import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  CustomersClient,
  Customer,
  CreateCustomerRequest,
} from '@proxy/payment-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { NotificationService } from '@core/services/notification.service';

/**
 * Reusable customer picker — search existing customers or create a new one.
 * Emits the chosen/created Customer via (selected). Open with `open()`.
 */
@Component({
  selector: 'app-customer-picker-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-picker-modal.component.html',
  styleUrls: ['./customer-picker-modal.component.scss'],
})
export class CustomerPickerModalComponent {
  private readonly customersClient = inject(CustomersClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly notify = inject(NotificationService);

  readonly isOpen = signal(false);
  readonly mode = signal<'search' | 'create'>('search');
  readonly results = signal<Customer[]>([]);
  readonly searching = signal(false);
  readonly creating = signal(false);

  readonly selected = output<Customer>();

  query = '';
  private searchTimer: any;

  // Create form
  ncId = '';
  ncFirst = '';
  ncLast = '';
  ncEmail = '';
  ncMobile = '';
  // True once Create was pressed — drives red borders on empty required fields.
  triedCreate = false;

  open(): void {
    this.reset();
    this.isOpen.set(true);
    this.search('');
  }

  close(): void {
    this.isOpen.set(false);
  }

  onSearchInput(event: Event): void {
    this.query = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search(this.query), 300);
  }

  async search(q: string): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.searching.set(true);
    try {
      const rows = await firstValueFrom(
        this.customersClient.list(
          appId,
          q || undefined, // searchCriteria
          undefined, // isBlocked
          undefined, // fraudPolicyId
          undefined, // isCheckAccountBalanceActivated
          1, // pageNumber
          5, // pageSize
        ),
      );
      this.results.set(rows ?? []);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to search customers.'));
      this.results.set([]);
    } finally {
      this.searching.set(false);
    }
  }

  pick(customer: Customer): void {
    this.selected.emit(customer);
    this.close();
  }

  showCreate(): void {
    this.mode.set('create');
    this.triedCreate = false;
  }

  backToSearch(): void {
    this.mode.set('search');
  }

  // Required fields highlighted via red borders (no inline messages).
  get idInvalid(): boolean {
    return this.triedCreate && !this.ncId.trim();
  }
  get emailInvalid(): boolean {
    return this.triedCreate && !this.ncEmail.trim();
  }

  async create(): Promise<void> {
    this.triedCreate = true;
    if (!this.ncId.trim() || !this.ncEmail.trim()) return;

    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.creating.set(true);
    try {
      const request = new CreateCustomerRequest({
        customerId: this.ncId.trim(),
        firstName: this.ncFirst.trim() || undefined,
        lastName: this.ncLast.trim() || undefined,
        email: this.ncEmail.trim(),
        mobileNumber: this.ncMobile.trim() || undefined,
      });
      const customer = await firstValueFrom(this.customersClient.create(appId, request));
      this.notify.showSuccess('Customer created.');
      this.selected.emit(customer);
      this.close();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to create customer.'));
    } finally {
      this.creating.set(false);
    }
  }

  displayName(c: Customer): string {
    const n = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    return n || c.customerId;
  }

  initials(c: Customer): string {
    const n = this.displayName(c);
    return n ? n.slice(0, 2).toUpperCase() : '?';
  }

  private reset(): void {
    this.mode.set('search');
    this.results.set([]);
    this.query = '';
    this.ncId = '';
    this.ncFirst = '';
    this.ncLast = '';
    this.ncEmail = '';
    this.ncMobile = '';
    this.triedCreate = false;
  }

  private extractError(err: any, fallback: string): string {
    return (
      err?.response?.Message ||
      err?.response?.message ||
      err?.Message ||
      err?.message ||
      fallback
    );
  }
}
