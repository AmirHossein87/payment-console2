import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { EmptyError } from "rxjs";
import { PaymentsClient as BasePaymentsClient } from "@proxy/payment-proxy";
import { PaymentsClient } from "@proxy/payment-app-proxy";
import { NotificationService } from "@core/services/notification.service";
import { PaymentWebhookEvent, PaymentWebhooksService } from "@core/services/payment-webhooks.service";
import { BreadcrumbStore } from "@core/stores/breadcrumb.store";
import { WorkspaceStore } from "@core/stores/workspace.store";
import { PaymentDetailComponent } from "./payment-detail.component";

describe("PaymentDetailComponent — Webhooks block", () => {
  let api: jasmine.SpyObj<PaymentWebhooksService>;
  let component: PaymentDetailComponent;

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

  beforeEach(() => {
    api = jasmine.createSpyObj("PaymentWebhooksService", ["getForPayment"]);
    TestBed.configureTestingModule({
      providers: [
        { provide: PaymentWebhooksService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => "42" } } } },
        { provide: Router, useValue: jasmine.createSpyObj("Router", ["navigate"]) },
        { provide: WorkspaceStore, useValue: { currentAppId: () => "app1" } },
        { provide: BreadcrumbStore, useValue: jasmine.createSpyObj("BreadcrumbStore", ["set", "clear"]) },
        { provide: NotificationService, useValue: jasmine.createSpyObj("NotificationService", ["showSuccess", "showError"]) },
        { provide: BasePaymentsClient, useValue: {} },
        { provide: PaymentsClient, useValue: {} },
      ],
    });
    component = TestBed.runInInjectionContext(() => new PaymentDetailComponent());
    (component as unknown as { paymentId: number }).paymentId = 42;
  });

  it("asks for the events of this payment in this app and shows them with their plain-language badge", async () => {
    api.getForPayment.and.resolveTo([
      event({ webhookQueueItemId: 2, status: "Retrying", isProcessed: false, retryCount: 1, lastStatusCode: 500 }),
      event({ webhookQueueItemId: 1, status: "Delivered" }),
    ]);

    await component.loadWebhookEvents();

    expect(api.getForPayment).toHaveBeenCalledWith("app1", 42);
    expect(component.webhookEventsState()).toBe("ready");
    expect(component.webhookRows().map((r) => r.view.label)).toEqual(["Retrying", "Delivered"]);
    expect(component.webhookSummary()).toBe("2 events: 1 delivered, 1 retrying");
  });

  it("is ready with no rows when the payment has no webhook events", async () => {
    api.getForPayment.and.resolveTo([]);

    await component.loadWebhookEvents();

    expect(component.webhookEventsState()).toBe("ready");
    expect(component.webhookRows()).toEqual([]);
    expect(component.webhookSummary()).toBe("");
  });

  it("hides the whole block when the user may not see webhooks", async () => {
    api.getForPayment.and.rejectWith({ status: 403 });
    await component.loadWebhookEvents();
    expect(component.webhookEventsState()).toBe("hidden");
  });

  it("hides the block on a sign-out, which the interceptor ends as an empty call", async () => {
    api.getForPayment.and.rejectWith(new EmptyError());
    await component.loadWebhookEvents();
    expect(component.webhookEventsState()).toBe("hidden");
  });

  it("shows a not-found state for a 404", async () => {
    api.getForPayment.and.rejectWith({ status: 404 });
    await component.loadWebhookEvents();
    expect(component.webhookEventsState()).toBe("notfound");
  });

  it("shows a retryable error for any other failure and drops the stale rows", async () => {
    api.getForPayment.and.resolveTo([event()]);
    await component.loadWebhookEvents();
    expect(component.webhookRows().length).toBe(1);

    api.getForPayment.and.rejectWith({ status: 500 });
    await component.loadWebhookEvents();

    expect(component.webhookEventsState()).toBe("error");
    expect(component.webhookRows()).toEqual([]);
  });

  it("opens and closes the technical details of one event without touching the others", () => {
    component.toggleWebhook(1);
    expect(component.isWebhookOpen(1)).toBeTrue();
    expect(component.isWebhookOpen(2)).toBeFalse();

    component.toggleWebhook(1);
    expect(component.isWebhookOpen(1)).toBeFalse();
  });
});
