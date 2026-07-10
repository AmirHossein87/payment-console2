import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthStore } from '@core/stores/auth.store';
import { SettingsStore } from '@core/stores/settings.store';
import { AuthFlowOrchestratorService } from '@core/services/auth-flow-orchestrator.service';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-agreement',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './agreement.component.html',
  styleUrls: ['./agreement.component.scss'],
})
export class AgreementComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly orchestrator = inject(AuthFlowOrchestratorService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly authStore = inject(AuthStore);
  readonly settingsStore = inject(SettingsStore);

  email = '';
  password = '';
  confirmPassword = '';
  agreeToTerms = false;
  queryParams: any = {};

  ngOnInit(): void {
    this.authStore.signupAlreadyRegistered.set(false);

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        this.queryParams = params;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isFormValid(): boolean {
    if (!this.email || !this.password || !this.confirmPassword || !this.agreeToTerms) {
      return false;
    }
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailPattern.test(this.email)) return false;
    if (this.password.length < 6 || this.password !== this.confirmPassword) return false;
    return true;
  }

  getPasswordError(): string | null {
    if (this.password && this.password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    if (this.password && this.confirmPassword && this.password !== this.confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  }

  async onLeave(): Promise<void> {
    await this.firebaseAuth.signout(this.queryParams);
  }

  async signinWithGoogle(): Promise<void> {
    this.authStore.signupAlreadyRegistered.set(false);
    this.authStore.isGoogleLoading.set(true);
    try {
      const userCredential = await this.firebaseAuth.signInWithPopup();
      if (userCredential) {
        const idToken = await userCredential.user.getIdToken();
        await this.orchestrator.initiateFirebaseSession(idToken);
      } else {
        this.authStore.isGoogleLoading.set(false);
      }
    } catch (error: any) {
      this.authStore.isGoogleLoading.set(false);
      this.notificationService.showError(this.getFirebaseErrorMessage(error));
    }
  }

  async onSignUp(): Promise<void> {
    this.authStore.signupAlreadyRegistered.set(false);
    if (!this.isFormValid()) return;

    if (!this.firebaseAuth.isUserAuthenticated()) {
      try {
        this.authStore.isGoogleLoading.set(true);
        const userCredential = await this.firebaseAuth.signUpWithEmail(
          this.email,
          this.password
        );

        // A brand-new email/password account is unverified. Firebase issues an
        // ID token with email_verified:false, which the backend signup API
        // rejects ("email is not verified"). Send the verification email and
        // route to the verify-email page — the backend is provisioned only
        // AFTER the user verifies (see VerifyEmailComponent.checkVerification).
        if (!userCredential.user.emailVerified) {
          // The account now EXISTS in Firebase and the user is signed in. A
          // failure to *send* the verification email must NOT look like a signup
          // failure — otherwise the account is stranded and the next attempt hits
          // "email already in use". Route to the verify-email page regardless (it
          // has a Resend button); only surface the send failure as a hint. This
          // is the root cause of the "errored but was created" scenario.
          try {
            await this.firebaseAuth.sendEmailVerification();
          } catch {
            this.notificationService.showError(
              'We couldn\'t send the verification email. Use "Resend" on the next screen.'
            );
          }
          this.authStore.isGoogleLoading.set(false);
          this.router.navigate(['/auth/verify-email'], {
            queryParams: { ...this.queryParams, email: this.email },
          });
          return;
        }

        // Already verified (e.g. a pre-existing verified credential) — provision
        // immediately. isSignup=true because we're on the sign-up path.
        const idToken = await userCredential.user.getIdToken();
        await this.orchestrator.initiateFirebaseSession(idToken, true);
      } catch (error: any) {
        this.authStore.isGoogleLoading.set(false);
        // A duplicate email means the account already exists — often the user's
        // OWN account, created by an earlier attempt that errored *after* the
        // account was made. Surface the inline box (sign in / forgot password)
        // instead of a dead-end toast so they can recover.
        if (error?.code === 'auth/email-already-in-use') {
          this.authStore.signupAlreadyRegistered.set(true);
        } else {
          this.notificationService.showError(this.getFirebaseErrorMessage(error));
        }
      } finally {
        this.password = '';
        this.confirmPassword = '';
      }
      return;
    }

    await this.orchestrator.completeAgreement();
  }

  private getFirebaseErrorMessage(error: any): string {
    if (!error) return 'An error occurred.';
    if (error.code) {
      switch (error.code) {
        case 'auth/invalid-email': return 'Invalid email address format.';
        case 'auth/email-already-in-use': return 'Email address is already in use.';
        case 'auth/weak-password': return 'Password should be at least 6 characters.';
        case 'auth/operation-not-allowed': return 'Email/password accounts are not enabled.';
        case 'auth/network-request-failed': return 'Network error — we couldn\'t reach the sign-up service. Check your connection (and any ad blocker or VPN), then try again.';
        case 'auth/too-many-requests': return 'Too many attempts. Please wait a moment and try again.';
        default: return error.message || 'An unexpected registration error occurred.';
      }
    }
    return error.message || 'An unexpected registration error occurred.';
  }
}
