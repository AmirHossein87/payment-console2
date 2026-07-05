import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthStore } from '../stores/auth.store';
import { StorageService } from '../services/storage.service';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60; // +1h
const PAST_EXP = Math.floor(Date.now() / 1000) - 60; // -1m

/**
 * Smoke / unit tests for route protection: a valid token grants access; a
 * missing or expired token clears storage and redirects to the sign-in page.
 *
 * Ported from payment-admin's auth.guard.spec.ts and adapted to the
 * payment-console architecture: the guard is now a functional CanActivateFn
 * (not a class), so it is invoked inside a TestBed injection context, and the
 * token is read from the signal-based AuthStore rather than StorageService.
 */
describe('authGuard', () => {
  let router: jasmine.SpyObj<Router>;
  let authStore: jasmine.SpyObj<AuthStore>;
  let storage: jasmine.SpyObj<StorageService>;

  const route: any = { queryParams: { appId: 'app-1' } };
  const state: any = {};

  beforeEach(() => {
    router = jasmine.createSpyObj('Router', ['navigate']);
    authStore = jasmine.createSpyObj('AuthStore', ['token']);
    storage = jasmine.createSpyObj('StorageService', ['get', 'clear']);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthStore, useValue: authStore },
        { provide: StorageService, useValue: storage },
      ],
    });
  });

  function run(): boolean {
    return TestBed.runInInjectionContext(() => authGuard(route, state)) as boolean;
  }

  it('allows activation with a valid, non-expired token', () => {
    authStore.token.and.returnValue(makeJwt({ exp: FUTURE_EXP }));

    expect(run()).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('blocks and redirects to sign-in when no token is present', () => {
    authStore.token.and.returnValue(null);

    expect(run()).toBeFalse();
    expect(storage.clear).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/auth/signin'],
      jasmine.objectContaining({ queryParams: route.queryParams })
    );
  });

  it('blocks and redirects when the token is expired', () => {
    authStore.token.and.returnValue(makeJwt({ exp: PAST_EXP }));

    expect(run()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/signin'], jasmine.any(Object));
  });
});
