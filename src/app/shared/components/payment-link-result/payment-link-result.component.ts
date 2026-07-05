import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-payment-link-result',
  standalone: true,
  imports: [CommonModule, QRCodeComponent],
  templateUrl: './payment-link-result.component.html',
  styleUrls: ['./payment-link-result.component.scss'],
})
export class PaymentLinkResultComponent {
  private readonly notify = inject(NotificationService);

  readonly url = input.required<string>();

  openLink(): void {
    window.open(this.url(), '_blank');
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.notify.showSuccess('Payment link copied');
    } catch {
      /* clipboard unavailable */
    }
  }
}
