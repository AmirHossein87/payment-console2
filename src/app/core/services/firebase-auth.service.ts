import { Injectable, inject } from '@angular/core';
import {
  OAuthProvider,
  UserCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
} from '@angular/fire/auth';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import {
  ApiKey,
  AuthenticationClient,
  SignInRequest,
  SignUpRequest,
  RefreshTokenType,
} from '@proxy/payment-app-proxy';
import { AuthStore } from '../stores/auth.store';
import { NotificationService } from './notification.service';
import { StorageService } from './storage.service';
import { Logger } from './logger.service';
import { TagManagerService } from './tag-manager.service';
import { parseJwt, isTokenExpired } from '../utils/jwt.util';
import { environment } from '@environments/environment';

@Injectable({ providedIn: 'root' })
export class FirebaseAuthService {
  private readonly log = Logger.create('FirebaseAuth');
  private readonly auth = inject(Auth);
  private backgroundRefreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private authenticationClient: AuthenticationClient,
    private authStore: AuthStore,
    private notificationService: NotificationService,
    private storage: StorageService,
    private router: Router,
    private tagManager: TagManagerService
  ) {}

  async signInWithEmail(email: string, password: string): Promise<UserCredential> {
    return await signInWithEmailAndPassword(this.auth, email, password);
  }

  async signUpWithEmail(email: string, password: string): Promise<UserCredential> {
    return await createUserWithEmailAndPassword(this.auth, email, password);
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  async signInWithPopup(): Promise<UserCredential | null> {
    try {
      const provider = new OAuthProvider(GoogleAuthProvider.PROVIDER_ID);
      environment.Scopes.forEach((scope: string) => provider.addScope(scope));
      return await signInWithPopup(this.auth, provider);
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user') {
        return null;
      }
      this.log.error('Google sign-in popup error:', error);
      throw error;
    }
  }

  async callSignIn(signInRequest: SignInRequest): Promise<ApiKey> {
    const result = await firstValueFrom(
      this.authenticationClient.signIn(signInRequest)
    );
    this.authStore.setSession(result.accessToken.value, result.userId);
    this.startBackgroundTokenRefresh();
    // Google Ads conversion signal — the activation goal. Fires only on the
    // user's FIRST successful sign in (once per user), and only when the visitor
    // arrived via an ad click. Repeat sign-ins and token refresh never convert
    // (refresh bypasses this method via reconnect()).
    this.tagManager.trackFirstSignInConversion(result.userId);
    return result;
  }

  async callSignUp(signUpRequest: SignUpRequest, keepLoading = false): Promise<ApiKey> {
    const result = await firstValueFrom(
      this.authenticationClient.signUp(signUpRequest)
    );
    this.authStore.setSession(result.accessToken.value, result.userId);
    this.startBackgroundTokenRefresh();
    // Sign-up authenticates the user immediately (it returns an access token and
    // sets the session above) — so registration IS the user's first successful
    // sign in. Fire the same activation conversion as callSignIn. The
    // once-per-user marker inside trackFirstSignInConversion guarantees a later
    // real sign in won't double-count, and it's still gated by ad-click
    // attribution, so organic/direct sign-ups never convert.
    this.tagManager.trackFirstSignInConversion(result.userId);
    return result;
  }

  isUserAuthenticated(): boolean {
    return this.authStore.isAuthenticated();
  }

  hasExpired(): boolean {
    const token = this.authStore.token();
    if (!token) return true;
    return isTokenExpired(token);
  }

  async signout(preserveQueryParams?: Record<string, any>): Promise<void> {
    try {
      await signOut(this.auth);
    } catch {}

    const defaultApp = this.storage.get('default-app');
    this.authStore.clearSession();
    this.storage.clear();

    if (defaultApp) {
      localStorage.setItem('default-app', defaultApp);
    }

    if (this.backgroundRefreshInterval) {
      clearInterval(this.backgroundRefreshInterval);
      this.backgroundRefreshInterval = null;
    }

    let targetUrl = `${location.origin}/auth/signin`;
    if (preserveQueryParams) {
      const qParams = new URLSearchParams();
      Object.keys(preserveQueryParams).forEach((key) => {
        const val = preserveQueryParams[key];
        if (val !== null && val !== undefined) {
          qParams.set(key, String(val));
        }
      });
      const qStr = qParams.toString();
      if (qStr) targetUrl += `?${qStr}`;
    }
    location.href = targetUrl;
  }

  startBackgroundTokenRefresh(): void {
    if (this.backgroundRefreshInterval) {
      clearInterval(this.backgroundRefreshInterval);
    }

    const token = this.authStore.token();
    if (!token) return;

    const decoded = parseJwt(token);
    const exp = decoded.exp;
    const nowTime = Math.round(Date.now() / 1000);
    const jobTime = (exp - nowTime - 60) * 1000;

    if (jobTime <= 0) {
      this.reconnect();
      return;
    }

    this.backgroundRefreshInterval = setInterval(async () => {
      await this.reconnect(false);
    }, jobTime);
  }

  async reconnect(showLoader = true): Promise<void> {
    if (showLoader) {
      this.authStore.startLoading('Refreshing session...');
    }

    try {
      const idToken = await this.getRefreshToken();
      const signInRequest = new SignInRequest({
        idToken,
        refreshTokenType: RefreshTokenType.None,
      });
      const result: ApiKey = await lastValueFrom(
        this.authenticationClient.signIn(signInRequest)
      );
      this.authStore.setSession(result.accessToken.value, result.userId);
      this.startBackgroundTokenRefresh();
    } catch (error) {
      if (showLoader) {
        this.authStore.stopLoading();
      }
      if (this.backgroundRefreshInterval) {
        clearInterval(this.backgroundRefreshInterval);
      }
      this.notificationService.showError('Session expired. Please sign in again.');
      await this.signout();
    }
  }

  private async getRefreshToken(): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) {
      await this.signout();
      throw new Error('No authenticated user');
    }
    return await user.getIdToken();
  }
}
