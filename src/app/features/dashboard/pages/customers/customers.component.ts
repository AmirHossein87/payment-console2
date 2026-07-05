import {
  Component,
  signal,
  computed,
  inject,
  ViewChild,
  TemplateRef,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { CustomersClient, Customer, FraudPolicy, FraudPoliciesClient } from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { NotificationService } from '@core/services/notification.service';
import { DataGridComponent } from '@shared/components/data-grid/data-grid.component';
import { GridColumn } from '@shared/components/data-grid/data-grid.interface';
import { CreateCustomerModalComponent } from './create-customer-modal/create-customer-modal.component';

interface CustomerRow {
  customerId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  mobileNumber?: string | null;
  isBlocked: boolean;
  fraudPolicyId: number;
  createdTime: Date;
  fullName: string;
  fraudPolicyName: string;
}

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, DataGridComponent, CreateCustomerModalComponent],
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.scss'],
})
export class CustomersComponent implements OnInit {
  @ViewChild('customerTemplate', { static: true })
  customerTemplate!: TemplateRef<any>;

  private readonly customersClient = inject(CustomersClient);
  private readonly fraudPoliciesClient = inject(FraudPoliciesClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  readonly rows = signal<CustomerRow[]>([]);
  readonly loading = signal(false);
  gridColumns: GridColumn[] = [];

  searchCriteria = "";

  private policyNameById = new Map<number, string>();

  // --- Advanced filter (fraud policy + blocked status) — applied server-side ---
  readonly policies = signal<FraudPolicy[]>([]);
  // Staged values edited in the modal; committed to `applied*` on "Apply filter".
  readonly fPolicy = signal<number | null>(null);
  readonly fBlocked = signal<'' | 'yes' | 'no'>('');
  // Applied values that drive the API query and the active-count badge.
  readonly appliedPolicy = signal<number | null>(null);
  readonly appliedBlocked = signal<'' | 'yes' | 'no'>('');
  readonly advancedOpen = signal(false);

  readonly activeFilterCount = computed(
    () => (this.appliedPolicy() != null ? 1 : 0) + (this.appliedBlocked() ? 1 : 0),
  );

  ngOnInit(): void {
    this.gridColumns = [
      {
        id: 'customerId',
        header: 'Customer ID',
        field: 'customerId',
        width: '180px',
        isLink: true,
        isSortable: true,
        isFilterable: true,
        linkHref: (row: any) => this.detailUrl(row.customerId),
      },
      {
        id: 'customer',
        header: 'Customer',
        field: 'firstName',
        type: 'custom',
        customTemplate: this.customerTemplate,
        width: 'minmax(220px, 1fr)',
        isSortable: true,
        isFilterable: true,
        valueFormatter: (_v: any, row: any) => row.fullName,
      },
      {
        id: 'email',
        header: 'Email',
        field: 'email',
        width: 'minmax(200px, 1fr)',
        isSortable: true,
        isFilterable: true,
        valueFormatter: (v: any) => v || '—',
      },
      {
        id: 'mobileNumber',
        header: 'Mobile',
        field: 'mobileNumber',
        width: '150px',
        isSortable: true,
        valueFormatter: (v: any) => v || '—',
      },
      {
        id: 'isBlocked',
        header: 'Status',
        field: 'isBlocked',
        type: 'status',
        width: '130px',
        isSortable: true,
        isFilterable: true,
        badgeMap: { true: 'bad', false: 'ok' },
        valueFormatter: (v: any) => (v ? 'Blocked' : 'Active'),
      },
      {
        id: 'fraudPolicyName',
        header: 'Policy',
        field: 'fraudPolicyName',
        width: '160px',
        isSortable: true,
        isFilterable: true,
        valueFormatter: (v: any) => v || '—',
      },
      {
        id: 'createdTime',
        header: 'Created',
        field: 'createdTime',
        type: 'date',
        width: '140px',
        isSortable: true,
      },
    ];

    this.load();
  }

  async load(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.loading.set(true);
    try {
      const isBlocked =
        this.appliedBlocked() === 'yes' ? true : this.appliedBlocked() === 'no' ? false : undefined;
      const policyId = this.appliedPolicy() ?? undefined;
      const { customers, policies } = await firstValueFrom(
        forkJoin({
          customers: this.customersClient.list(appId, this.searchCriteria || undefined, isBlocked, policyId),
          policies: this.fraudPoliciesClient.list(appId),
        }),
      );
      this.policies.set(policies ?? []);
      this.policyNameById = new Map(
        (policies ?? []).map((p: FraudPolicy) => [p.fraudPolicyId, p.fraudPolicyName]),
      );
      this.rows.set((customers ?? []).map((c: Customer) => this.enrich(c)));
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load customers.'));
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  onCreated(customer: Customer): void {
    this.load();
    // Open the freshly created customer's detail page.
    const appId = this.workspaceStore.currentAppId();
    if (appId && customer?.customerId) {
      this.router.navigate(['/', appId, 'customers', customer.customerId]);
    }
  }

  onLinkClicked(event: { column: GridColumn; row: any; value: any }): void {
    const appId = this.workspaceStore.currentAppId();
    if (appId) this.router.navigate(['/', appId, 'customers', String(event.value)]);
  }

  onSearchChanged(state: { globalSearch: string }): void {
    const term = (state.globalSearch ?? '').trim();
    if (term === this.searchCriteria) return;
    this.searchCriteria = term;
    this.load();
  }

  // --- Advanced filter controls ---
  openAdvanced(): void {
    // Seed the modal with the currently-applied values.
    this.fPolicy.set(this.appliedPolicy());
    this.fBlocked.set(this.appliedBlocked());
    this.advancedOpen.set(true);
  }
  closeAdvanced(): void { this.advancedOpen.set(false); }
  setPolicyFilter(v: string): void { this.fPolicy.set(v === '' ? null : Number(v)); }
  setBlockedFilter(v: string): void { this.fBlocked.set((v as '' | 'yes' | 'no') ?? ''); }

  /** Commit the staged filters and re-query the API. */
  applyFilters(): void {
    this.appliedPolicy.set(this.fPolicy());
    this.appliedBlocked.set(this.fBlocked());
    this.advancedOpen.set(false);
    this.rows.set([]);
    this.load();
  }

  /** Clear all filters and reload. */
  clearFilters(): void {
    this.fPolicy.set(null);
    this.fBlocked.set('');
    this.appliedPolicy.set(null);
    this.appliedBlocked.set('');
    this.advancedOpen.set(false);
    this.rows.set([]);
    this.load();
  }

  // --- Display helpers ---

  displayName(row: CustomerRow): string {
    return row.fullName || row.customerId;
  }

  initials(row: CustomerRow): string {
    const name = this.displayName(row);
    return name ? name.slice(0, 2).toUpperCase() : '?';
  }

  avatarGradient(seed: string): string {
    return this.gradientFor(seed);
  }

  private enrich(c: Customer): CustomerRow {
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return {
      ...c,
      fullName,
      fraudPolicyName: c.fraudPolicyId ? this.policyNameById.get(c.fraudPolicyId) ?? '' : '',
    };
  }

  private detailUrl(customerId: string): string {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return '';
    return this.router.serializeUrl(
      this.router.createUrlTree(['/', appId, 'customers', customerId]),
    );
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
