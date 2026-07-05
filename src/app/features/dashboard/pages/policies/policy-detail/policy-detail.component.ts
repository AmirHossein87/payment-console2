import {
  Component,
  computed,
  effect,
  inject,
  signal,
  OnInit,
  OnDestroy,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import {
  FraudPoliciesClient,
  PaymentProfilesClient,
  FraudPolicy,
  FraudRule,
  CreateFraudPolicyRequest,
  CreateFraudRuleRequest,
  UpdateFraudPolicyRequest,
  UpdateFraudPolicyRulesRequest,
  FirewallConfiguration,
  IpRange,
} from "@proxy/payment-app-proxy";
import { WorkspaceStore } from "@core/stores/workspace.store";
import { BreadcrumbStore } from "@core/stores/breadcrumb.store";
import { NotificationService } from "@core/services/notification.service";
import { patchOf } from "@core/utils/patch.util";
import { UniversalEditModalComponent } from "@shared/components/universal-edit-modal/universal-edit-modal.component";
import { ConfirmModalComponent } from "@shared/components/confirm-modal/confirm-modal.component";
import {
  RuleEditorModalComponent,
  RuleProfileOption,
  RuleSaved,
} from "../rule-editor-modal/rule-editor-modal.component";

/** A key/value row shown in the Firewall summary grid. */
interface KvRow {
  k: string;
  v: string;
}

/** Local editable copy of the firewall form. */
interface FirewallForm {
  rejectWhenUnavailable: boolean;
  vpnUnacceptable: boolean;
  voipUnacceptable: boolean;
  ipScore: number | null;
  emailScore: number | null;
  mobileScore: number | null;
  countries: string;
  specificIps: string;
  ipRanges: string;
}

@Component({
  selector: "app-policy-detail",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UniversalEditModalComponent,
    ConfirmModalComponent,
    RuleEditorModalComponent,
  ],
  templateUrl: "./policy-detail.component.html",
  styleUrls: ["./policy-detail.component.scss"],
})
export class PolicyDetailComponent implements OnInit, OnDestroy {
  @ViewChild("editor") private editor!: UniversalEditModalComponent;
  @ViewChild("confirm") private confirm!: ConfirmModalComponent;
  @ViewChild("ruleEditor") private ruleEditor!: RuleEditorModalComponent;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly breadcrumbStore = inject(BreadcrumbStore);
  private readonly notify = inject(NotificationService);
  private readonly policiesClient = inject(FraudPoliciesClient);
  private readonly profilesClient = inject(PaymentProfilesClient);

  private appId = "";
  private policyId = 0;

  readonly policy = signal<FraudPolicy | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly rulesLoading = signal(false);
  readonly profiles = signal<RuleProfileOption[]>([]);

  // Firewall edit modal state.
  readonly fwOpen = signal(false);
  fwForm: FirewallForm = this.emptyFirewallForm();

  readonly firewallRows = computed<KvRow[]>(() => {
    const f = this.policy()?.firewallConfiguration;
    if (!f) return [];
    return [
      { k: "When service unavailable", v: f.ignoreIfServiceProviderIsNotAvailable === false ? "Reject payment" : "Ignore firewall" },
      { k: "VPN", v: f.isVpnAccepted === false ? "Unacceptable" : "No check" },
      { k: "VOIP", v: f.voipAccepted === false ? "Unacceptable" : "No check" },
      { k: "White countries", v: this.listOrDash(f.countries) },
      { k: "White IPs", v: this.listOrDash(f.specificIps) },
      { k: "White IP ranges", v: f.ipRanges?.length ? f.ipRanges.map((r) => `${r.startIp} – ${r.endIp}`).join(", ") : "-" },
      { k: "Mobile accepted max fraud score", v: f.mobileVerificationMaxFraudScore ?? "-" } as KvRow,
      { k: "IP accepted max fraud score", v: f.ipVerificationMaxFraudScore ?? "-" } as KvRow,
      { k: "Email accepted max fraud score", v: f.emailVerificationMaxFraudScore ?? "-" } as KvRow,
    ].map((r) => ({ k: r.k, v: String(r.v) }));
  });

  readonly rules = computed<FraudRule[]>(() => this.policy()?.rules ?? []);

  constructor() {
    // Keep the breadcrumb in sync with the loaded policy name.
    effect(() => {
      const p = this.policy();
      const appId = this.appId;
      this.breadcrumbStore.set([
        { label: "Fraud Policies", link: appId ? ["/", appId, "policies"] : ["/"] },
        { label: p?.fraudPolicyName ?? "Policy" },
      ]);
    });
  }

  ngOnInit(): void {
    this.appId = this.workspaceStore.currentAppId() ?? "";
    this.policyId = Number(this.route.snapshot.paramMap.get("policyId"));
    this.load();
    this.loadProfiles();
  }

  ngOnDestroy(): void {
    this.breadcrumbStore.clear();
  }

  async load(): Promise<void> {
    if (!this.appId || !this.policyId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const p = await firstValueFrom(this.policiesClient.get(this.appId, this.policyId));
      this.policy.set(p);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, "Failed to load policy."));
      this.policy.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadProfiles(): Promise<void> {
    if (!this.appId) return;
    try {
      const list = await firstValueFrom(this.profilesClient.getPaymentProfiles(this.appId));
      this.profiles.set(
        (list ?? []).map((p) => ({
          id: p.paymentProfileId,
          name:
            p.paymentProfileName ||
            (p.paymentProvider?.provider as string) ||
            `Gateway #${p.paymentProfileId}`,
          provider: p.paymentProvider,
        }))
      );
    } catch {
      this.profiles.set([]);
    }
  }

  goBack(): void {
    this.router.navigate(["/", this.appId, "policies"]);
  }

  // --- Header actions ---

  editName(): void {
    const p = this.policy();
    if (!p) return;
    this.editor.open({
      title: "Rename policy",
      icon: "edit",
      label: "Policy name",
      type: "text",
      value: p.fraudPolicyName,
      required: true,
      save: async (v: string) => {
        const req = { fraudPolicyName: patchOf(v) } as UpdateFraudPolicyRequest;
        const updated = await firstValueFrom(
          this.policiesClient.updateFraudPolicy(this.appId, this.policyId, req)
        );
        this.policy.set(updated ?? p);
      },
    });
  }

  saveAs(): void {
    const p = this.policy();
    if (!p) return;
    this.editor.open({
      title: "Save as new policy",
      icon: "content_copy",
      label: "New policy name",
      type: "text",
      value: `${p.fraudPolicyName} (copy)`,
      required: true,
      successMessage: "New policy created",
      save: async (v: string) => {
        // Copy the general fields + rules via create, then copy the firewall
        // via a follow-up patch, then jump into the new policy's detail page.
        const createReq = new CreateFraudPolicyRequest({
          fraudPolicyName: v,
          maxAllowedUniqueCreditCardCount: p.maxAllowedUniqueCreditCardCount ?? null,
          maxAllowedUniqueElectronicCheckCount: p.maxAllowedUniqueElectronicCheckCount ?? null,
          maxUnconfirmedElectronicCheckCount: p.maxUnconfirmedElectronicCheckCount ?? null,
          maxUnconfirmedElectronicCheckExpirationHour: p.maxUnconfirmedElectronicCheckExpirationHour ?? null,
          maxUnconfirmedCreditCardCount: p.maxUnconfirmedCreditCardCount ?? null,
          maxUnconfirmedCreditCardExpirationHour: p.maxUnconfirmedCreditCardExpirationHour ?? null,
          checkAchBalance: p.checkAchBalance,
          rules: this.rules().map((r) => this.toCreateRule(r)),
        });
        const created = await firstValueFrom(this.policiesClient.create(this.appId, createReq));
        if (created && p.firewallConfiguration) {
          const req = { firewallConfiguration: patchOf(p.firewallConfiguration) } as UpdateFraudPolicyRequest;
          await firstValueFrom(
            this.policiesClient.updateFraudPolicy(this.appId, created.fraudPolicyId, req)
          );
        }
        if (created) {
          this.router.navigate(["/", this.appId, "policies", created.fraudPolicyId]);
        }
      },
    });
  }

  askDelete(): void {
    const p = this.policy();
    if (!p) return;
    if (p.isDefault) {
      this.notify.showError("Cannot delete the default policy.");
      return;
    }
    this.confirm.open({
      title: "Delete policy",
      message: `Delete "${p.fraudPolicyName}"? This action can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
      icon: "delete",
      confirm: async () => {
        await firstValueFrom(this.policiesClient.deleteFraudPolicy(this.appId, this.policyId));
        this.notify.showSuccess("Policy deleted");
        this.router.navigate(["/", this.appId, "policies"]);
      },
    });
  }

  // --- Firewall ---

  openFirewall(): void {
    const f = this.policy()?.firewallConfiguration;
    this.fwForm = {
      rejectWhenUnavailable: f?.ignoreIfServiceProviderIsNotAvailable === false,
      vpnUnacceptable: f?.isVpnAccepted === false,
      voipUnacceptable: f?.voipAccepted === false,
      ipScore: f?.ipVerificationMaxFraudScore ?? null,
      emailScore: f?.emailVerificationMaxFraudScore ?? null,
      mobileScore: f?.mobileVerificationMaxFraudScore ?? null,
      countries: (f?.countries ?? []).join(", "),
      specificIps: (f?.specificIps ?? []).join(", "),
      ipRanges: (f?.ipRanges ?? []).map((r) => `${r.startIp}-${r.endIp}`).join(", "),
    };
    this.fwOpen.set(true);
  }

  closeFirewall(): void {
    if (this.saving()) return;
    this.fwOpen.set(false);
  }

  async saveFirewall(): Promise<void> {
    const p = this.policy();
    if (!p) return;
    const fw = new FirewallConfiguration({
      ignoreIfServiceProviderIsNotAvailable: !this.fwForm.rejectWhenUnavailable,
      isVpnAccepted: this.fwForm.vpnUnacceptable ? false : null,
      voipAccepted: this.fwForm.voipUnacceptable ? false : null,
      ipVerificationMaxFraudScore: this.numOrNull(this.fwForm.ipScore),
      emailVerificationMaxFraudScore: this.numOrNull(this.fwForm.emailScore),
      mobileVerificationMaxFraudScore: this.numOrNull(this.fwForm.mobileScore),
      countries: this.splitList(this.fwForm.countries),
      specificIps: this.splitList(this.fwForm.specificIps),
      ipRanges: this.parseIpRanges(this.fwForm.ipRanges),
    });
    this.saving.set(true);
    try {
      const req = { firewallConfiguration: patchOf(fw) } as UpdateFraudPolicyRequest;
      const updated = await firstValueFrom(
        this.policiesClient.updateFraudPolicy(this.appId, this.policyId, req)
      );
      this.policy.set(updated ?? p);
      this.fwOpen.set(false);
      this.notify.showSuccess("Firewall updated");
    } catch (err: any) {
      this.notify.showError(this.extractError(err, "Failed to update firewall."));
    } finally {
      this.saving.set(false);
    }
  }

  // --- Rules ---

  addRule(): void {
    this.ruleEditor.open(null, null, this.profiles());
  }

  editRule(index: number): void {
    this.ruleEditor.open(this.rules()[index], index, this.profiles());
  }

  async onRuleSaved(event: RuleSaved): Promise<void> {
    const rule = new FraudRule({
      action: event.draft.action,
      profiles: event.draft.profiles,
      periodType: event.draft.periodType,
      periodTypeValue: event.draft.periodTypeValue,
      calcType: event.draft.calcType,
      calcTypeValue: event.draft.calcTypeValue,
      currency: event.draft.currency,
      detectionMessage: event.draft.detectionMessage,
    });
    const next = [...this.rules()];
    if (event.index != null) next[event.index] = rule;
    else next.push(rule);

    this.ruleEditor.setSaving(true);
    try {
      await this.persistRules(next, event.index != null ? "Rule updated" : "Rule added");
      this.ruleEditor.setSaving(false);
      this.ruleEditor.close();
    } catch {
      // error already shown by persistRules; modal stays open
      this.ruleEditor.setSaving(false);
    }
  }

  deleteRule(index: number): void {
    const rule = this.rules()[index];
    this.confirm.open({
      title: "Delete rule",
      message: `Delete this ${rule?.action ?? ""} rule? This action can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
      icon: "delete",
      confirm: async () => {
        const next = this.rules().filter((_, i) => i !== index);
        await this.persistRules(next, "Rule deleted");
      },
    });
  }

  private async persistRules(next: FraudRule[], successMsg: string): Promise<void> {
    const p = this.policy();
    if (!p) return;
    this.rulesLoading.set(true);
    try {
      const req = new UpdateFraudPolicyRulesRequest({
        rules: next.map((r) => this.toCreateRule(r)),
      });
      const updated = await firstValueFrom(
        this.policiesClient.updateFraudPolicyRules(this.appId, this.policyId, req)
      );
      this.policy.set(updated ?? p);
      this.notify.showSuccess(successMsg);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, "Failed to save rules."));
      throw err;
    } finally {
      this.rulesLoading.set(false);
    }
  }

  // --- Display helpers ---

  actionPill(action: string): string {
    return action === "RejectPayment" ? "warn" : "bad";
  }

  ruleProfilesLabel(rule: FraudRule): string {
    const ids = rule.profiles ?? [];
    if (!ids.length) return "All";
    const byId = new Map(this.profiles().map((p) => [p.id, p.name]));
    return ids.map((id) => byId.get(id) ?? `#${id}`).join(", ");
  }

  private toCreateRule(r: FraudRule): CreateFraudRuleRequest {
    return new CreateFraudRuleRequest({
      action: r.action,
      profileIds: r.profiles ?? [],
      periodType: r.periodType,
      periodTypeValue: r.periodTypeValue,
      calcType: r.calcType,
      calcTypeValue: r.calcTypeValue,
      currency: r.currency ?? null,
      detectionMessage: r.detectionMessage ?? null,
    });
  }

  private listOrDash(arr: string[] | null | undefined): string {
    return arr && arr.length ? arr.join(", ") : "-";
  }

  private splitList(v: string): string[] {
    return v.split(",").map((x) => x.trim()).filter(Boolean);
  }

  private parseIpRanges(v: string): IpRange[] {
    return this.splitList(v).map((s) => {
      const [start, end] = s.split("-").map((x) => x.trim());
      return new IpRange({ startIp: start, endIp: end || start });
    });
  }

  private numOrNull(v: number | null): number | null {
    return v === null || v === undefined || (v as any) === "" ? null : Number(v);
  }

  private emptyFirewallForm(): FirewallForm {
    return {
      rejectWhenUnavailable: false,
      vpnUnacceptable: false,
      voipUnacceptable: false,
      ipScore: null,
      emailScore: null,
      mobileScore: null,
      countries: "",
      specificIps: "",
      ipRanges: "",
    };
  }

  protected extractError(err: any, fallback: string): string {
    return (
      err?.response?.message ||
      err?.message ||
      err?.exceptionMessage ||
      fallback
    );
  }
}
