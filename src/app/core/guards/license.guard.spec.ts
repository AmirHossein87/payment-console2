import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { licenseGuard } from './license.guard';
import { AppsClient } from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '../stores/workspace.store';
import { PermissionStore } from '../stores/permission.store';

/**
 * The guard validates app access against the backend (GET /api/apps/{appId}),
 * so a super admin can open apps outside their own license list. It forbids
 * ONLY on 403; non-403 failures (expired/inactive, transient) do not block.
 */
describe('licenseGuard (backend app-access check)', () => {
  let router: jasmine.SpyObj<Router>;
  let appsClient: jasmine.SpyObj<AppsClient>;
  let workspaceStore: jasmine.SpyObj<WorkspaceStore>;
  let permissionStore: jasmine.SpyObj<PermissionStore>;

  const state: any = {};
  const routeFor = (appId: string | null): any => ({
    paramMap: { get: (k: string) => (k === 'appId' ? appId : null) },
  });

  beforeEach(() => {
    router = jasmine.createSpyObj('Router', ['navigate']);
    appsClient = jasmine.createSpyObj('AppsClient', ['getSettings']);
    workspaceStore = jasmine.createSpyObj('WorkspaceStore', ['setAppId', 'setSelectedApp']);
    permissionStore = jasmine.createSpyObj('PermissionStore', ['loadPermissions']);
    permissionStore.loadPermissions.and.returnValue(Promise.resolve());

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: AppsClient, useValue: appsClient },
        { provide: WorkspaceStore, useValue: workspaceStore },
        { provide: PermissionStore, useValue: permissionStore },
      ],
    });
  });

  function run(appId: string | null): Promise<boolean> {
    return TestBed.runInInjectionContext(
      () => licenseGuard(routeFor(appId), state) as Promise<boolean>
    );
  }

  it('allows the route when the apps API returns the app', async () => {
    appsClient.getSettings.and.returnValue(of({ appId: 'app-1' } as any));

    const result = await run('app-1');

    expect(result).toBeTrue();
    expect(workspaceStore.setAppId).toHaveBeenCalledWith('app-1');
    expect(router.navigate).not.toHaveBeenCalledWith(['/forbidden']);
  });

  it('forbids when the apps API returns 403', async () => {
    appsClient.getSettings.and.returnValue(throwError(() => ({ status: 403 })));

    const result = await run('app-i-cannot-access');

    expect(result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/forbidden']);
  });

  it('allows the route on a non-403 error (e.g. expired/inactive)', async () => {
    appsClient.getSettings.and.returnValue(throwError(() => ({ status: 400 })));

    const result = await run('expired-app');

    expect(result).toBeTrue();
    expect(workspaceStore.setAppId).toHaveBeenCalledWith('expired-app');
    expect(router.navigate).not.toHaveBeenCalledWith(['/forbidden']);
  });

  it('forbids when there is no appId', async () => {
    const result = await run(null);

    expect(result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/forbidden']);
  });
});
