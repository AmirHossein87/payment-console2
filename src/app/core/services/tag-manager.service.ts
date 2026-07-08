import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { Logger } from '@core/services/logger.service';

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

/**
 * Thin wrapper around Google Tag Manager (gtm.js).
 *
 * GTM is gated entirely by the active environment:
 *   - `environment.enableTagManager === true` AND a non-empty `gtmContainerId`
 *     → gtm.js is dynamically injected and events are pushed to `dataLayer`.
 *   - otherwise → nothing is injected, no `<script>` is added, and NO request is
 *     ever made to Google. Every public method becomes a safe no-op.
 *
 * Because the GTM loader is only appended when enabled, the "off" environment
 * (e.g. local dev, or any env with a blank container id) never even contacts
 * Google.
 *
 * Note: GTM does not send analytics hits by itself. It only loads the container
 * and exposes the `dataLayer`. What actually happens to the events pushed here
 * (page_view, custom events) is configured inside the GTM web UI — typically a
 * GA4 Configuration tag plus triggers that listen for the `event` keys below.
 */
@Injectable({ providedIn: 'root' })
export class TagManagerService {
  private readonly log = Logger.create('TagManager');
  private enabled = false;
  private initialized = false;

  /**
   * sessionStorage key holding the captured Google Ads click id. sessionStorage
   * is used on purpose: it survives the in-app hard reload and is NOT wiped by
   * StorageService.clear() (which only clears localStorage on signout / guard
   * failure), yet it scopes attribution to the current browsing session.
   */
  private static readonly AD_CLICK_KEY = 'gtm_ad_click';

  /** Query params Google Ads appends to a landing URL after an ad click. */
  private static readonly AD_CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid'];

  /**
   * localStorage key holding the JSON array of user ids that have already
   * reported their "first successful sign in" conversion. Persisted (and kept
   * across signout via StorageService.PRESERVED_KEYS) so the conversion is sent
   * to Google Ads at most ONCE per user — not on every sign in, and not on
   * signout → signin again. Keep this string in sync with StorageService.
   */
  static readonly FIRST_SIGNIN_KEY = 'gtm_first_signin_users';

  /**
   * Injects the GTM loader (gtm.js) for the current environment as high in the
   * page lifecycle as possible. Call this from main.ts BEFORE Angular bootstraps
   * so the tag loads near the top of page load — which is what Google Tag
   * Assistant / the "Test your website" checker expect to find.
   *
   * Idempotent: a window flag guarantees the container is injected at most once,
   * even though both main.ts (early) and init() (via DI) call it. Returns whether
   * GTM is enabled+loaded for this environment.
   */
  static loadContainer(): boolean {
    if (!environment.enableTagManager || !environment.gtmContainerId) {
      return false;
    }
    if ((window as any).__gtm_loaded__) {
      return true;
    }
    (window as any).__gtm_loaded__ = true;

    const containerId = environment.gtmContainerId;

    // 1. Bootstrap the dataLayer with the gtm.start event. This MUST be pushed
    //    before the loader script so GTM can measure container load time and
    //    fire any "All Pages" / initialization triggers.
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

    // 2. Inject the gtm.js loader (mirrors Google's standard snippet).
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${containerId}`;
    document.head.appendChild(script);

    return true;
  }

  /**
   * Wires up the service once Angular is running: captures Google Ads attribution
   * and ensures the container is loaded (no-op if main.ts already loaded it).
   * Safe to call more than once.
   */
  init(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    // Record whether this visitor arrived from a Google Ads click. Done before
    // the enabled check so the landing-page gclid is captured at app boot,
    // before any guard redirect or in-app reload can drop it from the URL.
    this.captureAdClick();

    this.enabled = TagManagerService.loadContainer();

    if (this.enabled) {
      this.log.info('Google Tag Manager initialized.', environment.gtmContainerId);
    } else {
      this.log.info('Google Tag Manager is disabled for this environment — gtm.js will not be loaded.');
    }
  }

  /**
   * Pushes a single-page-app page view onto the dataLayer. No-op when GTM is
   * disabled. Wire a GA4 event tag in the GTM UI to the `page_view` event to
   * forward these to Analytics.
   */
  trackPageView(path: string, title?: string): void {
    if (!this.enabled) {
      return;
    }
    window.dataLayer.push({
      event: 'page_view',
      page_path: path,
      page_location: window.location.href,
      page_title: title ?? document.title,
    });
  }

  /**
   * Pushes a custom event onto the dataLayer. No-op when GTM is disabled.
   * The `action` becomes the `event` key that GTM triggers listen for.
   */
  trackEvent(action: string, params: Record<string, unknown> = {}): void {
    if (!this.enabled) {
      return;
    }
    window.dataLayer.push({ event: action, ...params });
  }

  /**
   * Pushes a conversion event onto the dataLayer ONLY when the visitor arrived
   * via a Google Ads click (a gclid/gbraid/wbraid was captured this session).
   * No-op for organic, referral, and direct traffic — so we never report a
   * conversion to Google Ads for a customer it didn't send us.
   */
  trackConversion(action: string, params: Record<string, unknown> = {}): void {
    if (!this.enabled) {
      return;
    }
    if (!this.hasAdClickAttribution) {
      this.log.info(`Skipping "${action}" conversion — visitor did not arrive from a Google Ads click.`);
      return;
    }
    window.dataLayer.push({ event: action, ...params });
  }

  /**
   * Reports the `sign_in` conversion the FIRST time a given user signs in on
   * this browser, then never again for that user. This is the activation goal:
   * we deliberately do NOT count sign-up (registration) or repeat sign-ins.
   *
   * Still gated by ad-click attribution (via trackConversion), so organic /
   * direct sign-ins never report a conversion. The ad-attribution check runs
   * BEFORE the marker is written, so a non-ad first sign in does not "use up"
   * the once-per-user slot — a later ad-attributed sign in can still convert.
   */
  trackFirstSignInConversion(userId: string, params: Record<string, unknown> = {}): void {
    if (!this.enabled || !userId || !this.hasAdClickAttribution) {
      return;
    }
    if (this.hasReportedSignIn(userId)) {
      this.log.info('Skipping "sign_in" conversion — first sign in already reported for this user.');
      return;
    }
    this.markSignInReported(userId);
    this.trackConversion('sign_in', { user_id: userId, ...params });
  }

  /** Whether GTM is actually active in this environment. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Whether a Google Ads click id was captured for the current session. */
  get hasAdClickAttribution(): boolean {
    try {
      return !!window.sessionStorage.getItem(TagManagerService.AD_CLICK_KEY);
    } catch {
      return false;
    }
  }

  /**
   * Persists the Google Ads click id from the current URL, if present. Only
   * writes when a click id exists, so an organic page load never overwrites an
   * ad-click captured earlier in the same session.
   */
  private captureAdClick(): void {
    try {
      const params = new URLSearchParams(window.location.search);
      const clickId = TagManagerService.AD_CLICK_PARAMS
        .map((p) => params.get(p))
        .find((v) => !!v);
      if (clickId) {
        window.sessionStorage.setItem(TagManagerService.AD_CLICK_KEY, clickId);
      }
    } catch {
      // sessionStorage / URL parsing unavailable — silently skip attribution.
    }
  }

  /** Whether this user has already reported their first-sign-in conversion. */
  private hasReportedSignIn(userId: string): boolean {
    return this.getReportedSignIns().includes(userId);
  }

  /** Records that this user's first-sign-in conversion has now been reported. */
  private markSignInReported(userId: string): void {
    try {
      const users = this.getReportedSignIns();
      if (!users.includes(userId)) {
        users.push(userId);
        localStorage.setItem(TagManagerService.FIRST_SIGNIN_KEY, JSON.stringify(users));
      }
    } catch {
      // localStorage unavailable — fail open. A rare duplicate conversion is
      // preferable to throwing inside the sign-in flow.
    }
  }

  private getReportedSignIns(): string[] {
    try {
      const raw = localStorage.getItem(TagManagerService.FIRST_SIGNIN_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
}
