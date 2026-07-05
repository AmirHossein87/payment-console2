import { Component, computed, inject, signal, OnInit, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { LayoutStore } from '@core/stores/layout.store';
import { SettingsStore } from '@core/stores/settings.store';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { LicenseStore } from '@core/stores/license.store';
import { BreadcrumbStore, Crumb } from '@core/stores/breadcrumb.store';
import { App, License } from '@proxy/payment-app-proxy';
import { UserMenuComponent } from '../user-menu/user-menu.component';
import { ConfirmModalComponent } from '@shared/components/confirm-modal/confirm-modal.component';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, RouterLink, UserMenuComponent, ConfirmModalComponent],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss'],
})
export class TopbarComponent implements OnInit {
  @ViewChild('confirmModal') private confirmModal!: ConfirmModalComponent;
  private readonly layoutStore = inject(LayoutStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly workspaceStore = inject(WorkspaceStore);
  readonly licenseStore = inject(LicenseStore);
  private readonly breadcrumbStore = inject(BreadcrumbStore);
  private readonly router = inject(Router);

  readonly isMobile = this.layoutStore.isMobile;
  readonly sidebarOpen = this.layoutStore.sidebarOpen;
  readonly isDark = this.settingsStore.isDark;

  // Active application = the primary dashboard context. Source of truth is
  // selectedApp (the getSettings result — includes standalone apps that are NOT
  // in the license-derived permissibleApps list). Falls back to permissibleApps.
  readonly activeApp = computed<App | null>(
    () => this.workspaceStore.selectedApp() ?? this.workspaceStore.activeAppMetadata()
  );
  readonly brand = this.settingsStore.brand;

  readonly isSandbox = computed(() => this.activeApp()?.isSandbox ?? false);

  readonly dropOpen = signal(false);

  /** The license that owns the active app — null when the active app is standalone. */
  readonly currentLicense = computed<License | null>(() => {
    const id = this.workspaceStore.currentAppId();
    if (!id) return null;
    return this.licenseStore.licenses().find((l) => (l.apps ?? []).some((a) => a.appId === id)) ?? null;
  });

  /** Active app exists but belongs to no license (accessible standalone app). */
  readonly isStandalone = computed(() => !!this.activeApp() && !this.currentLicense());

  /** With 2+ licenses we show the "My Licenses" dropdown; with one, we hide it
   *  (its name is surfaced in the user menu) and show a plain env toggle instead. */
  readonly hasMultipleLicenses = computed(() => this.licenseStore.licenses().length > 1);
  readonly soloSandboxApp = computed<App | null>(() => {
    const ls = this.licenseStore.licenses();
    return ls.length === 1 ? (ls[0].apps ?? []).find((a) => a.isSandbox) ?? null : null;
  });
  readonly soloLiveApp = computed<App | null>(() => {
    const ls = this.licenseStore.licenses();
    return ls.length === 1 ? (ls[0].apps ?? []).find((a) => !a.isSandbox) ?? null : null;
  });

  /** "My Licenses" rows — each license with only the environments it actually has. */
  readonly licenseRows = computed(() => {
    const activeId = this.workspaceStore.currentAppId();
    const sandbox = this.isSandbox();
    return this.licenseStore.licenses().map((l) => {
      const apps = l.apps ?? [];
      const isActive = apps.some((a) => a.appId === activeId);
      return {
        license: l,
        name: l.licenseName || l.licenseId,
        sandboxApp: apps.find((a) => a.isSandbox) ?? null,
        liveApp: apps.find((a) => !a.isSandbox) ?? null,
        isActive,
        activeEnv: isActive ? (sandbox ? 'sandbox' : 'live') : null,
      };
    });
  });

  // Single crumb derived from the current route; overridden by a page-set trail.
  private readonly routeCrumb = signal<string>('Dashboard');

  readonly trail = computed<Crumb[]>(() => {
    const override = this.breadcrumbStore.trail();
    return override.length ? override : [{ label: this.routeCrumb() }];
  });

  private readonly crumbMap: Record<string, string> = {
    overview: 'Overview',
    payments: 'Payments',
    customers: 'Customers',
    gateways: 'Gateways',
    policies: 'Fraud Policies',
    team: 'Team',
    billing: 'Billing',
    'app-setting': 'Settings',
    dashboard: 'Dashboard',
  };

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.updateBreadcrumb());
  }

  ngOnInit(): void {
    // The auth flow can deep-link to an app without loading the license list
    // (it returns early on an appId param). Ensure it's loaded so the env toggle
    // can find the current license's sibling (sandbox + live) apps.
    if (this.licenseStore.licenses().length === 0 && !this.licenseStore.isLoadingLicenses()) {
      this.licenseStore.loadLicenses();
    }
  }

  toggleDrop(event: MouseEvent): void {
    event.stopPropagation();
    this.dropOpen.update((v) => !v);
  }

  @HostListener('document:click')
  closeDrop(): void {
    this.dropOpen.set(false);
  }

  /** Switch the active app to a specific license's environment; closes the menu. */
  selectEnv(app: App | null, event: MouseEvent): void {
    event.stopPropagation();
    this.dropOpen.set(false);
    this.switchEnv(app);
  }

  toggleSidebar(): void {
    this.layoutStore.toggleSidebar();
  }

  toggleTheme(): void {
    this.settingsStore.toggleTheme();
  }

  /** Asks the user to confirm before switching environment, then navigates. */
  switchEnv(app: App | null): void {
    const currentId = this.workspaceStore.currentAppId();
    if (!app || app.appId === currentId) return;

    const envName = app.isSandbox ? 'Sandbox' : 'Live';
    this.confirmModal.open({
      title: `Switch to ${envName}?`,
      message: `You will be navigated away from the current page. Any unsaved changes may be lost.`,
      confirmLabel: `Switch to ${envName}`,
      icon: 'swap_horiz',
      confirm: async () => {
        this.workspaceStore.setSwitching(envName);
        this.workspaceStore.setAppId(app.appId);
        this.workspaceStore.setSelectedApp(app);
        this.router.navigate(['/', app.appId]);
      },
    });
  }

  private updateBreadcrumb(): void {
    const url = this.router.url.split('?')[0];
    const segments = url.split('/').filter(Boolean);
    const lastSegment = segments.length > 1 ? segments[segments.length - 1] : 'dashboard';
    this.routeCrumb.set(this.crumbMap[lastSegment] ?? 'Dashboard');
  }
}
