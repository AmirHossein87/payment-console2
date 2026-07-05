import { signal, computed, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TeamClient } from '@proxy/payment-app-proxy';
import { Logger } from '../services/logger.service';

/**
 * Holds the permission scopes for the currently active workspace app.
 *
 * Permissions are fetched from:
 *   GET /api/team/users/current/apps/{appId}/permissions → string[]
 *
 * The store is populated by licenseGuard on every workspace route entry and
 * cleared whenever the appId changes.
 *
 * Example scope strings returned by the backend:
 *   DashboardRead, PaymentRead, PaymentWrite, CustomerRead, CustomerWrite,
 *   GatewayListRead, PaymentProfileWrite, FraudPolicyRead, FraudPolicyWrite,
 *   RoleRead, RoleWrite, AppSettingRead, LicenseManagement, ...
 */
@Injectable({ providedIn: 'root' })
export class PermissionStore {
  private readonly teamClient = inject(TeamClient);
  private readonly log = Logger.create('PermissionStore');

  /** Raw list of permission scope strings for the active app. */
  readonly permissions = signal<string[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isLoaded = signal<boolean>(false);
  /** appId for which permissions are currently loaded. */
  private loadedAppId: string | null = null;

  /** Fast Set-based lookup — recomputed whenever permissions signal changes. */
  private readonly permSet = computed<Set<string>>(
    () => new Set(this.permissions())
  );

  /** Returns true when the user holds the given permission scope. */
  hasPermission(scope: string): boolean {
    if (!scope) return true; // no restriction declared → open
    return this.permSet().has(scope);
  }

  /** Convenience: check a Read-type permission. */
  canRead(resource: string): boolean {
    return this.hasPermission(`${resource}Read`);
  }

  /** Convenience: check a Write-type permission. */
  canWrite(resource: string): boolean {
    return this.hasPermission(`${resource}Write`);
  }

  /**
   * Fetches permissions for `appId` from the backend and stores them.
   * Skips the network call when the same appId is already loaded.
   */
  async loadPermissions(appId: string): Promise<void> {
    if (this.loadedAppId === appId && this.isLoaded()) {
      return; // already fresh
    }

    this.isLoading.set(true);
    try {
      const perms = await firstValueFrom(this.teamClient.getAppPermissions(appId));
      this.permissions.set(perms ?? []);
      this.loadedAppId = appId;
      this.isLoaded.set(true);
      this.log.info(`Loaded ${perms?.length ?? 0} permissions for app "${appId}".`);
    } catch (err) {
      this.log.error('Failed to load permissions:', err);
      // On error keep any previously loaded permissions rather than wiping them.
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Clears stored permissions (call when the user switches workspaces or signs
   * out so stale scopes are never carried into a new app context).
   */
  clear(): void {
    this.permissions.set([]);
    this.loadedAppId = null;
    this.isLoaded.set(false);
  }
}
