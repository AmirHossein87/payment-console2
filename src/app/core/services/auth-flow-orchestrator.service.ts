import { Injectable, inject } from '@angular/core';
import { Router, Params } from '@angular/router';
import {
  SignInRequest,
  SignUpRequest,
  RefreshTokenType,
} from '@proxy/payment-app-proxy';
import { FirebaseAuthService } from './firebase-auth.service';
import { LicenseFlowService } from './license-flow.service';
import { AuthStore } from '../stores/auth.store';
import { SettingsStore } from '../stores/settings.store';
import { LicenseStore } from '../stores/license.store';
import { WorkspaceStore } from '../stores/workspace.store';
import { NotificationService } from './notification.service';
import { StorageService } from './storage.service';
import { Logger } from './logger.service';
import { appendTokenParams } from '../utils/url.util';

@Injectable({ providedIn: 'root' })
export class AuthFlowOrchestratorService {
  private readonly log = Logger.create('AuthFlowOrchestrator');

  private readonly router = inject(Router);
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly licenseFlow = inject(LicenseFlowService);
  private readonly notificationService = inject(NotificationService);
  private readonly storage = inject(StorageService);
  private readonly authStore = inject(AuthStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly licenseStore = inject(LicenseStore);
  private readonly workspaceStore = inject(WorkspaceStore);

  async initiateFirebaseSession(idToken: string, isSignupOverride?: boolean): Promise<void> {
    // Normally sign-up vs sign-in is inferred from the URL ("/auth/signup"). But
    // the verify-email page provisions a just-verified NEW account while sitting
    // on "/auth/verify-email" (no "signup" segment), so it passes an explicit
    // flag. Fall back to URL sniffing for the in-form Google/email flows.
    const isSignup = isSignupOverride ?? this.router.url.includes('signup');
    this.authStore.signupAlreadyRegistered.set(false);
    this.authStore.signinUnregistered.set(false);

    try {
      this.authStore.isGoogleLoading.set(true);

      if (isSignup) {
        this.authStore.startLoading('Registering your user account...');
        const signUpRequest = new SignUpRequest({
          idToken,
          refreshTokenType: RefreshTokenType.Web,
        });
        await this.firebaseAuth.callSignUp(signUpRequest, false);
      } else {
        this.authStore.startLoading('Signing in...');
        const signInRequest = new SignInRequest({
          idToken,
          refreshTokenType: RefreshTokenType.Web,
        });
        await this.firebaseAuth.callSignIn(signInRequest);
      }

      this.authStore.stopLoading();
      this.log.info(
        isSignup
          ? 'Sign up successful, evaluating post-login flow.'
          : 'Sign in successful, evaluating post-login flow.'
      );
      await this.evaluatePostAuth();
    } catch (error: any) {
      this.authStore.isRedirectingToDashboard.set(false);
      this.authStore.stopLoading();
      this.log.warn(isSignup ? 'Sign up failed:' : 'Sign in failed:', error);

      const is403 = error?.status === 403;
      // The error interceptor normalizes `response` into an object, so coerce
      // both response and message to strings before substring matching (the
      // source could rely on a raw string `response`; here it would throw).
      const responseText =
        typeof error?.response === 'string'
          ? error.response
          : JSON.stringify(error?.response ?? '');
      const messageText = typeof error?.message === 'string' ? error.message : '';

      // 409 Conflict on sign-up means the account already exists — the user does
      // not need to register, they just need to sign in. The interceptor does NOT
      // carry the HTTP 409 status through (it reads `status` from the body, which
      // is absent), so the reliable signal is the backend exception type
      // ("AlreadyExistsException"). Keep the status/text checks as fallbacks.
      const is409 =
        error?.status === 409 ||
        error?.statusCode === 409 ||
        error?.type === 'Conflict' ||
        error?.typeName === 'AlreadyExistsException' ||
        error?.exceptionTypeName === 'AlreadyExistsException' ||
        responseText.includes('AlreadyExistsException') ||
        messageText.includes('AlreadyExistsException') ||
        messageText.includes('duplicate key');
      const isUnregisteredException =
        error?.typeName === 'UnregisteredUserException' ||
        error?.exceptionTypeName === 'UnregisteredUserException' ||
        responseText.includes('UnregisteredUserException') ||
        responseText.includes('UnregsistredUserException') ||
        messageText.includes('UnregisteredUserException') ||
        messageText.includes('UnregsistredUserException');

      if (isSignup && (is409 || (is403 && !isUnregisteredException))) {
        // Account already exists — surface the "already registered, please sign in"
        // box on the sign-up page (via signupAlreadyRegistered) instead of a toast,
        // mirroring the sign-in unregistered prompt. No signup retry.
        this.log.info('Sign up rejected — user already exists. Prompting sign in.');
        this.authStore.signupAlreadyRegistered.set(true);
        this.authStore.isGoogleLoading.set(false);
      } else if (!isSignup && this.checkIfUnregistered(error)) {
        // Signing in with an account that was never registered — do NOT silently
        // auto-create it. Surface a "no account yet, please sign up" prompt on the
        // sign-in page (via the signinUnregistered flag) and let the user choose.
        this.log.info('Sign in rejected — user is not registered. Prompting sign up.');
        this.authStore.signinUnregistered.set(true);
        this.authStore.isGoogleLoading.set(false);
      } else {
        const errorMsg = this.getErrorMessage(
          error,
          isSignup ? 'Registration failed.' : 'Authentication failed.'
        );
        this.notificationService.showError(errorMsg);
        this.authStore.isGoogleLoading.set(false);
      }
    }
  }

  async evaluatePostAuth(): Promise<void> {
    const params = this.getQueryParams();
    const returnUrl = params['returnUrl'];

    // Fetch the user's theme from the server exactly once, right after login,
    // and let SettingsStore persist it locally — every later read (Settings
    // page, topbar) uses that synced value instead of re-fetching/re-deriving.
    await Promise.all([this.settingsStore.load(), this.settingsStore.loadUserTheme()]);

    const isLicenseActive = this.settingsStore.isSupportLicenseManagement();

    if (isLicenseActive && returnUrl) {
      this.log.info('returnUrl detected and licensing active. Redirecting to grant access.');
      this.authStore.isRedirectingToDashboard.set(false);
      this.router.navigate(['/auth/grant-access'], { queryParams: params });
      this.authStore.isGoogleLoading.set(false);
    } else {
      this.log.info('Navigating to admin dashboard (licensing active).');
      this.authStore.isRedirectingToDashboard.set(true);
      await this.proceedToDashboard(params['appId']);
    }
  }

  async completeAgreement(): Promise<void> {
    this.log.info('Agreement completed. Continuing flow.');
    await this.evaluatePostAuth();
  }

  async handleGrantAccessDecision(
    isGranted: boolean,
    returnUrl: string | null,
    appId: string | null
  ): Promise<void> {
    if (!returnUrl) {
      this.log.warn('No returnUrl provided. Navigating to signin.');
      this.router.navigate(['/auth/signin']);
      return;
    }

    if (!isGranted) {
      this.log.info('Access denied. Redirecting to returnUrl without token.');
      const fullReturnUrl = returnUrl.startsWith('http') ? returnUrl : `https://${returnUrl}`;
      window.location.href = fullReturnUrl;
      return;
    }

    try {
      this.authStore.startLoading('Preparing authorization...');
      const licenseInfo = await this.licenseFlow.ensureLicenseToken(appId, returnUrl);
      this.authStore.stopLoading();

      const finalUrl = appendTokenParams(
        returnUrl,
        licenseInfo.licenseId,
        licenseInfo.authorizationCode
      );
      this.log.info('Redirecting to returnUrl with authorization code:', finalUrl);
      window.location.href = finalUrl;
    } catch (err: any) {
      this.authStore.stopLoading();
      this.log.error('Failed to secure authorization code:', err);
      const errorMsg = this.getErrorMessage(err, 'Failed to grant access.');
      this.notificationService.showError(errorMsg);
    }
  }

  private async proceedToDashboard(appId: string | null): Promise<void> {
    this.authStore.isRedirectingToDashboard.set(true);

    try {
      this.authStore.startLoading('Securing license...');
      await this.settingsStore.load();

      const appLicenses = await this.licenseStore.getBestLicense(false);

      if (appLicenses && appLicenses.length > 0) {
        // best-license returned records — open a workspace directly from them.
        // Priority: an explicitly-requested appId the user actually owns →
        // the sandbox app → the first (live) app.
        const requested = appId ? appLicenses.find((al) => al.appId === appId) : null;
        const sandbox = appLicenses.find((al) => al.isSandbox);
        const target = requested ?? sandbox ?? appLicenses[0];

        this.log.info('Opening workspace from best-license:', target.appId, {
          isSandbox: !!target.isSandbox,
        });
        this.authStore.stopLoading();
        this.navigateWithDelay(target.appId);
        return;
      }

      // No existing license/app — provision one, then route into it.
      this.log.info('No matching license. Creating new license.');
      const newLicense = await this.licenseFlow.createLicense(appId, null);
      this.authStore.stopLoading();
      await this.navigateToDashboard(newLicense?.licenseId);
    } catch (err) {
      this.log.warn('Licensing evaluation failed; falling back to license listing.', err);
      this.authStore.stopLoading();
      await this.navigateToDashboard();
    }
  }

  async navigateToDashboard(newlyCreatedLicenseId?: string): Promise<void> {
    this.authStore.isRedirectingToDashboard.set(true);
    const params = this.getQueryParams();
    const appId = params['appId'];

    if (appId) {
      this.workspaceStore.setAppId(appId);
      this.router.navigate([`/${appId}/overview`]);
      return;
    }

    try {
      this.authStore.startLoading('Loading workspaces...');
      const licenses = await this.licenseStore.loadLicenses();
      const allApps = this.licenseStore.permissibleApps();

      // Prefer the user's last-used workspace, but ONLY if it still belongs to
      // their current licenses. `default-app` is intentionally preserved across
      // signout, so a stale or cross-account pointer would otherwise route to an
      // app this user cannot access and bounce them to /forbidden despite holding
      // a perfectly valid license.
      const storedAppId = this.storage.get('default-app');
      if (
        storedAppId &&
        WorkspaceStore.isValidAppId(storedAppId) &&
        allApps.some((a) => a.appId === storedAppId)
      ) {
        this.navigateWithDelay(storedAppId);
        return;
      }
      if (storedAppId) {
        this.log.info(
          'Stored default-app is not in the current license set; clearing it.',
          storedAppId
        );
        this.storage.remove('default-app');
        localStorage.removeItem('default-app');
      }

      if (newlyCreatedLicenseId) {
        const targetLicense = licenses.find((l) => l.licenseId === newlyCreatedLicenseId);
        if (targetLicense?.apps?.length) {
          const sandboxApp = targetLicense.apps.find((app) => app.isSandbox);
          if (sandboxApp) {
            this.navigateWithDelay(sandboxApp.appId);
            return;
          }
        }
      }

      const sandboxApp = this.licenseStore.sandboxApp();
      if (sandboxApp) {
        this.navigateWithDelay(sandboxApp.appId);
      } else if (allApps.length >= 1) {
        this.navigateWithDelay(allApps[0].appId);
      } else {
        this.router.navigate(['/notfound']);
      }
    } catch (err: any) {
      this.log.error('Failed to load dashboard data:', err);
      const errorMsg = this.getErrorMessage(err, 'Failed to load dashboard workspaces.');
      this.notificationService.showError(errorMsg);
    } finally {
      this.authStore.stopLoading();
      this.authStore.isGoogleLoading.set(false);
    }
  }

  private navigateWithDelay(appId: string): void {
    setTimeout(() => {
      this.workspaceStore.setAppId(appId);
      this.router.navigate([`/${appId}/overview`]);
    }, 200);
  }

  private checkIfUnregistered(error: any): boolean {
    if (!error) return false;
    return (
      error.status === 403 ||
      error.typeName === 'UnregisteredUserException' ||
      error.exceptionTypeName === 'UnregisteredUserException' ||
      error.response?.includes('UnregisteredUserException') ||
      error.response?.includes('UnregsistredUserException') ||
      error.message?.includes('UnregisteredUserException') ||
      error.message?.includes('UnregsistredUserException')
    );
  }

  private getQueryParams(): Params {
    let route = this.router.routerState.snapshot.root;
    const params = { ...route.queryParams };
    while (route.firstChild) {
      route = route.firstChild;
      Object.assign(params, route.queryParams);
    }
    return params;
  }

  private getErrorMessage(error: any, fallback: string): string {
    if (!error) return fallback;

    if (error.message && typeof error.message === 'string' && error.message.trim() !== '') {
      return error.message;
    }

    if (error.response) {
      try {
        let parsed: any = error.response;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (parsed && typeof parsed === 'object') {
          if (parsed.Message) return parsed.Message;
          if (parsed.message) return parsed.message;
        }
      } catch {}
    }

    if (error.Message && typeof error.Message === 'string' && error.Message.trim() !== '') {
      return error.Message;
    }

    return fallback;
  }
}
