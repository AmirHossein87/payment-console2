import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthFlowOrchestratorService } from '@core/services/auth-flow-orchestrator.service';
import { Logger } from '@core/services/logger.service';

@Component({
  selector: 'app-grant-access',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './grant-access.component.html',
  styleUrls: ['./grant-access.component.scss'],
})
export class GrantAccessComponent implements OnInit {
  private readonly log = Logger.create('GrantAccess');
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orchestrator = inject(AuthFlowOrchestratorService);

  licenseId: string | null = null;
  appName = 'An application';
  domainName: string | null = null;
  returnUrl: string | null = null;
  accessStatus: 'pending' | 'granted' | 'denied' = 'pending';
  permissions: string[] = ['Manage profiles', 'Payments history'];

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      this.licenseId = params['licenseId'] || null;
      this.returnUrl = params['returnUrl'];

      if (this.returnUrl) {
        let hostname: string;
        try {
          const urlString = this.returnUrl.startsWith('http')
            ? this.returnUrl
            : `https://${this.returnUrl}`;
          const url = new URL(urlString);
          hostname = url.hostname;
        } catch (e) {
          this.log.error('Invalid returnUrl:', this.returnUrl);
          hostname = this.returnUrl.split('/')[0];
        }

        this.domainName = this.getRootDomain(hostname);
        this.appName = this.domainName;
      } else {
        this.appName = this.licenseId || 'An application';
      }
    });
  }

  private getRootDomain(hostname: string): string {
    const parts = hostname.split('.');
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  }

  async grantAccess(): Promise<void> {
    this.accessStatus = 'granted';
    await this.orchestrator.handleGrantAccessDecision(
      true,
      this.returnUrl,
      this.licenseId
    );
  }

  denyAccess(): void {
    this.accessStatus = 'denied';
    this.orchestrator.handleGrantAccessDecision(
      false,
      this.returnUrl,
      this.licenseId
    );
  }

  reset(): void {
    this.router.navigate(['/auth/signin'], {
      queryParams: { grantAuthorization: 'true' },
      queryParamsHandling: 'merge',
    });
  }
}
