import { Component, signal, computed, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  PaymentProfilesClient,
  PaymentProfile,
  FraudPoliciesClient,
  FraudPolicy,
} from '@proxy/payment-app-proxy';
import {
  Customer,
  CustomersClient,
  PaymentsClient,
  PaymentCreateByHostedPageRequest,
  PaymentProviderCustomerOrder,
  PaymentProviderCustomer,
  PaymentProviderCurrency,
} from '@proxy/payment-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { NotificationService } from '@core/services/notification.service';
import { ProviderLogoComponent } from '@shared/components/provider-logo/provider-logo.component';
import { CustomerPickerModalComponent } from '@shared/components/customer-picker-modal/customer-picker-modal.component';
import { PaymentLinkResultComponent } from '@shared/components/payment-link-result/payment-link-result.component';

@Component({
  selector: 'app-create-payment-link-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ProviderLogoComponent, CustomerPickerModalComponent, PaymentLinkResultComponent],
  templateUrl: './create-payment-link-modal.component.html',
  styleUrls: ['./create-payment-link-modal.component.scss'],
})
export class CreatePaymentLinkModalComponent {
  private readonly profilesClient = inject(PaymentProfilesClient);
  private readonly fraudClient = inject(FraudPoliciesClient);
  private readonly paymentsClient = inject(PaymentsClient);
  private readonly customersClient = inject(CustomersClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly notify = inject(NotificationService);

  readonly created = output<void>();

  readonly isOpen = signal(false);
  readonly isSuccess = signal(false);
  readonly moreOpen = signal(false);
  readonly busy = signal(false);
  readonly gateways = signal<PaymentProfile[]>([]);
  readonly loadingGateways = signal(false);
  readonly policies = signal<FraudPolicy[]>([]);
  readonly loadingPolicies = signal(false);
  readonly createdLink = signal('');
  readonly currency = signal('');

  /** Only one fraud policy → auto-picked and shown read-only. */
  readonly singlePolicy = computed(() => this.policies().length === 1);

  readonly availableCurrencies = computed(() =>
    [...new Set(this.gateways().map(p => String(p.currency ?? '')).filter(c => !!c))].sort()
  );

  /** Only one gateway configured — selection is auto-picked and shown read-only. */
  readonly singleGateway = computed(() => this.gateways().length === 1);

  readonly filteredGateways = computed(() => {
    const cur = this.currency();
    if (!cur) return this.gateways();
    return this.gateways().filter(p => String(p.currency) === cur);
  });

  amount: number | null = null;
  returnUrl = '';
  recurring = false;
  fraudPolicyId: number | null = null;
  tried = false;
  gwOpen = false;
  paymentProfileId: number | null = null;
  customerId: string | null = null;
  customerLabel = '';

  async open(customer?: Customer): Promise<void> {
    this.reset();
    if (customer) {
      this.customerId = customer.customerId;
      const name = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();
      this.customerLabel = name || customer.customerId;
    }
    this.isOpen.set(true);
    await Promise.all([
      this.loadGateways(),
      this.loadPolicies(),
      this.maybeAutoSelectFirstCustomer(),
    ]);
  }

  /**
   * Onboarding aid: in a SANDBOX app that hasn't completed setup yet, pre-fill
   * the customer field with the first available customer so the merchant can try
   * "create a payment link" without hunting for a customer first. Only runs when
   * NO customer was already supplied to open() and the app is sandbox AND
   * !isSetupCompleted. Silent on failure — the field simply stays empty.
   */
  private async maybeAutoSelectFirstCustomer(): Promise<void> {
    if (this.customerId) return; // a customer was passed to open() — respect it

    const app = this.workspaceStore.selectedApp() ?? this.workspaceStore.activeAppMetadata();
    if (!app || !this.workspaceStore.isSandbox() || app.isSetupCompleted) return;

    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    try {
      const rows = await firstValueFrom(
        this.customersClient.list(
          appId,
          undefined, // searchCriteria
          undefined, // isBlocked
          undefined, // fraudPolicyId
          undefined, // isCheckAccountBalanceActivated
          1, // pageNumber
          1, // pageSize — we only need the first
        ),
      );
      const first = rows?.[0];
      // Guard against a customer having been picked while this request was in flight.
      if (first && !this.customerId) this.onCustomerSelected(first);
    } catch {
      // Non-critical onboarding convenience — leave the field empty on failure.
    }
  }

  /** Loads the app's fraud policies and auto-picks when there's only one (shown
      read-only); defaults to the default policy when there are several. */
  private async loadPolicies(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    this.loadingPolicies.set(true);
    try {
      const list = await firstValueFrom(this.fraudClient.list(appId));
      this.policies.set(list ?? []);
    } catch {
      this.policies.set([]);
    } finally {
      this.loadingPolicies.set(false);
      const pols = this.policies();
      if (pols.length === 1) {
        this.fraudPolicyId = pols[0].fraudPolicyId;
      } else if (pols.length > 1) {
        this.fraudPolicyId = (pols.find((p) => p.isDefault) ?? pols[0]).fraudPolicyId;
      }
    }
  }

  /** Loads the app's gateways and auto-picks a single gateway / currency. Called
      on open AND on "Create another" (reset clears the gateway list). */
  private async loadGateways(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    this.loadingGateways.set(true);
    try {
      const profiles = await firstValueFrom(this.profilesClient.getPaymentProfiles(appId));
      this.gateways.set(profiles ?? []);
    } catch {
      this.gateways.set([]);
    } finally {
      this.loadingGateways.set(false);
      // Only one gateway configured — pick it (and its currency) for the user;
      // both fields are shown read-only in the template since there's nothing
      // to choose. selectGateway() also sets currency from the gateway.
      const profiles = this.gateways();
      if (profiles.length === 1) {
        this.selectGateway(profiles[0].paymentProfileId!);
      } else {
        // Multiple gateways but only one distinct currency — pick that.
        const currencies = this.availableCurrencies();
        if (currencies.length === 1) this.currency.set(currencies[0]);
      }
    }
  }

  close(): void {
    if (this.busy()) return; // locked while the create request is in flight
    this.gwOpen = false;
    this.isOpen.set(false);
  }

  toggleMore(): void {
    this.moreOpen.update((v) => !v);
  }

  // --- Currency ---
  onCurrencyChange(cur: string): void {
    this.currency.set(cur);
    // Clear gateway only if it no longer matches the new currency
    if (this.paymentProfileId !== null) {
      const profile = this.gateways().find(p => p.paymentProfileId === this.paymentProfileId);
      if (String(profile?.currency ?? '') !== cur) this.paymentProfileId = null;
    }
    // Do NOT auto-select a gateway — currency can match multiple gateways.
    // Let the user explicitly choose which gateway to use.
  }

  // --- Gateway ---
  selectedProfile(): PaymentProfile | null {
    if (!this.paymentProfileId) return null;
    return this.gateways().find(p => p.paymentProfileId === this.paymentProfileId) ?? null;
  }

  selectGateway(id: number): void {
    this.paymentProfileId = id;
    this.gwOpen = false;
    // Always set currency from the chosen gateway — each gateway has exactly one currency.
    const profile = this.gateways().find(p => p.paymentProfileId === id);
    if (profile?.currency) this.currency.set(String(profile.currency));
  }

  clearGateway(): void {
    this.paymentProfileId = null;
    this.gwOpen = false;
  }

  profileLabel(p: PaymentProfile): string {
    const name = p.paymentProvider?.provider ?? p.paymentProfileName ?? 'Gateway';
    return p.currency ? `${name} · ${p.currency}` : name;
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

  onAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = input.value;
    const dotIdx = val.indexOf('.');
    if (dotIdx !== -1 && val.length - dotIdx > 3) {
      input.value = val.slice(0, dotIdx + 3);
      this.amount = parseFloat(input.value);
    }
  }

  // --- Validation ---
  get amountInvalid(): boolean {
    return this.tried && (!this.amount || this.amount <= 0);
  }
  get currencyInvalid(): boolean {
    return this.tried && !this.currency();
  }
  get customerInvalid(): boolean {
    return this.tried && !this.customerId;
  }

  async create(): Promise<void> {
    this.tried = true;
    if (this.amountInvalid || this.currencyInvalid || this.customerInvalid) return;

    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    const customer = new PaymentProviderCustomer();
    customer.init({ customerId: this.customerId! });

    const customerOrder = new PaymentProviderCustomerOrder();
    customerOrder.init({ customer });

    // Hosted-page links expire exactly 7 days from creation.
    const expirationTime = new Date();
    expirationTime.setDate(expirationTime.getDate() + 7);

    const req = new PaymentCreateByHostedPageRequest();
    req.init({
      referenceId: crypto.randomUUID(),
      amount: this.amount!,
      currency: this.currency() as PaymentProviderCurrency,
      autoCapture: true,
      // The "Recurring payment" toggle only decides whether the recurring option
      // is OFFERED on the checkout page — it must NOT force-register an auto-pay
      // mandate at link creation. So it drives showPayRecurringInCheckout, not
      // registerAutoPayment (which stays false).
      registerAutoPayment: false,
      showPayRecurringInCheckout: this.recurring,
      expirationTime,
      fraudPolicyId: this.fraudPolicyId,
      returnUrl: this.returnUrl?.trim() || null,
      paymentProfiles: this.paymentProfileId ? [this.paymentProfileId] : null,
      customerOrder,
    });

    this.busy.set(true);
    try {
      const payment = await firstValueFrom(this.paymentsClient.createByHostedPage(appId, req));
      this.createdLink.set(payment.redirectUrl ?? '');
      this.isSuccess.set(true);
      // Reload the grid behind the modal right away — don't wait for the user
      // to click Done/close, so the new payment is visible as soon as it exists.
      this.created.emit();
    } catch (err: any) {
      const msg =
        err?.error?.message || err?.error || err?.message || 'Failed to create payment link.';
      this.notify.showError(msg);
    } finally {
      this.busy.set(false);
    }
  }

  createAnother(): void {
    this.reset();
    // reset() clears the gateway + policy lists — reload them.
    this.loadGateways();
    this.loadPolicies();
  }

  private reset(): void {
    this.amount = null;
    this.currency.set('');
    this.returnUrl = '';
    this.recurring = false;
    this.fraudPolicyId = null;
    this.policies.set([]);
    this.tried = false;
    this.gwOpen = false;
    this.busy.set(false);
    this.isSuccess.set(false);
    this.moreOpen.set(false);
    this.paymentProfileId = null;
    this.customerId = null;
    this.customerLabel = '';
    this.gateways.set([]);
  }
}
