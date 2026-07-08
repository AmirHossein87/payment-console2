import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private static readonly INVALID_APP_IDS = new Set([
    'undefined', 'null', 'forbidden', 'notfound', 'apps', 'auth', 'billing',
    'overview', 'payments', 'gateways', 'app-setting', 'policies',
    'fraud-activities', 'customers', 'team', 'personalization', 'dashboard',
    'login', 'register', 'app', 'licenses', 'rules', 'fraud'
  ]);

  // 'gtm_first_signin_users' must survive signout so the first-sign-in Google
  // Ads conversion is reported once per user, not again after every signout.
  // Keep in sync with TagManagerService.FIRST_SIGNIN_KEY.
  private static readonly PRESERVED_KEYS = ['app-theme', 'tc-theme', 'gtm_first_signin_users'];

  static isValidAppId(appId: any): boolean {
    if (typeof appId !== 'string') return false;
    const clean = appId.trim().toLowerCase();
    if (!clean) return false;
    return !StorageService.INVALID_APP_IDS.has(clean);
  }

  constructor() {
    StorageService.patchLocalStorage();
  }

  static patchLocalStorage(): void {
    if ((window as any).__local_storage_patched__) return;
    (window as any).__local_storage_patched__ = true;

    const originalSet = localStorage.setItem;
    localStorage.setItem = function (key: string, value: string) {
      if (key === 'default-app') {
        if (!StorageService.isValidAppId(value)) {
          console.warn(`[LocalStorage] Blocked invalid default-app: ${value}`);
          localStorage.removeItem(key);
          return;
        }
      }
      originalSet.call(localStorage, key, value);
    };

    const originalGet = localStorage.getItem;
    localStorage.getItem = function (key: string): string | null {
      const val = originalGet.call(localStorage, key);
      if (key === 'default-app' && val) {
        if (!StorageService.isValidAppId(val)) {
          console.warn(`[LocalStorage] Cleaned up invalid default-app: ${val}`);
          localStorage.removeItem(key);
          return null;
        }
      }
      return val;
    };
  }

  set(key: string, data: any): void {
    if (typeof data === 'string') {
      localStorage.setItem(key, data);
    } else {
      localStorage.setItem(key, JSON.stringify(data));
    }
  }

  get(key: string): any {
    return localStorage.getItem(key);
  }

  clear(): void {
    const preserved: Record<string, string | null> = {};
    StorageService.PRESERVED_KEYS.forEach((key) => {
      preserved[key] = localStorage.getItem(key);
    });
    localStorage.clear();
    StorageService.PRESERVED_KEYS.forEach((key) => {
      if (preserved[key] !== null) {
        localStorage.setItem(key, preserved[key]!);
      }
    });
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }
}
