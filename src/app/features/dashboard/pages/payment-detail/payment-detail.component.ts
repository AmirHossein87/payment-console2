import { Component, computed, effect, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { PaymentsClient as BasePaymentsClient } from '@proxy/payment-proxy';
import {
  PaymentsClient,
  Payment,
  PaymentStateLog,
  PaymentWebhookItem,
  PaymentProviderPaymentLinkInfo,
  PaymentProviderLogData,
} from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { BreadcrumbStore } from '@core/stores/breadcrumb.store';
import { NotificationService } from '@core/services/notification.service';
import { PaymentLinkModalComponent } from '@shared/components/payment-link-modal/payment-link-modal.component';
import { ProviderLogoComponent } from '@shared/components/provider-logo/provider-logo.component';

interface ConfirmModel {
  title: string;
  message: string;
  danger?: boolean;
  needsReason?: boolean;
  run: (reason: string) => Promise<void>;
}

interface InfoModel {
  title: string;
  mode: 'json' | 'link' | 'logs';
  loading: boolean;
  json?: string;
  link?: PaymentProviderPaymentLinkInfo;
  logs?: PaymentProviderLogData[];
}

@Component({
  selector: 'app-payment-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, PaymentLinkModalComponent, ProviderLogoComponent],
  templateUrl: './payment-detail.component.html',
  styleUrls: ['./payment-detail.component.scss'],
})
export class PaymentDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly breadcrumbStore = inject(BreadcrumbStore);
  private readonly notify = inject(NotificationService);
  private readonly baseClient = inject(BasePaymentsClient); // payment-proxy
  private readonly appClient = inject(PaymentsClient); // payment-app-proxy

  readonly payment = signal<Payment | null>(null);
  readonly stateLogs = signal<PaymentStateLog[]>([]);
  readonly webhook = signal<PaymentWebhookItem | null>(null);
  readonly loading = signal<boolean>(true);
  // State logs load via a separate call, fired after the payment itself resolves
  // (see load()) — without its own flag, the table briefly renders its "No state
  // logs" empty state (stateLogs() still []) before the real rows arrive.
  readonly loadingStateLogs = signal<boolean>(true);
  readonly busy = signal<boolean>(false);

  readonly confirm = signal<ConfirmModel | null>(null);
  readonly info = signal<InfoModel | null>(null);
  reasonText = '';
  readonly reasonTried = signal(false);

  private appId = '';
  private paymentId = 0;

  readonly appBase = this.workspaceStore.currentAppId;

  readonly customerName = computed(() => {
    const c = this.payment()?.customerOrder?.customer;
    if (!c) return '';
    const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    return name || c.customerId || '';
  });

  readonly items = computed(() => this.payment()?.customerOrder?.items ?? []);

  /** Absolute URL to a customer's detail page — used as the Customer ID <a href>
      so the browser opens it in a new tab. */
  customerUrl(customerId: string | null | undefined): string {
    const appId = this.workspaceStore.currentAppId();
    if (!appId || !customerId) return '';
    return this.router.serializeUrl(
      this.router.createUrlTree(['/', appId, 'customers', customerId])
    );
  }

  readonly paymentLabel = computed(() => String(this.payment()?.paymentId ?? this.paymentId ?? ''));

  constructor() {
    // Topbar breadcrumb: Payments → Detail 41811 - Marshall Carroll (b20b…)
    effect(() => {
      const appId = this.appBase();
      const id = this.paymentLabel();
      const name = this.customerName();
      const custId = this.payment()?.customerOrder?.customer?.customerId;
      const detail = name
        ? `Detail ${id} - ${name}${custId ? ` (${custId})` : ''}`
        : `Detail ${id}`;
      this.breadcrumbStore.set([
        { label: 'Payments', link: appId ? ['/', appId, 'payments'] : ['/'] },
        { label: detail },
      ]);
    });
  }

  ngOnDestroy(): void {
    this.breadcrumbStore.clear();
  }

  ngOnInit(): void {
    this.appId = this.workspaceStore.currentAppId() ?? '';
    this.paymentId = Number(this.route.snapshot.paramMap.get('paymentId'));
    if (!this.appId || !this.paymentId) {
      this.loading.set(false);
      this.loadingStateLogs.set(false);
      return;
    }
    this.load();
  }

  async load(): Promise<void> {
    await this.loadPayment();
    this.loadStateLogs();
    this.loadWebhook();
  }

  // Standard API-call structure (matches PaymentsComponent.loadPayments):
  // currentAppId() guard -> loading -> try firstValueFrom -> catch extractError -> finally.
  async loadPayment(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.loading.set(true);
    try {
      const payment = await firstValueFrom(this.appClient.get(appId, this.paymentId));
      this.payment.set(payment);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load payment.'));
      this.payment.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async loadStateLogs(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) {
      this.loadingStateLogs.set(false);
      return;
    }

    this.loadingStateLogs.set(true);
    try {
      const logs = await firstValueFrom(this.appClient.stateLogs(appId, this.paymentId));
      this.stateLogs.set(logs ?? []);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load state logs.'));
      this.stateLogs.set([]);
    } finally {
      this.loadingStateLogs.set(false);
    }
  }

  async loadWebhook(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    try {
      const webhook = await firstValueFrom(this.appClient.getLastWebhookItem(appId, this.paymentId));
      this.webhook.set(webhook ?? null);
    } catch {
      // Optional data — a payment may simply have no webhook yet.
      this.webhook.set(null);
    }
  }

  // --- Money formatting ---
  money(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const currency = (this.payment()?.currency as unknown as string) || 'USD';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
    } catch {
      return `${value}`;
    }
  }

  // --- Action buttons (confirm modal) ---
  askCapture(): void {
    this.openConfirm('Capture payment', `Capture payment ${this.paymentId}?`, false, () =>
      this.runApi(this.baseClient.capture(this.appId, this.paymentId), 'Payment captured.')
    );
  }
  askUnhold(): void {
    this.openConfirm('Unhold payment', `Unhold payment ${this.paymentId}?`, false, () =>
      this.runApi(this.baseClient.unhold(this.appId, this.paymentId), 'Payment unheld.')
    );
  }
  askCancel(): void {
    this.openConfirm('Cancel payment', `Cancel payment ${this.paymentId}?`, true, () =>
      this.runApi(this.baseClient.cancel(this.appId, this.paymentId), 'Payment canceled.')
    );
  }
  askRecheck(): void {
    this.openConfirm('Recheck payment', `Recheck payment ${this.paymentId}?`, false, () =>
      this.runApi(this.baseClient.recheck(this.appId, this.paymentId), 'Payment rechecked.')
    );
  }
  askRefund(): void {
    this.openConfirm(
      'Refund payment',
      'The money will be refunded to the customer. This is irreversible. Continue?',
      true,
      () => this.runApi(this.appClient.refund(this.appId, this.paymentId), 'Payment refunded.')
    );
  }
  askMarkDispute(): void {
    this.openConfirm('Mark as dispute', 'Add a note for this dispute:', true, (reason) =>
      this.runApi(
        this.appClient.markAsDispute(this.appId, this.paymentId, reason),
        'Marked as disputed.'
      ),
      true
    );
  }
  askMarkRefund(): void {
    this.openConfirm('Mark as refund', 'Add a note for this refund:', false, (reason) =>
      this.runApi(
        this.appClient.markAsRefund(this.appId, this.paymentId, reason),
        'Marked as refunded.'
      ),
      true
    );
  }

  private openConfirm(
    title: string,
    message: string,
    danger: boolean,
    run: (reason: string) => Promise<void>,
    needsReason = false
  ): void {
    this.reasonText = '';
    this.reasonTried.set(false);
    this.confirm.set({ title, message, danger, needsReason, run });
  }

  async runConfirm(): Promise<void> {
    const c = this.confirm();
    if (!c) return;
    if (c.needsReason && !this.reasonText.trim()) {
      this.reasonTried.set(true);
      return;
    }
    await c.run(this.reasonText.trim());
  }

  closeConfirm(): void {
    this.confirm.set(null);
  }

  private async runApi(obs: Observable<any>, successMsg: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(obs);
      this.notify.showSuccess(successMsg);
      this.confirm.set(null);
      await this.load();
    } catch (e: any) {
      this.notify.showError(this.extractError(e, 'Action failed.'));
    } finally {
      this.busy.set(false);
    }
  }

  // --- Provider info modals ---
  // Open the modal immediately with a skeleton, then fill it once the API returns.
  async openRawInfo(): Promise<void> {
    this.info.set({ title: 'Raw provider info', mode: 'json', loading: true });
    try {
      const res = await firstValueFrom(
        this.appClient.getProviderRawInfo(this.appId, this.paymentId)
      );
      let json = res?.providerInfo ?? '';
      try {
        json = JSON.stringify(JSON.parse(res!.providerInfo!), null, 2);
      } catch {
        /* leave raw */
      }
      this.info.set({ title: 'Raw provider info', mode: 'json', loading: false, json });
    } catch (e: any) {
      this.notify.showError(this.extractError(e, 'Failed to load raw info.'));
      this.info.set(null);
    }
  }

  async openLinkInfo(): Promise<void> {
    this.info.set({ title: 'Provider link info', mode: 'link', loading: true });
    try {
      const res = await firstValueFrom(
        this.appClient.getProviderLinkInfo(this.appId, this.paymentId)
      );
      this.info.set({ title: 'Provider link info', mode: 'link', loading: false, link: res });
    } catch (e: any) {
      this.notify.showError(this.extractError(e, 'Failed to load link info.'));
      this.info.set(null);
    }
  }

  async openLogDetails(): Promise<void> {
    this.info.set({ title: 'Provider log', mode: 'logs', loading: true });
    try {
      const res = await firstValueFrom(
        this.appClient.getProviderLog(this.appId, this.paymentId)
      );
      this.info.set({ title: 'Provider log', mode: 'logs', loading: false, logs: res ?? [] });
    } catch (e: any) {
      this.notify.showError(this.extractError(e, 'Failed to load log details.'));
      this.info.set(null);
    }
  }

  closeInfo(): void {
    this.info.set(null);
  }


  stringify(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  // Map a payment state to a status-pill class.
  statePill(state: any): string {
    const s = String(state ?? '');
    if (['Captured', 'Approved', 'CapturedHold'].includes(s)) return 'ok';
    if (['Authorized', 'Authorizing'].includes(s)) return 'info';
    if (['Failed'].includes(s)) return 'bad';
    if (['Disputed', 'Capturing', 'SaleInProgress', 'ProviderAuthorizedHold'].includes(s)) return 'warn';
    if (['Refunded', 'Refunding'].includes(s)) return 'violet';
    return 'muted';
  }

  protected extractError(err: any, fallback: string): string {
    return (
      err?.response?.Message ||
      err?.response?.message ||
      err?.Message ||
      err?.message ||
      err?.exceptionMessage ||
      fallback
    );
  }
}
