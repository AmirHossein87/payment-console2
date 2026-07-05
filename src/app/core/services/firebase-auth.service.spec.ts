import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { FirebaseAuthService } from './firebase-auth.service';
import { AuthStore } from '../stores/auth.store';
import { NotificationService } from './notification.service';
import { StorageService } from './storage.service';
import { AuthenticationClient } from '@proxy/payment-app-proxy';

/**
 * Builds a syntactically valid (unsigned) JWT with the given payload so the
 * service's token / expiry logic can be exercised without real Firebase.
 */
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60; // +1h
const PAST_EXP = Math.floor(Date.now() / 1000) - 60; // -1m

/**
 * Smoke / unit tests for the platform token-swap + session plumbing.
 *
 * Ported from payment-admin's firebase-auth.service.spec.ts and adapted to the
 * payment-console architecture: the service no longer owns parseJwt / storage
 * writes (those moved to jwt.util + AuthStore), so we assert against
 * AuthStore.setSession instead of StorageService.set('token', ...). The
 * Google Ads TagManager conversion signals do not exist in this fork, so those
 * assertions are intentionally dropped.
 */
describe('FirebaseAuthService', () => {
  let service: FirebaseAuthService;

  let authenticationClient: jasmine.SpyObj<AuthenticationClient>;
  let authStore: jasmine.SpyObj<AuthStore>;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let storage: jasmine.SpyObj<StorageService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authenticationClient = jasmine.createSpyObj('AuthenticationClient', ['signIn', 'signUp']);
    authStore = jasmine.createSpyObj('AuthStore', [
      'setSession',
      'clearSession',
      'startLoading',
      'stopLoading',
      'isAuthenticated',
      'token',
    ]);
    notificationService = jasmine.createSpyObj('NotificationService', ['showError', 'showSuccess']);
    storage = jasmine.createSpyObj('StorageService', ['get', 'set', 'clear', 'remove']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        FirebaseAuthService,
        { provide: AuthenticationClient, useValue: authenticationClient },
        { provide: AuthStore, useValue: authStore },
        { provide: NotificationService, useValue: notificationService },
        { provide: StorageService, useValue: storage },
        { provide: Router, useValue: router },
        { provide: Auth, useValue: {} },
      ],
    });

    service = TestBed.inject(FirebaseAuthService);

    // Never schedule the real background refresh timer during tests.
    spyOn(service, 'startBackgroundTokenRefresh').and.stub();
  });

  describe('isUserAuthenticated', () => {
    it('delegates to AuthStore.isAuthenticated (true)', () => {
      authStore.isAuthenticated.and.returnValue(true);
      expect(service.isUserAuthenticated()).toBeTrue();
    });

    it('delegates to AuthStore.isAuthenticated (false)', () => {
      authStore.isAuthenticated.and.returnValue(false);
      expect(service.isUserAuthenticated()).toBeFalse();
    });
  });

  describe('hasExpired', () => {
    it('returns false for a stored, non-expired token', () => {
      authStore.token.and.returnValue(makeJwt({ exp: FUTURE_EXP }));
      expect(service.hasExpired()).toBeFalse();
    });

    it('returns true for an expired token', () => {
      authStore.token.and.returnValue(makeJwt({ exp: PAST_EXP }));
      expect(service.hasExpired()).toBeTrue();
    });

    it('returns true when no token is stored', () => {
      authStore.token.and.returnValue(null);
      expect(service.hasExpired()).toBeTrue();
    });
  });

  describe('callSignIn', () => {
    it('persists the session via AuthStore.setSession', async () => {
      const accessToken = makeJwt({ exp: FUTURE_EXP });
      authenticationClient.signIn.and.returnValue(
        of({ accessToken: { value: accessToken }, userId: 'user-1' } as any)
      );

      const result = await service.callSignIn({ idToken: 'id-token' } as any);

      expect(authStore.setSession).toHaveBeenCalledWith(accessToken, 'user-1');
      expect(result.userId).toBe('user-1');
    });
  });

  describe('callSignUp', () => {
    it('persists the session via AuthStore.setSession', async () => {
      const accessToken = makeJwt({ exp: FUTURE_EXP });
      authenticationClient.signUp.and.returnValue(
        of({ accessToken: { value: accessToken }, userId: 'user-2' } as any)
      );

      const result = await service.callSignUp({ idToken: 'id-token' } as any);

      expect(authStore.setSession).toHaveBeenCalledWith(accessToken, 'user-2');
      expect(result.userId).toBe('user-2');
    });
  });
});
