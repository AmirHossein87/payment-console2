import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { LayoutStore } from '@core/stores/layout.store';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { SettingsStore } from '@core/stores/settings.store';
import { SidebarComponent } from '@features/dashboard/components/sidebar/sidebar.component';
import { TopbarComponent } from '@features/dashboard/components/topbar/topbar.component';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './dashboard-layout.component.html',
  styleUrls: ['./dashboard-layout.component.scss'],
})
export class DashboardLayoutComponent {
  private readonly layoutStore = inject(LayoutStore);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly router = inject(Router);
  readonly sidebarOpen = this.layoutStore.sidebarOpen;
  readonly switching = this.workspaceStore.switching;

  // Full-bleed for the payments list (…/payments) — it fills the content block.
  readonly flush = signal(this.isFlushRoute(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.flush.set(this.isFlushRoute(e.urlAfterRedirects));
        this.workspaceStore.setSwitching(null);
      });

    // 2FA is per (user, app): refresh the alarm state whenever the active app
    // changes so the avatar dot / My Profile badge reflect the current app.
    effect(() => {
      this.settingsStore.loadTwoFaForApp(this.workspaceStore.currentAppId());
    });
  }

  private isFlushRoute(url: string): boolean {
    return /\/(payments|gateways|customers|policies|team|billing)(\?|$)/.test(url.split('#')[0]);
  }

  closeSidebar(): void {
    this.layoutStore.closeSidebar();
  }
}
