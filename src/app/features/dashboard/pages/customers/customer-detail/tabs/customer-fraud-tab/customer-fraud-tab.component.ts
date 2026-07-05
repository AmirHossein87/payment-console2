import { Component, input, output, inject, signal, computed, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import {
  CustomersClient,
  Customer,
  CustomerActivityLog,
  FraudPoliciesClient,
  FraudPolicy,
  UpdateCustomerRequest,
  ActivityLogType,
} from '@proxy/payment-app-proxy';
import { NotificationService } from '@core/services/notification.service';
import { UniversalEditModalComponent } from '@shared/components/universal-edit-modal/universal-edit-modal.component';
import {
  ConfirmModalComponent,
  ConfirmConfig,
} from '@shared/components/confirm-modal/confirm-modal.component';
import { patchOf } from '@core/utils/patch.util';
import { DataGridComponent } from '@shared/components/data-grid/data-grid.component';
import { GridColumn } from '@shared/components/data-grid/data-grid.interface';

@Component({
  selector: 'app-customer-fraud-tab',
  standalone: true,
  imports: [CommonModule, UniversalEditModalComponent, ConfirmModalComponent, DataGridComponent],
  templateUrl: './customer-fraud-tab.component.html',
  styleUrls: ['../../customer-detail.shared.scss'],
})
export class CustomerFraudTabComponent implements OnInit {
  @ViewChild('editor') private editor!: UniversalEditModalComponent;
  @ViewChild('confirm') private confirm!: ConfirmModalComponent;
  @ViewChild('descriptionTemplate', { static: true }) descriptionTemplate!: TemplateRef<any>;

  private readonly appClient = inject(CustomersClient);
  private readonly fraudPoliciesClient = inject(FraudPoliciesClient);
  private readonly notify = inject(NotificationService);

  readonly customer = input.required<Customer | null>();
  readonly appId = input.required<string>();
  readonly customerId = input.required<string>();

  readonly customerChanged = output<Customer>();

  readonly policies = signal<FraudPolicy[]>([]);
  readonly allLogs = signal<CustomerActivityLog[]>([]);
  readonly loadingLogs = signal(false);

  readonly showCustomData = signal(false);
  readonly customDataContent = signal('');

  /** Event-type filter — rendered as a custom select in the grid's toolbar
   *  (beside Refresh) instead of the grid's own built-in per-column filter. */
  readonly selectedType = signal<string | undefined>(undefined);
  readonly logTypeOptions = Object.values(ActivityLogType);

  readonly filteredLogs = computed(() => {
    const type = this.selectedType();
    const logs = this.allLogs();
    return type ? logs.filter((l) => l.activityLogType === type) : logs;
  });

  gridColumns: GridColumn[] = [];

  /** Mirrors the old activityClass() mapping, as a GridColumn badgeMap. */
  private readonly activityBadgeMap: Record<string, string> = {
    Blocked: 'bad',
    RejectedPayment: 'bad',
    Firewall: 'bad',
    Unblocked: 'ok',
    UpdateFraudPolicy: 'info',
    AffectedCheckPolicyTime: 'muted',
  };

  readonly policyName = computed(() => {
    const c = this.customer();
    const id = c?.fraudPolicyId;
    if (id == null) return '—';
    return this.policies().find((p) => p.fraudPolicyId === id)?.fraudPolicyName ?? String(id);
  });

  ngOnInit(): void {
    this.gridColumns = [
      {
        id: 'activityLogType',
        header: 'Event',
        field: 'activityLogType',
        type: 'status',
        width: '160px',
        badgeMap: this.activityBadgeMap,
      },
      {
        id: 'createdTime',
        header: 'Date',
        field: 'createdTime',
        type: 'date',
        width: '160px',
        isSortable: true,
      },
      {
        id: 'customData',
        header: 'Description',
        field: 'customData',
        type: 'custom',
        customTemplate: this.descriptionTemplate,
        width: 'minmax(220px, 1fr)',
      },
      {
        id: 'createdByUserId',
        header: 'Actor',
        field: 'createdByUserId',
        width: '160px',
        valueFormatter: (v: any) => v || 'System',
      },
    ];

    this.loadPolicies();
    this.loadLogs();
  }

  async loadPolicies(): Promise<void> {
    try {
      const list = await firstValueFrom(this.fraudPoliciesClient.list(this.appId()));
      this.policies.set(list ?? []);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load policies.'));
    }
  }

  async loadLogs(): Promise<void> {
    this.loadingLogs.set(true);
    try {
      const logs = await firstValueFrom(
        this.appClient.getCustomerActivityLogs(this.appId(), this.customerId()),
      );
      this.allLogs.set(logs ?? []);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load activity logs.'));
      this.allLogs.set([]);
    } finally {
      this.loadingLogs.set(false);
    }
  }

  // --- Fraud policy change ---

  editPolicy(): void {
    const c = this.customer();
    if (!c) return;
    this.editor.open({
      title: 'Change fraud policy',
      icon: 'shield',
      label: 'Fraud policy',
      type: 'select',
      value: c.fraudPolicyId,
      options: this.policies().map((p) => ({ label: p.fraudPolicyName, value: p.fraudPolicyId })),
      save: async (v: any) => this.patchCustomer({ fraudPolicyId: patchOf(Number(v)) } as UpdateCustomerRequest),
    });
  }

  // --- Block / unblock ---

  confirmToggleBlock(): void {
    const c = this.customer();
    if (!c) return;
    const blocking = !c.isBlocked;
    const cfg: ConfirmConfig = {
      title: blocking ? 'Block customer' : 'Unblock customer',
      message: blocking
        ? `Block customer "${c.customerId}"? They will be prevented from making payments.`
        : `Unblock customer "${c.customerId}"? They will be allowed to make payments again.`,
      confirmLabel: blocking ? 'Block' : 'Unblock',
      danger: blocking,
      icon: blocking ? 'block' : 'lock_open',
      confirm: async () => {
        try {
          await this.patchCustomer({ isBlocked: patchOf(blocking) } as UpdateCustomerRequest);
          // Block/unblock writes a new activity-log entry server-side — reload
          // the grid so it shows up without a manual refresh.
          this.loadLogs();
        } catch (err: any) {
          this.notify.showError(this.extractError(err, 'Failed to update customer.'));
          throw err;
        }
      },
    };
    this.confirm.open(cfg);
  }

  // --- Reset affected policy ---

  confirmResetAffectedPolicy(): void {
    const cfg: ConfirmConfig = {
      title: 'Reset affected policy',
      message:
        'Reset the affected check policy time for this customer? This re-evaluates fraud rules on the next payment.',
      confirmLabel: 'Reset',
      icon: 'restart_alt',
      confirm: async () => this.resetAffectedPolicy(),
    };
    this.confirm.open(cfg);
  }

  private async resetAffectedPolicy(): Promise<void> {
    try {
      await firstValueFrom(
        this.appClient.resetAffectedCheckPolicyTime(this.appId(), this.customerId()),
      );
      this.notify.showSuccess('Affected policy has been reset.');
      this.loadLogs();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to reset affected policy.'));
    }
  }

  // --- Activity log filtering ---

  onTypeFilter(type: string): void {
    this.selectedType.set(type || undefined);
  }

  // --- Custom data viewer ---

  customDataSummary(customData?: string | null): string {
    if (!customData) return '—';
    try {
      const parsed = JSON.parse(customData);
      if (parsed?.RuleDescription?.FraudDescription) {
        return parsed.RuleDescription.FraudDescription;
      }
      if (parsed?.FraudDescription) return parsed.FraudDescription;
    } catch {
      // fall through to raw
    }
    return customData.length > 60 ? customData.slice(0, 60) + '…' : customData;
  }

  viewCustomData(customData?: string | null): void {
    if (!customData) return;
    let content = customData;
    try {
      content = JSON.stringify(JSON.parse(customData), null, 2);
    } catch {
      // keep raw
    }
    this.customDataContent.set(content);
    this.showCustomData.set(true);
  }

  closeCustomData(): void {
    this.showCustomData.set(false);
  }

  private async patchCustomer(req: UpdateCustomerRequest): Promise<void> {
    const updated = await firstValueFrom(
      this.appClient.updateCustomer(this.appId(), this.customerId(), req),
    );
    if (updated) this.customerChanged.emit(updated);
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
