import { signal, computed, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TeamClient, LicensesClient, License, App, AppLicense, CreateLicenseResponse } from '@proxy/payment-app-proxy';
import { StorageService } from '../services/storage.service';
import { extractBaseDomain } from '../utils/url.util';

@Injectable({ providedIn: 'root' })
export class LicenseStore {
  private readonly teamClient = inject(TeamClient);
  private readonly licensesClient = inject(LicensesClient);
  private readonly storage = inject(StorageService);

  readonly licenses = signal<License[]>([]);
  readonly activeLicenseId = signal<string | null>(null);
  readonly isLoadingLicenses = signal<boolean>(false);
  readonly newlyCreatedLicenseId = signal<string | null>(null);
  // Apps confirmed accessible by the best-license endpoint. The team
  // `getLicenses` list and `best-license` can diverge (different endpoints), so
  // we keep best-license results as an additional source of truth for the guard.
  readonly bestLicenseApps = signal<AppLicense[]>([]);

  readonly permissibleApps = computed<App[]>(() => {
    const byId = new Map<string, App>();

    // Primary source: the team licenses list (full app metadata).
    for (const license of this.licenses()) {
      for (const app of license.apps || []) {
        byId.set(app.appId, app);
      }
    }

    // Augment with apps best-license confirmed but that are missing from the
    // team list. best-license only returns apps the user can access, so these
    // are known-valid; synthesize minimal metadata so the guard admits them.
    for (const al of this.bestLicenseApps()) {
      if (!byId.has(al.appId)) {
        byId.set(al.appId, {
          appId: al.appId,
          friendlyName: al.isSandbox ? 'Sandbox App' : al.appId,
          isSandbox: al.isSandbox,
          logo: null,
          licenseExpirationTime: new Date('2999-01-01T00:00:00Z'),
          isActive: true,
          isSetupCompleted: true,
          isConnectFirstGateway: true,
        } as any);
      }
    }

    const list = Array.from(byId.values());
    if (list.length === 0) {
      return [{
        appId: 'sandbox',
        friendlyName: 'Sandbox App',
        isSandbox: true,
        logo: null,
        licenseExpirationTime: new Date('2030-01-01T00:00:00Z'),
        isActive: true,
        isSetupCompleted: true,
        isConnectFirstGateway: true
      } as any];
    }
    return list;
  });

  readonly sandboxApp = computed<App | null>(() => {
    return this.permissibleApps().find((app) => app.isSandbox) ?? null;
  });

  readonly firstApp = computed<App | null>(() => {
    const apps = this.permissibleApps();
    return apps.length > 0 ? apps[0] : null;
  });

  readonly activeLicense = computed<License | null>(() => {
    const id = this.activeLicenseId();
    if (!id) return null;
    return this.licenses().find((l) => l.licenseId === id) ?? null;
  });

  readonly isCurrentLicenseExpired = computed<boolean>(() => {
    const app = this.permissibleApps().find((a) => a.appId === this.activeLicenseId());
    if (!app?.licenseExpirationTime) return false;
    return new Date(app.licenseExpirationTime).getTime() <= Date.now();
  });

  async loadLicenses(): Promise<License[]> {
    this.isLoadingLicenses.set(true);
    try {
      const licenses = await firstValueFrom(this.teamClient.getLicenses());
      this.licenses.set(licenses);
      return licenses;
    } catch (e) {
      console.error('Failed to load licenses:', e);
      this.licenses.set([]);
      return [];
    } finally {
      this.isLoadingLicenses.set(false);
    }
  }

  async getBestLicense(generateBot?: boolean): Promise<AppLicense[] | null> {
    try {
      const result = await firstValueFrom(this.licensesClient.getBestLicense(generateBot));
      // Cache so the route guard recognizes these apps even if the team
      // licenses list is empty or out of sync.
      this.bestLicenseApps.set(result ?? []);
      return result;
    } catch (e) {
      console.error('Failed to get best license:', e);
      return null;
    }
  }

  async createLicense(appId: string | null, returnUrl: string | null): Promise<CreateLicenseResponse> {
    this.storage.remove('default-app');
    localStorage.removeItem('default-app');

    const targetLicenseId = appId && appId !== 'null' ? appId : undefined;
    const licenseName = extractBaseDomain(returnUrl);

    const license = await firstValueFrom(
      this.licensesClient.createLicense(targetLicenseId, licenseName)
    );

    this.newlyCreatedLicenseId.set(license.licenseId);
    return license;
  }

  async ensureLicenseToken(
    appId: string | null,
    returnUrl: string | null
  ): Promise<{ licenseId: string; authorizationCode: string }> {
    const bestLicenses = await this.getBestLicense();
    if (bestLicenses && bestLicenses.length > 0) {
      const targetId = this.storage.get('default-app');
      let appLicense = targetId
        ? bestLicenses.find((al) => al.appId === targetId)
        : null;
      if (!appLicense) {
        appLicense = bestLicenses.find((al) => al.isSandbox) ?? bestLicenses[0];
      }
      return {
        licenseId: appLicense.appId,
        authorizationCode: appLicense.authorizationCode,
      };
    }

    const newLicense = await this.createLicense(appId, returnUrl);
    if (!newLicense || !newLicense.authorizationCode) {
      throw new Error('Failed to secure authorization code from created license.');
    }
    return {
      licenseId: newLicense.licenseId,
      authorizationCode: newLicense.authorizationCode,
    };
  }
}
