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
   * localStorage key holding the JSON array of user ids that have already fired
   * their FIRST `sign_in` (login) event. Persisted (kept across signout via
   * StorageService.PRESERVED_KEYS) so login is reported at most ONCE per user —
   * NOT on every sign in, and NOT again after signout → signin. This is what
   * makes "log out / log back in many times a day" count only once.
   * Keep this string in sync with StorageService.
   */
  static readonly FIRST_SIGNIN_KEY = 'gtm_first_signin_users';

  /**
   * localStorage key holding the JSON array of user ids that have already fired
   * their `sign_up` (registration) event. Persisted across signout so registration
   * is reported at most ONCE per user. Keep this string in sync with StorageService.
   */
  static readonly SIGNUP_KEY = 'gtm_signup_users';

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
   * Pushes an event onto the dataLayer for EVERY visitor — NOT gated by ad click.
   *
   * Attribution is handled downstream by GA4 + the Google Ads link: Ads only
   * counts a conversion when GA4 has a matching ad click, so pushing the event
   * for organic/direct/referral visitors never over-reports to Ads — it simply
   * lets GA4 see the full picture (and makes GTM Preview debugging possible). The
   * captured ad-click id, if any, rides along as an optional `gclid` param.
   */
  trackConversion(action: string, params: Record<string, unknown> = {}): void {
    if (!this.enabled) {
      return;
    }
    const gclid = this.adClickId;
    window.dataLayer.push({ event: action, ...(gclid ? { gclid } : {}), ...params });
  }

  /**
   * Fires the GA4-standard `sign_up` event once per user, on registration. NOT
   * gated by ad click. A second registration for the same account can't happen,
   * but the marker keeps it to a single push defensively.
   *
   * Returns a promise that resolves once the tag has actually been sent (or a
   * short timeout elapses) — `await` it before navigating so the signup flow's
   * redirect can't drop the event. Resolves immediately when GTM is off.
   */
  trackSignUp(userId: string, params: Record<string, unknown> = {}): Promise<void> {
    return this.trackOncePerUser('sign_up', TagManagerService.SIGNUP_KEY, userId, params);
  }

  /**
   * Fires the GA4-standard `sign_in` (login) event the FIRST time a user signs in
   * on this browser, then never again for that user — so logging out and back in
   * many times a day is counted at most once. NOT gated by ad click.
   *
   * Returns a promise that resolves once the tag has been sent (or a short
   * timeout elapses); `await` it before navigating. Resolves immediately when
   * GTM is off.
   */
  trackFirstSignIn(userId: string, params: Record<string, unknown> = {}): Promise<void> {
    return this.trackOncePerUser('sign_in', TagManagerService.FIRST_SIGNIN_KEY, userId, params);
  }

  /**
   * Shared once-per-user push: no-op when GTM is off, the userId is missing, or
   * this user already fired `event` on this browser. The marker is written before
   * the push so a duplicate can never slip through. The captured ad-click id, if
   * any, rides along as an optional `gclid` param (metadata, never a gate).
   * Resolves once the event's tags have fired (see flushPush).
   */
  private trackOncePerUser(
    event: string,
    storageKey: string,
    userId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    if (!this.enabled || !userId) {
      return Promise.resolve();
    }
    if (this.hasReported(storageKey, userId)) {
      this.log.info(`Skipping "${event}" — already reported once for this user.`);
      return Promise.resolve();
    }
    this.markReported(storageKey, userId);
    const gclid = this.adClickId;
    return this.flushPush({
      event,
      user_id: userId,
      ...(gclid ? { gclid } : {}),
      ...params,
    });
  }

  /**
   * Pushes a payload and resolves once GTM has fired the tags for it (via GTM's
   * `eventCallback`), or after `timeoutMs`, whichever comes first. This defeats
   * the "redirect race": if the caller navigates (or hard-redirects) right after,
   * the async GA4 tag would otherwise be cancelled before it sends. Awaiting this
   * holds the navigation until the hit is on the wire.
   *
   * The `settled` guard makes it resolve exactly once even though `eventCallback`
   * can fire per-tag/container. Never rejects — a dropped analytics hit must
   * never break the auth flow.
   */
  private flushPush(payload: Record<string, unknown>, timeoutMs = 1200): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const done = (): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(done, timeoutMs);
      try {
        window.dataLayer.push({
          ...payload,
          eventTimeout: timeoutMs,
          eventCallback: () => done(),
        });
      } catch {
        done();
      }
    });
  }

  /** Whether GTM is actually active in this environment. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * The Google Ads click id captured for the current session, or null. Attached
   * to events as optional `gclid` metadata — never used to gate whether an event
   * fires (GA4 + the Ads link decide attribution).
   */
  get adClickId(): string | null {
    try {
      return window.sessionStorage.getItem(TagManagerService.AD_CLICK_KEY);
    } catch {
      return null;
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

  /** Whether this user has already fired the event tracked under `storageKey`. */
  private hasReported(storageKey: string, userId: string): boolean {
    return this.getReported(storageKey).includes(userId);
  }

  /** Records that this user has now fired the event tracked under `storageKey`. */
  private markReported(storageKey: string, userId: string): void {
    try {
      const users = this.getReported(storageKey);
      if (!users.includes(userId)) {
        users.push(userId);
        localStorage.setItem(storageKey, JSON.stringify(users));
      }
    } catch {
      // localStorage unavailable — fail open. A rare duplicate event is
      // preferable to throwing inside the auth flow.
    }
  }

  private getReported(storageKey: string): string[] {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
}
