import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { API_BASE_URL } from "@proxy/payment-app-proxy";
import {
  StripeConnectService,
  describeConnectError,
  readCallbackMessage,
  readConnectMessage,
} from "./stripe-connect.service";

describe("readConnectMessage", () => {
  const popup = {};
  const origin = "https://api.example.com";
  const message = (over: Partial<{ origin: string; source: unknown; data: unknown }> = {}) => ({
    origin,
    source: popup as MessageEventSource,
    data: { type: "stripe-connect", success: true, error: null, paymentProfileId: 7 },
    ...over,
  });

  it("accepts the result posted by the window we opened, from the API origin", () => {
    expect(readConnectMessage(message() as any, popup, origin)).toEqual({
      success: true,
      error: null,
      paymentProfileId: 7,
    });
  });

  it("reports the error code of a failed connection", () => {
    const result = readConnectMessage(
      message({ data: { type: "stripe-connect", success: false, error: "access_denied" } }) as any,
      popup,
      origin,
    );
    expect(result).toEqual({ success: false, error: "access_denied", paymentProfileId: null });
  });

  it("ignores a message from another origin", () => {
    expect(readConnectMessage(message({ origin: "https://evil.example" }) as any, popup, origin)).toBeNull();
  });

  it("ignores a message from a window we did not open", () => {
    expect(readConnectMessage(message({ source: {} }) as any, popup, origin)).toBeNull();
  });

  it("ignores messages that are not stripe-connect results", () => {
    expect(readConnectMessage(message({ data: { type: "something-else" } }) as any, popup, origin)).toBeNull();
    expect(readConnectMessage(message({ data: "stripe-connect" }) as any, popup, origin)).toBeNull();
    expect(readConnectMessage(message({ data: null }) as any, popup, origin)).toBeNull();
  });

  it("never treats a truthy-but-not-true success as connected", () => {
    const result = readConnectMessage(
      message({ data: { type: "stripe-connect", success: "true" } }) as any,
      popup,
      origin,
    );
    expect(result?.success).toBeFalse();
  });
});

describe("readCallbackMessage", () => {
  const popup = {};
  const origin = "https://api.example.com";
  const state = "s".repeat(43);
  const message = (over: Partial<{ origin: string; source: unknown; data: unknown }> = {}) => ({
    origin,
    source: popup as MessageEventSource,
    data: { type: "stripe-connect-callback", code: "ac_1", state, error: null },
    ...over,
  });

  it("accepts the code and state relayed by the window we opened, from the API origin", () => {
    expect(readCallbackMessage(message() as any, popup, origin)).toEqual({ code: "ac_1", state, error: null });
  });

  it("accepts a cancelled attempt (an error and no code)", () => {
    const relayed = readCallbackMessage(
      message({ data: { type: "stripe-connect-callback", state, error: "access_denied" } }) as any,
      popup,
      origin,
    );
    expect(relayed).toEqual({ code: null, state, error: "access_denied" });
  });

  it("ignores another origin, another window, and messages without a state", () => {
    expect(readCallbackMessage(message({ origin: "https://evil.example" }) as any, popup, origin)).toBeNull();
    expect(readCallbackMessage(message({ source: {} }) as any, popup, origin)).toBeNull();
    expect(
      readCallbackMessage(message({ data: { type: "stripe-connect-callback", code: "ac_1" } }) as any, popup, origin),
    ).toBeNull();
    expect(readCallbackMessage(message({ data: { type: "stripe-connect", success: true } }) as any, popup, origin)).toBeNull();
  });
});

describe("describeConnectError", () => {
  it("explains the known codes and falls back for the rest", () => {
    expect(describeConnectError("access_denied")).toContain("cancelled");
    expect(describeConnectError("mode_mismatch")).toContain("mode");
    expect(describeConnectError("whatever")).toContain("could not be connected");
    expect(describeConnectError(null)).toContain("could not be connected");
  });
});

describe("describeConnectError (detail)", () => {
  it("appends why Stripe refused, when the server says", () => {
    expect(describeConnectError("invalid_credential", "No such key")).toContain("No such key");
    expect(describeConnectError("invalid_credential")).not.toContain("(");
  });
});

describe("describeConnectError (account mismatch)", () => {
  it("explains a gateway that belongs to another Stripe account", () => {
    expect(describeConnectError("account_mismatch")).toContain("different Stripe account");
  });
});

describe("describeConnectError (new gateway)", () => {
  it("explains a gateway that could not be created after connecting", () => {
    expect(describeConnectError("profile_not_created")).toContain("gateway could not be created");
  });
});

describe("StripeConnectService requests", () => {
  let service: StripeConnectService;
  let http: HttpTestingController;
  let popup: { document: { body: { textContent: string } }; location: { href: string }; closed: boolean; close: jasmine.Spy };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: "https://api.example.com" }],
    });
    service = TestBed.inject(StripeConnectService);
    http = TestBed.inject(HttpTestingController);
    popup = { document: { body: { textContent: "" } }, location: { href: "" }, closed: false, close: jasmine.createSpy("close") };
    spyOn(window, "open").and.returnValue(popup as unknown as Window);
  });

  afterEach(() => http.verify());

  it("getAvailability unwraps isAvailable", async () => {
    const pending = service.getAvailability("app1");
    http.expectOne("https://api.example.com/api/apps/app1/stripe-connect").flush({ isAvailable: true });
    expect(await pending).toBeTrue();
  });

  it("getAvailability is false when the server does not say true", async () => {
    const pending = service.getAvailability("app1");
    http.expectOne("https://api.example.com/api/apps/app1/stripe-connect").flush({ isAvailable: false });
    expect(await pending).toBeFalse();
  });

  it("connectNew opens the popup first and sends the currency as a query param", () => {
    void service.connectNew("app1", "USD");
    expect(window.open).toHaveBeenCalledTimes(1); // synchronously, before any response
    const req = http.expectOne((r) => r.url === "https://api.example.com/api/apps/app1/stripe-connect/start");
    expect(req.request.method).toBe("POST");
    expect(req.request.params.get("currency")).toBe("USD");
    expect(req.request.params.has("profileName")).toBeFalse();
    req.flush({ authorizeUrl: "https://marketplace.stripe.com/oauth/v2/authorize?x=1", expirationTime: "2026-10-03T00:00:00Z" });
  });

  it("connectNew sends profileName only when given", () => {
    void service.connectNew("app1", "EUR", "Main Stripe");
    const req = http.expectOne((r) => r.url.endsWith("/stripe-connect/start"));
    expect(req.request.params.get("profileName")).toBe("Main Stripe");
    req.flush({ authorizeUrl: "https://marketplace.stripe.com/x", expirationTime: "2026-10-03T00:00:00Z" });
  });

  it("connectNew closes the popup and rejects when the server refuses to start", async () => {
    const pending = service.connectNew("app1", "USD");
    http.expectOne((r) => r.url.endsWith("/stripe-connect/start")).flush({ message: "no" }, { status: 400, statusText: "Bad Request" });
    await expectAsync(pending).toBeRejected();
    expect(popup.close).toHaveBeenCalled();
  });

  const relay = (state = "s".repeat(43), over: Record<string, unknown> = {}) => {
    const event = new MessageEvent("message", {
      origin: "https://api.example.com",
      data: { type: "stripe-connect-callback", code: "ac_1", state, error: null, ...over },
    });
    Object.defineProperty(event, "source", { value: popup });
    window.dispatchEvent(event);
  };
  const startFlush = () =>
    http
      .expectOne((r) => r.url.endsWith("/stripe-connect/start"))
      .flush({ authorizeUrl: "https://marketplace.stripe.com/x", expirationTime: "2026-10-03T00:00:00Z" });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("finishes the connection with the user's own login, from what the callback page relayed", async () => {
    const pending = service.connectNew("app1", "USD");
    startFlush();
    await settle();

    relay("t".repeat(43));
    const req = http.expectOne("https://api.example.com/api/apps/app1/stripe-connect/complete");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ state: "t".repeat(43), code: "ac_1", error: null });
    req.flush({ success: true, error: null, paymentProfileId: 9, detail: null });

    expect(await pending).toEqual({ success: true, error: null, paymentProfileId: 9, detail: null });
  });

  it("reports why Stripe refused, as the server answered", async () => {
    const pending = service.connectNew("app1", "USD");
    startFlush();
    await settle();

    relay();
    http.expectOne((r) => r.url.endsWith("/stripe-connect/complete")).flush({
      success: false,
      error: "invalid_credential",
      paymentProfileId: null,
      detail: "No such key",
    });

    expect(await pending).toEqual({ success: false, error: "invalid_credential", paymentProfileId: null, detail: "No such key" });
  });

  it("does not take the popup closing itself after the relay for a cancelled connection", async () => {
    const pending = service.connectNew("app1", "USD");
    startFlush();
    await settle();

    popup.closed = true; // the callback page closes itself right after posting
    relay();
    await new Promise((resolve) => setTimeout(resolve, 1200)); // longer than the closed-window poll and its grace period
    http.expectOne((r) => r.url.endsWith("/stripe-connect/complete")).flush({ success: true, error: null, paymentProfileId: 3, detail: null });

    expect((await pending).success).toBeTrue();
  });

  it("answers a failed completion request with a plain error instead of hanging", async () => {
    const pending = service.connectNew("app1", "USD");
    startFlush();
    await settle();

    relay();
    http.expectOne((r) => r.url.endsWith("/stripe-connect/complete")).flush({}, { status: 500, statusText: "Server Error" });

    const result = await pending;
    expect(result.success).toBeFalse();
    expect(result.error).toBe("exchange_failed");
  });

  it("connectNew finishes at once, without the Stripe page, when the server reused the connection the app already has", async () => {
    const pending = service.connectNew("app1", "EUR", "Euro");
    http
      .expectOne((r) => r.url.endsWith("/stripe-connect/start"))
      .flush({ authorizeUrl: null, expirationTime: null, paymentProfileId: 12 });

    expect(await pending).toEqual({ success: true, error: null, paymentProfileId: 12, detail: null });
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.href).toBe(""); // never sent to Stripe
  });

  it("connect (existing gateway) posts to the profile's start url", () => {
    void service.connect("app1", 7);
    const req = http.expectOne("https://api.example.com/api/apps/app1/payment-profiles/7/stripe-connect/start");
    expect(req.request.method).toBe("POST");
    req.flush({ authorizeUrl: "https://marketplace.stripe.com/x", expirationTime: "2026-10-03T00:00:00Z" });
  });
});
