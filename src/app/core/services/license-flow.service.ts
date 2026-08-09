import { Injectable, inject } from '@angular/core';
import { LicenseStore } from '../stores/license.store';
import { CreateLicenseResponse } from '@proxy/payment-app-proxy';

@Injectable({ providedIn: 'root' })
export class LicenseFlowService {
  private readonly licenseStore = inject(LicenseStore);

  async createLicense(
    returnUrl: string | null,
    licenseName?: string | null
  ): Promise<CreateLicenseResponse> {
    return await this.licenseStore.createLicense(returnUrl, licenseName);
  }

  async ensureLicenseToken(
    returnUrl: string | null,
    licenseName?: string | null
  ): Promise<{ licenseId: string; authorizationCode: string }> {
    return await this.licenseStore.ensureLicenseToken(returnUrl, licenseName);
  }
}
