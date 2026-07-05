import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  PaymentProfilesClient,
  FraudPoliciesClient,
  PaymentProfile,
  FraudPolicy,
} from '@proxy/payment-app-proxy';
import { Customer } from '@proxy/payment-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { NotificationService } from '@core/services/notification.service';
import { ProviderLogoComponent } from '@shared/components/provider-logo/provider-logo.component';
import { CustomerPickerModalComponent } from '@shared/components/customer-picker-modal/customer-picker-modal.component';
import { DateRangePickerComponent, DateRange } from '@shared/components/date-range-picker/date-range-picker.component';

/**
 * Applied filter — mirrors the payment-admin URL scheme.
 * `paymentState` is a single state code: -1 = In progress, -2 = Hold (sentinels
 * that expand to several underlying ids), otherwise a real state id.
 */
export interface PaymentsFilter {
  paymentState?: number;
  customerId?: string;
  customerLabel?: string;
  paymentProfileId?: number;
  fraudPolicyId?: number;
  startTime?: string; // yyyy-MM-dd
  endTime?: string;
}

interface StateOption {
  name: string;
  code: number;
}

// Sentinel state codes → the underlying ids they expand to (ported from
// payment-admin: InprogressValues / HoldValues).
export const STATE_INPROGRESS = -1;
export const STATE_HOLD = -2;
export const INPROGRESS_VALUES = [3, 4, 5, 6, 10];
export const HOLD_VALUES = [11, 13];

/** Expand a single paymentState code into the API's comma-separated id list. */
export function expandPaymentState(code: number | undefined): string | undefined {
  if (code == null) return undefined;
  if (code === STATE_INPROGRESS) return INPROGRESS_VALUES.join(",");
  if (code === STATE_HOLD) return HOLD_VALUES.join(",");
  return String(code);
}

@Component({
  selector: 'app-payments-filter-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ProviderLogoComponent, CustomerPickerModalComponent, DateRangePickerComponent],
  templateUrl: './payments-filter-modal.component.html',
  styleUrls: ['./payments-filter-modal.component.scss'],
})
export class PaymentsFilterModalComponent {
  private readonly profilesClient = inject(PaymentProfilesClient);
  private readonly policiesClient = inject(FraudPoliciesClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly notify = inject(NotificationService);

  readonly isOpen = signal(false);
  readonly loadingData = signal(false);
  readonly profiles = signal<PaymentProfile[]>([]);
  readonly policies = signal<FraudPolicy[]>([]);

  readonly applied = output<PaymentsFilter>();

  // Payment-state business (ported from payment-admin getPaymentStates): single
  // select; Hold/In progress are sentinel codes that expand on the API call.
  readonly states: StateOption[] = [
    { name: 'Created', code: 1 },
    { name: 'In progress', code: STATE_INPROGRESS },
    { name: 'Hold', code: STATE_HOLD },
    { name: 'Captured', code: 7 },
    { name: 'Failed', code: 8 },
    { name: 'Disputed', code: 9 },
    { name: 'Cancelling', code: 12 },
    { name: 'Refunded', code: 14 },
    { name: 'Refunding', code: 15 },
  ];
  readonly selectedState = signal<number | null>(null);

  gwOpen = false;

  paymentProfileId: number | null = null;
  fraudPolicyId: number | null = null;
  customerId: string | null = null;
  customerLabel = '';
  startTime = '';
  endTime = '';

  open(current?: PaymentsFilter): void {
    this.restore(current);
    this.isOpen.set(true);
    this.loadData();
  }

  close(): void {
    this.gwOpen = false;
    this.isOpen.set(false);
  }

  private async loadData(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    this.loadingData.set(true);
    try {
      const [profiles, policies] = await Promise.all([
        firstValueFrom(this.profilesClient.getPaymentProfiles(appId)).catch(() => []),
        firstValueFrom(this.policiesClient.list(appId)).catch(() => []),
      ]);
      this.profiles.set(profiles ?? []);
      this.policies.set(policies ?? []);
    } finally {
      this.loadingData.set(false);
    }
  }

  // --- State single-select ---
  isStateSelected(code: number): boolean {
    return this.selectedState() === code;
  }
  toggleState(code: number): void {
    this.selectedState.update((cur) => (cur === code ? null : code));
  }

  // --- Gateway ---
  selectedProfile(): PaymentProfile | null {
    if (!this.paymentProfileId) return null;
    return this.profiles().find(p => p.paymentProfileId === this.paymentProfileId) ?? null;
  }

  selectGateway(id: number | null): void {
    this.paymentProfileId = id;
    this.gwOpen = false;
  }

  profileLabel(p: PaymentProfile): string {
    const name = p.paymentProvider?.provider ?? p.paymentProfileName ?? 'Gateway';
    return p.currency ? `${name} (${p.currency})` : name;
  }

  // --- Date range ---
  onDateRangeChange(r: DateRange): void {
    this.startTime = r.from ?? '';
    this.endTime = r.to ?? '';
  }

  // --- Customer ---
  onCustomerSelected(c: Customer): void {
    this.customerId = c.customerId;
    const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    this.customerLabel = name || c.customerId;
  }
  clearCustomer(): void {
    this.customerId = null;
    this.customerLabel = '';
  }

  // --- Actions ---
  apply(): void {
    this.applied.emit({
      paymentState: this.selectedState() ?? undefined,
      customerId: this.customerId ?? undefined,
      customerLabel: this.customerLabel || undefined,
      paymentProfileId: this.paymentProfileId ?? undefined,
      fraudPolicyId: this.fraudPolicyId ?? undefined,
      startTime: this.startTime || undefined,
      endTime: this.endTime || undefined,
    });
    this.close();
  }

  clear(): void {
    this.selectedState.set(null);
    this.paymentProfileId = null;
    this.fraudPolicyId = null;
    this.customerId = null;
    this.customerLabel = '';
    this.startTime = '';
    this.endTime = '';
  }

  private restore(current?: PaymentsFilter): void {
    this.paymentProfileId = current?.paymentProfileId ?? null;
    this.fraudPolicyId = current?.fraudPolicyId ?? null;
    this.customerId = current?.customerId ?? null;
    this.customerLabel = current?.customerLabel ?? '';
    this.startTime = current?.startTime ?? '';
    this.endTime = current?.endTime ?? '';
    this.selectedState.set(current?.paymentState ?? null);
  }
}
