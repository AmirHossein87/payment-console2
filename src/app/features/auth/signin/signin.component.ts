import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '@core/stores/auth.store';
import { SettingsStore } from '@core/stores/settings.store';
import { AuthFlowOrchestratorService } from '@core/services/auth-flow-orchestrator.service';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-signin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.scss'],
})
export class SigninComponent {
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly orchestrator = inject(AuthFlowOrchestratorService);
  private readonly notificationService = inject(NotificationService);
  readonly authStore = inject(AuthStore);
  readonly settingsStore = inject(SettingsStore);

  email = '';
  password = '';

  async signinWithGoogle(): Promise<void> {
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

  async onSubmit(): Promise<void> {
    if (!this.email || !this.password) return;
    try {
      this.authStore.isGoogleLoading.set(true);
      const userCredential = await this.firebaseAuth.signInWithEmail(this.email, this.password);
      const idToken = await userCredential.user.getIdToken();
      await this.orchestrator.initiateFirebaseSession(idToken);
    } catch (error: any) {
      this.authStore.isGoogleLoading.set(false);
      this.notificationService.showError(this.getFirebaseErrorMessage(error));
    } finally {
      this.password = '';
    }
  }

  private getFirebaseErrorMessage(error: any): string {
    if (!error) return 'An error occurred.';
    if (error.code) {
      switch (error.code) {
        case 'auth/invalid-email': return 'Invalid email address format.';
        case 'auth/user-disabled': return 'This user account has been disabled.';
        case 'auth/user-not-found': return 'User not found.';
        case 'auth/wrong-password': return 'Incorrect password.';
        case 'auth/email-already-in-use': return 'Email address is already in use.';
        case 'auth/weak-password': return 'Password should be at least 6 characters.';
        case 'auth/invalid-credential': return 'Invalid credentials provided.';
        case 'auth/network-request-failed': return 'Network error — we couldn\'t reach the sign-in service. Check your connection (and any ad blocker or VPN), then try again.';
        case 'auth/too-many-requests': return 'Too many attempts. Please wait a moment and try again.';
        default: return error.message || 'An unexpected authentication error occurred.';
      }
    }
    return error.message || 'An unexpected authentication error occurred.';
  }
}
