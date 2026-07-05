import { Component, input, output, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { CustomersClient, Customer, UpdateCustomerRequest } from '@proxy/payment-app-proxy';
import { NotificationService } from '@core/services/notification.service';
import { UniversalEditModalComponent } from '@shared/components/universal-edit-modal/universal-edit-modal.component';
import { patchOf } from '@core/utils/patch.util';

@Component({
  selector: 'app-customer-profile-tab',
  standalone: true,
  imports: [CommonModule, UniversalEditModalComponent],
  templateUrl: './customer-profile-tab.component.html',
  styleUrls: ['../../customer-detail.shared.scss'],
})
export class CustomerProfileTabComponent {
  @ViewChild('editor') private editor!: UniversalEditModalComponent;

  private readonly appClient = inject(CustomersClient);
  private readonly notify = inject(NotificationService);

  readonly customer = input.required<Customer | null>();
  readonly appId = input.required<string>();
  readonly customerId = input.required<string>();

  readonly customerChanged = output<Customer>();

  readonly loadingRaw = signal(false);
  readonly showRaw = signal(false);
  readonly rawJson = signal('');

  editFirstName(): void {
    const c = this.customer();
    if (!c) return;
    this.editor.open({
      title: 'Edit first name',
      icon: 'person',
      label: 'First name',
      type: 'text',
      value: c.firstName ?? '',
      required: true,
      save: async (v: string) => this.patchCustomer({ firstName: patchOf(v) } as UpdateCustomerRequest),
    });
  }

  editLastName(): void {
    const c = this.customer();
    if (!c) return;
    this.editor.open({
      title: 'Edit last name',
      icon: 'person',
      label: 'Last name',
      type: 'text',
      value: c.lastName ?? '',
      required: true,
      save: async (v: string) => this.patchCustomer({ lastName: patchOf(v) } as UpdateCustomerRequest),
    });
  }

  editEmail(): void {
    const c = this.customer();
    if (!c) return;
    this.editor.open({
      title: 'Edit email',
      icon: 'mail',
      label: 'Email',
      type: 'text',
      value: c.email ?? '',
      placeholder: 'name@example.com',
      save: async (v: string) => this.patchCustomer({ email: patchOf(v) } as UpdateCustomerRequest),
    });
  }

  editMobile(): void {
    const c = this.customer();
    if (!c) return;
    this.editor.open({
      title: 'Edit mobile',
      icon: 'phone',
      label: 'Mobile number',
      type: 'text',
      value: c.mobileNumber ?? '',
      required: false,
      save: async (v: string | null) =>
        this.patchCustomer({ mobile: patchOf(v || null) } as UpdateCustomerRequest),
    });
  }

  async showProviderRawInfo(): Promise<void> {
    this.loadingRaw.set(true);
    try {
      const info = await firstValueFrom(
        this.appClient.getProviderRawInfo(this.appId(), this.customerId()),
      );
      this.rawJson.set(JSON.stringify(info ?? {}, null, 2));
      this.showRaw.set(true);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load provider raw info.'));
    } finally {
      this.loadingRaw.set(false);
    }
  }

  closeRaw(): void {
    this.showRaw.set(false);
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
