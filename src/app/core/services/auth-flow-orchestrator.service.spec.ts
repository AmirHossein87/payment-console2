import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthFlowOrchestratorService } from './auth-flow-orchestrator.service';
import { FirebaseAuthService } from './firebase-auth.service';
import { LicenseFlowService } from './license-flow.service';
import { NotificationService } from './notification.service';
import { StorageService } from './storage.service';
import { AuthStore } from '../stores/auth.store';
import { SettingsStore } from '../stores/settings.store';
import { LicenseStore } from '../stores/license.store';
import { WorkspaceStore } from '../stores/workspace.store';

/**
 * Smoke / unit tests for the sign-in & sign-up decision logic.
 *
 * This service is the "brain" of auth: it decides what to call (signin vs signup)
 * and how to react to backend errors (403 unregistered / already-exists). These
 * tests lock that behavior down so future changes can't silently break the flow.
 *
 * Ported from payment-admin's auth-flow-orchestrator.service.spec.ts and adapted
 * to the payment-console architecture: signal-based AuthStore (mocked as objects
 * exposing .set), `evaluatePostAuth` (renamed from `evaluatePostSignIn`), and the
 * fork's behavior of AUTO-creating an account on a 403 "unregistered" sign-in.
 */
describe('AuthFlowOrchestratorService', () => {
  let service: AuthFlowOrchestratorService;

  let router: any;
  let firebaseAuth: jasmine.SpyObj<FirebaseAuthService>;
  let licenseFlow: jasmine.SpyObj<LicenseFlowService>;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let storage: jasmine.SpyObj<StorageService>;
  let settingsStore: jasmine.SpyObj<SettingsStore>;
  let licenseStore: jasmine.SpyObj<LicenseStore>;
  let workspaceStore: jasmine.SpyObj<WorkspaceStore>;
  let authStore: any;

  beforeEach(() => {
    router = {
      url: '/auth/signin',
      navigate: jasmine.createSpy('navigate'),
      routerState: { snapshot: { root: { queryParams: {}, firstChild: null } } },
    };

    firebaseAuth = jasmine.createSpyObj('FirebaseAuthService', [
      'callSignIn',
      'callSignUp',
      'isUserAuthenticated',
      'signInWithPopup',
    ]);
    licenseFlow = jasmine.createSpyObj('LicenseFlowService', [
      'getBestLicense',
      'createLicense',
      'ensureLicenseToken',
    ]);
    notificationService = jasmine.createSpyObj('NotificationService', ['showError', 'showSuccess']);
    storage = jasmine.createSpyObj('StorageService', ['get', 'set', 'clear', 'remove']);
    settingsStore = jasmine.createSpyObj('SettingsStore', ['load', 'isSupportLicenseManagement']);
    settingsStore.load.and.resolveTo(undefined);
    settingsStore.isSupportLicenseManagement.and.returnValue(false);
    licenseStore = jasmine.createSpyObj('LicenseStore', [
      'loadLicenses',
      'permissibleApps',
      'sandboxApp',
    ]);
    workspaceStore = jasmine.createSpyObj('WorkspaceStore', ['setAppId']);

    // AuthStore is signal-based: model the writable signals as objects with a .set spy.
    authStore = {
      isGoogleLoading: jasmine.createSpyObj('signal', ['set']),
      signupAlreadyRegistered: jasmine.createSpyObj('signal', ['set']),
      signinUnregistered: jasmine.createSpyObj('signal', ['set']),
      isRedirectingToDashboard: jasmine.createSpyObj('signal', ['set']),
      startLoading: jasmine.createSpy('startLoading'),
      stopLoading: jasmine.createSpy('stopLoading'),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthFlowOrchestratorService,
        { provide: Router, useValue: router },
        { provide: FirebaseAuthService, useValue: firebaseAuth },
        { provide: LicenseFlowService, useValue: licenseFlow },
        { provide: NotificationService, useValue: notificationService },
        { provide: StorageService, useValue: storage },
        { provide: AuthStore, useValue: authStore },
        { provide: SettingsStore, useValue: settingsStore },
        { provide: LicenseStore, useValue: licenseStore },
        { provide: WorkspaceStore, useValue: workspaceStore },
      ],
    });

    service = TestBed.inject(AuthFlowOrchestratorService);
  });

  describe('sign in', () => {
    it('calls the sign-in API then evaluates the post-auth flow', async () => {
      router.url = '/auth/signin';
      firebaseAuth.callSignIn.and.resolveTo({} as any);
      const evalSpy = spyOn(service, 'evaluatePostAuth').and.resolveTo(undefined);

      await service.initiateFirebaseSession('id-token');

      expect(firebaseAuth.callSignIn).toHaveBeenCalledTimes(1);
      expect(firebaseAuth.callSignUp).not.toHaveBeenCalled();
      expect(evalSpy).toHaveBeenCalled();
    });

    it('on 403 / unregistered: does NOT auto-create — prompts the user to sign up', async () => {
      router.url = '/auth/signin';
      firebaseAuth.callSignIn.and.rejectWith({ status: 403, typeName: 'UnregisteredUserException' });

      await service.initiateFirebaseSession('id-token');

      // No silent account creation and no forced navigation — just surface the
      // "you don't have an account, please sign up" prompt on the sign-in page.
      expect(firebaseAuth.callSignUp).not.toHaveBeenCalled();
      expect(authStore.signinUnregistered.set).toHaveBeenCalledWith(true);
      expect(router.navigate).not.toHaveBeenCalledWith(['/auth/signup'], jasmine.any(Object));
    });
  });

  describe('sign up', () => {
    it('calls the sign-up API then evaluates the post-auth flow', async () => {
      router.url = '/auth/signup';
      firebaseAuth.callSignUp.and.resolveTo({} as any);
      const evalSpy = spyOn(service, 'evaluatePostAuth').and.resolveTo(undefined);

      await service.initiateFirebaseSession('id-token');

      expect(firebaseAuth.callSignUp).toHaveBeenCalledTimes(1);
      expect(firebaseAuth.callSignIn).not.toHaveBeenCalled();
      expect(evalSpy).toHaveBeenCalled();
    });

    it('on a raw 409 Conflict during signup: shows the "already registered" box (no toast, no retry)', async () => {
      router.url = '/auth/signup';
      firebaseAuth.callSignUp.and.rejectWith({ status: 409 });

      await service.initiateFirebaseSession('id-token');

      // Box on the sign-up page, not a toast.
      expect(authStore.signupAlreadyRegistered.set).toHaveBeenCalledWith(true);
      expect(notificationService.showError).not.toHaveBeenCalledWith(
        'You already have an account. Please sign in instead.'
      );
      // No signup retry.
      expect(firebaseAuth.callSignUp).toHaveBeenCalledTimes(1);
    });

    it('on 403 already-exists (AlreadyExistsException) during signup: shows the "already registered" box', async () => {
      router.url = '/auth/signup';
      firebaseAuth.callSignUp.and.rejectWith({ status: 403, typeName: 'AlreadyExistsException' });

      await service.initiateFirebaseSession('id-token');

      expect(authStore.signupAlreadyRegistered.set).toHaveBeenCalledWith(true);
      expect(notificationService.showError).not.toHaveBeenCalledWith(
        'You already have an account. Please sign in instead.'
      );
    });

    it('detects already-exists from the exception name inside an object response body', async () => {
      router.url = '/auth/signup';
      firebaseAuth.callSignUp.and.rejectWith({
        status: 400,
        response: { TypeName: 'AlreadyExistsException', Message: 'duplicate' },
      });

      await service.initiateFirebaseSession('id-token');

      expect(authStore.signupAlreadyRegistered.set).toHaveBeenCalledWith(true);
    });
  });

  describe('evaluatePostAuth routing', () => {
    it('routes to grant-access when a returnUrl is present and license management is active', async () => {
      router.routerState.snapshot.root = {
        queryParams: { returnUrl: 'https://merchant.example.com' },
        firstChild: null,
      };
      settingsStore.isSupportLicenseManagement.and.returnValue(true);

      await service.evaluatePostAuth();

      expect(router.navigate).toHaveBeenCalledWith(
        ['/auth/grant-access'],
        jasmine.objectContaining({
          queryParams: jasmine.objectContaining({ returnUrl: 'https://merchant.example.com' }),
        })
      );
    });

    it('proceeds to the dashboard when there is no returnUrl', async () => {
      router.routerState.snapshot.root = { queryParams: {}, firstChild: null };
      settingsStore.isSupportLicenseManagement.and.returnValue(false);
      const proceedSpy = spyOn<any>(service, 'proceedToDashboard').and.resolveTo(undefined);

      await service.evaluatePostAuth();

      expect(proceedSpy).toHaveBeenCalled();
    });
  });
});
