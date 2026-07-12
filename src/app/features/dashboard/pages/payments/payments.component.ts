import {
  Component,
  signal,
  computed,
  inject,
  input,
  ViewChild,
  TemplateRef,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, ActivatedRoute, Params } from "@angular/router";
import { firstValueFrom } from "rxjs";
import {
  PaymentsClient,
  PaymentSummary,
} from "@proxy/payment-app-proxy";
import { WorkspaceStore } from "@core/stores/workspace.store";
import { PermissionStore } from "@core/stores/permission.store";
import { NotificationService } from "@core/services/notification.service";
import { DataGridComponent } from "@shared/components/data-grid/data-grid.component";
import { GridColumn } from "@shared/components/data-grid/data-grid.interface";
import { CreatePaymentLinkModalComponent } from "@shared/components/create-payment-link-modal/create-payment-link-modal.component";
import {
  PaymentsFilterModalComponent,
  PaymentsFilter,
  expandPaymentState,
} from "./payments-filter-modal/payments-filter-modal.component";

@Component({
  selector: "app-payments",
  standalone: true,
  imports: [
    CommonModule,
    DataGridComponent,
    CreatePaymentLinkModalComponent,
    PaymentsFilterModalComponent,
  ],
  template: `
    <app-data-grid
      title="Payments"
      [showCount]="false"
      [data]="paymentData()"
      [columns]="gridColumns"
      [loading]="loading()"
      [defaultPageSize]="10"
      [hasMore]="hasMore()"
      [fill]="!embedded()"
      [searchInToolbar]="true"
      [serverSearch]="true"
      [initialSearch]="searchCriteria"
      (refreshRequested)="loadPayments()"
      (loadMore)="loadBatch()"
      (filterChanged)="onSearchChanged($event)"
      (linkClicked)="onLinkClicked($event)"
    >
      <div toolbar-actions style="display: contents">
        <button
          class="btn btn-sm"
          [class.btn-primary]="hasActiveFilter()"
          (click)="filterModal.open(filter())"
        >
          <span class="material-symbols-outlined">filter_alt</span>
          Filter
          @if (activeFilterCount() > 0) {
            <span class="filter-badge">{{ activeFilterCount() }}</span>
          }
        </button>
        @if (canWrite()) {
          <button class="btn btn-sm btn-primary" (click)="linkModal.open()">
            <span class="material-symbols-outlined">link</span>
            Payment link
          </button>
        }
      </div>
    </app-data-grid>

    <app-create-payment-link-modal #linkModal (created)="onPaymentLinkCreated()" />

    <app-payments-filter-modal
      #filterModal
      (applied)="onFilterApplied($event)"
    />

    <ng-template #customerTemplate let-value let-row="row">
      @if (value) {
        <a
          class="idlink cell-mono"
          [href]="customerUrl(value)"
          target="_blank"
          rel="noopener"
          >{{ value }}</a
        >
      } @else {
        <span class="cell-sub">—</span>
      }
    </ng-template>

  `,
  styles: [
    `
      .filter-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        margin-left: 4px;
        border-radius: 9px;
        background: var(--brand-600);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }
      .btn-primary .filter-badge {
        background: rgba(255, 255, 255, 0.28);
      }
      /* Customer cell link — same blue style as the DataGrid's Payment ID link.
         Needed here because this template is projected in the payments component's
         scope, so the DataGrid's scoped .idlink does not reach it. */
      .idlink {
        color: var(--brand-600);
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
      }
      .idlink:hover {
        text-decoration: underline;
      }
      .page-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        margin-bottom: 20px;
        gap: 16px;
        flex-wrap: wrap;
        h1 {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }
        p {
          color: var(--text-2);
          font-size: 13.5px;
          margin-top: 3px;
        }
      }
    `,
  ],
})
export class PaymentsComponent implements OnInit {
  @ViewChild("customerTemplate", { static: true })
  customerTemplate!: TemplateRef<any>;

  private readonly paymentsClient = inject(PaymentsClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly permissionStore = inject(PermissionStore);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** True when the current user holds PaymentWrite — gates payment link creation. */
  readonly canWrite = computed(() => this.permissionStore.hasPermission('PaymentWrite'));

  /** When set (e.g. embedded in the customer-detail Payments tab), the grid is
      locked to this customer: the Customer column is hidden and the URL is not
      touched. Unset on the standalone /payments page. */
  readonly customerId = input<string | null>(null);
  readonly embedded = computed(() => !!this.customerId());

  readonly paymentData = signal<PaymentSummary[]>([]);
  readonly loading = signal(false);
  readonly hasMore = signal(true);
  gridColumns: GridColumn[] = [];

  // Server-side global search term (matched against all records, not just the
  // loaded batches). Public so the grid can seed its search box from a shared URL.
  searchCriteria = "";

  // Active server-side filter (state / gateway / customer / policy / dates).
  readonly filter = signal<PaymentsFilter>({});
  readonly activeFilterCount = computed(() => {
    const f = this.filter();
    let n = 0;
    if (f.paymentState != null) n++;
    if (f.paymentProfileId != null) n++;
    if (f.customerId) n++;
    if (f.fraudPolicyId != null) n++;
    if (f.startTime) n++;
    if (f.endTime) n++;
    return n;
  });
  readonly hasActiveFilter = computed(() => this.activeFilterCount() > 0);

  // Batched server fetch: pull `batchSize` records per API call, paginate them in
  // memory (10/page), and fetch the next batch only when the grid needs it.
  private readonly batchSize = 100;
  private nextPageNumber = 1;
  private isFetching = false;

  private readonly providerMap: Record<
    string,
    { label: string; cssClass: string }
  > = {
    Stripe: { label: "Stripe", cssClass: "stripe" },
    PayPal: { label: "PayPal", cssClass: "paypal" },
    Adyen: { label: "Adyen", cssClass: "adyen" },
    Revolut: { label: "Revolut", cssClass: "revolut" },
    AuthorizeNet: { label: "Authorize.Net", cssClass: "authnet" },
    Braintree: { label: "Braintree", cssClass: "braintree" },
  };

  private readonly stateBadgeMap: Record<string, string> = {
    Captured: "ok",
    Authorized: "info",
    Authorizing: "info",
    Approved: "ok",
    Failed: "bad",
    Refunded: "violet",
    Refunding: "violet",
    Disputed: "warn",
    Created: "muted",
    Capturing: "warn",
    SaleInProgress: "warn",
    Cancelling: "muted",
  };

  ngOnInit(): void {
    // No per-column widths — the DataGrid splits every column equally (equalColumns).
    const columns: GridColumn[] = [
      {
        id: "paymentId",
        header: "Payment ID",
        field: "paymentId",
        isLink: true,
        isFilterable: true,
        linkHref: (row: any) => this.paymentUrl(row.paymentId),
      },
      {
        id: "customerId",
        header: "Customer",
        field: "customerId",
        type: "custom",
        customTemplate: this.customerTemplate,
        isSortable: true,
        isFilterable: true,
      },
      {
        id: "provider",
        header: "Provider",
        field: "paymentProvider",
        type: "provider",
      },
      {
        id: "amount",
        header: "Amount",
        field: "amount",
        type: "currency",
        align: "right",
        isSortable: true,
        isFilterable: true,
      },
      {
        id: "paymentState",
        header: "Status",
        field: "paymentState",
        type: "status",
        isSortable: true,
        isFilterable: true,
        badgeMap: this.stateBadgeMap,
      },
      {
        id: "createdTime",
        header: "Date",
        field: "createdTime",
        type: "date",
        isSortable: true,
      },
    ];

    // Embedded in a customer-detail tab → drop the redundant Customer column and
    // lock the filter to that customer (no URL sync — not on the /payments route).
    // Equal column widths are handled centrally by the DataGrid (equalColumns
    // defaults to on).
    this.gridColumns = this.embedded()
      ? columns.filter((c) => c.id !== "customerId")
      : columns;

    if (this.embedded()) {
      this.filter.set({ customerId: this.customerId()! });
    } else {
      // Seed filter + search from the URL so a shared link (e.g. sent to another
      // operator) opens the payments grid pre-filtered.
      this.readStateFromRoute();
    }
    this.loadPayments();
  }

  // --- Shareable-link state (URL query params) ---

  private readStateFromRoute(): void {
    const p = this.route.snapshot.queryParamMap;

    const num = (key: string): number | undefined => {
      const raw = p.get(key);
      if (raw == null || raw === "") return undefined;
      const n = Number(raw);
      return isNaN(n) ? undefined : n;
    };

    this.filter.set({
      paymentState: num("paymentStates"),
      customerId: p.get("customerId") ?? undefined,
      customerLabel: p.get("customerName") ?? undefined,
      paymentProfileId: num("paymentProfileId"),
      fraudPolicyId: num("fraudPolicyId"),
      startTime: p.get("startTime") ?? undefined,
      endTime: p.get("endTime") ?? undefined,
    });
    this.searchCriteria = p.get("searchCriteria") ?? "";
  }

  // Reflect the active filter + search into the URL (null clears a param) so the
  // current view is fully described by — and reproducible from — the link.
  private syncStateToRoute(): void {
    // Embedded in another page (customer detail) — never rewrite that route's URL.
    if (this.embedded()) return;
    const f = this.filter();
    const queryParams: Params = {
      paymentStates: f.paymentState ?? null,
      customerId: f.customerId ?? null,
      customerName: f.customerLabel ?? null,
      paymentProfileId: f.paymentProfileId ?? null,
      fraudPolicyId: f.fraudPolicyId ?? null,
      startTime: f.startTime ?? null,
      endTime: f.endTime ?? null,
      searchCriteria: this.searchCriteria || null,
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  // Initial load / refresh — reset paging and pull the first batch.
  // Do NOT clear paymentData here so the grid keeps old rows visible during
  // refresh (slim loading bar) instead of flashing a full skeleton.
  // loadBatch() replaces data on the first batch and appends on subsequent ones.
  async loadPayments(): Promise<void> {
    this.nextPageNumber = 1;
    this.hasMore.set(true);
    await this.loadBatch();
  }

  // Fetch the next `batchSize` (100) records from the server and append them in
  // memory. The grid paginates the accumulated set; it calls this via (loadMore)
  // when the user reaches the last loaded page and `hasMore` is true.
  async loadBatch(): Promise<void> {
    if (this.isFetching || !this.hasMore()) return;
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.isFetching = true;
    this.loading.set(true);
    const isFirstBatch = this.nextPageNumber === 1;
    try {
      const f = this.filter();
      const paymentStates = expandPaymentState(f.paymentState);
      const beginTime = f.startTime
        ? new Date(`${f.startTime}T00:00:00`)
        : undefined;
      const endTime = f.endTime
        ? new Date(`${f.endTime}T23:59:59`)
        : undefined;
      const rows = await firstValueFrom(
        this.paymentsClient.getPaymentsSummary(
          appId,
          paymentStates, // paymentStates (expanded from the state code)
          this.searchCriteria || undefined, // searchCriteria
          beginTime, // beginTime
          endTime, // endTime
          this.nextPageNumber, // pageNumber (batch number, 1-based)
          this.batchSize, // pageSize (100 per call)
          f.customerId, // customerId
          f.paymentProfileId, // paymentProfileId (gateway)
          f.fraudPolicyId, // fraudPolicyId
        ),
      );
      const batch = rows ?? [];
      // First batch replaces; subsequent batches append.
      if (isFirstBatch) {
        this.paymentData.set(batch);
      } else {
        this.paymentData.update((cur) => [...cur, ...batch]);
      }
      // A full batch means there may be more; a short batch is the last page.
      this.hasMore.set(batch.length === this.batchSize);
      this.nextPageNumber++;
    } catch (err: any) {
      this.notify.showError(this.extractError(err, "Failed to load payments."));
      this.hasMore.set(false);
    } finally {
      this.loading.set(false);
      this.isFetching = false;
    }
  }

  // A new payment link is created (payment now exists server-side) — reload the
  // grid immediately, showing the full skeleton rather than the slim refresh bar,
  // instead of waiting for the modal's Done/close.
  onPaymentLinkCreated(): void {
    this.paymentData.set([]);
    this.loadPayments();
  }

  onFilterApplied(f: PaymentsFilter): void {
    // Keep the grid locked to the embedded customer regardless of the filter modal.
    this.filter.set(this.embedded() ? { ...f, customerId: this.customerId()! } : f);
    this.paymentData.set([]);
    this.syncStateToRoute();
    this.loadPayments();
  }

  // Grid global search → server-side query. Re-fetch from the first batch so a
  // match in any (even not-yet-loaded) page is found.
  onSearchChanged(state: { globalSearch: string }): void {
    const term = (state.globalSearch ?? "").trim();
    if (term === this.searchCriteria) return;
    this.searchCriteria = term;
    this.syncStateToRoute();
    this.loadPayments();
  }

  onLinkClicked(event: { column: GridColumn; row: any; value: any }): void {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;
    if (this.embedded()) {
      // Embedded in the customer-detail Payments tab — a plain click must not
      // navigate away from that page, so open the payment detail in a new tab
      // instead (Ctrl/Cmd/middle-click already does this natively via <a href>).
      window.open(this.paymentUrl(event.value), '_blank', 'noopener');
      return;
    }
    // Standalone /payments page — plain left-click navigates in the current tab.
    // Ctrl/Cmd/middle-click is handled natively by the <a href> and never reaches here.
    this.router.navigate(['/', appId, 'payments', String(event.value)]);
  }

  // Absolute URL for a payment detail row, used as the <a href> so the browser
  // can open it in a new tab on Ctrl/Cmd/middle-click.
  private paymentUrl(paymentId: string | number): string {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return '';
    return this.router.serializeUrl(
      this.router.createUrlTree(['/', appId, 'payments', paymentId])
    );
  }

  // --- Display helpers ---

  providerLabel(providerType: string): string {
    return this.providerMap[providerType]?.label ?? providerType ?? "Unknown";
  }

  providerClass(providerType: string): string {
    return this.providerMap[providerType]?.cssClass ?? "";
  }

  providerInitial(providerType: string): string {
    const label = this.providerLabel(providerType);
    return label ? label[0] : "?";
  }

  // Absolute URL to a customer's detail page — used as the Customer cell <a href>
  // so the browser opens it in a new tab (target="_blank").
  customerUrl(customerId: string): string {
    const appId = this.workspaceStore.currentAppId();
    if (!appId || !customerId) return "";
    return this.router.serializeUrl(
      this.router.createUrlTree(["/", appId, "customers", customerId])
    );
  }

  protected extractError(err: any, fallback: string): string {
    return (
      err?.response?.Message ||
      err?.response?.message ||
      err?.Message ||
      err?.message ||
      err?.exceptionMessage ||
      fallback
    );
  }
}
