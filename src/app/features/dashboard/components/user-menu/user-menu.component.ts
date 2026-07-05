import { Component, computed, inject, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { PermissionStore } from '@core/stores/permission.store';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { buildUserMenuItems } from '../nav-config';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-menu.component.html',
  styleUrls: ['./user-menu.component.scss'],
})
export class UserMenuComponent {
  private readonly auth = inject(Auth);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly permissionStore = inject(PermissionStore);
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isOpen = signal(false);
  readonly activeApp = this.workspaceStore.activeAppMetadata;

  readonly fbUser = toSignal(authState(this.auth));

  /**
   * `toSignal` starts at `undefined` until Firebase's authState observable emits
   * its first value (a genuine async gap — independent of route guards, so it
   * still occurs after a hot-reload/hard-refresh once already inside the
   * dashboard). Before that, `userName()` would fall through to the app's
   * friendlyName, then jump to the real Firebase name once resolved. Gate the
   * template on this instead of showing that wrong intermediate value.
   */
  readonly authResolved = computed(() => this.fbUser() !== undefined);

  /** Menu items filtered by the current user's permission scopes. */
  readonly menuItems = computed(() => {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return [];
    return buildUserMenuItems(appId).filter(item =>
      !item.permission || this.permissionStore.hasPermission(item.permission)
    );
  });

  readonly userPhoto = computed(() => this.fbUser()?.photoURL ?? null);

  readonly userName = computed(() => {
    const u = this.fbUser();
    return u?.displayName || u?.email || this.activeApp()?.friendlyName || 'User';
  });

  readonly userInitials = computed(() => {
    const name = this.userName();
    return name.substring(0, 2).toUpperCase();
  });

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  onItemClick(item: { action?: string; route?: string }, event?: MouseEvent): void {
    // On a real <a> menu item, let the browser handle Ctrl/Cmd/Shift/middle-click
    // so it opens the route in a new tab; a plain left-click navigates in-app.
    if (
      event &&
      (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1)
    ) {
      this.isOpen.set(false);
      return;
    }
    event?.preventDefault();
    this.isOpen.set(false);
    if (item.action === 'signout') {
      this.firebaseAuth.signout();
    } else if (item.route) {
      this.router.navigate([item.route]);
    }
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }
}
