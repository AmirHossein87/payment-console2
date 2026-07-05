import { Injectable, inject } from '@angular/core';
import { LicenseStore } from '../stores/license.store';
import { CreateLicenseResponse } from '@proxy/payment-app-proxy';
import { StorageService } from './storage.service';
import { Logger } from './logger.service';

@Injectable({ providedIn: 'root' })
export class LicenseFlowService {
  private readonly log = Logger.create('LicenseFlow');
  private readonly licenseStore = inject(LicenseStore);
  private readonly storage = inject(StorageService);

  async getBestLicense(): Promise<{ licenseId: string; authorizationCode: string } | null> {
    const appLicenses = await this.licenseStore.getBestLicense();

    if (appLicenses && appLicenses.length > 0) {
      const targetId = this.storage.get('default-app');
      let appLicense = targetId
        ? appLicenses.find((al) => al.appId === targetId)
        : null;

      if (!appLicense) {
        appLicense = appLicenses.find((al) => al.isSandbox) || appLicenses[0];
      }

      return {
        licenseId: appLicense.appId,
        authorizationCode: appLicense.authorizationCode,
      };
    }

    this.log.info('No best license returned by API.');
    return null;
  }

  async createLicense(
    appId: string | null,
    returnUrl: string | null
  ): Promise<CreateLicenseResponse> {
    return await this.licenseStore.createLicense(appId, returnUrl);
  }

  async ensureLicenseToken(
    appId: string | null,
    returnUrl: string | null
  ): Promise<{ licenseId: string; authorizationCode: string }> {
    return await this.licenseStore.ensureLicenseToken(appId, returnUrl);
  }
}
