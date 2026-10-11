import { HttpClient, HttpParams } from "@angular/common/http";
import { Inject, Injectable, Optional } from "@angular/core";
import { Observable, firstValueFrom } from "rxjs";
import { API_BASE_URL } from "@proxy/payment-app-proxy";

/**
 * "Connect with Stripe" client. Hand-written on purpose: the NSwag proxy in `core/proxies` is generated and must not be edited.
 * When the proxy is next regenerated from the API, `StripeConnectController` will appear there and this file can shrink to the
 * popup handling (`connect`) on top of the generated client.
 */

export interface StripeConnectStatus {
  /** "Connect with Stripe" is configured on the server. When false the console shows only the manual key form. */
  isAvailable: boolean;
  /** `Manual` (pasted keys) or `OAuth` (connected through the Stripe App). */
  authMode: string;
  account?: string | null;
  /** When the current access token stops working (ISO date, UTC). It is renewed automatically before that. */
  tokenExpirationTime?: string | null;
  /** The token is past its expiry, so payments are failing until it is renewed or reconnected. */
  isExpired: boolean;
}

interface StripeConnectStartResult {
  /** Where to send the popup. Null when no authorization is needed (see `paymentProfileId`). */
  authorizeUrl?: string | null;
  expirationTime?: string | null;
  /**
   * Set instead of `authorizeUrl` when the app already has a Stripe connection and the new currency's gateway was created from it:
   * the merchant has nothing to authorize again, so no Stripe page is shown.
   */
  paymentProfileId?: number | null;
}

export interface StripeConnectResult {
  success: boolean;
  /** One of the server's codes (`access_denied`, `invalid_state`, …) or `closed` when the window was closed without finishing. */
  error: string | null;
  paymentProfileId: number | null;
  /** Why Stripe refused, in words the server says are safe to show (never a key). */
  detail?: string | null;
}

/** What the callback page relays: the one-time code and state, to be finished here with the user's own login. */
export interface StripeConnectCallback {
  code: string | null;
  state: string;
  error: string | null;
}

export const STRIPE_CONNECT_CLOSED = "closed";

/**
 * Reads the message the callback page posts to its opener. Only a message from the API's own origin and from the very window
 * we opened is accepted, so a page on another origin cannot forge a "connected" result.
 */
export function readConnectMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  popup: unknown,
  apiOrigin: string,
): StripeConnectResult | null {
  if (event.origin !== apiOrigin || event.source !== popup) return null;
  const data = event.data;
  if (!data || typeof data !== "object" || data.type !== "stripe-connect") return null;
  return {
    success: data.success === true,
    error: typeof data.error === "string" ? data.error : null,
    paymentProfileId: typeof data.paymentProfileId === "number" ? data.paymentProfileId : null,
  };
}

/**
 * Reads the code and state the callback page relays to its opener. Same trust rule as {@link readConnectMessage}: only the API's
 * origin and the very window we opened. The state is what ties the code to this user's attempt, so a message without one is ignored.
 */
export function readCallbackMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  popup: unknown,
  apiOrigin: string,
): StripeConnectCallback | null {
  if (event.origin !== apiOrigin || event.source !== popup) return null;
  const data = event.data;
  if (!data || typeof data !== "object" || data.type !== "stripe-connect-callback") return null;
  if (typeof data.state !== "string" || data.state.length === 0) return null;
  return {
    code: typeof data.code === "string" ? data.code : null,
    state: data.state,
    error: typeof data.error === "string" ? data.error : null,
  };
}

export function describeConnectError(code: string | null | undefined, detail?: string | null): string {
  const message = describeCode(code);
  return detail ? `${message} (${detail})` : message;
}

function describeCode(code: string | null | undefined): string {
  switch (code) {
    case "access_denied":
      return "The connection was cancelled on the Stripe page.";
    case "expired_state":
      return "The connection attempt expired. Please try again.";
    case "invalid_state":
      return "The connection link was not valid anymore. Please try again.";
    case "mode_mismatch":
      return "The Stripe account mode does not match this app (live and test cannot be mixed).";
    case "invalid_credential":
      return "Stripe accepted the connection but the access it gave could not be used. Check the app's permissions and try again.";
    case "account_mismatch":
      return "This gateway already belongs to a different Stripe account.";
    case "profile_not_created":
      return "Stripe was connected but the gateway could not be created. Please try again or add it manually.";
    default:
      return "Stripe could not be connected. Please try again.";
  }
}

@Injectable({ providedIn: "root" })
export class StripeConnectService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Optional() @Inject(API_BASE_URL) baseUrl?: string,
  ) {
    this.baseUrl = baseUrl ?? "";
  }

  getStatus(appId: string, profileId: number): Promise<StripeConnectStatus> {
    return firstValueFrom(this.http.get<StripeConnectStatus>(this.url(appId, profileId)));
  }

  /** Whether "Connect with Stripe" is on for this app (feature enabled and configured for the app's live/test mode). */
  async getAvailability(appId: string): Promise<boolean> {
    const result = await firstValueFrom(this.http.get<{ isAvailable: boolean }>(this.appUrl(appId)));
    return result?.isAvailable === true;
  }

  /**
   * Existing gateway: opens the Stripe install page in a popup and resolves when the callback page reports back (or the
   * window is closed). Must be called straight from a click: the popup is opened first, before any await, or the browser
   * blocks it. Rejects when the popup is blocked or the server refuses to start (for example a wrong 2FA code).
   */
  connect(appId: string, profileId: number, onFinishing?: () => void): Promise<StripeConnectResult> {
    return this.openPopup(appId, onFinishing, () =>
      this.http.post<StripeConnectStartResult>(`${this.url(appId, profileId)}/start`, null),
    );
  }

  /**
   * New gateway: nothing exists until the merchant finishes on Stripe, then the server creates it (or reconnects the app's
   * existing Stripe gateway in that currency). Same click-handler rule as {@link connect}.
   */
  connectNew(
    appId: string,
    currency: string,
    profileName?: string | null,
    onFinishing?: () => void,
  ): Promise<StripeConnectResult> {
    let params = new HttpParams().set("currency", currency);
    if (profileName) params = params.set("profileName", profileName);
    return this.openPopup(appId, onFinishing, () =>
      this.http.post<StripeConnectStartResult>(`${this.appUrl(appId)}/start`, null, { params }),
    );
  }

  /** Opens the blank popup first (synchronously, so it is not blocked), then asks the server for the install link. */
  private async openPopup(
    appId: string,
    onFinishing: (() => void) | undefined,
    start: () => Observable<StripeConnectStartResult>,
  ): Promise<StripeConnectResult> {
    const popup = window.open("", "stripe-connect", "width=560,height=760");
    if (!popup) {
      throw new Error("The browser blocked the Stripe window. Allow pop-ups for this site and try again.");
    }
    popup.document.body.textContent = "Connecting to Stripe…";

    try {
      const result = await firstValueFrom(start());
      if (!result.authorizeUrl) {
        // The popup had to be opened before the answer was known (a browser blocks one opened later); it is not needed after all.
        popup.close();
        return { success: true, error: null, paymentProfileId: result.paymentProfileId ?? null, detail: null };
      }
      popup.location.href = result.authorizeUrl;
    } catch (err) {
      popup.close();
      throw err;
    }

    return this.waitForResult(popup, appId, onFinishing);
  }

  private waitForResult(popup: Window, appId: string, onFinishing?: () => void): Promise<StripeConnectResult> {
    const apiOrigin = new URL(this.baseUrl || window.location.origin, window.location.origin).origin;

    return new Promise<StripeConnectResult>((resolve) => {
      let closedTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: StripeConnectResult) => {
        window.removeEventListener("message", onMessage);
        clearInterval(poll);
        clearTimeout(closedTimer);
        resolve(result);
      };
      let relayed = false;
      const onMessage = (event: MessageEvent) => {
        const result = readConnectMessage(event, popup, apiOrigin);
        if (result) {
          finish(result);
          return;
        }

        // The callback page only relays the code and state; the connection is finished here, as the signed-in user who started it.
        const callback = readCallbackMessage(event, popup, apiOrigin);
        if (!callback || relayed) return;
        relayed = true;
        clearInterval(poll); // the page closes itself after relaying: that is not a cancellation any more
        clearTimeout(closedTimer);
        // Stripe is done; from here only our own server call is pending, so the caller can show "connecting".
        onFinishing?.();
        void this.complete(appId, callback).then(finish);
      };
      window.addEventListener("message", onMessage);

      // The page posts its result and then closes itself, so a closed window alone is not "cancelled": give a message
      // that is still in flight a moment to arrive first.
      const poll = setInterval(() => {
        if (popup.closed && closedTimer === undefined) {
          closedTimer = setTimeout(
            () => finish({ success: false, error: STRIPE_CONNECT_CLOSED, paymentProfileId: null }),
            400,
          );
        }
      }, 500);
    });
  }

  /** Finishes the connection with the user's own login. Never rejects: a failure is reported in the result. */
  private async complete(appId: string, callback: StripeConnectCallback): Promise<StripeConnectResult> {
    try {
      const result = await firstValueFrom(
        this.http.post<StripeConnectResult>(`${this.appUrl(appId)}/complete`, {
          state: callback.state,
          code: callback.code,
          error: callback.error,
        }),
      );
      return {
        success: result.success === true,
        error: result.error ?? null,
        paymentProfileId: result.paymentProfileId ?? null,
        detail: result.detail ?? null,
      };
    } catch {
      return { success: false, error: "exchange_failed", paymentProfileId: null, detail: null };
    }
  }

  private appUrl(appId: string): string {
    return `${this.baseUrl}/api/apps/${encodeURIComponent(appId)}/stripe-connect`;
  }

  private url(appId: string, profileId: number): string {
    return `${this.baseUrl}/api/apps/${encodeURIComponent(appId)}/payment-profiles/${profileId}/stripe-connect`;
  }
}
