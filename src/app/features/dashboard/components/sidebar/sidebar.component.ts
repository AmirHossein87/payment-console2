import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LayoutStore } from '@core/stores/layout.store';
import { SettingsStore } from '@core/stores/settings.store';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { PermissionStore } from '@core/stores/permission.store';
import { buildNavGroups, NavGroup } from '../nav-config';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  private readonly layoutStore = inject(LayoutStore);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly permissionStore = inject(PermissionStore);
  readonly settingsStore = inject(SettingsStore);

  readonly sidebarOpen = this.layoutStore.sidebarOpen;
  readonly brand = this.settingsStore.brand;

  /** Nav groups filtered by the current user's permission scopes. */
  readonly navGroups = computed<NavGroup[]>(() => {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return [];
    const groups = buildNavGroups(appId);
    return groups
      .map(g => ({
        ...g,
        items: g.items.filter(item =>
          !item.permission || this.permissionStore.hasPermission(item.permission)
        ),
      }))
      .filter(g => g.items.length > 0);
  });

  closeSidebar(): void {
    this.layoutStore.closeSidebar();
  }
}
