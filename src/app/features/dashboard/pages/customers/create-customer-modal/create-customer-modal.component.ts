import { Component, signal, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  CustomersClient as BaseCustomersClient,
  CreateCustomerRequest,
  Customer,
} from '@proxy/payment-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { NotificationService } from '@core/services/notification.service';

const EMAIL_RE = /^[A-Za-z0-9._%+-]{2,}@[a-zA-Z-_.]{2,}[.]{1}[a-zA-Z]{2,}$/;

interface CreateCustomerForm {
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
}

@Component({
  selector: 'app-create-customer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-customer-modal.component.html',
  styleUrls: ['./create-customer-modal.component.scss'],
})
export class CreateCustomerModalComponent {
  private readonly baseClient = inject(BaseCustomersClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly notify = inject(NotificationService);

  readonly created = output<Customer>();

  readonly isOpen = signal(false);
  readonly busy = signal(false);
  readonly tried = signal(false);

  form: CreateCustomerForm = this.emptyForm();

  open(): void {
    this.form = this.emptyForm();
    this.tried.set(false);
    this.isOpen.set(true);
  }

  close(): void {
    if (this.busy()) return;
    this.isOpen.set(false);
  }

  async create(): Promise<void> {
    this.tried.set(true);
    if (
      this.customerIdInvalid ||
      this.firstNameInvalid ||
      this.lastNameInvalid ||
      this.emailInvalid
    ) {
      return;
    }

    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    const req = new CreateCustomerRequest({
      customerId: this.form.customerId.trim(),
      firstName: this.form.firstName.trim() || null,
      lastName: this.form.lastName.trim() || null,
      email: this.form.email.trim() || null,
      mobileNumber: this.form.mobileNumber.trim() || null,
    });

    this.busy.set(true);
    try {
      const customer = await firstValueFrom(this.baseClient.create(appId, req));
      this.notify.showSuccess(`Customer "${customer.customerId}" has been created.`);
      this.created.emit(customer);
      this.isOpen.set(false);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to create customer.'));
    } finally {
      this.busy.set(false);
    }
  }

  private emptyForm(): CreateCustomerForm {
    return { customerId: '', firstName: '', lastName: '', email: '', mobileNumber: '' };
  }

  get customerIdInvalid(): boolean {
    return this.tried() && !this.form.customerId.trim();
  }
  get firstNameInvalid(): boolean {
    return this.tried() && !this.form.firstName.trim();
  }
  get lastNameInvalid(): boolean {
    return this.tried() && !this.form.lastName.trim();
  }
  get emailInvalid(): boolean {
    return this.tried() && !EMAIL_RE.test(this.form.email.trim());
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
