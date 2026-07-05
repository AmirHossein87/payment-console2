import {
  Component,
  signal,
  computed,
  inject,
  ViewChild,
  OnInit,
  OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import {
  PaymentProfilesClient,
  PaymentProfile,
  PaymentProfileUpdateRequest,
} from "@proxy/payment-app-proxy";
import { WorkspaceStore } from "@core/stores/workspace.store";
import { BreadcrumbStore } from "@core/stores/breadcrumb.store";
import { NotificationService } from "@core/services/notification.service";
import { UniversalEditModalComponent } from "@shared/components/universal-edit-modal/universal-edit-modal.component";
import { ProviderLogoComponent } from "@shared/components/provider-logo/provider-logo.component";
import { patchOf } from "@core/utils/patch.util";

interface ConfigField {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  options?: { label: string; value: any }[];
}

@Component({
  selector: "app-gateway-detail",
  standalone: true,
  imports: [CommonModule, UniversalEditModalComponent, ProviderLogoComponent],
  templateUrl: "./gateway-detail.component.html",
  styleUrls: ["./gateway-detail.component.scss"],
})
export class GatewayDetailComponent implements OnInit, OnDestroy {
  @ViewChild("editor") private editor!: UniversalEditModalComponent;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly breadcrumbStore = inject(BreadcrumbStore);
  private readonly notify = inject(NotificationService);
  private readonly profilesClient = inject(PaymentProfilesClient);

  private appId = "";
  private profileId = 0;

  readonly profile = signal<PaymentProfile | null>(null);
  readonly loading = signal(true);
  readonly configFields = signal<ConfigField[]>([]);
  readonly configCredential = signal<Record<string, any> | null>(null);
  readonly configLoading = signal(true);

  private readonly providerLabels: Record<string, string> = {
    AuthorizeNet: "Authorize.Net",
    JpMorgan: "JP Morgan",
    JpMorganElectronicCheck: "JP Morgan (eCheck)",
    Amazon: "Amazon Pay",
    TapAed: "Tap (AED)",
    TapUsd: "Tap (USD)",
    TwoCheckout: "2Checkout",
  };

  readonly providerLabel = computed(() => {
    const type = this.profile()?.paymentProvider?.provider as string;
    return this.providerLabels[type] ?? type ?? "Unknown";
  });

  ngOnInit(): void {
    this.appId = this.workspaceStore.currentAppId() ?? "";
    this.profileId = Number(this.route.snapshot.params["profileId"]);
    this.load();
  }

  ngOnDestroy(): void {
    this.breadcrumbStore.clear();
  }

  async load(): Promise<void> {
    if (!this.appId || !this.profileId) return;
    this.loading.set(true);
    try {
      const found = await firstValueFrom(
        this.profilesClient.getPaymentProfile(this.appId, this.profileId),
      );
      this.profile.set(found ?? null);
      if (found) {
        this.breadcrumbStore.set([
          { label: "Gateways", link: ["/", this.appId, "gateways"] },
          { label: found.paymentProfileName ?? "Gateway #" + found.paymentProfileId },
        ]);
        this.configFields.set(
          this.parseConfigFields(found.paymentProvider?.providerConfigFormat),
        );
        this.loadConfigCredential();
      }
    } catch (err: any) {
      this.notify.showError(this.extractError(err, "Failed to load gateway."));
    } finally {
      this.loading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(["/", this.appId, "gateways"]);
  }

  copyProfileId(): void {
    const p = this.profile();
    if (!p) return;
    navigator.clipboard
      .writeText(String(p.paymentProfileId))
      .then(() => this.notify.showSuccess("Profile ID copied."));
  }

  editName(): void {
    const p = this.profile();
    if (!p) return;
    this.editor.open({
      title: "Edit gateway name",
      icon: "edit",
      label: "Name",
      type: "text",
      value: p.paymentProfileName ?? "",
      placeholder: "e.g. Stripe (USD)",
      required: false,
      notice: {
        type: 'warning',
        message: 'This name is shown to customers during checkout. Rename with care.',
      },
      save: async (v: string | null) => {
        // Single-field PATCH: send ONLY this field. A plain object (not
        // `new PaymentProfileUpdateRequest`) avoids the generated toJSON() that
        // force-emits every field as null. See patch.util.ts.
        const req = { paymentProfileName: patchOf(v) } as PaymentProfileUpdateRequest;
        const updated = await firstValueFrom(
          this.profilesClient.update(this.appId, this.profileId, req),
        );
        this.profile.set(updated ?? p);
        this.breadcrumbStore.set([
          { label: "Gateways", link: ["/", this.appId, "gateways"] },
          { label: v || "Gateway" },
        ]);
      },
    });
  }

  editIsActive(): void {
    const p = this.profile();
    if (!p) return;
    this.editor.open({
      title: "Gateway status",
      icon: "toggle_on",
      label: "Active",
      type: "boolean",
      value: p.isActive,
      helper: "Inactive gateways cannot process new payments.",
      save: async (v: boolean) => {
        const req = { isActive: patchOf(v) } as PaymentProfileUpdateRequest;
        const updated = await firstValueFrom(
          this.profilesClient.update(this.appId, this.profileId, req),
        );
        this.profile.set(updated ?? p);
      },
    });
  }

  editAppInitialFee(): void {
    const p = this.profile();
    if (!p) return;
    this.editor.open({
      title: "Edit initial fee",
      icon: "payments",
      label: "App initial fee",
      type: "number",
      value: p.appInitialFee ?? 0,
      helper: "Flat fee charged per transaction on top of the provider fee.",
      save: async (v: number) => {
        const req = { appInitialFee: patchOf(Number(v)) } as PaymentProfileUpdateRequest;
        const updated = await firstValueFrom(
          this.profilesClient.update(this.appId, this.profileId, req),
        );
        this.profile.set(updated ?? p);
      },
    });
  }

  editAppPercentageFee(): void {
    const p = this.profile();
    if (!p) return;
    this.editor.open({
      title: "Edit percentage fee",
      icon: "percent",
      label: "App percentage fee (%)",
      type: "number",
      value: p.appPercentageFee ?? 0,
      helper: "Percentage of the transaction amount on top of the provider fee.",
      save: async (v: number) => {
        const req = { appPercentageFee: patchOf(Number(v)) } as PaymentProfileUpdateRequest;
        const updated = await firstValueFrom(
          this.profilesClient.update(this.appId, this.profileId, req),
        );
        this.profile.set(updated ?? p);
      },
    });
  }

  editConfigField(field: ConfigField): void {
    const cred = this.configCredential() ?? {};
    const currentValue = cred[field.name] ?? "";
    const isSecret = /key|secret|password|token|credential/i.test(field.name);
    this.editor.open({
      title: `Edit ${field.label}`,
      icon: "key",
      label: field.label,
      type:
        field.type === "select"
          ? "select"
          : isSecret
            ? "password"
            : field.type,
      value: currentValue,
      ...(field.options ? { options: field.options } : {}),
      save: async (v: any) => {
        const req = {
          providerConfig: patchOf(JSON.stringify({ [field.name]: v })),
        } as PaymentProfileUpdateRequest;
        await firstValueFrom(
          this.profilesClient.update(this.appId, this.profileId, req),
        );
        this.configCredential.update((c) => ({ ...(c ?? {}), [field.name]: v }));
      },
    });
  }

  async loadConfigCredential(): Promise<void> {
    this.configLoading.set(true);
    try {
      const raw = await firstValueFrom(
        this.profilesClient.getBankCredential(this.appId, this.profileId),
      );
      const parsed =
        typeof raw === "string"
          ? JSON.parse(raw || "{}")
          : (raw ?? {});
      const cred: Record<string, any> =
        typeof parsed === "object" && parsed !== null ? parsed : {};
      this.configCredential.set(cred);

      // If providerConfigFormat yielded no fields, derive them from the
      // credential keys so the card always shows what the API actually returned.
      if (this.configFields().length === 0) {
        this.configFields.set(this.fieldsFromCredential(cred));
      }
    } catch {
      this.configCredential.set({});
    } finally {
      this.configLoading.set(false);
    }
  }

  private fieldsFromCredential(cred: Record<string, any>): ConfigField[] {
    const isSecret = (k: string) =>
      /key|secret|password|token|credential/i.test(k);
    return Object.keys(cred)
      .filter((k) => {
        const v = cred[k];
        return v !== null && typeof v !== "object" && typeof v !== "boolean";
      })
      .map((key) => {
        const label = key
          .replace(/([A-Z])/g, " $1")
          .trim()
          .replace(/^./, (s) => s.toUpperCase());
        return {
          name: key,
          label,
          type: isSecret(key) ? ("password" as const) : ("text" as const),
        };
      });
  }

  maskedValue(fieldName: string): string {
    const cred = this.configCredential();
    if (!cred) return "";
    const v = String(cred[fieldName] ?? "");
    if (!v) return "";
    const field = this.configFields().find((f) => f.name === fieldName);
    if (field?.type === "password") {
      return "•••• " + v.slice(-4);
    }
    return v;
  }

  feeDisplay(value: number | null | undefined, suffix = ""): string {
    if (value == null || value === 0) return "—";
    return Number(value).toFixed(2) + suffix;
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
      // Plain object — value type determines field type
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
          if (
            typeof val === "object" &&
            val.type === "Selection" &&
            Array.isArray(val.options)
          ) {
            return [
              {
                name: key,
                label,
                type: "select" as const,
                options: val.options.map((o: any) => ({
                  label: o.Name ?? String(o),
                  value: o.Country ?? o,
                })),
              },
            ];
          }
          if (key.toLowerCase() === "port" || typeof val === "number") {
            return [{ name: key, label, type: "number" as const }];
          }
          return [
            {
              name: key,
              label,
              type: isSecret(key) ? "password" : ("text" as const),
            },
          ];
        });
    } catch {
      return [];
    }
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
