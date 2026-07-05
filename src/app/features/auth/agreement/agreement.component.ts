import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
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
        const idToken = await userCredential.user.getIdToken();
        await this.orchestrator.initiateFirebaseSession(idToken);
      } catch (error: any) {
        this.authStore.isGoogleLoading.set(false);
        this.notificationService.showError(this.getFirebaseErrorMessage(error));
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
        default: return error.message || 'An unexpected registration error occurred.';
      }
    }
    return error.message || 'An unexpected registration error occurred.';
  }
}
