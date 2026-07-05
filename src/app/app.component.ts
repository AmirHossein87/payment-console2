import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription, filter } from 'rxjs';
import { LoadingOverlayComponent } from '@shared/components/loading-overlay/loading-overlay.component';
import { ToastContainerComponent } from '@shared/components/toast-container/toast-container.component';
import { SettingsStore } from '@core/stores/settings.store';
import { Logger } from '@core/services/logger.service';
import { TagManagerService } from '@core/services/tag-manager.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    LoadingOverlayComponent,
    ToastContainerComponent,
  ],
  template: `
    <router-outlet />
    <app-loading-overlay />
    <app-toast-container />
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
    }
  `],
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly settingsStore = inject(SettingsStore);
  private readonly router = inject(Router);
  private readonly tagManager = inject(TagManagerService);
  private tagManagerSubscription?: Subscription;
  private readonly mediaListener = (e: MediaQueryListEvent): void => {
    // Use 'tc-theme' (the user's explicit preference) so that null and 'system'
    // both allow OS changes through, but an explicit 'dark'/'light' lock ignores them.
    const pref = localStorage.getItem('tc-theme');
    if (!pref || pref === 'system') {
      this.settingsStore.isDark.set(e.matches);
    }
  };
  private readonly themeListener = (event: Event): void => {
    this.settingsStore.isDark.set((event as CustomEvent).detail.isDark);
  };

  ngOnInit(): void {
    Logger.printBootBanner();

    // Load Google Tag Manager — only does anything in environments where it is enabled.
    this.tagManager.init();

    // SPA page-view tracking on every route change (no-op when GTM is disabled).
    this.tagManagerSubscription = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.tagManager.trackPageView(e.urlAfterRedirects);
      });

    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', this.mediaListener);

    window.addEventListener('app-theme-changed', this.themeListener);
  }

  ngOnDestroy(): void {
    this.tagManagerSubscription?.unsubscribe();

    window
      .matchMedia('(prefers-color-scheme: dark)')
      .removeEventListener('change', this.mediaListener);

    window.removeEventListener('app-theme-changed', this.themeListener);
  }
}
