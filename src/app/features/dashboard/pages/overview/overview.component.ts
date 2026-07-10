import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppsClient, PaymentsClient, PaymentOverviewView, PaymentProfilesClient, PaymentProvider } from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { PermissionStore } from '@core/stores/permission.store';
import { CreatePaymentLinkModalComponent } from '@shared/components/create-payment-link-modal/create-payment-link-modal.component';
import { DateRangePickerComponent, DateRange } from '@shared/components/date-range-picker/date-range-picker.component';
import { ProviderLogoComponent } from '@shared/components/provider-logo/provider-logo.component';

type DashboardState = 'setup' | 'gateway' | 'completed' | 'completed-expired' | 'expired';
type OvPreset = 'today' | '7d' | 'month';
type OvRange = OvPreset | 'custom';

interface KpiValue {
  v: string;
  sub: string;
  d: number;
  goodDown?: boolean;
}

interface RangeData {
  kpis: Record<string, KpiValue>;
  /** [label, captured, declined] */
  daily: [string, number, number][];
  states: Record<string, number>;
  /** [name, cssClass, txCount, grossVolume, fees, approvalRate, shareOfVolume, rawProviderKey] */
  providers: [string, string, number, string, string, number, number, string][];
  /** [currency, volume, payments, fees, fraudProtected] */
  currencies: [string, string, number, string, string][];
  /** [currency, count, amount] */
  rejected: [string, number, string][];
  fraud: { blocked: number; customersBlocked: number };
}

/**
 * Sample overview data, faithful to the design prototype and the backend
 * PaymentDashboardView shape (paymentState, paymentDaily, providerCurrencies/
 * providerIncomes, paymentCurrencies, rejected). `d` = period-over-period delta.
 */
const OV: Record<OvPreset, RangeData> = {
  today: {
    kpis: {
      approval: { v: '88.4%', sub: '38 of 43 attempts', d: 1.1 },
      tx: { v: '38', sub: 'captured', d: 5.0 },
      declined: { v: '5', sub: '11.6% of attempts', d: -2.4, goodDown: true },
      fraud: { v: '3', sub: '7.0% of attempts', d: -1.2, goodDown: true },
    },
    daily: [['09:00', 4, 1], ['11:00', 6, 0], ['13:00', 7, 1], ['15:00', 5, 1], ['17:00', 8, 1], ['19:00', 6, 1], ['21:00', 2, 0]],
    states: { Captured: 38, Authorized: 6, InProgress: 4, Created: 9, Failed: 5, Disputed: 1, Refunded: 2 },
    providers: [['Stripe', 'stripe', 24, '$8,120', '$284', 92, 62, 'Stripe'], ['PayPal', 'paypal', 11, '$2,540', '$71', 86, 24, 'PayPal'], ['Adyen', 'adyen', 9, '€3,310', '$11', 90, 9, 'Adyen'], ['Revolut', 'revolut', 4, '£980', '$6', 75, 5, 'Revolut']],
    currencies: [['USD', '$10,660', 35, '$372', '$640'], ['EUR', '€3,310', 9, '€113', '€0'], ['GBP', '£980', 4, '£33', '£0'], ['AED', '1,420', 3, '48 AED', '0 AED']],
    rejected: [['USD', 5, '$1,240'], ['EUR', 2, '€420']],
    fraud: { blocked: 3, customersBlocked: 1 },
  },
  '7d': {
    kpis: {
      approval: { v: '92.7%', sub: '412 of 459 attempts', d: 1.3 },
      tx: { v: '412', sub: 'captured', d: 9.0 },
      declined: { v: '47', sub: '8.4% of attempts', d: -3.2, goodDown: true },
      fraud: { v: '28', sub: '6.1% of attempts', d: -2.8, goodDown: true },
    },
    daily: [['Mon', 52, 7], ['Tue', 61, 6], ['Wed', 58, 9], ['Thu', 64, 5], ['Fri', 71, 8], ['Sat', 58, 7], ['Sun', 48, 5]],
    states: { Captured: 412, Authorized: 38, InProgress: 21, Created: 64, Failed: 47, Disputed: 9, Refunded: 18 },
    providers: [['Stripe', 'stripe', 186, '$84,200', '$2,940', 94, 46, 'Stripe'], ['PayPal', 'paypal', 92, '$31,450', '$1,100', 88, 24, 'PayPal'], ['Adyen', 'adyen', 74, '€41,900', '$1,560', 91, 23, 'Adyen'], ['Revolut', 'revolut', 38, '£12,300', '$640', 79, 7, 'Revolut']],
    currencies: [['USD', '$184,210', 412, '$6,240', '$11,800'], ['EUR', '€72,400', 128, '€2,460', '€420'], ['GBP', '£21,300', 64, '£724', '£180'], ['AED', '7,820', 22, '266 AED', '0 AED']],
    rejected: [['USD', 31, '$8,120'], ['EUR', 12, '€2,940'], ['GBP', 5, '£640']],
    fraud: { blocked: 28, customersBlocked: 6 },
  },
  month: {
    kpis: {
      approval: { v: '90.4%', sub: '1,847 of 2,043 attempts', d: -0.6 },
      tx: { v: '1,847', sub: 'captured', d: 16.1 },
      declined: { v: '196', sub: '9.6% of attempts', d: 2.1, goodDown: true },
      fraud: { v: '118', sub: '5.8% of attempts', d: 1.4, goodDown: true },
    },
    daily: [['Wk1', 392, 44], ['Wk2', 438, 51], ['Wk3', 471, 46], ['Wk4', 546, 55]],
    states: { Captured: 1847, Authorized: 142, InProgress: 63, Created: 228, Failed: 196, Disputed: 34, Refunded: 71 },
    providers: [['Stripe', 'stripe', 742, '$318,400', '$11,140', 93, 43, 'Stripe'], ['PayPal', 'paypal', 388, '$142,900', '$5,000', 87, 19, 'PayPal'], ['Adyen', 'adyen', 296, '€168,200', '$6,280', 92, 23, 'Adyen'], ['Revolut', 'revolut', 152, '£54,100', '$2,380', 81, 15, 'Revolut']],
    currencies: [['USD', '$742,000', 1480, '$24,800', '$51,000'], ['EUR', '€291,000', 512, '€9,700', '€2,400'], ['GBP', '£86,400', 256, '£2,880', '£600'], ['AED', '31,200', 88, '1,040 AED', '0 AED']],
    rejected: [['USD', 124, '$32,400'], ['EUR', 48, '€11,800'], ['GBP', 21, '£2,560']],
    fraud: { blocked: 118, customersBlocked: 23 },
  },
};

const KPI_META = [
  { key: 'approval', label: 'Approval rate', icon: 'verified', c: '--ok' },
  { key: 'tx', label: 'Transactions', icon: 'receipt_long', c: '--info' },
  { key: 'declined', label: 'Declined', icon: 'block', c: '--bad' },
  { key: 'fraud', label: 'Fraud blocked', icon: 'gpp_bad', c: '--violet' },
];

const STATE_META: Record<string, string> = {
  Captured: 'st-captured', Authorized: 'st-hold', InProgress: 'st-progress',
  Created: 'st-created', Failed: 'st-fail', Disputed: 'st-disputed', Refunded: 'st-refund',
};
const STATE_LABEL: Record<string, string> = {
  Captured: 'Captured', Authorized: 'Authorized / Hold', InProgress: 'In progress',
  Created: 'Created', Failed: 'Failed', Disputed: 'Disputed', Refunded: 'Refunded',
};

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, CreatePaymentLinkModalComponent, DateRangePickerComponent, ProviderLogoComponent],
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
})
export class OverviewComponent implements OnInit {
  private readonly router = inject(Router);
  readonly workspaceStore = inject(WorkspaceStore);
  private readonly permissionStore = inject(PermissionStore);
  private readonly paymentsClient = inject(PaymentsClient);
  private readonly profilesClient = inject(PaymentProfilesClient);
  private readonly appsClient = inject(AppsClient);

  /** Live overview payload from GET /payments/overview (null → fall back to sample data). */
  readonly overviewData = signal<PaymentOverviewView | null>(null);
  // Starts true (not false) so the skeleton shows from first paint. ngOnInit
  // awaits refreshSelectedApp() before loadOverview() ever runs — with a false
  // default, that gap rendered the real content branch with overviewData()
  // still null, flashing the sample/fake data before the API result replaced it.
  readonly loadingOverview = signal(true);

  // Monotonic token for loadOverview() calls. Only the response of the most
  // recent call is allowed to write overviewData / clear the loading flag — an
  // earlier, slower call (e.g. the ngOnInit default range still in flight when
  // the user clicks another range) must NOT overwrite the newer result. Without
  // this, a stale narrower-range response could clobber the correct one, making
  // the provider table (and every card) show fewer rows than the selected range.
  private overviewRequestId = 0;

  /** provider enum key → PaymentProvider (with iconUri1/iconUri2) for logo rendering. */
  readonly providerIconMap = signal<Map<string, PaymentProvider>>(new Map());

  /**
   * Counts DISTINCT customers across a set of fraud block events. A customer
   * blocked more than once (multiple events sharing the same customerId) is
   * counted a single time, so the "customers blocked" fraud stat reflects
   * unique people, not raw block actions. Blank/missing ids are ignored.
   */
  static countBlockedCustomers(
    events: ReadonlyArray<{ customerId?: string | null }> | null | undefined
  ): number {
    if (!events) return 0;
    const unique = new Set<string>();
    for (const e of events) {
      if (e?.customerId) unique.add(e.customerId);
    }
    return unique.size;
  }

  readonly ranges: { key: OvPreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: 'Last 7 days' },
    { key: 'month', label: 'This month' },
  ];
  readonly kpiMeta = KPI_META;

  readonly ovRange = signal<OvRange>('7d');
  readonly customFrom = signal<string | null>(null);
  readonly customTo = signal<string | null>(null);

  readonly ov = computed<RangeData>(() => {
    const live = this.overviewData();
    if (live) return this.mapToRangeData(live);
    // No live data yet (loading / error) — show sample data for the selected preset.
    const r = this.ovRange();
    return r === 'custom' ? OV['month'] : OV[r];
  });

  setRange(r: OvPreset): void {
    this.ovRange.set(r);
    this.customFrom.set(null);
    this.customTo.set(null);
    this.loadOverview();
  }

  onDateRangeChange(range: DateRange): void {
    this.customFrom.set(range.from);
    this.customTo.set(range.to);
    if (range.from || range.to) {
      this.ovRange.set('custom');
    }
    this.loadOverview();
  }

  /**
   * Derives the getting-started state from the active app's metadata. Mirrors
   * payment-admin's `resolveUiState` (dashboard.component.ts) exactly:
   *   isActive=false + setup + firstCapture  → completed-expired (analytics + renew notice)
   *   isActive=false                         → expired (renew prompt)
   *   isSetupCompleted || hasFirstCapture    → completed (analytics)
   *   isConnectFirstGateway || routed profile→ gateway (onboarding)
   *   otherwise                              → setup (onboarding)
   * Expiry is driven by `isActive` (the backend flips it on expiry), not a
   * client-side date check — and expiry never blocks access (routes stay open).
   */
  readonly state = computed<DashboardState>(() => {
    // Prefer the full app loaded via AppsClient.getSettings (stored by licenseGuard
    // in selectedApp) — it carries isSetupCompleted / hasFirstCapturePayment /
    // isConnectFirstGateway. permissibleApps (activeAppMetadata) is a lighter list
    // that may not include those flags. Mirrors payment-admin's selectedApp$.
    const app = this.workspaceStore.selectedApp() ?? this.workspaceStore.activeAppMetadata();
    if (!app) return 'setup';

    if (app.isActive === false && app.isSetupCompleted === true && app.hasFirstCapturePayment === true) {
      return 'completed-expired';
    }
    if (app.isActive === false) return 'expired';
    if (app.isSetupCompleted === true || app.hasFirstCapturePayment === true) return 'completed';
    if (app.isConnectFirstGateway === true || (app.defaultRoutedProfiles?.length ?? 0) > 0) {
      return 'gateway';
    }
    return 'setup';
  });

  async ngOnInit(): Promise<void> {
    // licenseGuard sets workspaceStore.selectedApp ONLY once per app-level route
    // entry (it lives on the parent route, which isn't re-guarded when navigating
    // between sibling children like Gateways → Overview). Without a refresh here,
    // connecting a gateway and returning to Overview via SPA routing would still
    // show a stale snapshot — "Add Gateway" even though isConnectFirstGateway is
    // now true server-side. Mirrors payment-admin's
    // `layoutService.reloadSelectedApp()` call in its Dashboard ngOnInit.
    await this.refreshSelectedApp();

    // Default landing is the Overview. It doubles as the onboarding wizard while
    // setup is incomplete, so EVERYONE must stay here until setup is done —
    // detect setup-completed FIRST. Only once the app is fully set up (and the
    // analytics view would show) do we bounce a user lacking DashboardRead to
    // /payments, mirroring payment-admin's DashboardPermissionGuard.
    const app = this.workspaceStore.selectedApp() ?? this.workspaceStore.activeAppMetadata();
    const setupCompleted =
      app?.isSetupCompleted === true || app?.hasFirstCapturePayment === true;

    if (setupCompleted && !this.permissionStore.hasPermission('DashboardRead')) {
      const appId = this.workspaceStore.currentAppId();
      if (appId) {
        this.router.navigate(['/', appId, 'payments']);
      }
      return;
    }

    // Fetch the real analytics for the initial range (only when the analytics
    // view is actually shown — the onboarding states have no overview data).
    this.loadOverview();
    this.loadProviderIcons();
  }

  private async refreshSelectedApp(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    try {
      const app = await firstValueFrom(this.appsClient.getSettings(appId));
      this.workspaceStore.setSelectedApp(app);
    } catch {
      // Keep the existing (possibly stale) snapshot rather than blocking the page.
    }
  }

  private async loadProviderIcons(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    try {
      const list = await firstValueFrom(this.profilesClient.getPaymentProfiles(appId));
      const map = new Map<string, PaymentProvider>();
      for (const p of list ?? []) {
        const key = p.paymentProvider?.provider as string | undefined;
        if (key && p.paymentProvider) map.set(key, p.paymentProvider);
      }
      this.providerIconMap.set(map);
    } catch {
      // icons stay empty — fallback to initials
    }
  }

  /** Analytics is shown for both fully-completed and completed-but-expired apps. */
  readonly showAnalytics = computed(() => {
    const s = this.state();
    return s === 'completed' || s === 'completed-expired';
  });

  // --- KPI cards (value, sub, period-over-period delta, sparkline) ---
  readonly kpiCards = computed(() => {
    const d = this.ov();
    const spMax = Math.max(...d.daily.map((x) => x[1]));
    const last = d.daily.length - 1;
    const spark = d.daily.map((x, i) => ({
      h: Math.max(12, Math.round((x[1] / spMax) * 100)),
      hot: i === last,
    }));
    return KPI_META.map((m) => {
      const k = d.kpis[m.key];
      return { ...m, v: k.v, sub: k.sub, delta: this.delta(k.d, k.goodDown), spark };
    });
  });

  private delta(d: number, goodDown?: boolean): { cls: string; icon: string; text: string } {
    if (!d) return { cls: 'flat', icon: 'remove', text: '0%' };
    const up = d > 0;
    const good = goodDown ? !up : up;
    return { cls: good ? 'up' : 'down', icon: up ? 'trending_up' : 'trending_down', text: `${Math.abs(d).toFixed(1)}%` };
  }

  // --- Volume-over-time stacked bars (captured + declined) ---
  readonly volBars = computed(() => {
    const d = this.ov();
    const vMax = Math.max(...d.daily.map((x) => x[1] + x[2]));
    return d.daily.map((x) => {
      const capH = Math.round((x[1] / vMax) * 100);
      const rejH = Math.round((x[2] / vMax) * 100);
      const sum = capH + rejH;
      return {
        label: x[0], cap: x[1], rej: x[2],
        stackH: sum,
        capPct: sum ? (capH / sum) * 100 : 0,
        rejPct: sum ? (rejH / sum) * 100 : 0,
      };
    });
  });

  // --- Payment lifecycle donut (conic-gradient) + legend ---
  readonly donut = computed(() => {
    const d = this.ov();
    const entries = Object.keys(d.states).map((k) => ({
      key: k, label: STATE_LABEL[k], color: STATE_META[k], v: d.states[k],
    }));
    const total = entries.reduce((s, e) => s + e.v, 0) || 1;
    let acc = 0;
    const stops = entries.map((e) => {
      const a = (acc / total) * 360;
      acc += e.v;
      const b = (acc / total) * 360;
      return `var(--${e.color}) ${a}deg ${b}deg`;
    }).join(', ');
    return { gradient: `conic-gradient(${stops})`, total, legend: entries };
  });

  // --- Per-provider performance rows ---
  readonly providerRows = computed(() => {
    const iconMap = this.providerIconMap();
    return this.ov().providers.map((p) => {
      const [name, cls, tx, gross, fee, appr, share, rawKey] = p;
      const ac = appr >= 90 ? 'good' : appr >= 80 ? 'warnf' : 'badf';
      const paymentProvider = iconMap.get(rawKey) ?? null;
      return { name, cls, initial: name.charAt(0), tx, gross, fee, appr, share, ac, paymentProvider };
    });
  });

  // --- Live data fetch + mapping ---

  /** Fetches the overview for the current range when the analytics view is shown. */
  async loadOverview(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId || !this.showAnalytics()) return;

    const { begin, end } = this.rangeWindow();
    const reqId = ++this.overviewRequestId;
    this.loadingOverview.set(true);
    try {
      const view = await firstValueFrom(this.paymentsClient.getOverview(appId, begin, end));
      // A newer load started while this one was in flight — its result is the
      // source of truth now; discard this stale response entirely.
      if (reqId !== this.overviewRequestId) return;
      this.overviewData.set(view ?? null);
    } catch {
      if (reqId !== this.overviewRequestId) return;
      // Leave the sample data in place on failure.
      this.overviewData.set(null);
    } finally {
      // Only the latest request clears the loading flag, so the skeleton stays
      // up until the response that actually matters arrives.
      if (reqId === this.overviewRequestId) this.loadingOverview.set(false);
    }
  }

  /** [begin, end] window for the selected preset / custom range. */
  private rangeWindow(): { begin: Date; end: Date } {
    const now = new Date();
    const end = now;
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const r = this.ovRange();
    if (r === 'custom') {
      const from = this.customFrom();
      const to = this.customTo();
      const begin = from ? new Date(`${from}T00:00:00`) : this.daysAgo(now, 29);
      return { begin, end: to ? new Date(`${to}T23:59:59`) : end };
    }
    if (r === 'today') return { begin: startOfDay(now), end };
    if (r === '7d') return { begin: this.daysAgo(now, 6), end };
    // 'month' — from the first day of the current month (00:00:00) through the
    // last second of today (23:59:59).
    const monthBegin = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { begin: monthBegin, end: endOfToday };
  }

  private daysAgo(from: Date, days: number): Date {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() - days);
    return d;
  }

  /** Maps the API payload into the RangeData shape the template already consumes. */
  private mapToRangeData(v: PaymentOverviewView): RangeData {
    const k = v.kpi;
    const p = v.previousKpi ?? null;
    const pctOfAttempts = (n: number) =>
      k.totalAttempts ? (n / k.totalAttempts) * 100 : 0;
    const rel = (cur: number, prev?: number | null) =>
      prev && prev > 0 ? ((cur - prev) / prev) * 100 : 0;

    const kpis: Record<string, KpiValue> = {
      approval: {
        v: `${(k.approvalRate ?? 0).toFixed(1)}%`,
        sub: `${(k.capturedCount ?? 0).toLocaleString()} of ${(k.totalAttempts ?? 0).toLocaleString()} attempts`,
        d: p ? (k.approvalRate ?? 0) - (p.approvalRate ?? 0) : 0,
      },
      tx: {
        v: (k.capturedCount ?? 0).toLocaleString(),
        sub: 'captured',
        d: rel(k.capturedCount, p?.capturedCount),
      },
      declined: {
        v: (k.declinedCount ?? 0).toLocaleString(),
        sub: `${pctOfAttempts(k.declinedCount).toFixed(1)}% of attempts`,
        d: rel(k.declinedCount, p?.declinedCount),
        goodDown: true,
      },
      fraud: {
        v: (k.fraudBlockedCount ?? 0).toLocaleString(),
        sub: `${pctOfAttempts(k.fraudBlockedCount).toFixed(1)}% of attempts`,
        d: rel(k.fraudBlockedCount, p?.fraudBlockedCount),
        goodDown: true,
      },
    };

    const daily = (v.volumeSeries ?? []).map(
      (s) => [s.label, s.capturedCount ?? 0, s.declinedCount ?? 0] as [string, number, number]
    );

    const states: Record<string, number> = {};
    for (const ps of v.paymentStates ?? []) states[ps.state] = ps.count ?? 0;

    const providers = (v.providerStats ?? []).map(
      (ps) =>
        [
          this.providerLabel(ps.providerName as string),
          this.providerCls(ps.providerName as string),
          ps.transactionCount ?? 0,
          this.money(ps.grossVolume, ps.currency as string),
          this.money(ps.fees, ps.currency as string),
          Math.round(ps.approvalRate ?? 0),
          Math.round(ps.shareOfVolume ?? 0),
          ps.providerName as string,
        ] as [string, string, number, string, string, number, number, string]
    );

    const currencies = (v.currencyStats ?? []).map(
      (c) =>
        [
          c.currency as string,
          this.money(c.volume, c.currency as string),
          c.paymentCount ?? 0,
          this.money(c.fees, c.currency as string),
          this.money(c.fraudProtectedAmount, c.currency as string),
        ] as [string, string, number, string, string]
    );

    const rejected = (v.declinedByCurrency ?? []).map(
      (r) => [r.currency as string, r.count ?? 0, this.money(r.amount, r.currency as string)] as [string, number, string]
    );

    return {
      kpis,
      daily,
      states,
      providers,
      currencies,
      rejected,
      fraud: {
        blocked: v.fraud?.paymentsBlocked ?? 0,
        customersBlocked: v.fraud?.customersBlocked ?? 0,
      },
    };
  }

  private money(amount: number | null | undefined, currency: string): string {
    const cur = currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: cur,
        maximumFractionDigits: 0,
      }).format(amount ?? 0);
    } catch {
      return `${amount ?? 0}`;
    }
  }

  private providerLabel(provider: string): string {
    const labels: Record<string, string> = {
      AuthorizeNet: 'Authorize.Net',
      JpMorgan: 'JP Morgan',
      JpMorganElectronicCheck: 'JP Morgan (eCheck)',
      Amazon: 'Amazon Pay',
      TapAed: 'Tap (AED)',
      TapUsd: 'Tap (USD)',
      TwoCheckout: '2Checkout',
    };
    return labels[provider] ?? provider ?? 'Unknown';
  }

  private providerCls(provider: string): string {
    const map: Record<string, string> = {
      Stripe: 'stripe',
      PayPal: 'paypal',
      Adyen: 'adyen',
      Revolut: 'revolut',
      AuthorizeNet: 'authnet',
      Braintree: 'braintree',
    };
    return map[provider] ?? (provider ?? '').toLowerCase();
  }

  go(path: string): void {
    const appId = this.workspaceStore.currentAppId();
    if (appId) {
      this.router.navigate(['/', appId, path]);
    }
  }
}
