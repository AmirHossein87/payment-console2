import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { AppsClient, PaymentProfilesClient, PaymentProvider } from "@proxy/payment-app-proxy";
import { NotificationService } from "@core/services/notification.service";
import { StripeConnectService } from "@core/services/stripe-connect.service";
import { TagManagerService } from "@core/services/tag-manager.service";
import { PermissionStore } from "@core/stores/permission.store";
import { WorkspaceStore } from "@core/stores/workspace.store";
import { GatewaysComponent } from "./gateways.component";

describe("GatewaysComponent — Connect with Stripe in the wizard", () => {
  let connect: jasmine.SpyObj<StripeConnectService>;
  let profiles: jasmine.SpyObj<PaymentProfilesClient>;
  let component: GatewaysComponent;

  const provider = (name: string) =>
    ({ provider: name, currencies: ["USD"], providerConfigFormat: "{}" }) as unknown as PaymentProvider;

  const flush = () => new Promise<void>((r) => setTimeout(r));

  beforeEach(() => {
    connect = jasmine.createSpyObj("StripeConnectService", ["getAvailability", "connectNew"]);
    profiles = jasmine.createSpyObj("PaymentProfilesClient", ["getPaymentProfiles", "create"]);
    profiles.getPaymentProfiles.and.returnValue({ subscribe: () => undefined } as never);
    TestBed.configureTestingModule({
      providers: [
        { provide: StripeConnectService, useValue: connect },
        { provide: PaymentProfilesClient, useValue: profiles },
        { provide: AppsClient, useValue: {} },
        { provide: WorkspaceStore, useValue: { currentAppId: () => "app1" } },
        { provide: PermissionStore, useValue: { hasPermission: () => true } },
        { provide: NotificationService, useValue: jasmine.createSpyObj("NotificationService", ["showSuccess", "showError"]) },
        { provide: Router, useValue: jasmine.createSpyObj("Router", ["navigate"]) },
        { provide: TagManagerService, useValue: jasmine.createSpyObj("TagManagerService", ["trackConversion"]) },
      ],
    });
    component = TestBed.runInInjectionContext(() => new GatewaysComponent());
    // The list reload that follows a connection attempt is not what these tests are about.
    spyOn(component, "loadGateways").and.resolveTo();
  });

  it("hides the Connect block when the server says it is not available", async () => {
    connect.getAvailability.and.resolveTo(false);
    component.selectProvider(provider("Stripe"));
    await flush();
    expect(component.showStripeConnect()).toBeFalse();
  });

  it("shows the Connect block for Stripe when it is available", async () => {
    connect.getAvailability.and.resolveTo(true);
    component.selectProvider(provider("Stripe"));
    await flush();
    expect(component.showStripeConnect()).toBeTrue();
  });

  it("never asks about, or shows, Connect for other providers", async () => {
    component.selectProvider(provider("PayPal"));
    await flush();
    expect(connect.getAvailability).not.toHaveBeenCalled();
    expect(component.showStripeConnect()).toBeFalse();
  });

  it("treats a failed availability call as not available", async () => {
    connect.getAvailability.and.rejectWith(new Error("boom"));
    component.selectProvider(provider("Stripe"));
    await flush();
    expect(component.showStripeConnect()).toBeFalse();
  });

  it("does not connect until a currency is chosen", async () => {
    connect.getAvailability.and.resolveTo(true);
    component.selectProvider(provider("Stripe"));
    await flush();
    component.wCurrency = "";
    await component.connectStripeNew();
    expect(connect.connectNew).not.toHaveBeenCalled();
  });

  it("keeps the wizard open without an error when the window is just closed", async () => {
    connect.getAvailability.and.resolveTo(true);
    connect.connectNew.and.resolveTo({ success: false, error: "closed", paymentProfileId: null });
    component.selectProvider(provider("Stripe"));
    await flush();
    component.wizardOpen.set(true);
    await component.connectStripeNew();
    expect(component.wizardOpen()).toBeTrue();
    expect(component.wizardError()).toBe("");
    expect(component.wizardConnecting()).toBeFalse();
  });

  it("shows the described error when Stripe reports one", async () => {
    connect.getAvailability.and.resolveTo(true);
    connect.connectNew.and.resolveTo({ success: false, error: "access_denied", paymentProfileId: null });
    component.selectProvider(provider("Stripe"));
    await flush();
    await component.connectStripeNew();
    expect(component.wizardError()).toContain("cancelled");
  });

  it("on success closes the wizard and opens the new gateway", async () => {
    connect.getAvailability.and.resolveTo(true);
    connect.connectNew.and.resolveTo({ success: true, error: null, paymentProfileId: 42 });
    component.selectProvider(provider("Stripe"));
    await flush();
    component.wizardOpen.set(true);
    await component.connectStripeNew();
    expect(component.wizardOpen()).toBeFalse();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(["/", "app1", "gateways", 42]);
  });

  it("flags the finishing phase while our server completes the connection, then clears it", async () => {
    connect.getAvailability.and.resolveTo(true);
    let duringFinishing: boolean | undefined;
    connect.connectNew.and.callFake((_a: string, _c: string, _n?: string | null, onFinishing?: () => void) => {
      onFinishing?.();
      duringFinishing = component.wizardFinishing();
      return Promise.resolve({ success: false, error: "access_denied", paymentProfileId: null });
    });
    component.selectProvider(provider("Stripe"));
    await flush();
    await component.connectStripeNew();
    expect(duringFinishing).toBeTrue();
    expect(component.wizardFinishing()).toBeFalse();
  });

  it("explains what to do when the Stripe window closes without finishing", async () => {
    connect.getAvailability.and.resolveTo(true);
    connect.connectNew.and.resolveTo({ success: false, error: "closed", paymentProfileId: null });
    component.selectProvider(provider("Stripe"));
    await flush();
    await component.connectStripeNew();
    expect(component.wizardConnectHint()).toBeTrue();
    expect(component.wizardError()).toBe("");
  });

  it("clears the hint on the next attempt and never shows it for a real result", async () => {
    connect.getAvailability.and.resolveTo(true);
    connect.connectNew.and.resolveTo({ success: false, error: "closed", paymentProfileId: null });
    component.selectProvider(provider("Stripe"));
    await flush();
    await component.connectStripeNew();
    connect.connectNew.and.resolveTo({ success: false, error: "access_denied", paymentProfileId: null });
    await component.connectStripeNew();
    expect(component.wizardConnectHint()).toBeFalse();
    expect(component.wizardError()).toContain("cancelled");
  });

  it("says so and reloads the list when the gateway for this currency already exists (409)", async () => {
    connect.getAvailability.and.resolveTo(true);
    connect.connectNew.and.rejectWith({ status: 409 });
    component.selectProvider(provider("Stripe"));
    await flush();
    await component.connectStripeNew();
    expect(component.wizardError()).toBe("A Stripe gateway for this currency already exists.");
    expect(component.loadGateways).toHaveBeenCalled();
    expect(component.wizardConnecting()).toBeFalse();
  });

  describe("currencies already configured", () => {
    const multi = (name: string, currencies: string[]) =>
      ({ provider: name, currencies, providerConfigFormat: "{}" }) as unknown as PaymentProvider;
    const gw = (provider: string, currency: string) =>
      ({ paymentProvider: { provider }, currency }) as never;

    it("offers only the currencies that have no gateway yet for that provider", () => {
      component.gateways.set([gw("Stripe", "USD"), gw("PayPal", "EUR")]);
      component.selectProvider(multi("Stripe", ["USD", "EUR", "GBP"]));
      expect(component.wizardCurrencies()).toEqual(["EUR", "GBP"]);
      expect(component.wCurrency).toBe("EUR");
    });

    it("keeps every currency for a provider with no gateway", () => {
      component.gateways.set([gw("PayPal", "USD")]);
      component.selectProvider(multi("Stripe", ["USD", "EUR"]));
      expect(component.wizardCurrencies()).toEqual(["USD", "EUR"]);
    });

    it("reports when no free currency is left and selects nothing", () => {
      component.gateways.set([gw("Stripe", "USD")]);
      component.selectProvider(multi("Stripe", ["USD"]));
      expect(component.wizardNoFreeCurrency()).toBeTrue();
      expect(component.wCurrency).toBe("");
    });
  });
});
