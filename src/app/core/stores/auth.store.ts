import { signal, computed, effect, Injectable, inject } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { parseJwt, isTokenExpired } from '../utils/jwt.util';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly storage = inject(StorageService);

  readonly token = signal<string | null>(this.storage.get('token'));
  readonly userId = signal<string | null>(this.storage.get('user'));
  readonly isAuthenticating = signal<boolean>(false);
  readonly authLoadingMessage = signal<string | null>(null);
  readonly isGoogleLoading = signal<boolean>(false);
  readonly isAutoLicenseLoading = signal<boolean>(false);
  readonly signupAlreadyRegistered = signal<boolean>(false);
  /** True after a sign-in attempt for an account that isn't registered yet. */
  readonly signinUnregistered = signal<boolean>(false);
  readonly isRedirectingToDashboard = signal<boolean>(false);

  readonly isAuthenticated = computed(() => {
    const t = this.token();
    if (!t) return false;
    return !isTokenExpired(t);
  });

  readonly decodedToken = computed(() => {
    const t = this.token();
    return t ? parseJwt(t) : null;
  });

  readonly tokenExpiration = computed(() => {
    const decoded = this.decodedToken();
    return decoded ? decoded.exp : null;
  });

  constructor() {
    effect(() => {
      const t = this.token();
      if (t) {
        this.storage.set('token', t);
      } else {
        this.storage.remove('token');
      }
    });

    effect(() => {
      const u = this.userId();
      if (u) {
        this.storage.set('user', u);
      } else {
        this.storage.remove('user');
      }
    });
  }

  setSession(token: string, userId: string): void {
    this.token.set(token);
    this.userId.set(userId);
  }

  clearSession(): void {
    this.token.set(null);
    this.userId.set(null);
    this.isAuthenticating.set(false);
    this.isGoogleLoading.set(false);
    this.isAutoLicenseLoading.set(false);
    this.isRedirectingToDashboard.set(false);
    this.authLoadingMessage.set(null);
    this.signinUnregistered.set(false);
  }

  startLoading(message: string): void {
    this.isAuthenticating.set(true);
    this.authLoadingMessage.set(message);
  }

  stopLoading(): void {
    this.isAuthenticating.set(false);
    this.authLoadingMessage.set(null);
  }
}
