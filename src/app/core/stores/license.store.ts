import { signal, computed, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TeamClient, LicensesClient, License, App, AppLicense, LicenseApp, CreateLicenseResponse } from '@proxy/payment-app-proxy';
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
  readonly bestLicenseApps = signal<LicenseApp[]>([]);

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

  async getBestLicense(): Promise<AppLicense | null> {
    try {
      // best-license now returns a SINGLE license (its id + the apps under it),
      // or null when the user has none.
      const result = await firstValueFrom(this.licensesClient.getBestLicense());
      // Cache the license's apps so the route guard recognizes them even if the
      // team licenses list is empty or out of sync.
      this.bestLicenseApps.set(result?.apps ?? []);
      return result ?? null;
    } catch (e) {
      console.error('Failed to get best license:', e);
      return null;
    }
  }

  async createLicense(
    returnUrl: string | null,
    licenseName?: string | null
  ): Promise<CreateLicenseResponse> {
    this.storage.remove('default-app');
    localStorage.removeItem('default-app');

    // CreateLicense only takes a name now (the id is server-generated). Prefer the
    // route's `licenseName` query param; fall back to the returnUrl domain.
    const targetLicenseName =
      licenseName && licenseName.trim() ? licenseName.trim() : extractBaseDomain(returnUrl);

    const license = await firstValueFrom(
      this.licensesClient.createLicense(targetLicenseName)
    );

    this.newlyCreatedLicenseId.set(license.licenseId);
    return license;
  }

  async ensureLicenseToken(
    returnUrl: string | null,
    licenseName?: string | null
  ): Promise<{ licenseId: string; authorizationCode: string }> {
    // 1) Ask for the user's best license. It now returns the license id (+ its
    //    apps), NOT an authorization code.
    const best = await this.getBestLicense();

    // 2) Has a license → fetch its authorization code via GetLicense(licenseId).
    if (best?.licenseId) {
      const access = await firstValueFrom(this.licensesClient.getLicense(best.licenseId));
      if (!access?.authorizationCode) {
        throw new Error('Failed to secure authorization code for the existing license.');
      }
      return {
        licenseId: access.licenseId,
        authorizationCode: access.authorizationCode,
      };
    }

    // 3) No license yet → provision one (its response carries the code directly).
    const newLicense = await this.createLicense(returnUrl, licenseName);
    if (!newLicense || !newLicense.authorizationCode) {
      throw new Error('Failed to secure authorization code from created license.');
    }
    return {
      licenseId: newLicense.licenseId,
      authorizationCode: newLicense.authorizationCode,
    };
  }
}
