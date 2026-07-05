import { signal, computed, effect, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SettingsClient, Setting, TeamClient } from '@proxy/payment-app-proxy';

export type ThemePreference = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly settingsClient = inject(SettingsClient);
  private readonly teamClient = inject(TeamClient);

  private readonly _settings = signal<Setting | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly isLoaded = signal<boolean>(false);
  readonly isDark = signal<boolean>(this.resolveInitialDarkMode());
  /** The user's raw preference ('system' included) — distinct from the resolved `isDark` bool. */
  readonly themePreference = signal<ThemePreference>(this.resolveInitialThemePreference());
  private themeFetched = false;

  readonly isSupportLicenseManagement = computed(() => true);

  readonly brand = computed(() => this._settings()?.brand ?? 'PaymentHub');
  // Brand display business logic (ported from payment-admin): the brand NAME is
  // shown only when the tenant actually configured one — no default fallback.
  readonly hasBrand = computed(() => !!this._settings()?.brand);
  readonly appName = computed(() => this._settings()?.brand ?? '');
  readonly signinImageUri = computed(() => this._settings()?.signinImageUri ?? null);
  readonly signinImageUriDark = computed(() => this._settings()?.signinImageUri2 ?? null);
  readonly activeLogoUri = computed(() => {
    return this.isDark()
      ? this.signinImageUriDark() ?? this.signinImageUri()
      : this.signinImageUri();
  });
  readonly signinSlogan = computed(() => this._settings()?.signinSlogan ?? null);
  readonly termsUrl = computed(() => this._settings()?.signinTermsAndConditionUrl ?? null);
  readonly privacyUrl = computed(() => this._settings()?.signinPrivacyUrl ?? null);
  readonly termsText = computed(() => this._settings()?.signinTermsAndCondition ?? null);
  readonly isSupportSignupProcess = computed(() => this._settings()?.isSupportSignupProcess ?? false);

  constructor() {
    effect(() => {
      const dark = this.isDark();
      localStorage.setItem('app-theme', dark ? 'dark' : 'light');

      const body = document.body;
      body.classList.remove('theme-dark', 'theme-light');
      body.classList.add(dark ? 'theme-dark' : 'theme-light');

      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', dark ? 'dark' : 'light');

      const themeLink = document.getElementById('app-theme') as HTMLLinkElement;
      if (themeLink) {
        themeLink.href = dark
          ? './assets/css/md-dark-indigo.css'
          : './assets/css/theme-md-light-indigo.css';
      }
    });
  }

  async load(): Promise<void> {
    if (this.isLoaded()) return;
    this.isLoading.set(true);
    try {
      const settings = await firstValueFrom(this.settingsClient.get());
      this._settings.set(settings);
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      this.isLoading.set(false);
      this.isLoaded.set(true);
    }
  }

  toggleTheme(): void {
    this.isDark.set(!this.isDark());
    this.themePreference.set(this.isDark() ? 'dark' : 'light');
    localStorage.setItem('tc-theme', this.themePreference());
  }

  /**
   * Sets the theme preference explicitly (e.g. from the Settings page picker)
   * and persists it — the single write path for a user-driven theme change.
   */
  setThemePreference(pref: ThemePreference): void {
    this.themePreference.set(pref);
    localStorage.setItem('tc-theme', pref);
    this.isDark.set(this.computeIsDark(pref));
  }

  /**
   * Fetches the user's saved theme from the server ONCE (right after login) and
   * makes it the local source of truth: persisted to 'tc-theme' and applied via
   * isDark/themePreference. Subsequent reads (e.g. opening Settings) use the
   * already-synced local value instead of re-fetching and re-deriving it — that
   * repeated re-derivation was the cause of a prior bug where a stale/mis-cased
   * server value silently flipped a dark system to light after login.
   */
  async loadUserTheme(): Promise<void> {
    if (this.themeFetched) return;
    this.themeFetched = true;
    try {
      const user = await firstValueFrom(this.teamClient.getInfo());
      const pref = this.normalizeTheme(user?.theme);
      this.setThemePreference(pref);
    } catch (e) {
      console.error('Failed to load user theme:', e);
    }
  }

  /**
   * The backend `theme` field is a raw string (no enum), so it can come back in
   * any casing (e.g. "System", "Dark"). Normalize here so a casing mismatch
   * never silently falls through to light.
   */
  normalizeTheme(t: string | null | undefined): ThemePreference {
    const v = (t ?? '').toLowerCase();
    return v === 'dark' || v === 'light' ? v : 'system';
  }

  private computeIsDark(pref: ThemePreference): boolean {
    return pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  private resolveInitialThemePreference(): ThemePreference {
    // One-time migration: a prior bug wrote 'tc-theme' = 'light' as a byproduct
    // of loading Settings (not from an explicit user save), permanently locking
    // out the OS dark preference. Clear that stale value once so it re-resolves
    // from matchMedia; a real user choice gets rewritten by setThemePreference().
    if (!localStorage.getItem('tc-theme-migrated-v1')) {
      localStorage.removeItem('tc-theme');
      localStorage.setItem('tc-theme-migrated-v1', '1');
    }
    return this.normalizeTheme(localStorage.getItem('tc-theme'));
  }

  private resolveInitialDarkMode(): boolean {
    return this.computeIsDark(this.resolveInitialThemePreference());
  }
}
