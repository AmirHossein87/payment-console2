import { Component, computed, inject, signal, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { PermissionStore } from '@core/stores/permission.store';
import { SettingsStore } from '@core/stores/settings.store';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { ConfirmModalComponent } from '@shared/components/confirm-modal/confirm-modal.component';
import { buildUserMenuItems } from '../nav-config';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [CommonModule, ConfirmModalComponent],
  templateUrl: './user-menu.component.html',
  styleUrls: ['./user-menu.component.scss'],
})
export class UserMenuComponent {
  private readonly auth = inject(Auth);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly permissionStore = inject(PermissionStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  @ViewChild('signoutConfirm') private signoutConfirm!: ConfirmModalComponent;

  readonly isOpen = signal(false);

  /** App forces 2FA but this user hasn't set theirs up — drives the alarm sign. */
  readonly needsTwoFaSetup = this.settingsStore.needsTwoFaSetup;

  /** The My Profile item is where 2FA is set up — it carries the alarm badge. */
  isProfileItem(item: { route?: string }): boolean {
    return !!item.route?.endsWith('/my-profile');
  }

  readonly fbUser = toSignal(authState(this.auth));

  /**
   * `toSignal` starts at `undefined` until Firebase's authState observable emits
   * its first value (a genuine async gap — independent of route guards, so it
   * still occurs after a hot-reload/hard-refresh once already inside the
   * dashboard). The template shows a skeleton until then rather than a wrong
   * intermediate value.
   *
   * NOTE: authState can also emit `null` (Firebase's client session is gone /
   * wasn't restored while our backend session is still valid). `null !== undefined`,
   * so we DO render — which is why the identity getters below must never fall back
   * to app metadata: doing so printed the APP NAME where the user's name belongs.
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

  /**
   * The signed-in person's label. Deliberately does NOT fall back to app metadata:
   * the workspace's friendlyName is not a user identity, and using it made the
   * header show the APP NAME whenever authState resolved to null.
   */
  readonly userName = computed(() => {
    const u = this.fbUser();
    return u?.displayName || u?.email || 'User';
  });

  /**
   * The user's *real* display name, or null when they signed up with just an
   * email (no displayName). The dropdown header uses this to avoid printing the
   * email twice — once as the "name" line and once as the email line — when the
   * account has no name.
   */
  readonly displayName = computed(() => this.fbUser()?.displayName?.trim() || null);

  /** The signed-in person's email, or '' when unknown — never the app id. */
  readonly userEmail = computed(() => this.fbUser()?.email ?? '');

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
      // Confirm before signing out — an accidental click shouldn't drop the session.
      this.signoutConfirm.open({
        title: 'Sign out?',
        message: 'You’ll be signed out and returned to the sign-in page.',
        confirmLabel: 'Sign out',
        icon: 'logout',
        confirm: async () => {
          await this.firebaseAuth.signout();
        },
      });
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
