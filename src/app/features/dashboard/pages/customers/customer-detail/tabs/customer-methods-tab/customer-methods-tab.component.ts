import { Component, input, inject, signal, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import {
  CustomersClient as BaseCustomersClient,
  PaymentMethod,
} from '@proxy/payment-proxy';
import { NotificationService } from '@core/services/notification.service';
import { ConfirmModalComponent, ConfirmConfig } from '@shared/components/confirm-modal/confirm-modal.component';
import { PaymentLinkResultComponent } from '@shared/components/payment-link-result/payment-link-result.component';
import { ProviderLogoComponent } from '@shared/components/provider-logo/provider-logo.component';

@Component({
  selector: 'app-customer-methods-tab',
  standalone: true,
  imports: [CommonModule, ConfirmModalComponent, PaymentLinkResultComponent, ProviderLogoComponent],
  templateUrl: './customer-methods-tab.component.html',
  styleUrls: ['../../customer-detail.shared.scss'],
})
export class CustomerMethodsTabComponent implements OnInit {
  @ViewChild('confirm') private confirm!: ConfirmModalComponent;

  private readonly baseClient = inject(BaseCustomersClient);
  private readonly notify = inject(NotificationService);

  readonly appId = input.required<string>();
  readonly customerId = input.required<string>();

  readonly methods = signal<PaymentMethod[]>([]);
  readonly loading = signal(false);
  readonly panelLinkLoading = signal(false);
  readonly panelLink = signal('');

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await firstValueFrom(
        this.baseClient.getCustomerPaymentMethods(this.appId(), this.customerId()),
      );
      this.methods.set(rows ?? []);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load payment methods.'));
      this.methods.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  confirmDelete(m: PaymentMethod): void {
    const cfg: ConfirmConfig = {
      title: 'Delete payment method',
      message: `Are you sure you want to delete ${m.paymentMethodNumber || m.paymentMethodType}?`,
      confirmLabel: 'Delete',
      danger: true,
      icon: 'delete',
      confirm: async () => this.deletePaymentMethod(m),
    };
    this.confirm.open(cfg);
  }

  private async deletePaymentMethod(m: PaymentMethod): Promise<void> {
    try {
      await firstValueFrom(
        this.baseClient.removePaymentMethod(this.appId(), this.customerId(), m.paymentMethodId),
      );
      this.notify.showSuccess('Payment method deleted.');
      this.load();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to delete payment method.'));
    }
  }

  async getCustomerPanelLink(): Promise<void> {
    this.panelLinkLoading.set(true);
    try {
      const link = await firstValueFrom(
        this.baseClient.getCustomerPanelLink(this.appId(), this.customerId()),
      );
      if (link && !link.toLowerCase().includes('error') && !link.toLowerCase().includes('invalid')) {
        this.panelLink.set(link);
      } else {
        this.notify.showError('Could not generate customer panel link.');
      }
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to generate customer panel link.'));
    } finally {
      this.panelLinkLoading.set(false);
    }
  }

  closePanelLink(): void {
    this.panelLink.set('');
  }

  methodTypeIcon(type: any): string {
    const t = String(type ?? '');
    if (t.toLowerCase().includes('check') || t.toLowerCase().includes('bank') || t === 'ACH') {
      return 'account_balance';
    }
    if (t.toLowerCase().includes('paypal')) return 'account_balance_wallet';
    if (t.toLowerCase().includes('crypto')) return 'currency_bitcoin';
    return 'credit_card';
  }

  verifyPill(state: any): string {
    const s = String(state ?? '');
    if (s === 'Verified') return 'ok';
    if (s === 'SendVerificationPayments' || s === 'ReadyToConfirm') return 'warn';
    return 'muted';
  }

  verifyLabel(state: any): string {
    const s = String(state ?? '');
    return s === 'SendVerificationPayments' || s === 'ReadyToConfirm' ? 'Unconfirmed' : s || '—';
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
