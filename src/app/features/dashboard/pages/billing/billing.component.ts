import {
  Component,
  signal,
  inject,
  ViewChild,
  TemplateRef,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import {
  AppsClient,
  LicenseInvoice,
  LicenseInvoiceStatus,
  PaymentSummary,
  PaymentState,
  App,
} from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { NotificationService } from '@core/services/notification.service';
import { DataGridComponent } from '@shared/components/data-grid/data-grid.component';
import { ProviderLogoComponent } from '@shared/components/provider-logo/provider-logo.component';
import { GridColumn } from '@shared/components/data-grid/data-grid.interface';

interface InvoiceRow {
  licenseInvoiceId: number;
  createdTime: Date;
  status: LicenseInvoiceStatus;
  canPayLicenseInvoice: boolean;
  paymentUrl?: string | null;
}

const STATUS_PILL: Record<string, string> = {
  [LicenseInvoiceStatus.Succeeded]: 'ok',
  [LicenseInvoiceStatus.UnPaid]: 'warn',
  [LicenseInvoiceStatus.Canceled]: 'bad',
  [LicenseInvoiceStatus.Pending]: 'info',
  [LicenseInvoiceStatus.Created]: 'muted',
};

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, DataGridComponent, ProviderLogoComponent],
  templateUrl: './billing.component.html',
  styleUrls: ['./billing.component.scss'],
})
export class BillingComponent implements OnInit {
  @ViewChild('invoiceIdTpl', { static: true }) invoiceIdTpl!: TemplateRef<any>;
  @ViewChild('statusTpl', { static: true }) statusTpl!: TemplateRef<any>;
  @ViewChild('actionTpl', { static: true }) actionTpl!: TemplateRef<any>;

  private readonly appsClient = inject(AppsClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly notify = inject(NotificationService);

  readonly invoices = signal<InvoiceRow[]>([]);
  readonly loading = signal(false);
  readonly appSettings = signal<App | null>(null);

  readonly selectedInvoice = signal<InvoiceRow | null>(null);
  readonly invoicePayments = signal<PaymentSummary[]>([]);
  readonly paymentsLoading = signal(false);

  readonly renewOpen = signal(false);
  readonly renewSaving = signal(false);

  readonly payTarget = signal<InvoiceRow | null>(null);
  readonly paySaving = signal(false);

  gridColumns: GridColumn[] = [];

  ngOnInit(): void {
    this.gridColumns = [
      {
        id: 'invoiceId',
        header: 'Invoice ID',
        field: 'licenseInvoiceId',
        type: 'custom',
        customTemplate: this.invoiceIdTpl,
        width: '120px',
        isSortable: true,
      },
      {
        id: 'createdTime',
        header: 'Created Time',
        field: 'createdTime',
        type: 'date',
        isSortable: true,
        width: '160px',
      },
      {
        id: 'status',
        header: 'Status',
        field: 'status',
        type: 'custom',
        customTemplate: this.statusTpl,
        width: '140px',
        isSortable: true,
      },
      {
        id: 'action',
        header: '',
        field: '__action',
        type: 'custom',
        customTemplate: this.actionTpl,
        width: '80px',
      },
    ];

    this.load();
  }

  async load(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    // Use app settings already fetched by licenseGuard when available.
    const cached = this.workspaceStore.selectedApp();
    if (cached) {
      this.appSettings.set(cached);
    }

    this.loading.set(true);
    try {
      const invoices = await firstValueFrom(
        this.appsClient.getLicenseInvoices(appId, undefined, undefined, undefined, undefined)
      );
      this.invoices.set((invoices ?? []).map(i => this.toRow(i)));

      // Fetch settings only if they weren't provided by the guard.
      if (!cached) {
        try {
          const settings = await firstValueFrom(this.appsClient.getSettings(appId));
          this.appSettings.set(settings ?? null);
        } catch { /* settings failure is non-critical — expiry badge is omitted */ }
      }
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load billing invoices.'));
      this.invoices.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  // --- Payments modal ---
  openInvoicePayments(row: InvoiceRow): void {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.selectedInvoice.set(row);
    this.invoicePayments.set([]);
    this.paymentsLoading.set(true);

    firstValueFrom(this.appsClient.getLicenseInvoicePayments(appId, row.licenseInvoiceId))
      .then(payments => this.invoicePayments.set(payments ?? []))
      .catch(err =>
        this.notify.showError(this.extractError(err, 'Failed to load payment details.'))
      )
      .finally(() => this.paymentsLoading.set(false));
  }

  closePaymentsModal(): void {
    this.selectedInvoice.set(null);
  }

  // --- Renewal ---
  readonly renewPreparing = signal(false);

  async openRenewal(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.renewPreparing.set(true);
    try {
      const settings = await firstValueFrom(this.appsClient.getSettings(appId));
      this.appSettings.set(settings ?? null);
      if (!settings?.licenseRenewCalculatedTime) {
        this.notify.showError('Renewal date is not available.');
        return;
      }
      this.renewOpen.set(true);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to get renewal information.'));
    } finally {
      this.renewPreparing.set(false);
    }
  }

  closeRenewal(): void {
    if (this.renewSaving()) return;
    this.renewOpen.set(false);
  }

  async confirmRenewal(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.renewSaving.set(true);
    try {
      const result = await firstValueFrom(this.appsClient.renewLicense(appId));
      const url = result?.paymentUrl;
      if (url && typeof url === 'string' && url.startsWith('http')) {
        window.open(url, '_blank');
        this.notify.showSuccess('Redirecting to payment gateway…');
      } else {
        this.notify.showSuccess('Renewal successful.');
      }
      this.renewOpen.set(false);
      await this.load();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Renewal failed.'));
    } finally {
      this.renewSaving.set(false);
    }
  }

  // --- Pay Invoice ---
  readonly payPreparing = signal(false);

  async openPayInvoice(row: InvoiceRow): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.payPreparing.set(true);
    try {
      const settings = await firstValueFrom(this.appsClient.getSettings(appId));
      this.appSettings.set(settings ?? null);
      if (!settings?.licenseRenewCalculatedTime) {
        this.notify.showError('Renewal date is not available.');
        return;
      }
      this.payTarget.set(row);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to get invoice details.'));
    } finally {
      this.payPreparing.set(false);
    }
  }

  closePayInvoice(): void {
    if (this.paySaving()) return;
    this.payTarget.set(null);
  }

  async confirmPayInvoice(): Promise<void> {
    const row = this.payTarget();
    const appId = this.workspaceStore.currentAppId();
    if (!row || !appId) return;

    this.paySaving.set(true);
    try {
      const result = await firstValueFrom(
        this.appsClient.payLicenseInvoice(appId, row.licenseInvoiceId)
      );
      const url = result?.paymentUrl;
      if (url && typeof url === 'string' && url.startsWith('http')) {
        window.open(url, '_blank');
        this.notify.showSuccess('Redirecting to payment gateway…');
      } else {
        this.notify.showError('Invalid payment link received from server.');
      }
      this.payTarget.set(null);
      await this.load();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Payment failed.'));
    } finally {
      this.paySaving.set(false);
    }
  }

  // --- Helpers ---
  statusPillClass(status: LicenseInvoiceStatus): string {
    return STATUS_PILL[status] ?? 'muted';
  }

  paymentStatePillClass(state: PaymentState | string): string {
    const s = String(state).toLowerCase();
    if (s === 'captured' || s === 'succeeded') return 'ok';
    if (s === 'failed') return 'bad';
    if (s === 'unpaid') return 'warn';
    if (s === 'pending') return 'info';
    return 'muted';
  }

  licenseExpiryLabel(): string {
    const s = this.appSettings();
    if (!s?.licenseExpirationTime) return '';
    const d = new Date(s.licenseExpirationTime as any);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  renewalDescription(): string {
    const s = this.appSettings();
    if (!s?.licenseRenewCalculatedTime) return '';
    const d = new Date(s.licenseRenewCalculatedTime as any);
    const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    return s.licenseAmount
      ? `Extend until ${dateStr} · $${s.licenseAmount} USD`
      : `Extend until ${dateStr}`;
  }

  payDescription(): string {
    const s = this.appSettings();
    if (!s?.licenseRenewCalculatedTime) return '';
    const d = new Date(s.licenseRenewCalculatedTime as any);
    const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    return s.licenseAmount
      ? `Pay $${s.licenseAmount} USD to extend until ${dateStr}`
      : `Pay to extend until ${dateStr}`;
  }

  private toRow(i: LicenseInvoice): InvoiceRow {
    return {
      licenseInvoiceId: i.licenseInvoiceId,
      createdTime: i.createdTime,
      status: i.status,
      canPayLicenseInvoice: i.canPayLicenseInvoice,
      paymentUrl: i.paymentUrl,
    };
  }

  protected extractError(err: any, fallback: string): string {
    return err?.response?.message || err?.message || err?.exceptionMessage || fallback;
  }
}
