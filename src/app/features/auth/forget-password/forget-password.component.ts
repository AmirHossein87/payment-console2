import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthStore } from '@core/stores/auth.store';
import { SettingsStore } from '@core/stores/settings.store';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-forget-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forget-password.component.html',
  styleUrls: ['./forget-password.component.scss'],
})
export class ForgetPasswordComponent {
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly authStore = inject(AuthStore);
  readonly settingsStore = inject(SettingsStore);

  email = '';

  async onForgetPass(): Promise<void> {
    if (!this.email) return;
    try {
      this.authStore.isGoogleLoading.set(true);
      await this.firebaseAuth.sendPasswordResetEmail(this.email);
      this.authStore.isGoogleLoading.set(false);
      // Redirect to the "Check your email" confirmation page (preserve params).
      this.router.navigate(['/auth/confirm'], {
        queryParams: this.route.snapshot.queryParams,
      });
    } catch (error: any) {
      this.authStore.isGoogleLoading.set(false);
      this.notificationService.showError(this.getFirebaseErrorMessage(error));
    }
  }

  private getFirebaseErrorMessage(error: any): string {
    if (!error) return 'An error occurred.';
    if (error.code) {
      switch (error.code) {
        case 'auth/invalid-email':
          return 'Invalid email address format.';
        case 'auth/user-not-found':
          return 'No account found with that email address.';
        case 'auth/missing-email':
          return 'Please enter your email address.';
        case 'auth/too-many-requests':
          return 'Too many attempts. Please try again later.';
        default:
          return error.message || 'An unexpected error occurred. Please try again.';
      }
    }
    return error.message || 'An unexpected error occurred. Please try again.';
  }
}
