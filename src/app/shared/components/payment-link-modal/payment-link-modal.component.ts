import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PaymentLinkResultComponent } from '@shared/components/payment-link-result/payment-link-result.component';

@Component({
  selector: 'app-payment-link-modal',
  standalone: true,
  imports: [CommonModule, PaymentLinkResultComponent],
  templateUrl: './payment-link-modal.component.html',
  styleUrls: ['./payment-link-modal.component.scss'],
})
export class PaymentLinkModalComponent {
  readonly isOpen = signal(false);
  readonly url = signal('');
  readonly title = signal('Payment link');

  open(url: string | null | undefined, title = 'Payment link'): void {
    if (!url) return;
    this.url.set(url);
    this.title.set(title);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
