import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of notificationService.toasts(); track toast.id) {
        <div class="toast" [class.toast-error]="toast.type === 'error'" [class.toast-success]="toast.type === 'success'">
          <span class="toast-message">{{ toast.message }}</span>
          <button class="toast-dismiss" (click)="notificationService.dismiss(toast.id)">&times;</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(500px, 90vw);
    }
    .toast {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      border-radius: var(--r-sm);
      box-shadow: var(--sh-lg);
      font-family: var(--font);
      font-size: 0.9rem;
      animation: slideDown 0.3s ease forwards;
    }
    .toast-error { background: var(--bad); color: #fff; }
    .toast-success { background: var(--ok); color: #fff; }
    .toast-dismiss {
      background: none;
      border: none;
      color: inherit;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0 0 0 12px;
      opacity: 0.8;
    }
    .toast-dismiss:hover { opacity: 1; }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class ToastContainerComponent {
  readonly notificationService = inject(NotificationService);
}
