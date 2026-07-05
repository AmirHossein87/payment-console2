import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '@core/stores/auth.store';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (authStore.isAuthenticating()) {
      <div class="loading-overlay">
        <div class="spinner"></div>
        <p class="loading-message">
          {{ authStore.authLoadingMessage() || 'Loading...' }}
        </p>
      </div>
    }
  `,
  styles: [`
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(2px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 9999;
      animation: fadeIn 0.3s ease forwards;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .loading-message {
      color: #fff;
      font-size: 0.95rem;
      font-weight: 600;
      font-family: var(--font);
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `],
})
export class LoadingOverlayComponent {
  readonly authStore = inject(AuthStore);
}
