import { Component, ElementRef, HostListener, computed, inject, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  FraudRule,
  FraudRuleAction,
  FraudRuleCalcType,
  FraudRulePeriodType,
  PaymentProvider,
  PaymentProviderCurrency,
} from "@proxy/payment-app-proxy";
import { ProviderLogoComponent } from "@shared/components/provider-logo/provider-logo.component";

/** A payment profile the rule can be scoped to (id + display label). */
export interface RuleProfileOption {
  id: number;
  name: string;
  provider?: PaymentProvider;
}

/** The rule shape produced by the editor (mirrors the visible FraudRule fields). */
export interface PolicyRuleDraft {
  action: FraudRuleAction;
  calcType: FraudRuleCalcType;
  calcTypeValue: number;
  periodType: FraudRulePeriodType;
  periodTypeValue: number;
  currency: PaymentProviderCurrency | null;
  profiles: number[];
  detectionMessage: string | null;
}

/** Emitted on save. `index` is the rule's position (null = a newly added rule). */
export interface RuleSaved {
  index: number | null;
  draft: PolicyRuleDraft;
}

/**
 * Add / edit a single fraud rule. ONE component drives both scenarios — call
 * `open(null, ...)` to add, or `open(existingRule, index, ...)` to edit.
 * Dismiss ONLY via Cancel or X (no backdrop click), matching the app's modal rule.
 */
@Component({
  selector: "app-rule-editor-modal",
  standalone: true,
  imports: [CommonModule, FormsModule, ProviderLogoComponent],
  templateUrl: "./rule-editor-modal.component.html",
  styleUrls: ["./rule-editor-modal.component.scss"],
})
export class RuleEditorModalComponent {
  private readonly elRef = inject(ElementRef);

  readonly saved = output<RuleSaved>();

  readonly isOpen = signal(false);
  readonly isEdit = signal(false);
  readonly isSaving = signal(false);
  readonly profileOptions = signal<RuleProfileOption[]>([]);
  readonly dropdownOpen = signal(false);
  readonly selectedProfiles = signal(new Set<number>());

  readonly profileSummary = computed(() => {
    const count = this.selectedProfiles().size;
    if (count === 0) return "All profiles";
    return count === 1 ? "1 profile selected" : `${count} profiles selected`;
  });

  // Enum option lists for the dropdowns.
  readonly actions = Object.values(FraudRuleAction);
  readonly calcTypes = Object.values(FraudRuleCalcType);
  readonly periodTypes = Object.values(FraudRulePeriodType);
  readonly currencies = Object.values(PaymentProviderCurrency);

  private index: number | null = null;

  // Form model (ngModel-bound).
  action: FraudRuleAction = FraudRuleAction.RejectPayment;
  calcType: FraudRuleCalcType = FraudRuleCalcType.PaymentCount;
  calcTypeValue = 1;
  periodType: FraudRulePeriodType = FraudRulePeriodType.Daily;
  periodTypeValue = 1;
  currency: PaymentProviderCurrency | "" = "";
  detectionMessage = "";

  @HostListener("document:click", ["$event"])
  onDocClick(e: MouseEvent): void {
    if (this.dropdownOpen() && !this.elRef.nativeElement.contains(e.target)) {
      this.dropdownOpen.set(false);
    }
  }

  /** Opens the modal. `rule`/`index` null → add mode; otherwise edit that rule. */
  open(rule: FraudRule | null, index: number | null, profiles: RuleProfileOption[]): void {
    this.profileOptions.set(profiles);
    this.index = index;
    this.isEdit.set(rule != null);
    this.dropdownOpen.set(false);

    this.action = rule?.action ?? FraudRuleAction.RejectPayment;
    this.calcType = rule?.calcType ?? FraudRuleCalcType.PaymentCount;
    this.calcTypeValue = rule?.calcTypeValue ?? 1;
    this.periodType = rule?.periodType ?? FraudRulePeriodType.Daily;
    this.periodTypeValue = rule?.periodTypeValue ?? 1;
    this.currency = rule?.currency ?? "";
    this.selectedProfiles.set(new Set(rule?.profiles ?? []));
    this.detectionMessage = rule?.detectionMessage ?? "";

    this.isOpen.set(true);
  }

  setSaving(v: boolean): void {
    this.isSaving.set(v);
  }

  close(): void {
    if (this.isSaving()) return;
    this.dropdownOpen.set(false);
    this.isOpen.set(false);
  }

  toggleDropdown(): void {
    this.dropdownOpen.update((v) => !v);
  }

  isProfileChecked(id: number): boolean {
    return this.selectedProfiles().has(id);
  }

  toggleProfile(id: number, checked: boolean): void {
    this.selectedProfiles.update((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  clearProfiles(): void {
    this.selectedProfiles.set(new Set());
  }

  save(): void {
    const draft: PolicyRuleDraft = {
      action: this.action,
      calcType: this.calcType,
      calcTypeValue: Number(this.calcTypeValue) || 0,
      periodType: this.periodType,
      periodTypeValue: Number(this.periodTypeValue) || 1,
      currency: this.currency || null,
      profiles: Array.from(this.selectedProfiles()),
      detectionMessage: this.detectionMessage.trim() || null,
    };
    this.saved.emit({ index: this.index, draft });
    // Modal stays open — parent closes it after the API call completes.
  }
}
