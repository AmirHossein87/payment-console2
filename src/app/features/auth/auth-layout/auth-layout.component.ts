import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subject, takeUntil } from 'rxjs';
import { AuthStore } from '@core/stores/auth.store';
import { SettingsStore } from '@core/stores/settings.store';
import { AuthFlowOrchestratorService } from '@core/services/auth-flow-orchestrator.service';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { NotificationService } from '@core/services/notification.service';
import { Logger } from '@core/services/logger.service';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './auth-layout.component.html',
  styleUrls: ['./auth-layout.component.scss'],
})
export class AuthLayoutComponent implements OnInit, OnDestroy {
  private readonly log = Logger.create('AuthLayout');
  private readonly destroy$ = new Subject<void>();

  readonly authStore = inject(AuthStore);
  readonly settingsStore = inject(SettingsStore);
  private readonly orchestrator = inject(AuthFlowOrchestratorService);
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  showAuthErrorModal = false;

  async ngOnInit(): Promise<void> {
    await this.settingsStore.load();

    if (this.authStore.isAuthenticated()) {
      await this.orchestrator.evaluatePostAuth();
    }

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {});
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  closeAuthErrorModal(): void {
    this.showAuthErrorModal = false;
  }
}
