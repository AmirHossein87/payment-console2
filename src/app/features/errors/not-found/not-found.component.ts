import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="error-page">
      <span class="material-symbols-outlined error-icon">error</span>
      <h1>404</h1>
      <p>Page Not Found</p>
      <p class="error-detail">The page you're looking for doesn't exist or has been moved.</p>
      <a routerLink="/auth/signin" class="back-link">Back to Sign In</a>
    </div>
  `,
  styles: [`
    .error-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 12px;
      font-family: var(--font);
      background: var(--app-bg);
      color: var(--text);
    }
    .error-icon {
      font-size: 4rem;
      color: var(--text-2);
    }
    h1 {
      font-size: 3rem;
      font-weight: 700;
    }
    p {
      color: var(--text-2);
    }
    .error-detail {
      font-size: 0.9rem;
    }
    .back-link {
      margin-top: 16px;
      padding: 10px 24px;
      background: var(--brand-500);
      color: #fff;
      border-radius: var(--r-sm);
      font-weight: 600;
      transition: background 0.2s ease;
    }
    .back-link:hover {
      background: var(--brand-600);
    }
  `],
})
export class NotFoundComponent {}
