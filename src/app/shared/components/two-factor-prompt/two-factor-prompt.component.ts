import { Component, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TwoFactorPromptService } from '@core/services/two-factor-prompt.service';

/**
 * Global two-factor code prompt. Mounted once at the app root; shown/hidden by
 * {@link TwoFactorPromptService} whenever a request is gated by 2FA. The user
 * enters their authenticator code here and the original request is retried
 * transparently by the interceptor.
 */
@Component({
  selector: 'app-two-factor-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (svc.isOpen()) {
      <div class="tfp-overlay" (click)="onBackdrop()">
        <div class="tfp-modal" (click)="$event.stopPropagation()">
          <div class="tfp-head">
            <span class="material-symbols-outlined ic">encrypted</span>
            <h3>Two-factor authentication</h3>
            <button class="tfp-x" type="button" (click)="svc.cancel()" [disabled]="svc.verifying()" title="Cancel">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div class="tfp-body">
            <p class="tfp-msg">Enter the 6-digit code from your authenticator app to continue.</p>
            <input
              class="tfp-otp"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="000000"
              [(ngModel)]="code"
              (keyup.enter)="submitCode()"
              [class.err]="displayError()"
              [disabled]="svc.verifying()"
              autofocus
            />
            @if (displayError()) {
              <div class="tfp-err">{{ displayError() }}</div>
            }
          </div>
          <div class="tfp-foot">
            <button class="btn" type="button" (click)="svc.cancel()" [disabled]="svc.verifying()">Cancel</button>
            <div class="spacer"></div>
            <button class="btn btn-primary" type="button" (click)="submitCode()" [disabled]="svc.verifying()">
              <span class="material-symbols-outlined" [class.spin]="svc.verifying()">{{ svc.verifying() ? 'progress_activity' : 'check' }}</span>
              {{ svc.verifying() ? 'Verifying…' : 'Verify' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .tfp-overlay {
      position: fixed; inset: 0; z-index: 1200;
      background: rgba(15, 23, 42, 0.55);
      display: grid; place-items: center;
      padding: 20px;
      backdrop-filter: blur(2px);
    }
    .tfp-modal {
      width: 100%; max-width: 400px;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: var(--r-md, 14px);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
      overflow: hidden;
    }
    .tfp-head {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--border, #e5e7eb);
      .ic { color: var(--primary, #6366f1); font-size: 22px; }
      h3 { margin: 0; font-size: 15px; font-weight: 650; flex: 1; color: var(--text, #111827); }
    }
    .tfp-x {
      display: grid; place-items: center;
      width: 30px; height: 30px; border: none; border-radius: 8px;
      background: transparent; color: var(--text-3, #9ca3af); cursor: pointer;
      &:hover:not(:disabled) { background: var(--surface-2, #f3f4f6); color: var(--text, #111827); }
      &:disabled { opacity: 0.4; cursor: default; }
      .material-symbols-outlined { font-size: 20px; }
    }
    .tfp-body { padding: 18px; display: flex; flex-direction: column; gap: 12px; }
    .tfp-msg { margin: 0; font-size: 13px; line-height: 1.55; color: var(--text-2, #4b5563); }
    .tfp-otp {
      width: 100%; padding: 12px 14px;
      font-size: 22px; font-weight: 600; letter-spacing: 8px; text-align: center;
      font-variant-numeric: tabular-nums;
      border: 1px solid var(--border, #e5e7eb); border-radius: var(--r-sm, 10px);
      background: var(--surface, #fff); color: var(--text, #111827);
      &:focus { outline: none; border-color: var(--primary, #6366f1); }
      &.err { border-color: #ef4444; }
      &::placeholder { color: var(--text-3, #9ca3af); letter-spacing: 8px; }
      &:disabled { opacity: 0.6; }
    }
    .tfp-err { font-size: 12px; color: #ef4444; margin-top: -4px; }
    .tfp-foot {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px; border-top: 1px solid var(--border, #e5e7eb);
    }
    .tfp-foot .spacer { flex: 1; }
    .spin { animation: tfp-spin 0.9s linear infinite; }
    @keyframes tfp-spin { to { transform: rotate(360deg); } }
  `],
})
export class TwoFactorPromptComponent {
  readonly svc = inject(TwoFactorPromptService);

  code = '';
  tried = false;

  constructor() {
    // A server-side retry error (wrong code) reopens the prompt — clear the field
    // so the user starts fresh, and drop any stale local validation state.
    effect(() => {
      if (this.svc.error()) {
        this.code = '';
        this.tried = false;
      }
      if (!this.svc.isOpen()) {
        this.code = '';
        this.tried = false;
      }
    });
  }

  submitCode(): void {
    this.tried = true;
    const c = this.code.trim();
    if (!/^\d{6}$/.test(c)) return;
    this.svc.submit(c);
  }

  onBackdrop(): void {
    if (!this.svc.verifying()) this.svc.cancel();
  }

  /** Server-reported error (incorrect code) wins over local field validation. */
  displayError(): string {
    if (this.svc.error()) return this.svc.error();
    if (!this.tried) return '';
    const c = this.code.trim();
    if (!c) return 'Enter the 6-digit code from your authenticator app.';
    if (!/^\d{6}$/.test(c)) return 'The code must be 6 digits.';
    return '';
  }
}
