import { HttpClient } from "@angular/common/http";
import { Inject, Injectable, Optional } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { API_BASE_URL } from "@proxy/payment-app-proxy";

/**
 * Webhook events of one payment ("Webhooks" block on the payment page). Hand-written on purpose: the NSwag proxy in
 * `core/proxies` is generated and must not be edited. When the proxy is next regenerated, `PaymentsClient.getWebhooks(appId,
 * paymentId)` will appear there and {@link PaymentWebhooksService.getForPayment} can delegate to it.
 */

export type PaymentWebhookStatus = "Pending" | "Retrying" | "Delivered" | "Dropped";

/** One webhook EVENT (not one attempt): the delivery library keeps a single row per event and overwrites it on each attempt. */
export interface PaymentWebhookEvent {
  webhookQueueItemId: number;
  status: PaymentWebhookStatus;
  webhookUrl: string;
  /** JSON text, exactly what is POSTed. */
  payload: string;
  /** ISO, UTC: when the event was queued. */
  createdTime: string;
  lastAttemptTime?: string | null;
  deliveredTime?: string | null;
  nextRetryTime?: string | null;
  isProcessed: boolean;
  /** How many attempts failed. */
  retryCount: number;
  /** HTTP code of the last answer; null means the receiver did not answer at all (timeout, DNS, TLS). */
  lastStatusCode?: number | null;
  error?: string | null;
}

/** How a webhook event is shown: a one-glance badge and a plain sentence, with the technical detail kept for the expert view. */
export interface WebhookEventView {
  /** Matches the page's status pill classes. */
  tone: "muted" | "warn" | "ok" | "bad";
  /** Material Symbols name: the badge never relies on colour alone. */
  icon: string;
  label: string;
  headline: string;
  /** What is going on / what to check, or null when there is nothing to add. */
  hint: string | null;
}

const HTTP_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found (redirect)",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  408: "Request Timeout",
  410: "Gone",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** "404 Not Found", or "No response" when the receiver never answered. */
export function describeHttpStatus(code: number | null | undefined): string {
  if (code === null || code === undefined) return "No response";
  const text = HTTP_TEXT[code];
  return text ? `${code} ${text}` : `${code}`;
}

function attempts(n: number): string {
  return n === 1 ? "1 failed attempt" : `${n} failed attempts`;
}

/** What went wrong for a `Retrying` event, from the last answer of the receiver. */
function describeRetryCause(code: number | null | undefined): string {
  if (code === null || code === undefined) {
    return "Your server did not answer. Check that the address is correct and reachable from the internet.";
  }
  if (code >= 500) return `Your server had an error (HTTP ${code}). We will try again automatically.`;
  if (code >= 400) {
    return `Your server refused it (HTTP ${code}). Check the address and that it accepts these notifications.`;
  }
  return `Your server answered HTTP ${code}, which is not a success. It must answer with a 2xx code.`;
}

/** Why an event was `Dropped`. The two known reasons come with fixed server messages; anything else gets a generic line. */
function describeDropCause(error: string | null | undefined): string {
  const text = (error ?? "").toLowerCase();
  if (text.includes("not allowed")) {
    return "The webhook address was refused: it must start with https and point to a public address. Update it in the app settings.";
  }
  if (text.includes("expired")) {
    return "It could not be delivered in time, so we stopped trying. Your server may have been down for a while.";
  }
  return "We stopped trying and it was never delivered.";
}

/** Turns an event into the badge and sentences shown on the page. Unknown future statuses fall back to a neutral badge. */
export function describeWebhookEvent(event: Pick<PaymentWebhookEvent, "status" | "retryCount" | "lastStatusCode" | "error">): WebhookEventView {
  switch (event.status) {
    case "Pending":
      return {
        tone: "muted",
        icon: "schedule",
        label: "Waiting",
        headline: "Waiting to be sent",
        hint: "It is queued and will be sent shortly.",
      };
    case "Retrying":
      return {
        tone: "warn",
        icon: "sync",
        label: "Retrying",
        headline: "Not delivered yet. We keep trying",
        hint: describeRetryCause(event.lastStatusCode),
      };
    case "Delivered":
      return {
        tone: "ok",
        icon: "check_circle",
        label: "Delivered",
        headline: "Delivered to your server",
        hint: event.retryCount > 0 ? `It went through after ${attempts(event.retryCount)}.` : null,
      };
    case "Dropped":
      return {
        tone: "bad",
        icon: "error",
        label: "Not delivered",
        headline: "Gave up. This event was not delivered",
        hint: describeDropCause(event.error),
      };
    default:
      return { tone: "muted", icon: "help", label: String(event.status), headline: String(event.status), hint: null };
  }
}

/** "3 events: 2 delivered, 1 retrying". Empty when there are no events. */
export function summarizeWebhookEvents(events: readonly Pick<PaymentWebhookEvent, "status">[]): string {
  if (!events.length) return "";
  const labels: [PaymentWebhookStatus, string][] = [
    ["Delivered", "delivered"],
    ["Retrying", "retrying"],
    ["Pending", "waiting"],
    ["Dropped", "not delivered"],
  ];
  const parts = labels
    .map(([status, label]) => ({ n: events.filter((e) => e.status === status).length, label }))
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${p.label}`);
  return `${events.length} ${events.length === 1 ? "event" : "events"}: ${parts.join(", ")}`;
}

/** The payload is a JSON string: parse it only to pretty-print, and show the raw text when it is not valid JSON. */
export function prettyWebhookPayload(payload: string | null | undefined): string {
  if (!payload) return "";
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

@Injectable({ providedIn: "root" })
export class PaymentWebhooksService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Optional() @Inject(API_BASE_URL) baseUrl?: string,
  ) {
    this.baseUrl = baseUrl ?? "";
  }

  /** Newest first, one item per event, no paging. 404: the payment is not in this app. 401/403: not signed in / no permission. */
  getForPayment(appId: string, paymentId: number): Promise<PaymentWebhookEvent[]> {
    return firstValueFrom(
      this.http.get<PaymentWebhookEvent[]>(
        `${this.baseUrl}/api/apps/${encodeURIComponent(appId)}/payments/${paymentId}/webhooks`,
      ),
    );
  }
}
