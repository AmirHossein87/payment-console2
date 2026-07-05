import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { WorkspaceStore } from '../stores/workspace.store';
import { LicenseStore } from '../stores/license.store';

/**
 * Runs only on the bare root route ("/").
 * Redirects the user to their default app or the first available app from
 * their license list. Never allows the empty DashboardLayout to activate with
 * no appId — that leaves the layout shell with no content and no navigation.
 */
export const appRedirectGuard: CanActivateFn = async () => {
  const workspaceStore = inject(WorkspaceStore);
  const licenseStore = inject(LicenseStore);
  const router = inject(Router);

  // Fast path: last-used app is already in localStorage → go there directly.
  // The licenseGuard on that route will validate access.
  const storedAppId = workspaceStore.currentAppId();
  if (storedAppId) {
    router.navigate(['/', storedAppId, 'overview']);
    return false;
  }

  // No stored app — load the license list to pick the right destination.
  await licenseStore.loadLicenses();
  const firstApp = licenseStore.firstApp();
  if (firstApp?.appId) {
    router.navigate(['/', firstApp.appId, 'overview']);
    return false;
  }

  // No app available at all — land on forbidden.
  router.navigate(['/forbidden']);
  return false;
};
