import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  icon?: string;
  confirm: () => Promise<void>;
}

/**
 * Generic confirmation dialog used for destructive actions (delete policy,
 * disconnect gateway, etc.). The host supplies a `confirm` callback that
 * performs the action; the modal manages loading + close.
 */
@Component({
  selector: "app-confirm-modal",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="overlay" [class.open]="isOpen()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="mh">
          <span
            class="material-symbols-outlined"
            [class.danger]="config()?.danger"
            >{{ config()?.icon || "warning" }}</span
          >
          <h3>{{ config()?.title || "Confirm" }}</h3>
          <div class="spacer"></div>
          <button
            class="icon-btn"
            (click)="close()"
            [disabled]="busy()"
            title="Close"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="mb">
          <p class="confirm-text">{{ config()?.message }}</p>
        </div>
        <div class="mf">
          <div class="spacer"></div>
          <button class="btn" (click)="close()" [disabled]="busy()">
            {{ config()?.cancelLabel || "Cancel" }}
          </button>
          <button
            class="btn"
            [class.btn-danger]="config()?.danger"
            [class.btn-primary]="!config()?.danger"
            (click)="confirm()"
            [disabled]="busy()"
          >
            <span class="material-symbols-outlined" [class.spin]="busy()">{{
              config()?.danger ? "delete" : "check"
            }}</span>
            {{ busy() ? "Working…" : config()?.confirmLabel || "Confirm" }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(2px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 60;
      }
      .overlay.open {
        display: flex;
        animation: fade 0.2s ease;
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      .modal {
        background: var(--surface);
        border-radius: var(--r-lg);
        width: 400px;
        max-width: calc(100vw - 32px);
        display: flex;
        flex-direction: column;
        box-shadow: var(--sh-lg);
        animation: pop 0.2s ease;
      }
      @keyframes pop {
        from {
          transform: scale(0.96);
          opacity: 0.6;
        }
        to {
          transform: none;
          opacity: 1;
        }
      }
      .mh {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--border);
      }
      .mh .material-symbols-outlined {
        font-size: 20px;
        color: var(--warn);
      }
      .mh .material-symbols-outlined.danger {
        color: var(--bad);
      }
      .mh h3 {
        font-size: 15px;
        font-weight: 700;
      }
      .mh .spacer {
        flex: 1;
      }
      .mb {
        padding: 20px;
      }
      .confirm-text {
        color: var(--text-2);
        font-size: 13.5px;
        line-height: 1.5;
      }
      .mf {
        padding: 16px 20px;
        border-top: 1px solid var(--border);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .mf .spacer {
        flex: 1;
      }
      .spin {
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class ConfirmModalComponent {
  readonly isOpen = signal(false);
  readonly busy = signal(false);
  readonly config = signal<ConfirmConfig | null>(null);

  open(config: ConfirmConfig): void {
    this.busy.set(false);
    this.config.set(config);
    this.isOpen.set(true);
  }

  close(): void {
    if (this.busy()) return;
    this.isOpen.set(false);
  }

  async confirm(): Promise<void> {
    const cfg = this.config();
    if (!cfg) return;
    this.busy.set(true);
    try {
      await cfg.confirm();
      this.isOpen.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
