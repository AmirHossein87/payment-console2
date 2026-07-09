import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '@core/stores/auth.store';
import { SettingsStore } from '@core/stores/settings.store';
import { AuthFlowOrchestratorService } from '@core/services/auth-flow-orchestrator.service';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { NotificationService } from '@core/services/notification.service';

/**
 * Sits between email/password sign-up and backend provisioning.
 *
 * AgreementComponent.onSignUp creates the Firebase account, fires the
 * verification email, and routes here. A brand-new account's ID token carries
 * `email_verified: false`, which the backend signup API rejects — so we do NOT
 * call the backend until the user has clicked the link in their inbox.
 *
 * "I've verified my email" reloads the Firebase user, checks `emailVerified`,
 * force-refreshes the ID token (so it carries the updated claim) and only then
 * hands off to the orchestrator to provision the account (isSignup=true).
 */
@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.scss'],
})
export class VerifyEmailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly orchestrator = inject(AuthFlowOrchestratorService);
  private readonly notify = inject(NotificationService);
  readonly authStore = inject(AuthStore);
  readonly settingsStore = inject(SettingsStore);

  readonly email = signal<string | null>(null);
  readonly checking = signal(false);
  readonly resending = signal(false);
  readonly resendCooldown = signal(0);
  /** True when there is no Firebase session to verify against (e.g. a reload). */
  readonly noActiveUser = signal(false);

  private queryParams: Record<string, any> = {};
  private cooldownHandle: ReturnType<typeof setInterval> | null = null;
  private readonly resendCooldownSeconds = 60;

  ngOnInit(): void {
    // Clear any lingering loader from the sign-up page.
    this.authStore.isGoogleLoading.set(false);

    this.queryParams = { ...this.route.snapshot.queryParams };
    this.email.set(this.queryParams['email'] || this.firebaseAuth.getCurrentUserEmail());

    // No Firebase session → nothing to verify (start sign-up again).
    if (!this.firebaseAuth.getCurrentUserEmail()) {
      this.noActiveUser.set(true);
    }
  }

  ngOnDestroy(): void {
    if (this.cooldownHandle) clearInterval(this.cooldownHandle);
  }

  /**
   * Reloads the Firebase user and, once the email is verified, provisions the
   * account through the signup API and continues the normal post-signup flow.
   */
  async checkVerification(): Promise<void> {
    if (this.checking() || this.noActiveUser()) return;
    this.checking.set(true);
    try {
      await this.firebaseAuth.reloadCurrentUser();

      if (!this.firebaseAuth.isCurrentUserEmailVerified()) {
        this.notify.showError(
          "Your email isn't verified yet. Please click the link we emailed you, then try again."
        );
        return;
      }

      // Verified — force-refresh the ID token so it carries email_verified:true,
      // then provision the account (explicit isSignup=true: the URL is
      // /auth/verify-email, which the orchestrator would otherwise read as sign-in).
      const idToken = await this.firebaseAuth.getCurrentUserIdToken(true);
      await this.orchestrator.initiateFirebaseSession(idToken, true);
    } catch (error: any) {
      this.notify.showError(
        error?.message || 'Failed to check verification status. Please try again.'
      );
    } finally {
      this.checking.set(false);
    }
  }

  async resend(): Promise<void> {
    if (this.resending() || this.resendCooldown() > 0 || this.noActiveUser()) return;
    this.resending.set(true);
    try {
      await this.firebaseAuth.sendEmailVerification();
      this.notify.showSuccess('Verification email sent. Please check your inbox.');
      this.startResendCooldown();
    } catch (error: any) {
      this.notify.showError(
        error?.code === 'auth/too-many-requests'
          ? 'Too many requests. Please wait a moment before resending.'
          : error?.message || 'Failed to resend verification email.'
      );
    } finally {
      this.resending.set(false);
    }
  }

  async useDifferentEmail(): Promise<void> {
    await this.firebaseAuth.signout(this.queryParams);
  }

  private startResendCooldown(): void {
    this.resendCooldown.set(this.resendCooldownSeconds);
    if (this.cooldownHandle) clearInterval(this.cooldownHandle);
    this.cooldownHandle = setInterval(() => {
      this.resendCooldown.update((v) => v - 1);
      if (this.resendCooldown() <= 0 && this.cooldownHandle) {
        clearInterval(this.cooldownHandle);
        this.cooldownHandle = null;
      }
    }, 1000);
  }
}
