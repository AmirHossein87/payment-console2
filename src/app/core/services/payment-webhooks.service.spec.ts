import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { API_BASE_URL } from "@proxy/payment-app-proxy";
import {
  PaymentWebhookEvent,
  PaymentWebhooksService,
  describeHttpStatus,
  describeWebhookEvent,
  prettyWebhookPayload,
  summarizeWebhookEvents,
} from "./payment-webhooks.service";

const event = (over: Partial<PaymentWebhookEvent> = {}): PaymentWebhookEvent => ({
  webhookQueueItemId: 1,
  status: "Delivered",
  webhookUrl: "https://shop.example/hook",
  payload: "{}",
  createdTime: "2026-10-10T10:00:00Z",
  isProcessed: true,
  retryCount: 0,
  ...over,
});

describe("describeHttpStatus", () => {
  it("names the common codes", () => {
    expect(describeHttpStatus(200)).toBe("200 OK");
    expect(describeHttpStatus(404)).toBe("404 Not Found");
    expect(describeHttpStatus(503)).toBe("503 Service Unavailable");
  });

  it("shows just the number for a code it has no name for", () => {
    expect(describeHttpStatus(418)).toBe("418");
  });

  it("says there was no answer when the code is missing", () => {
    expect(describeHttpStatus(null)).toBe("No response");
    expect(describeHttpStatus(undefined)).toBe("No response");
  });
});

describe("describeWebhookEvent", () => {
  it("shows a queued event as waiting, with no worry attached", () => {
    const v = describeWebhookEvent(event({ status: "Pending", isProcessed: false }));
    expect(v.tone).toBe("muted");
    expect(v.label).toBe("Waiting");
    expect(v.hint).toContain("sent shortly");
  });

  it("shows a delivered event as delivered with nothing more to say", () => {
    const v = describeWebhookEvent(event({ status: "Delivered", retryCount: 0 }));
    expect(v.tone).toBe("ok");
    expect(v.label).toBe("Delivered");
    expect(v.hint).toBeNull();
  });

  it("does not make a delivered event look failed because it needed retries", () => {
    const v = describeWebhookEvent(event({ status: "Delivered", retryCount: 2, error: "old error" }));
    expect(v.tone).toBe("ok");
    expect(v.hint).toBe("It went through after 2 failed attempts.");
    expect(describeWebhookEvent(event({ status: "Delivered", retryCount: 1 })).hint).toBe("It went through after 1 failed attempt.");
  });

  describe("retrying", () => {
    const retrying = (code: number | null) =>
      describeWebhookEvent(event({ status: "Retrying", isProcessed: false, retryCount: 1, lastStatusCode: code }));

    it("is amber and tells the merchant we keep trying", () => {
      const v = retrying(500);
      expect(v.tone).toBe("warn");
      expect(v.headline).toContain("keep trying");
    });

    it("explains a missing answer", () => {
      expect(retrying(null).hint).toContain("did not answer");
    });

    it("explains a server error", () => {
      expect(retrying(502).hint).toContain("had an error (HTTP 502)");
    });

    it("explains a refusal", () => {
      expect(retrying(404).hint).toContain("refused it (HTTP 404)");
    });

    it("explains a non-2xx answer that is neither", () => {
      expect(retrying(302).hint).toContain("HTTP 302");
      expect(retrying(302).hint).toContain("2xx");
    });
  });

  describe("dropped", () => {
    const dropped = (error: string | null) => describeWebhookEvent(event({ status: "Dropped", error }));

    it("is red and says the event was not delivered", () => {
      const v = dropped(null);
      expect(v.tone).toBe("bad");
      expect(v.label).toBe("Not delivered");
      expect(v.hint).toBe("We stopped trying and it was never delivered.");
    });

    it("explains a refused address", () => {
      const v = dropped("Webhook URL is not allowed: it must use https and must not resolve to a private or internal address.");
      expect(v.hint).toContain("must start with https");
    });

    it("explains an expired event", () => {
      expect(dropped("Webhook expired: not delivered within 3 days").hint).toContain("could not be delivered in time");
    });
  });

  it("falls back to a neutral badge for a status it does not know yet", () => {
    const v = describeWebhookEvent(event({ status: "Paused" as any }));
    expect(v.tone).toBe("muted");
    expect(v.label).toBe("Paused");
  });
});

describe("summarizeWebhookEvents", () => {
  it("is empty without events", () => {
    expect(summarizeWebhookEvents([])).toBe("");
  });

  it("counts each status and skips the ones with none", () => {
    expect(
      summarizeWebhookEvents([{ status: "Delivered" }, { status: "Delivered" }, { status: "Retrying" }, { status: "Dropped" }]),
    ).toBe("4 events: 2 delivered, 1 retrying, 1 not delivered");
  });

  it("uses the singular for one event", () => {
    expect(summarizeWebhookEvents([{ status: "Pending" }])).toBe("1 event: 1 waiting");
  });
});

describe("prettyWebhookPayload", () => {
  it("formats JSON text", () => {
    expect(prettyWebhookPayload('{"a":1,"b":[2]}')).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
  });

  it("shows the raw text when it is not JSON", () => {
    expect(prettyWebhookPayload("not json {")).toBe("not json {");
  });

  it("is empty for a missing payload", () => {
    expect(prettyWebhookPayload(null)).toBe("");
    expect(prettyWebhookPayload("")).toBe("");
  });
});

describe("PaymentWebhooksService", () => {
  let service: PaymentWebhooksService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: "https://api.example.com" }],
    });
    service = TestBed.inject(PaymentWebhooksService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("reads the events of one payment", async () => {
    const promise = service.getForPayment("app 1", 42);
    const req = http.expectOne("https://api.example.com/api/apps/app%201/payments/42/webhooks");
    expect(req.request.method).toBe("GET");
    req.flush([event({ webhookQueueItemId: 9 })]);
    expect((await promise).map((e) => e.webhookQueueItemId)).toEqual([9]);
  });

  it("passes a failure on to the caller", async () => {
    const promise = service.getForPayment("app", 1);
    http.expectOne("https://api.example.com/api/apps/app/payments/1/webhooks").flush("", { status: 404, statusText: "Not Found" });
    await expectAsync(promise).toBeRejected();
  });
});
