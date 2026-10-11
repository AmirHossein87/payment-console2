import {
  Component,
  computed,
  signal,
  inject,
  ViewChild,
  TemplateRef,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import {
  PaymentProfilesClient,
  PaymentProfile,
  PaymentProfileCreateRequest,
  PaymentProvider,
  PaymentProviderCurrency,
} from "@proxy/payment-app-proxy";
import { AppsClient } from "@proxy/payment-app-proxy";
import { WorkspaceStore } from "@core/stores/workspace.store";
import { PermissionStore } from "@core/stores/permission.store";
import { NotificationService } from "@core/services/notification.service";
import { TagManagerService } from "@core/services/tag-manager.service";
import {
  StripeConnectService,
  STRIPE_CONNECT_CLOSED,
  describeConnectError,
} from "@core/services/stripe-connect.service";
import { DataGridComponent } from "@shared/components/data-grid/data-grid.component";
import { GridColumn } from "@shared/components/data-grid/data-grid.interface";
import { ProviderLogoComponent } from "@shared/components/provider-logo/provider-logo.component";

interface ConfigField {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  options?: { label: string; value: any }[];
  /** New metadata form: a field flagged `optional: true` isn't required and can
   *  be left blank (its placeholder shows "Optional"). */
  optional?: boolean;
  placeholder?: string;
}

@Component({
  selector: "app-gateways",
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, ProviderLogoComponent],
  templateUrl: "./gateways.component.html",
  styleUrls: ["./gateways.component.scss"],
})
export class GatewaysComponent implements OnInit {
  private readonly profilesClient = inject(PaymentProfilesClient);
  private readonly appsClient = inject(AppsClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly permissionStore = inject(PermissionStore);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly tagManager = inject(TagManagerService);
  private readonly stripeConnect = inject(StripeConnectService);

  /** True when the current user holds PaymentProfileWrite — controls gateway creation. */
  readonly canWrite = computed(() => this.permissionStore.hasPermission('PaymentProfileWrite'));

  @ViewChild("autoPayTpl", { static: true }) autoPayTpl!: TemplateRef<any>;

  readonly gateways = signal<PaymentProfile[]>([]);
  readonly loading = signal(false);
  gridColumns: GridColumn[] = [];

  // ── Wizard state ──────────────────────────────────────────────────────────
  readonly wizardOpen = signal(false);
  readonly wizardStep = signal<1 | 2 | 3>(1);
  readonly availableProviders = signal<PaymentProvider[]>([]);
  readonly providersLoading = signal(false);
  readonly wizardProvider = signal<PaymentProvider | null>(null);
  readonly wizardIsStripe = computed(() => (this.wizardProvider()?.provider as string) === "Stripe");
  /**
   * The currencies the merchant can still add for the selected provider: a gateway already exists for the others, and a second
   * one in the same currency is not allowed, so offering them only leads to an error (or, for Stripe, to reconnecting the old one).
   */
  readonly wizardCurrencies = computed(() => {
    const provider = this.wizardProvider();
    if (!provider) return [] as string[];
    const used = new Set(
      this.gateways()
        .filter((g) => (g.paymentProvider?.provider as string) === (provider.provider as string))
        .map((g) => g.currency as string),
    );
    return ((provider.currencies ?? []) as string[]).filter((c) => !used.has(c));
  });
  readonly wizardNoFreeCurrency = computed(() => !!this.wizardProvider() && this.wizardCurrencies().length === 0);
  /** "Connect with Stripe" is on for this app. Stays false (block hidden, manual form only) until the server says otherwise. */
  readonly stripeConnectAvailable = signal(false);
  /** The Stripe popup is open: the wizard cannot be closed or stepped while we wait for its result. */
  readonly wizardConnecting = signal(false);
  /** Stripe has sent the merchant back and our server is finishing the connection: the form is blurred and the button says so. */
  readonly wizardFinishing = signal(false);
  /**
   * The Stripe window was closed without finishing. The usual cause is a Stripe account that already has the app installed
   * (Stripe then shows "already installed" and never sends the merchant back), so the wizard says what to do instead of staying silent.
   */
  readonly wizardConnectHint = signal(false);
  readonly showStripeConnect = computed(() => this.wizardIsStripe() && this.stripeConnectAvailable());

  /** Step-1 provider search box. */
  readonly providerSearch = signal('');
  /** Providers filtered by the search box — matches the friendly NAME or the
      provider id/type (e.g. "authorize" or "AuthorizeNet"). */
  readonly filteredProviders = computed(() => {
    const q = this.providerSearch().trim().toLowerCase();
    const list = this.availableProviders();
    if (!q) return list;
    return list.filter((p) => {
      const id = String(p.provider ?? '').toLowerCase();
      const name = this.providerLabel(p.provider as string).toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  });
  readonly providerConfigFields = signal<ConfigField[]>([]);
  readonly wizardSaving = signal(false);
  readonly wizardError = signal("");
  readonly invalidFields = signal<Set<string>>(new Set());

  // Wizard form plain properties (ngModel compatible)
  wCurrency = "";
  wConfigFields: Record<string, string | undefined> = {};

  readonly wizardSteps = [
    { n: 1, label: "Provider" },
    { n: 2, label: "API key" },
    { n: 3, label: "Review" },
  ];

  readonly skeletonRows = [1, 2, 3, 4, 5, 6];

  private readonly providerLabels: Record<string, string> = {
    AuthorizeNet: "Authorize.Net",
    JpMorgan: "JP Morgan",
    JpMorganElectronicCheck: "JP Morgan (eCheck)",
    Amazon: "Amazon Pay",
    TapAed: "Tap (AED)",
    TapUsd: "Tap (USD)",
    TwoCheckout: "2Checkout",
  };

  ngOnInit(): void {
    this.gridColumns = [
      {
        id: "profileId",
        header: "Gateway Id",
        field: "paymentProfileId",
        isLink: true,
        isSortable: true,
        width: "100px",
      },
      {
        id: "provider",
        header: "Provider",
        field: "paymentProvider",
        type: "provider",
        isSortable: true,
        width: "190px",
      },
      {
        id: "currency",
        header: "Currency",
        field: "currency",
        isSortable: true,
        width: "100px",
      },
      {
        id: "autoPay",
        header: "Auto-pay",
        field: "paymentProvider.isSupportTokenizationPayment",
        type: "custom",
        customTemplate: this.autoPayTpl,
        isSortable: true,
        width: "100px",
      },
      {
        id: "fees",
        header: "Fees",
        field: "appInitialFee",
        type: "text",
        align: "right",
        isSortable: false,
        width: "130px",
        valueFormatter: (_v: any, row: any) => {
          const i = row?.appInitialFee;
          const p = row?.appPercentageFee;
          const parts: string[] = [];
          if (p != null && Number(p) > 0) parts.push(Number(p).toFixed(2) + "%");
          if (i != null && Number(i) > 0) parts.push(Number(i).toFixed(2));
          return parts.join(" + ");
        },
      },
      {
        id: "isActive",
        header: "Status",
        field: "isActive",
        type: "status",
        isSortable: true,
        width: "110px",
        badgeMap: { true: "ok", false: "bad" },
        valueFormatter: (v: any) => (v ? "Active" : "Inactive"),
        editOptions: [
          { label: "Active", value: true },
          { label: "Inactive", value: false },
        ],
      },
      {
        id: "name",
        header: "Name",
        field: "paymentProfileName",
        isSortable: true,
        width: "180px",
        valueFormatter: (v: any) => v ?? "",
      },
    ];
    this.loadGateways();
  }

  async loadGateways(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    this.loading.set(true);
    try {
      const profiles = await firstValueFrom(
        this.profilesClient.getPaymentProfiles(appId),
      );
      this.gateways.set(profiles ?? []);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, "Failed to load gateways."));
      this.gateways.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  onLinkClicked(event: { column: GridColumn; row: any; value: any }): void {
    const profile = event.row as PaymentProfile;
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    this.router.navigate(["/", appId, "gateways", profile.paymentProfileId], {
      state: { profile },
    });
  }

  // ── Wizard ────────────────────────────────────────────────────────────────

  async openWizard(): Promise<void> {
    this.wizardOpen.set(true);
    this.wizardStep.set(1);
    this.wizardProvider.set(null);
    this.stripeConnectAvailable.set(false);
    this.wizardConnecting.set(false);
    this.wizardFinishing.set(false);
    this.wizardConnectHint.set(false);
    this.providerConfigFields.set([]);
    this.wCurrency = "";
    this.wConfigFields = {};
    this.invalidFields.set(new Set());
    this.wizardError.set("");
    this.providerSearch.set('');
    await this.loadProviders();
  }

  onProviderSearch(event: Event): void {
    this.providerSearch.set((event.target as HTMLInputElement).value);
  }

  async loadProviders(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    this.providersLoading.set(true);
    try {
      const providers = await firstValueFrom(
        this.appsClient.getPaymentProvidersMetadata(appId),
      );
      this.availableProviders.set(providers ?? []);
    } catch {
      this.availableProviders.set([]);
    } finally {
      this.providersLoading.set(false);
    }
  }

  selectProvider(p: PaymentProvider): void {
    this.wizardProvider.set(p);
    this.wCurrency = this.wizardCurrencies()[0] ?? "";
    this.providerConfigFields.set(this.parseConfigFields(p.providerConfigFormat));
    this.wConfigFields = {};
    void this.loadStripeConnectAvailability(p);
  }

  /** Asked once per Stripe selection. Any failure means "not available": the manual form is always the fallback. */
  private async loadStripeConnectAvailability(p: PaymentProvider): Promise<void> {
    this.stripeConnectAvailable.set(false);
    const appId = this.workspaceStore.currentAppId();
    if (!appId || (p.provider as string) !== "Stripe") return;
    try {
      const available = await this.stripeConnect.getAvailability(appId);
      // The merchant may have picked another provider (or closed the wizard) while this was in flight.
      if (this.wizardProvider() === p) this.stripeConnectAvailable.set(available);
    } catch {
      // keep false
    }
  }

  /**
   * "Connect with Stripe" from step 2. Called straight from the click so the popup is not blocked. The server creates the
   * gateway when the merchant finishes on Stripe (or reconnects the app's existing Stripe gateway in this currency).
   */
  async connectStripeNew(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    const provider = this.wizardProvider();
    if (!appId || !provider || !this.wCurrency || this.wizardConnecting()) return;

    this.wizardConnecting.set(true);
    this.wizardError.set("");
    this.wizardConnectHint.set(false);
    try {
      const result = await this.stripeConnect.connectNew(appId, this.wCurrency, null, () => this.wizardFinishing.set(true));
      if (result.success) {
        this.tagManager.trackConversion("create_gateway", { app_id: appId, provider: provider.provider });
        this.wizardOpen.set(false);
        this.notify.showSuccess("Stripe is connected.");
        await this.loadGateways();
        if (result.paymentProfileId != null) {
          await this.router.navigate(["/", appId, "gateways", result.paymentProfileId]);
        }
      } else {
        // Whatever happened, the connection may have succeeded on Stripe's side: refresh the list.
        await this.loadGateways();
        if (result.error === STRIPE_CONNECT_CLOSED) {
          this.wizardConnectHint.set(true);
        } else {
          this.wizardError.set(describeConnectError(result.error, result.detail));
        }
      }
    } catch (err: any) {
      // 409: the gateway for this currency was created in the meantime (another tab, or a connection finishing late).
      const exists = err?.status === 409 || err?.response?.status === 409;
      this.wizardError.set(
        exists
          ? "A Stripe gateway for this currency already exists."
          : this.extractError(err, "Could not start the Stripe connection."),
      );
      // The gateway may exist even though the call failed.
      await this.loadGateways();
    } finally {
      this.wizardConnecting.set(false);
      this.wizardFinishing.set(false);
    }
  }

  proceedToStep2(): void {
    if (!this.wizardProvider()) return;
    this.wizardError.set("");
    this.wizardStep.set(2);
  }

  proceedToStep3(): void {
    const invalid = new Set<string>();
    if (!this.wCurrency) invalid.add("__currency__");
    this.providerConfigFields().forEach((f) => {
      // Optional fields may be left blank.
      if (!f.optional && !this.wConfigFields[f.name]?.trim()) invalid.add(f.name);
    });
    if (invalid.size > 0) {
      this.invalidFields.set(invalid);
      return;
    }
    this.invalidFields.set(new Set());
    this.wizardError.set("");
    this.wizardStep.set(3);
  }

  clearInvalid(name: string): void {
    this.invalidFields.update((s) => {
      const n = new Set(s);
      n.delete(name);
      return n;
    });
  }

  backToStep(n: 1 | 2): void {
    this.wizardError.set("");
    this.wizardStep.set(n);
  }

  closeWizard(): void {
    this.wizardOpen.set(false);
  }

  async createGateway(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    const provider = this.wizardProvider();
    if (!appId || !provider) return;

    this.wizardSaving.set(true);
    this.wizardError.set("");
    try {
      const req = new PaymentProfileCreateRequest({
        paymentProviderType: provider.provider,
        paymentProfileName: null,
        currency: this.wCurrency as PaymentProviderCurrency,
        providerConfig: this.buildProviderConfig(),
      });
      const created = await firstValueFrom(
        this.profilesClient.create(appId, req),
      );
      if (created) {
        this.gateways.update((list) => [...list, created]);
      }
      // Google Ads conversion signal — only fires when the visitor arrived via an ad click.
      this.tagManager.trackConversion("create_gateway", {
        app_id: appId,
        provider: provider.provider,
      });
      this.wizardOpen.set(false);
      this.notify.showSuccess("Gateway created successfully.");
    } catch (err: any) {
      this.wizardError.set(this.extractError(err, "Failed to create gateway."));
    } finally {
      this.wizardSaving.set(false);
    }
  }

  // ── Provider display helpers ──────────────────────────────────────────────

  providerLabel(providerType: string): string {
    return this.providerLabels[providerType] ?? providerType ?? "Unknown";
  }

  currenciesNote(p: PaymentProvider): string {
    const n = p.currencies?.length ?? 0;
    return n === 1 ? "1 currency" : `${n} currencies`;
  }

  configuredCount(providerType: string): number {
    return this.gateways().filter(
      (g) => (g.paymentProvider?.provider as string) === providerType,
    ).length;
  }

  // ── Config field helpers ──────────────────────────────────────────────────

  updateConfigField(name: string, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.wConfigFields[name] = val;
    if (val.trim()) this.clearInvalid(name);
  }

  maskConfigValue(name: string): string {
    const v = this.wConfigFields[name];
    if (!v) return "—";
    return "•••• " + v.slice(-4);
  }

  private parseConfigFields(format: string | null | undefined): ConfigField[] {
    if (!format) return [];
    const isSecret = (k: string) =>
      /key|secret|password|token|credential/i.test(k);
    try {
      const parsed = JSON.parse(format);

      if (Array.isArray(parsed)) {
        return parsed.map((f: any) => ({
          name: f.name ?? f.key ?? String(f),
          label: f.label ?? f.name ?? String(f),
          type: isSecret(f.name ?? "") ? "password" : ("text" as const),
        }));
      }
      if (Array.isArray(parsed.fields)) {
        return parsed.fields.map((f: any) => ({
          name: f.name ?? f.key,
          label: f.label ?? f.name,
          type: isSecret(f.name ?? "") ? "password" : ("text" as const),
        }));
      }
      // Plain object — each value is either a bare type string ("string") or the
      // new metadata form { type, example?, optional? }.
      return Object.keys(parsed)
        .filter((k) => k.toLowerCase() !== "currency")
        .flatMap((key): ConfigField[] => {
          const val = parsed[key];
          if (val === null || val === undefined || typeof val === "boolean")
            return [];
          const label = key
            .replace(/([A-Z])/g, " $1")
            .trim()
            .replace(/^./, (s) => s.toUpperCase());

          const isObj = typeof val === "object" && !Array.isArray(val);
          const optional = isObj && val.optional === true;
          const typeHint = isObj && typeof val.type === "string" ? val.type : "";
          const example = isObj && typeof val.example === "string" ? val.example : "";
          // Use the metadata `example` as the placeholder; if there's none, an
          // optional field shows "Optional"; else the template falls back to label.
          const placeholder = example || (optional ? "Optional" : undefined);

          if (typeHint === "Selection" && Array.isArray(val.options)) {
            return [
              {
                name: key,
                label,
                type: "select" as const,
                optional,
                placeholder,
                options: val.options.map((o: any) => ({
                  label: o.Name ?? String(o),
                  value: o.Country ?? o,
                })),
              },
            ];
          }

          let type: ConfigField["type"];
          if (
            key.toLowerCase() === "port" ||
            typeHint.toLowerCase() === "number" ||
            typeof val === "number"
          ) {
            type = "number";
          } else {
            type = isSecret(key) ? "password" : "text";
          }
          return [{ name: key, label, type, optional, placeholder }];
        });
    } catch {
      return [];
    }
  }

  private buildProviderConfig(): string {
    const fields = this.providerConfigFields();
    if (!fields.length) return "{}";
    const obj: Record<string, string> = {};
    fields.forEach((f) => {
      const val = this.wConfigFields[f.name];
      if (val) obj[f.name] = val;
    });
    return JSON.stringify(obj);
  }

  protected extractError(err: any, fallback: string): string {
    return (
      err?.response?.message ||
      err?.message ||
      err?.exceptionMessage ||
      fallback
    );
  }
}
