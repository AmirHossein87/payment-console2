import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppsClient } from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '../stores/workspace.store';
import { PermissionStore } from '../stores/permission.store';
import { Logger } from '../services/logger.service';

/**
 * Validates app access against the BACKEND, not the local license list.
 *
 * A super admin can open apps that are not in their own license list, and the
 * server is the source of truth — `GET /api/apps/{appId}` returns the app when
 * access is allowed and **403** when it is denied. We therefore call that API
 * and only forbid on 403. Non-403 failures (e.g. an expired/inactive app, or a
 * transient error) do NOT block the route — expiry is a billing state surfaced
 * inside the dashboard, never an access gate.
 *
 * After a successful access check the guard also loads the user's permission
 * scopes for this app so that the sidebar and structural directives (appPermission)
 * have data before any child component renders.
 */
export const licenseGuard: CanActivateFn = async (route) => {
  const appsClient = inject(AppsClient);
  const workspaceStore = inject(WorkspaceStore);
  const permissionStore = inject(PermissionStore);
  const router = inject(Router);
  const log = Logger.create('LicenseGuard');

  const appId = route.paramMap.get('appId');

  if (!appId) {
    log.warn('No appId on route — redirecting to /forbidden.');
    router.navigate(['/forbidden']);
    return false;
  }

  // Kick off the permission fetch in PARALLEL with the access check, but AWAIT it
  // before activating the route — the sidebar, permission directives, and the
  // Overview's redirect decision all read permissions on first render. Loading it
  // non-blocking caused a race where the Overview saw an empty permission set and
  // wrongly bounced set-up users to /payments before DashboardRead had loaded. A
  // fetch failure must still not block access, so errors are swallowed.
  const permsReady = permissionStore.loadPermissions(appId).catch(() => {});

  try {
    const app = await firstValueFrom(appsClient.getSettings(appId));
    workspaceStore.setAppId(appId);
    workspaceStore.setSelectedApp(app);
    await permsReady;
    return true;
  } catch (err: any) {
    if (err?.status === 403) {
      log.warn('App access denied (403) — redirecting to /forbidden.', { appId });
      router.navigate(['/forbidden']);
      return false;
    }
    // Non-403 (expired/inactive app, network, etc.) — do not block access.
    log.warn('App access check failed (non-403); allowing route.', {
      appId,
      status: err?.status,
    });
    workspaceStore.setAppId(appId);
    await permsReady;
    return true;
  }
};
