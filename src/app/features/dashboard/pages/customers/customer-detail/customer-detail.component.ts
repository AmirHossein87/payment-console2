import { Component, computed, effect, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CustomersClient, Customer } from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { BreadcrumbStore } from '@core/stores/breadcrumb.store';
import { NotificationService } from '@core/services/notification.service';
import { CustomerProfileTabComponent } from './tabs/customer-profile-tab/customer-profile-tab.component';
import { CustomerMethodsTabComponent } from './tabs/customer-methods-tab/customer-methods-tab.component';
import { CustomerPaymentsTabComponent } from './tabs/customer-payments-tab/customer-payments-tab.component';
import { CustomerFraudTabComponent } from './tabs/customer-fraud-tab/customer-fraud-tab.component';

type CdTab = 'profile' | 'methods' | 'payments' | 'fraud';

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [
    CommonModule,
    CustomerProfileTabComponent,
    CustomerMethodsTabComponent,
    CustomerPaymentsTabComponent,
    CustomerFraudTabComponent,
  ],
  templateUrl: './customer-detail.component.html',
  styleUrls: ['./customer-detail.component.scss', './customer-detail.shared.scss'],
})
export class CustomerDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly breadcrumbStore = inject(BreadcrumbStore);
  private readonly notify = inject(NotificationService);
  private readonly appClient = inject(CustomersClient);

  protected appId = '';
  protected customerId = '';

  readonly customer = signal<Customer | null>(null);
  readonly loading = signal(true);
  readonly activeTab = signal<CdTab>('profile');

  readonly fullName = computed(() => {
    const c = this.customer();
    if (!c) return '';
    return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.customerId;
  });

  readonly customerSubtitle = computed(() => {
    const c = this.customer();
    return c?.email || c?.mobileNumber || '';
  });

  readonly initials = computed(() => {
    const n = this.fullName() || this.customerId;
    return n ? n.slice(0, 2).toUpperCase() : '?';
  });

  readonly avatarGradient = computed(() =>
    this.gradientFor(this.customer()?.email || this.customerId),
  );

  constructor() {
    effect(() => {
      const appId = this.workspaceStore.currentAppId();
      const name = this.fullName();
      const id = this.customerId;
      const label = name && name !== id ? `${name} (${id})` : id || 'Customer';
      this.breadcrumbStore.set([
        { label: 'Customers', link: appId ? ['/', appId, 'customers'] : ['/'] },
        { label },
      ]);
    });
  }

  ngOnInit(): void {
    this.appId = this.workspaceStore.currentAppId() ?? '';
    this.customerId = this.route.snapshot.paramMap.get('customerId') ?? '';
    if (!this.appId || !this.customerId) {
      this.loading.set(false);
      return;
    }
    this.loadCustomer();
  }

  ngOnDestroy(): void {
    this.breadcrumbStore.clear();
  }

  async loadCustomer(): Promise<void> {
    this.loading.set(true);
    try {
      const c = await firstValueFrom(this.appClient.get(this.appId, this.customerId));
      this.customer.set(c);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load customer.'));
      this.customer.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: CdTab): void {
    this.activeTab.set(tab);
  }

  /** Merge a server-returned customer into the shared signal (header + tabs stay in sync). */
  onCustomerChanged(updated: Customer): void {
    this.customer.set(updated);
  }

  private gradientFor(seed: string): string {
    const palette = [
      '#f59e0b,#ef4444',
      '#6366f1,#8b5cf6',
      '#10b981,#059669',
      '#0ea5e9,#06b6d4',
      '#db2777,#9d174d',
      '#3880ff,#1f5bd0',
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i++)
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return `linear-gradient(135deg, ${palette[Math.abs(hash) % palette.length]})`;
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
