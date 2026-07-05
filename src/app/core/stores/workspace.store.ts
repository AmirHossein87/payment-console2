import { signal, computed, effect, Injectable, inject } from '@angular/core';
import { App } from '@proxy/payment-app-proxy';
import { StorageService } from '../services/storage.service';
import { LicenseStore } from './license.store';

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private static readonly INVALID_APP_IDS = new Set([
    'undefined', 'null', 'forbidden', 'notfound', 'apps', 'auth', 'billing',
    'overview', 'payments', 'gateways', 'app-setting', 'policies',
    'fraud-activities', 'customers', 'team', 'personalization', 'dashboard',
    'login', 'register', 'app', 'licenses', 'rules', 'fraud'
  ]);

  private readonly storage = inject(StorageService);
  private readonly licenseStore = inject(LicenseStore);

  readonly currentAppId = signal<string | null>(this.loadInitialAppId());
  readonly selectedApp = signal<App | null>(null);
  readonly switching = signal<string | null>(null);

  readonly activeAppMetadata = computed<App | null>(() => {
    const appId = this.currentAppId();
    if (!appId) return null;
    const apps = this.licenseStore.permissibleApps();
    return apps.find((a) => a.appId === appId) ?? null;
  });

  readonly isSandbox = computed<boolean>(() => {
    // Prefer `selectedApp` (set by licenseGuard via AppsClient.getSettings — ready
    // BEFORE this route's components ever render) over `activeAppMetadata`, which
    // is derived from licenseStore.permissibleApps() and can still be empty right
    // after render (licenses/best-license load independently, later). Reading
    // activeAppMetadata alone caused the Live/Sandbox badge to flash "Live" (the
    // `?? false` default) until that slower data arrived.
    const app = this.selectedApp() ?? this.activeAppMetadata();
    return app?.isSandbox ?? false;
  });

  constructor() {
    effect(() => {
      const appId = this.currentAppId();
      if (appId && WorkspaceStore.isValidAppId(appId)) {
        this.storage.set('default-app', appId);
      } else if (appId === null) {
        this.storage.remove('default-app');
      }
    });
  }

  setAppId(appId: string | null): void {
    if (appId && !WorkspaceStore.isValidAppId(appId)) {
      console.warn(`Blocked setting invalid appId: ${appId}`);
      return;
    }
    this.currentAppId.set(appId);
  }

  setSelectedApp(app: App | null): void {
    this.selectedApp.set(app);
  }

  setSwitching(label: string | null): void {
    this.switching.set(label);
  }

  static isValidAppId(appId: any): boolean {
    if (typeof appId !== 'string') return false;
    const clean = appId.trim().toLowerCase();
    if (!clean) return false;
    return !WorkspaceStore.INVALID_APP_IDS.has(clean);
  }

  private loadInitialAppId(): string | null {
    const stored = this.storage.get('default-app');
    if (stored && WorkspaceStore.isValidAppId(stored)) {
      return stored;
    }
    if (stored) {
      this.storage.remove('default-app');
    }
    return null;
  }
}
