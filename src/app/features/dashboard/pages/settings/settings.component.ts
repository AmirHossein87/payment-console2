import {
  Component,
  signal,
  computed,
  inject,
  OnInit,
  ElementRef,
  ViewChild,
  TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  AppsClient,
  FraudPoliciesClient,
  SystemClient,
  SettingsClient,
  TeamClient,
  PaymentsClient,
  TwoFactorClient,
  App,
  FraudPolicy,
  WebhookReportItem,
  AppSettingsUpdateRequest,
  UpdateCheckoutPageRequest,
  UserUpdateRequest,
} from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { SettingsStore } from '@core/stores/settings.store';
import { NotificationService } from '@core/services/notification.service';
import { patchOf } from '@core/utils/patch.util';
import { UniversalEditModalComponent } from '@shared/components/universal-edit-modal/universal-edit-modal.component';
import { ConfirmModalComponent } from '@shared/components/confirm-modal/confirm-modal.component';
import { DataGridComponent } from '@shared/components/data-grid/data-grid.component';
import { GridColumn } from '@shared/components/data-grid/data-grid.interface';

type Tab = 'general' | 'personalize' | 'checkout' | 'twofa' | 'api' | 'webhook';
/** Which page this instance renders — the SAME component backs all three routes. */
type SettingsMode = 'app' | 'developer' | 'profile';

/** A programmatic API key (backed by a "bot" identity — same API as Team). */
interface ApiKeyRow {
  userId: string;
  name: string;
  roleId: string;
  createdTime: Date | null;
}

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
  imports: [CommonModule, FormsModule, UniversalEditModalComponent, ConfirmModalComponent, DataGridComponent],
  providers: [SystemClient],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsPageComponent implements OnInit {
  @ViewChild('logoFileInput') logoFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editor') editor!: UniversalEditModalComponent;
  @ViewChild('hmacConfirm') hmacConfirm!: ConfirmModalComponent;
  @ViewChild('twoFaConfirm') twoFaConfirm!: ConfirmModalComponent;
  @ViewChild('keyNameTpl', { static: true }) keyNameTpl!: TemplateRef<any>;
  @ViewChild('keyActionsTpl', { static: true }) keyActionsTpl!: TemplateRef<any>;
  @ViewChild('whResultTpl', { static: true }) whResultTpl!: TemplateRef<any>;
  @ViewChild('whActionsTpl', { static: true }) whActionsTpl!: TemplateRef<any>;

  private readonly appsClient = inject(AppsClient);
  private readonly fraudClient = inject(FraudPoliciesClient);
  private readonly systemClient = inject(SystemClient);
  private readonly settingsClient = inject(SettingsClient);
  private readonly teamClient = inject(TeamClient);
  private readonly paymentsClient = inject(PaymentsClient);
  private readonly twoFactorClient = inject(TwoFactorClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploadingLogo = signal(false);
  readonly dnsOpen = signal(false);
  readonly activeTab = signal<Tab>('general');
  readonly isSupportCustomizeCheckout = signal(false);
  /** 'app' → regular Settings; 'developer' → Developer Settings (route-driven). */
  readonly mode = signal<SettingsMode>('app');

  readonly app = signal<App | null>(null);
  readonly fraudPolicies = signal<FraudPolicy[]>([]);

  // ── API Integration tab ─────────────────────────────────────────────────
  readonly apiKeys = signal<ApiKeyRow[]>([]);
  readonly apiKeysLoading = signal(false);
  private apiKeysLoaded = false;
  apiKeyColumns: GridColumn[] = [];

  // Create-key modal (reuses TeamClient.addBot — a bot IS an API key identity)
  readonly createKeyOpen = signal(false);
  readonly createKeySaving = signal(false);
  readonly createdKeyToken = signal('');
  newKeyName = '';
  newKeyTried = false;

  // Revoke-key confirm
  readonly confirmDeleteKey = signal<ApiKeyRow | null>(null);
  readonly deletingKey = signal(false);

  // ── Two-factor authentication (My Profile tab — the user's personal 2FA) ─
  readonly twoFaEnabled = signal(false);

  // ── App-level 2FA requirement (Settings → General — admin sets it) ───────
  readonly appTwoFaEnabled = signal(false);

  /**
   * The user still needs to set up their personal 2FA: the admin requires it for
   * the app, but this user hasn't enrolled. Drives the warning sign in My Profile.
   * When the app doesn't require 2FA, there's nothing to set up (no warning).
   */
  readonly needsTwoFaSetup = computed(() => this.appTwoFaEnabled() && !this.twoFaEnabled());

  // Enrollment (scan-QR → enter-code) modal state.
  readonly enrollOpen = signal(false);
  readonly qrLoading = signal(false);
  readonly qrCode = signal<string>('');     // data:image/png;base64,… from the API
  readonly activating = signal(false);
  otpCode = '';
  otpTried = false;

  // ── Webhook HMAC signing (POST/DELETE rotate secret) ─────────────────────
  readonly hmacEnabled = signal(false);
  readonly hmacSaving = signal(false);
  readonly hmacSecretRevealed = signal(false);
  /** The signing secret — only returned by rotate (enable/regenerate), once. */
  readonly hmacSecret = signal('');

  // ── Webhook delivery-attempt log (GET /api/apps/{appId}/webhooks) ────────
  readonly webhookLogs = signal<WebhookReportItem[]>([]);
  readonly webhookLogsLoading = signal(false);
  private webhookLogsLoaded = false;
  webhookLogColumns: GridColumn[] = [];
  /** The webhook attempt shown in the detail modal (full payload + full error). */
  readonly detailRow = signal<WebhookReportItem | null>(null);

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
    // All three routes render this component; route data picks which page.
    const raw = this.route.snapshot.data['mode'];
    const mode: SettingsMode = raw === 'developer' ? 'developer' : raw === 'profile' ? 'profile' : 'app';
    this.mode.set(mode);
    this.activeTab.set(mode === 'developer' ? 'api' : mode === 'profile' ? 'personalize' : 'general');

    // Theme was already fetched once (right after login) and synced into the
    // store — reflect that here instead of re-deriving it from the server.
    this.theme = this.settingsStore.themePreference();
    this.timezone = localStorage.getItem('tc-tz') ?? 'UTC';
    this.buildApiKeyColumns();
    if (mode === 'developer') this.setTab('api'); // lazy-load keys immediately
    this.loadPage();
  }

  private buildApiKeyColumns(): void {
    this.apiKeyColumns = [
      {
        id: 'name',
        header: 'Name',
        field: 'name',
        type: 'custom',
        customTemplate: this.keyNameTpl,
        isSortable: true,
        isFilterable: true,
      },
      {
        id: 'created',
        header: 'Created',
        field: 'createdTime',
        type: 'date',
        isSortable: true,
        width: '190px',
      },
      {
        id: 'actions',
        header: '',
        field: '__actions',
        type: 'custom',
        customTemplate: this.keyActionsTpl,
        width: '70px',
      },
    ];

    this.webhookLogColumns = [
      { id: 'paymentId', header: 'Payment ID', field: 'paymentId', isLink: true, linkHref: (row: any) => this.paymentUrl(row.paymentId), isSortable: true, isFilterable: true, width: '120px' },
      { id: 'ref', header: 'Reference', field: 'referenceId', isSortable: true, isFilterable: true, width: '150px' },
      { id: 'state', header: 'Payment state', field: 'paymentState', type: 'status', isSortable: true, isFilterable: true, width: '150px' },
      { id: 'attempted', header: 'Attempted', field: 'attemptedAt', type: 'date', isSortable: true, width: '185px' },
      { id: 'result', header: 'Result', field: '__result', type: 'custom', customTemplate: this.whResultTpl, width: '110px' },
      { id: 'error', header: 'Error', field: 'error', isFilterable: true },
      { id: 'actions', header: '', field: '__actions', type: 'custom', customTemplate: this.whActionsTpl, width: '70px' },
    ];
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

      // The user's per-app 2FA activation (is2faActivate) is only needed on the
      // My Profile page's 2FA tab — so only fetch users/current/apps there. In
      // app/developer settings there's no 2FA tab, so we skip the extra call.
      if (this.mode() === 'profile') {
        const userApps = await firstValueFrom(this.teamClient.getApps()).catch(() => null);
        const activated = (userApps ?? []).find((a) => a.appId === appId)?.is2faActivate ?? false;
        this.twoFaEnabled.set(activated);
        // Keep the app-wide alarm (avatar dot + profile menu badge) in sync.
        this.settingsStore.setTwoFaState(this.appTwoFaEnabled(), activated);
      }
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

  /** Settings → General: activate app-wide 2FA for critical actions (edited field). */
  editAppTwoFa(): void {
    this.editor.open({
      title: 'Two-factor authentication',
      icon: 'encrypted',
      label: 'Require 2FA for critical actions',
      type: 'boolean',
      value: this.appTwoFaEnabled(),
      helper: 'When on, refunds, mark-as-refund and mark-as-dispute require a 2FA code.',
      save: async (v) => {
        await this.patchSettings({ isTwoFactorAuthenticationEnabled: patchOf(!!v) } as AppSettingsUpdateRequest);
        this.appTwoFaEnabled.set(!!v);
        // Flipping the app-level force flag changes the alarm for this user too.
        this.settingsStore.setTwoFaState(!!v, this.settingsStore.user2faActivated());
      },
    });
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
    // Lazy-load the API keys the first time the tab is opened.
    if (tab === 'api' && !this.apiKeysLoaded) {
      this.apiKeysLoaded = true;
      this.loadApiKeys();
    }
    // Lazy-load the webhook delivery log the first time the Webhook tab opens.
    if (tab === 'webhook' && !this.webhookLogsLoaded) {
      this.webhookLogsLoaded = true;
      this.loadWebhookLogs();
    }
  }

  // --- Webhook delivery log ---
  async loadWebhookLogs(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    this.webhookLogsLoading.set(true);
    try {
      const items = await firstValueFrom(this.paymentsClient.getWebhooks(appId));
      this.webhookLogs.set(items ?? []);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load webhook deliveries.'));
      this.webhookLogs.set([]);
    } finally {
      this.webhookLogsLoading.set(false);
    }
  }

  /** Absolute URL to a payment's detail page (used as the Payment ID link href). */
  paymentUrl(paymentId: number): string {
    const appId = this.workspaceStore.currentAppId();
    if (!appId || !paymentId) return '';
    return this.router.serializeUrl(
      this.router.createUrlTree(['/', appId, 'payments', paymentId])
    );
  }

  /** Plain click on a Payment ID → open the payment detail in a new tab. */
  onWebhookPaymentLink(event: { value: any }): void {
    const url = this.paymentUrl(event.value);
    if (url) window.open(url, '_blank', 'noopener');
  }

  openDetail(row: WebhookReportItem): void {
    this.detailRow.set(row);
  }

  closeDetail(): void {
    this.detailRow.set(null);
  }

  /** Pretty-print a JSON payload for the detail modal; falls back to raw text. */
  prettyPayload(payload: string | null | undefined): string {
    const raw = payload ?? '';
    if (!raw.trim()) return '(empty payload)';
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  // --- API Integration (keys are "bot" identities — same endpoints as Team) ---
  async loadApiKeys(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    this.apiKeysLoading.set(true);
    try {
      const res = await firstValueFrom(this.teamClient.listUserRoles(appId));
      this.apiKeys.set(
        (res?.items ?? [])
          .filter((m) => m.user?.isBot)
          .map((m) => ({
            userId: m.userId,
            name:
              [m.user?.firstName, m.user?.lastName].filter(Boolean).join(' ') ||
              m.user?.name ||
              m.user?.email ||
              m.userId,
            roleId: m.role?.roleId ?? '',
            createdTime: m.user?.createdTime ?? null,
          }))
      );
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load API keys.'));
      this.apiKeys.set([]);
    } finally {
      this.apiKeysLoading.set(false);
    }
  }

  openCreateKey(): void {
    this.newKeyName = '';
    this.newKeyTried = false;
    this.createdKeyToken.set('');
    this.createKeyOpen.set(true);
  }

  closeCreateKey(): void {
    if (this.createKeySaving()) return;
    this.createKeyOpen.set(false);
    this.createdKeyToken.set('');
  }

  async confirmCreateKey(): Promise<void> {
    this.newKeyTried = true;
    const appId = this.workspaceStore.currentAppId();
    if (!appId || !this.newKeyName.trim()) return;

    this.createKeySaving.set(true);
    try {
      const apiKey = await firstValueFrom(
        this.teamClient.addBot(appId, this.newKeyName.trim())
      );
      const scheme = apiKey?.accessToken?.scheme ?? '';
      const value = apiKey?.accessToken?.value ?? '';
      this.createdKeyToken.set(scheme ? `${scheme} ${value}` : value);
      await this.loadApiKeys();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to create API key.'));
    } finally {
      this.createKeySaving.set(false);
    }
  }

  async copyKeyToken(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.createdKeyToken());
      this.notify.showSuccess('API key copied to clipboard');
    } catch { /* clipboard unavailable */ }
  }

  async copyAppId(appId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(appId);
      this.notify.showSuccess('App ID copied to clipboard');
    } catch { /* clipboard unavailable */ }
  }

  askDeleteKey(row: ApiKeyRow): void {
    this.confirmDeleteKey.set(row);
  }

  cancelDeleteKey(): void {
    if (this.deletingKey()) return;
    this.confirmDeleteKey.set(null);
  }

  async doDeleteKey(): Promise<void> {
    const row = this.confirmDeleteKey();
    const appId = this.workspaceStore.currentAppId();
    if (!row || !appId) return;

    this.deletingKey.set(true);
    try {
      await firstValueFrom(this.teamClient.removeUser(appId, row.roleId, row.userId));
      this.notify.showSuccess('API key revoked');
      this.confirmDeleteKey.set(null);
      await this.loadApiKeys();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to revoke API key.'));
    } finally {
      this.deletingKey.set(false);
    }
  }

  // --- Two-factor authentication enrollment (POST /api/twofactor/*) ---

  /** Opens the setup modal and fetches a fresh QR code to scan. */
  async startTwoFaSetup(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    this.otpCode = '';
    this.otpTried = false;
    this.qrCode.set('');
    this.enrollOpen.set(true);
    this.qrLoading.set(true);
    try {
      const dataUri = await firstValueFrom(this.twoFactorClient.generateQrCode(appId));
      this.qrCode.set(dataUri ?? '');
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to generate the QR code.'));
      this.enrollOpen.set(false);
    } finally {
      this.qrLoading.set(false);
    }
  }

  closeEnroll(): void {
    if (this.activating()) return;
    this.enrollOpen.set(false);
  }

  /** Verifies the 6-digit code from the authenticator and activates 2FA. */
  async verifyTwoFa(): Promise<void> {
    this.otpTried = true;
    const appId = this.workspaceStore.currentAppId();
    const code = this.otpCode.trim();
    if (!appId || !/^\d{6}$/.test(code) || this.activating()) return;
    this.activating.set(true);
    try {
      const status = await firstValueFrom(this.twoFactorClient.activate(appId, code));
      const active = status?.isActive ?? true;
      this.twoFaEnabled.set(active);
      this.settingsStore.setTwoFaState(this.appTwoFaEnabled(), active);
      this.enrollOpen.set(false);
      this.notify.showSuccess('Two-factor authentication is now active.');
    } catch (err: any) {
      // Wrong/expired code is the common case — keep the modal open to retry.
      const tn = err?.typeName ?? err?.response?.TypeName;
      const msg =
        tn === 'Invalid2FaException'
          ? 'That code is incorrect or has expired. Enter the current 6-digit code and try again.'
          : this.extractError(err, 'Could not activate two-factor authentication. Please try again.');
      this.notify.showError(msg);
    } finally {
      this.activating.set(false);
    }
  }

  /** Confirms, then turns 2FA off for the current user. */
  askDisableTwoFa(): void {
    this.twoFaConfirm.open({
      title: 'Turn off two-factor authentication?',
      message: this.appTwoFaEnabled()
        ? 'This app requires 2FA for sensitive actions — if you turn it off you will be asked to set it up again before running them.'
        : 'You will no longer be asked for a 2FA code. You can set it up again anytime.',
      confirmLabel: 'Turn off',
      danger: true,
      icon: 'lock_open',
      confirm: () => this.disableTwoFa(),
    });
  }

  private async disableTwoFa(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    try {
      const status = await firstValueFrom(this.twoFactorClient.deactivate(appId));
      const active = status?.isActive ?? false;
      this.twoFaEnabled.set(active);
      this.settingsStore.setTwoFaState(this.appTwoFaEnabled(), active);
      this.notify.showSuccess('Two-factor authentication turned off.');
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to turn off two-factor authentication.'));
    }
  }

  /** Inline validation message for the 6-digit code field (shown after a submit attempt). */
  otpError(): string {
    if (!this.otpTried) return '';
    const code = this.otpCode.trim();
    if (!code) return 'Enter the 6-digit code from your authenticator app.';
    if (!/^\d{6}$/.test(code)) return 'The code must be 6 digits.';
    return '';
  }

  // --- Webhook HMAC signing (each action asks for confirmation first) ---
  askEnableHmac(): void {
    this.hmacConfirm.open({
      title: 'Enable webhook signing?',
      message: 'We will start signing every webhook with an HMAC-SHA256 signature and give you a signing secret to store on your server.',
      confirmLabel: 'Enable signing',
      icon: 'verified_user',
      confirm: () => this.enableHmac(),
    });
  }

  askDisableHmac(): void {
    this.hmacConfirm.open({
      title: 'Disable webhook signing?',
      message: 'Webhooks will no longer be signed and the current secret is deleted. Any server verifying the signature must stop doing so or it will reject deliveries.',
      confirmLabel: 'Disable signing',
      danger: true,
      icon: 'gpp_bad',
      confirm: () => this.disableHmac(),
    });
  }

  askRegenerateHmac(): void {
    this.hmacConfirm.open({
      title: 'Regenerate signing secret?',
      message: 'A new secret is generated and the current one stops working immediately. Every integration still using the old secret will fail until you update it.',
      confirmLabel: 'Regenerate secret',
      danger: true,
      icon: 'autorenew',
      confirm: () => this.regenerateHmacSecret(),
    });
  }

  /** Enable (or first-time create): POST rotate → returns the secret (shown once). */
  async enableHmac(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId || this.hmacSaving()) return;
    this.hmacSaving.set(true);
    try {
      const secret = await firstValueFrom(this.paymentsClient.rotateWebhookSigningSecret(appId));
      this.hmacSecret.set(this.coerceSecret(secret));
      this.hmacSecretRevealed.set(true);
      this.hmacEnabled.set(true);
      this.notify.showSuccess('Webhook signing enabled — copy your signing secret now.');
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to enable webhook signing.'));
    } finally {
      this.hmacSaving.set(false);
    }
  }

  /** Disable: DELETE the signing secret. */
  async disableHmac(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId || this.hmacSaving()) return;
    this.hmacSaving.set(true);
    try {
      await firstValueFrom(this.paymentsClient.deleteWebhookSigningSecret(appId));
      this.hmacEnabled.set(false);
      this.hmacSecret.set('');
      this.hmacSecretRevealed.set(false);
      this.notify.showSuccess('Webhook signing disabled.');
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to disable webhook signing.'));
    } finally {
      this.hmacSaving.set(false);
    }
  }

  /** Rotate to a brand-new secret (POST) — invalidates the previous one. */
  async regenerateHmacSecret(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId || this.hmacSaving()) return;
    this.hmacSaving.set(true);
    try {
      const secret = await firstValueFrom(this.paymentsClient.rotateWebhookSigningSecret(appId));
      this.hmacSecret.set(this.coerceSecret(secret));
      this.hmacSecretRevealed.set(true);
      this.notify.showSuccess('New signing secret generated — update your integrations.');
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to regenerate signing secret.'));
    } finally {
      this.hmacSaving.set(false);
    }
  }

  /**
   * The rotate endpoint may return the secret as a bare JSON string OR wrapped in
   * an object (e.g. `{ secret: "…" }`), which would render as "[object Object]".
   * Normalise to the raw secret string so we always show the real value.
   */
  private coerceSecret(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const named = o['secret'] ?? o['signingSecret'] ?? o['webhookSigningSecret'] ?? o['value'] ?? o['key'] ?? o['token'];
      if (typeof named === 'string') return named;
      const firstStr = Object.values(o).find((x) => typeof x === 'string');
      if (typeof firstStr === 'string') return firstStr;
      return JSON.stringify(v);
    }
    return String(v);
  }

  toggleHmacReveal(): void {
    this.hmacSecretRevealed.update((v) => !v);
  }

  async copyHmacSecret(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.hmacSecret());
      this.notify.showSuccess('Signing secret copied to clipboard');
    } catch { /* clipboard unavailable */ }
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
    // Real signing state from the App — decides Enable vs Disable/Regenerate on load.
    this.hmacEnabled.set(app.webhookSettings?.isSigningEnabled ?? false);
    // App-level 2FA requirement (admin-set) — gates the My Profile 2FA tab.
    this.appTwoFaEnabled.set(app.isTwoFactorAuthenticationEnabled ?? false);
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
