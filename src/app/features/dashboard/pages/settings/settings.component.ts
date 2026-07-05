import {
  Component,
  signal,
  inject,
  OnInit,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AppsClient,
  FraudPoliciesClient,
  SystemClient,
  SettingsClient,
  TeamClient,
  App,
  FraudPolicy,
  AppSettingsUpdateRequest,
  UpdateCheckoutPageRequest,
  UserUpdateRequest,
} from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { SettingsStore } from '@core/stores/settings.store';
import { NotificationService } from '@core/services/notification.service';
import { patchOf } from '@core/utils/patch.util';
import { UniversalEditModalComponent } from '@shared/components/universal-edit-modal/universal-edit-modal.component';

type Tab = 'general' | 'checkout' | 'personalize';

interface GeneralSnapshot {
  webhookUrl: string;
  webhookScheme: string;
  webhookParam: string;
  fraudPolicyId: number | null;
}

interface CheckoutSnapshot {
  storeName: string;
  slogan1: string;
  slogan2: string;
  domain: string;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, UniversalEditModalComponent],
  providers: [SystemClient],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsPageComponent implements OnInit {
  @ViewChild('logoFileInput') logoFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editor') editor!: UniversalEditModalComponent;

  private readonly appsClient = inject(AppsClient);
  private readonly fraudClient = inject(FraudPoliciesClient);
  private readonly systemClient = inject(SystemClient);
  private readonly settingsClient = inject(SettingsClient);
  private readonly teamClient = inject(TeamClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly notify = inject(NotificationService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploadingLogo = signal(false);
  readonly dnsOpen = signal(false);
  readonly activeTab = signal<Tab>('general');
  readonly isSupportCustomizeCheckout = signal(false);

  readonly app = signal<App | null>(null);
  readonly fraudPolicies = signal<FraudPolicy[]>([]);

  // General tab form fields
  webhookUrl = '';
  webhookScheme = '';
  webhookParam = '';
  fraudPolicyId: number | null = null;

  // Checkout tab form fields
  storeName = '';
  slogan1 = '';
  slogan2 = '';
  domain = '';
  logoUrl: string | null = null;
  previewUrl: string | null = null;

  // Personalize (local only)
  theme: 'light' | 'dark' | 'system' = 'system';
  timezone = 'UTC';

  private _origGeneral: GeneralSnapshot = this.emptyGeneral();
  private _origCheckout: CheckoutSnapshot = this.emptyCheckout();

  get hasGeneralChanges(): boolean {
    const o = this._origGeneral;
    return (
      this.webhookUrl !== o.webhookUrl ||
      this.webhookScheme !== o.webhookScheme ||
      this.webhookParam !== o.webhookParam ||
      this.fraudPolicyId !== o.fraudPolicyId
    );
  }

  get hasCheckoutChanges(): boolean {
    const o = this._origCheckout;
    return (
      this.storeName !== o.storeName ||
      this.slogan1 !== o.slogan1 ||
      this.slogan2 !== o.slogan2 ||
      this.domain !== o.domain
    );
  }

  ngOnInit(): void {
    // Theme was already fetched once (right after login) and synced into the
    // store — reflect that here instead of re-deriving it from the server.
    this.theme = this.settingsStore.themePreference();
    this.timezone = localStorage.getItem('tc-tz') ?? 'UTC';
    this.loadPage();
  }

  async loadPage(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.loading.set(true);
    try {
      const [app, frauds, platformSettings, user] = await Promise.all([
        firstValueFrom(this.appsClient.getSettings(appId)),
        firstValueFrom(this.fraudClient.list(appId)),
        firstValueFrom(this.settingsClient.get()),
        firstValueFrom(this.teamClient.getInfo()).catch(() => null),
      ]);
      this.app.set(app);
      this.fraudPolicies.set(frauds ?? []);
      this.isSupportCustomizeCheckout.set(
        platformSettings?.isSupportCustomizeCheckout ?? false
      );
      this.initFormFromApp(app);

      // Timezone only — theme is the store's responsibility (fetched once at login).
      if (user?.timeZone) this.timezone = user.timeZone;
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load settings.'));
    } finally {
      this.loading.set(false);
    }
  }

  // --- General Tab (each field edited via the universal pencil modal) ---

  /**
   * Sends a SINGLE-FIELD AppSettings PATCH. `req` MUST be a plain-object cast
   * (e.g. `{ paymentWebhookUrl: patchOf(v) } as AppSettingsUpdateRequest`) — never
   * `new AppSettingsUpdateRequest()`, whose toJSON force-sends every field as null
   * and would wipe the other settings. See memory: single-field-patch-plain-object.
   */
  private async patchSettings(req: AppSettingsUpdateRequest): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    const updated = await firstValueFrom(this.appsClient.updateSettings(appId, req));
    this.app.set(updated);
    this.initFormFromApp(updated);
  }

  editFraudPolicy(): void {
    this.editor.open({
      title: 'Default fraud policy',
      icon: 'shield',
      label: 'Default fraud policy',
      type: 'select',
      value: this.fraudPolicyId,
      options: this.fraudPolicies().map((f) => ({
        label: f.fraudPolicyName ?? `Policy ${f.fraudPolicyId}`,
        value: f.fraudPolicyId,
      })),
      helper: 'Applied to new customers automatically.',
      helperClass: 'warn',
      save: (v) =>
        this.patchSettings({ defaultFraudPolicyId: patchOf(Number(v)) } as AppSettingsUpdateRequest),
    });
  }

  editWebhookUrl(): void {
    this.editor.open({
      title: 'Webhook URL',
      icon: 'webhook',
      label: 'Webhook URL',
      type: 'text',
      value: this.webhookUrl,
      placeholder: 'https://api.yourdomain.com/hooks',
      helper: 'Where we POST payment events.',
      save: (v) =>
        this.patchSettings({
          paymentWebhookUrl: patchOf(String(v ?? '').trim() || null),
        } as AppSettingsUpdateRequest),
    });
  }

  editWebhookScheme(): void {
    this.editor.open({
      title: 'Authorization header scheme',
      icon: 'vpn_key',
      label: 'Auth scheme',
      type: 'text',
      value: this.webhookScheme,
      placeholder: 'Bearer',
      helper: 'Authorization header scheme (e.g. Bearer).',
      save: (v) =>
        this.patchSettings({
          webhookAuthorizationHeaderScheme: patchOf(String(v ?? '').trim() || null),
        } as AppSettingsUpdateRequest),
    });
  }

  editWebhookParam(): void {
    this.editor.open({
      title: 'Authorization header parameter',
      icon: 'vpn_key',
      label: 'Auth parameter',
      type: 'password',
      value: this.webhookParam,
      placeholder: '••••••••',
      helper: 'Token / secret value sent with each webhook call.',
      save: (v) =>
        this.patchSettings({
          webhookAuthorizationHeaderParameter: patchOf(String(v ?? '').trim() || null),
        } as AppSettingsUpdateRequest),
    });
  }

  // --- Checkout Tab ---
  async saveCheckout(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.saving.set(true);
    try {
      // Plain-object casts — only the edited fields (see single-field-patch memory).
      const checkoutReq = {
        domain: patchOf(this.domain.trim() || null),
        checkoutSlogan1: patchOf(this.slogan1),
        checkoutSlogan2: patchOf(this.slogan2),
      } as UpdateCheckoutPageRequest;

      const settingsReq = {
        friendlyName: patchOf(this.storeName.trim()),
      } as AppSettingsUpdateRequest;

      const [, updated] = await Promise.all([
        firstValueFrom(this.appsClient.updateCheckoutPage(appId, checkoutReq)),
        firstValueFrom(this.appsClient.updateSettings(appId, settingsReq)),
      ]);
      this.app.set(updated);
      this.initFormFromApp(updated);
      this.notify.showSuccess('Checkout settings saved');
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to save checkout settings.'));
    } finally {
      this.saving.set(false);
    }
  }

  resetCheckout(): void {
    const o = this._origCheckout;
    this.storeName = o.storeName;
    this.slogan1 = o.slogan1;
    this.slogan2 = o.slogan2;
    this.domain = o.domain;
  }

  // --- Logo ---
  triggerLogoUpload(): void {
    this.logoFileInput?.nativeElement.click();
  }

  async onLogoFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => { this.previewUrl = reader.result as string; };
    reader.readAsDataURL(file);

    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.uploadingLogo.set(true);
    try {
      const url = await firstValueFrom(
        this.systemClient.uploadImage({ data: file, fileName: file.name })
      );
      this.logoUrl = url ?? null;
      this.previewUrl = null;

      await firstValueFrom(
        this.appsClient.updateSettings(appId, { logo: patchOf(url ?? null) } as AppSettingsUpdateRequest)
      );
      this.notify.showSuccess('Logo updated');
    } catch (err: any) {
      this.previewUrl = null;
      this.notify.showError(this.extractError(err, 'Failed to upload logo.'));
    } finally {
      this.uploadingLogo.set(false);
      input.value = '';
    }
  }

  // --- DNS ---
  get targetCName(): string { return this.app()?.targetCName ?? ''; }
  get canRemoveDomain(): boolean { return this.app()?.canRemoveHostedPageDomain ?? false; }
  get isSandbox(): boolean { return this.app()?.isSandbox ?? false; }

  async copyCName(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.targetCName);
      this.notify.showSuccess('CNAME copied to clipboard');
    } catch { /* clipboard unavailable */ }
  }

  async removeDomain(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    try {
      const updated = await firstValueFrom(this.appsClient.removeCheckoutDomain(appId));
      this.app.set(updated);
      this.initFormFromApp(updated);
      this.dnsOpen.set(false);
      this.notify.showSuccess('Custom domain removed');
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to remove domain.'));
    }
  }

  // --- Personalize (persisted on the user profile via TeamClient.updateInfo) ---

  async setTheme(t: 'light' | 'dark' | 'system'): Promise<void> {
    const prev = this.theme;
    this.theme = t;
    this.settingsStore.setThemePreference(t); // optimistic
    try {
      // Only the theme field — a `new UserUpdateRequest()` would null timeZone.
      const user = await firstValueFrom(
        this.teamClient.updateInfo({ theme: patchOf(t) } as UserUpdateRequest)
      );
      this.theme = this.settingsStore.normalizeTheme(user?.theme ?? t);
      this.settingsStore.setThemePreference(this.theme);
    } catch (err) {
      this.theme = prev;
      this.settingsStore.setThemePreference(prev);
      throw err; // surfaced by the modal
    }
  }

  async setTimezone(tz: string): Promise<void> {
    const prev = this.timezone;
    this.timezone = tz;
    try {
      // Only the timeZone field — a `new UserUpdateRequest()` would null theme.
      const user = await firstValueFrom(
        this.teamClient.updateInfo({ timeZone: patchOf(tz) } as UserUpdateRequest)
      );
      this.timezone = user?.timeZone ?? tz;
      localStorage.setItem('tc-tz', this.timezone);
    } catch (err) {
      this.timezone = prev;
      throw err; // surfaced by the modal
    }
  }

  themeLabel(): string {
    return ({ light: 'Light', dark: 'Dark', system: 'Auto (system)' } as Record<string, string>)[this.theme] ?? this.theme;
  }

  editTheme(): void {
    this.editor.open({
      title: 'Theme',
      icon: 'palette',
      label: 'Theme',
      type: 'select',
      value: this.theme,
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
        { label: 'Auto (system)', value: 'system' },
      ],
      save: async (v: string) => { await this.setTheme(v as 'light' | 'dark' | 'system'); },
    });
  }

  editTimezone(): void {
    this.editor.open({
      title: 'Time zone',
      icon: 'schedule',
      label: 'Time zone',
      type: 'select',
      value: this.timezone,
      options: [
        { label: 'UTC', value: 'UTC' },
        { label: 'Europe / London', value: 'Europe/London' },
        { label: 'Europe / Paris', value: 'Europe/Paris' },
        { label: 'Asia / Dubai', value: 'Asia/Dubai' },
        { label: 'Asia / Singapore', value: 'Asia/Singapore' },
        { label: 'Asia / Tokyo', value: 'Asia/Tokyo' },
        { label: 'America / New York', value: 'America/New_York' },
        { label: 'America / Chicago', value: 'America/Chicago' },
        { label: 'America / Los Angeles', value: 'America/Los_Angeles' },
      ],
      save: async (v: string) => { await this.setTimezone(v); },
    });
  }

  // --- Nav ---
  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  // --- Helpers ---
  fraudPolicyName(): string {
    const id = this.fraudPolicyId;
    if (id == null) return '';
    return this.fraudPolicies().find(f => f.fraudPolicyId === id)?.fraudPolicyName ?? '';
  }

  autoGrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  private initFormFromApp(app: App): void {
    this.webhookUrl = app.webhookSettings?.paymentWebhookUrl ?? '';
    this.webhookScheme = app.webhookSettings?.webhookAuthorizationHeaderScheme ?? '';
    this.webhookParam = app.webhookSettings?.webhookAuthorizationHeaderParameter ?? '';
    this.fraudPolicyId = app.defaultFraudPolicyId ?? null;

    this.storeName = app.friendlyName ?? '';
    this.slogan1 = app.checkoutSlogan1 ?? '';
    this.slogan2 = app.checkoutSlogan2 ?? '';
    this.domain = (app.hostedPageBaseUrl ?? '').replace(/^https?:\/\//, '');
    this.logoUrl = app.logo ?? null;
    this.previewUrl = null;

    this._origGeneral = {
      webhookUrl: this.webhookUrl,
      webhookScheme: this.webhookScheme,
      webhookParam: this.webhookParam,
      fraudPolicyId: this.fraudPolicyId,
    };
    this._origCheckout = {
      storeName: this.storeName,
      slogan1: this.slogan1,
      slogan2: this.slogan2,
      domain: this.domain,
    };
  }

  private emptyGeneral(): GeneralSnapshot {
    return { webhookUrl: '', webhookScheme: '', webhookParam: '', fraudPolicyId: null };
  }

  private emptyCheckout(): CheckoutSnapshot {
    return { storeName: '', slogan1: '', slogan2: '', domain: '' };
  }

  protected extractError(err: any, fallback: string): string {
    return err?.response?.message || err?.message || err?.exceptionMessage || fallback;
  }
}
