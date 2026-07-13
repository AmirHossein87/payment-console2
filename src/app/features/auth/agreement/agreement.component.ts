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
  /** Set once the user attempts to submit — gates the validation messages so the
      form isn't red before they've tried, but every dead click now explains itself. */
  tried = false;

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

  /** Email error — shown only after a submit attempt so the field isn't red early. */
  getEmailError(): string | null {
    if (!this.tried) return null;
    if (!this.email) return 'Email is required.';
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailPattern.test(this.email)) return 'Enter a valid email address.';
    return null;
  }

  getPasswordError(): string | null {
    if (this.tried && !this.password) return 'Password is required.';
    if (this.password && this.password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    if (this.tried && this.password && !this.confirmPassword) {
      return 'Please confirm your password.';
    }
    if (this.password && this.confirmPassword && this.password !== this.confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  }

  /** Terms error — the #1 silent blocker: the button was disabled with no message. */
  getTermsError(): string | null {
    return this.tried && !this.agreeToTerms ? 'Please accept the terms to continue.' : null;
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
      const msg = this.getFirebaseErrorMessage(error);
      if (msg) this.notificationService.showError(msg);
    }
  }

  async onSignUp(): Promise<void> {
    this.authStore.signupAlreadyRegistered.set(false);
    // Mark as attempted so the template reveals exactly WHY it can't proceed
    // (missing/invalid email, password, or unaccepted terms) — no more silent
    // dead clicks on a disabled button.
    this.tried = true;
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
          // The account now EXISTS in Firebase and the user is signed in. Don't
          // send the verification email here — the verify-email page sends it on
          // arrival (single source of truth), so every path that lands there gets
          // an email uniformly and a send failure can't strand the account.
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
        if (error?.code === 'auth/email-already-in-use') {
          // The account already exists — most often the user's OWN account from
          // an earlier attempt that created it but errored before verification.
          // Telling them to "sign in" is a dead end (the backend rejects an
          // unverified account), so instead sign them in with the credentials
          // they just typed and route them to verify-email to resend/continue.
          await this.recoverExistingEmail(this.email, this.password);
        } else {
          this.authStore.isGoogleLoading.set(false);
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

  /**
   * Handles "email already in use" on sign-up. Usually the SAME user, whose
   * earlier attempt created the Firebase account but errored before verification
   * — leaving them unverified and unable to sign in (the backend rejects
   * unverified tokens). Sign in with the credentials they just typed, then:
   *   • not verified → resend + go to the verify-email page (sign-in mode).
   *   • verified     → they already have a usable account → continue the sign-in flow.
   *   • sign-in fails (different password / not their account) → show the inline
   *     "already registered — sign in / reset password" box.
   */
  private async recoverExistingEmail(email: string, password: string): Promise<void> {
    try {
      const cred = await this.firebaseAuth.signInWithEmail(email, password);

      if (!cred.user.emailVerified) {
        // Existing but unverified — the session is now established. This is the
        // SIGN-UP flow, so after verification the backend call must be signUp
        // (create the account): a first-time user signs up, THEN signs in. Route
        // to verify-email WITHOUT a mode → it defaults to 'signup'.
        this.authStore.isGoogleLoading.set(false);
        this.router.navigate(['/auth/verify-email'], {
          queryParams: { ...this.queryParams, email },
        });
        return;
      }

      // Verified account whose password matches — they meant to sign in. Continue
      // the normal sign-in flow (isSignup=false). initiateFirebaseSession manages
      // the loader / navigation from here.
      const idToken = await cred.user.getIdToken();
      await this.orchestrator.initiateFirebaseSession(idToken, false);
    } catch {
      // Couldn't establish a session with the typed password. Never show an
      // inline box — always route to a PAGE. If a Firebase session for this email
      // is still active (e.g. an earlier attempt in this same tab), the
      // verify-email/confirmation page can resend; otherwise send them to the
      // sign-in page (email preserved), which also offers "forgot password".
      this.authStore.isGoogleLoading.set(false);
      const active = this.firebaseAuth.getCurrentUserEmail();
      if (active && active.toLowerCase() === email.toLowerCase()) {
        // Still the SIGN-UP flow → verify-email WITHOUT a mode (defaults to
        // 'signup') so verification is followed by signUp, not signIn.
        this.router.navigate(['/auth/verify-email'], {
          queryParams: { ...this.queryParams, email },
        });
      } else {
        this.notificationService.showError('This email is already registered. Please sign in.');
        this.router.navigate(['/auth/signin'], {
          queryParams: { ...this.queryParams, email },
        });
      }
    }
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
        case 'auth/popup-blocked': return 'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
        case 'auth/cancelled-popup-request': return '';
        default: return error.message || 'An unexpected registration error occurred.';
      }
    }
    return error.message || 'An unexpected registration error occurred.';
  }
}
