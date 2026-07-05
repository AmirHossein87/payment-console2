import { Component, input } from '@angular/core';
import { Customer } from '@proxy/payment-app-proxy';
import { PaymentsComponent } from '@features/dashboard/pages/payments/payments.component';

/**
 * Customer's Payments tab — reuses the exact main PaymentsComponent grid, locked
 * to this customer via its `customerId` input (which also hides the now-redundant
 * Customer column and skips the /payments URL sync).
 */
@Component({
  selector: 'app-customer-payments-tab',
  standalone: true,
  imports: [PaymentsComponent],
  templateUrl: './customer-payments-tab.component.html',
  styleUrls: ['../../customer-detail.shared.scss'],
})
export class CustomerPaymentsTabComponent {
  readonly appId = input.required<string>();
  readonly customerId = input.required<string>();
  readonly customer = input<Customer | null>(null);
}
