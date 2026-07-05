import {
  Component,
  input,
  output,
  signal,
  computed,
  effect,
  TemplateRef,
  HostListener,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ProviderLogoComponent } from "@shared/components/provider-logo/provider-logo.component";
import { DateRangePickerComponent, DateRange } from "@shared/components/date-range-picker/date-range-picker.component";
import {
  GridColumn,
  AdvancedFilterRule,
  GridPaginationState,
  GridSortState,
  FilterOperator,
} from "./data-grid.interface";

@Component({
  selector: "app-data-grid",
  standalone: true,
  imports: [CommonModule, ProviderLogoComponent, DateRangePickerComponent],
  templateUrl: "./data-grid.component.html",
  styleUrls: ["./data-grid.component.scss"],
  host: {
    "[class.fill]": "fill()",
    "[class.fixed-layout]": "fixedLayout()",
    "[class.compact]": "compact()",
    "[class.equal-cols]": "equalColumns()",
  },
})
export class DataGridComponent {
  // Inputs
  title = input<string>("Records");
  data = input<any[]>([]);
  columns = input<GridColumn[]>([]);
  loading = input<boolean>(false);
  serverSide = input<boolean>(false);
  totalRecords = input<number>(0);
  pageSizeOptions = input<number[]>([5, 10, 25, 50, 100]);
  defaultPageSize = input<number>(10);
  selectionMode = input<"none" | "single" | "multiple">("none");
  pagination = input<boolean>(true);
  showCount = input<boolean>(true);
  // When true, the built-in per-column dropdowns, date picker and advanced-filter
  // panel are hidden — leaving only the global search box (host supplies its own
  // advanced filter, e.g. a modal).
  hideBuiltInFilters = input<boolean>(false);
  // When true, the global search box is handled server-side: the grid keeps the
  // input + debounce and emits (filterChanged) on change, but does NOT filter the
  // loaded rows client-side (the host re-queries the API). Needed for batched data
  // where a match may live in a not-yet-loaded chunk.
  serverSearch = input<boolean>(false);
  // Seeds the global search box once (e.g. from a shared/bookmarked URL). Does not
  // emit (filterChanged) — the host is expected to have already loaded with it.
  initialSearch = input<string>("");
  // Flush/edge-to-edge mode: removes the card border-radius so the grid sits
  // wall-to-wall inside .content.flush pages. Fill behaviour (flex: 1) is
  // always on by default — this input only controls the cosmetic border-radius.
  fill = input<boolean>(false);
  // Lock column widths to prevent reflow when skeleton rows are replaced by real data.
  // Requires explicit `width` on each GridColumn (or uses sensible type-based defaults).
  fixedLayout = input<boolean>(false);
  // When true (the default), every data column is given an EQUAL width share so
  // the grid is split into evenly-sized columns regardless of each column's
  // `width`. Uses table-layout: fixed. Set [equalColumns]="false" to instead
  // honor per-column widths / content sizing.
  equalColumns = input<boolean>(true);
  // Batched server fetch: data is loaded in chunks (e.g. 100) and paginated in
  // memory; when the user reaches the last loaded page and hasMore is true, the
  // grid emits (loadMore) so the host can fetch + append the next chunk.
  hasMore = input<boolean>(false);
  // When true, the Refresh and Export buttons in the toolbar are hidden.
  hideDefaultActions = input<boolean>(false);
  // Optional Material icon name rendered before the title in dc-title.
  titleIcon = input<string>('');
  // When true, the entire dc-filters bar (search, dropdowns, date, advanced) is hidden.
  hideFilters = input<boolean>(false);
  // When true, the search box moves into the toolbar row (replacing the title) and
  // the filters bar is hidden entirely — used on pages like Payments where the title
  // is redundant and the bar would just add an empty gap.
  searchInToolbar = input<boolean>(false);
  // When true, rows/cells use tighter vertical padding for a denser table.
  compact = input<boolean>(false);
  actionsTemplate = input<TemplateRef<any> | null>(null);
  rowActionsTemplate = input<TemplateRef<any> | null>(null);
  skeletonRows = input<number>(8);

  // Outputs
  rowSelectionChanged = output<any[]>();
  refreshRequested = output<void>();
  paginationChanged = output<GridPaginationState>();
  sortingChanged = output<GridSortState[]>();
  linkClicked = output<{ column: GridColumn; row: any; value: any }>();
  loadMore = output<void>();
  filterChanged = output<{
    globalSearch: string;
    columnFilters: { [field: string]: string };
    advancedFilters: AdvancedFilterRule[];
  }>();

  // Internal Writable Signals
  globalSearch = signal<string>("");
  columnFilterValues = signal<{ [field: string]: string }>({});
  dateRangeFrom = signal<string | null>(null);
  dateRangeTo = signal<string | null>(null);
  sortStates = signal<GridSortState[]>([]);
  pageIndex = signal<number>(0);
  pageSize = signal<number>(10);
  selectedRows = signal<any[]>([]);
  advancedRules = signal<AdvancedFilterRule[]>([]);
  appliedAdvancedRules = signal<AdvancedFilterRule[]>([]);
  advancedFilterPanelOpen = signal<boolean>(false);
  activeDropdown = signal<string | null>(null);
  // Set while a Refresh is in flight so the grid shows the full skeleton (like the
  // initial load) instead of the thin top loading bar. Cleared when loading ends.
  isRefreshing = signal<boolean>(false);

  // Search input debouncer
  private searchTimeout: any;

  constructor() {
    // Sync default page size to internal signal
    effect(() => {
      this.pageSize.set(this.defaultPageSize());
    });

    // A Refresh keeps the skeleton up until the host finishes loading.
    effect(() => {
      if (!this.loading()) this.isRefreshing.set(false);
    });

    // Clear selection when data changes completely
    effect(() => {
      this.data();
      this.selectedRows.set([]);
    });

    // Seed the search box from a shared URL (without re-emitting a search event).
    effect(() => {
      const init = this.initialSearch();
      if (init) this.globalSearch.set(init);
    });
  }

  // --- Computed Signals for Client-Side Evaluation ---

  // All columns getter
  allColumns = computed(() => this.columns());

  // Total columns count (includes selection column)
  totalColumnsCount = computed(() => {
    let count = this.columns().length;
    if (this.selectionMode() !== "none") count++;
    return count;
  });

  // Unique list of columns that are marked filterable
  filterableDropdownColumns = computed(() => {
    if (this.hideBuiltInFilters()) return [];
    return this.columns().filter((c) => c.isFilterable && c.type !== "date");
  });

  // Check if grid has a date column for range filters
  hasDateColumn = computed(() => {
    if (this.hideBuiltInFilters()) return false;
    return this.columns().some((c) => c.type === "date");
  });

  // Client-side filtering pipeline
  filteredData = computed(() => {
    const raw = this.data();
    if (this.serverSide()) {
      return raw; // Skip filtering in server-side mode
    }

    let result = [...raw];

    // 1. Global Search Filter (skipped when the host searches server-side)
    const searchVal = this.serverSearch()
      ? ""
      : this.globalSearch().trim().toLowerCase();
    if (searchVal) {
      result = result.filter((row) => {
        return this.columns().some((col) => {
          const val = this.getCellValue(row, col.field);
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(searchVal);
        });
      });
    }

    // 2. Quick Column Filters
    const colFilters = this.columnFilterValues();
    Object.keys(colFilters).forEach((field) => {
      const filterVal = colFilters[field];
      if (filterVal) {
        result = result.filter((row) => {
          const cellVal = this.getCellValue(row, field);
          if (cellVal === null || cellVal === undefined) return false;
          return (
            String(cellVal).toLowerCase() === String(filterVal).toLowerCase()
          );
        });
      }
    });

    // 3. Date Range Filter
    const fromDate = this.dateRangeFrom();
    const toDate = this.dateRangeTo();
    if (fromDate || toDate) {
      const dateCol = this.columns().find((c) => c.type === "date");
      if (dateCol) {
        result = result.filter((row) => {
          const cellVal = this.getCellValue(row, dateCol.field);
          if (!cellVal) return false;
          const cellTime = new Date(cellVal).getTime();

          if (fromDate) {
            const fromTime = new Date(fromDate + "T00:00:00").getTime();
            if (cellTime < fromTime) return false;
          }
          if (toDate) {
            const toTime = new Date(toDate + "T23:59:59").getTime();
            if (cellTime > toTime) return false;
          }
          return true;
        });
      }
    }

    // 4. Advanced Custom Rules Builder
    const advRules = this.appliedAdvancedRules();
    if (advRules.length > 0) {
      result = result.filter((row) => {
        return advRules.every((rule) => {
          const cellVal = this.getCellValue(row, rule.field);
          if (cellVal === null || cellVal === undefined) return false;

          const strVal = String(cellVal).toLowerCase();
          const targetVal = String(rule.value).toLowerCase();

          switch (rule.operator) {
            case "contains":
              return strVal.includes(targetVal);
            case "notContains":
              return !strVal.includes(targetVal);
            case "equals":
              return strVal === targetVal;
            case "greaterThan":
              return Number(cellVal) > Number(rule.value);
            case "lessThan":
              return Number(cellVal) < Number(rule.value);
            case "between":
              const numVal = Number(cellVal);
              const min = Number(rule.value);
              const max = Number(rule.value2);
              return numVal >= min && numVal <= max;
            case "before":
              return (
                new Date(cellVal).getTime() < new Date(rule.value).getTime()
              );
            case "after":
              return (
                new Date(cellVal).getTime() > new Date(rule.value).getTime()
              );
            default:
              return true;
          }
        });
      });
    }

    return result;
  });

  // Client-side sorting pipeline
  sortedData = computed(() => {
    const filtered = this.filteredData();
    if (this.serverSide()) {
      return filtered; // Skip sorting in server-side mode
    }

    const sorts = this.sortStates();
    if (sorts.length === 0) return filtered;

    const result = [...filtered];
    return result.sort((a, b) => {
      for (const sort of sorts) {
        const valA = this.getCellValue(a, sort.field);
        const valB = this.getCellValue(b, sort.field);

        if (valA === valB) continue;

        let comparison = 0;
        if (typeof valA === "number" && typeof valB === "number") {
          comparison = valA - valB;
        } else if (valA instanceof Date && valB instanceof Date) {
          comparison = valA.getTime() - valB.getTime();
        } else {
          comparison = String(valA).localeCompare(String(valB));
        }

        return sort.dir === "asc" ? comparison : -comparison;
      }
      return 0;
    });
  });

  // Client-side pagination slice
  displayedData = computed(() => {
    const sorted = this.sortedData();
    if (this.serverSide() || !this.pagination()) {
      return sorted; // Data is already sliced by server
    }

    const start = this.pageIndex() * this.pageSize();
    const end = start + this.pageSize();
    return sorted.slice(start, end);
  });

  // Total records count summary
  totalRecordsCount = computed(() => {
    if (this.serverSide()) {
      return this.totalRecords();
    }
    return this.filteredData().length;
  });

  // Skeleton placeholders shown while data is loading — either the initial load
  // (grid still empty) or an explicit Refresh (existing rows are replaced by the
  // skeleton, matching the first-load experience).
  showSkeleton = computed(
    () =>
      this.loading() &&
      (this.displayedData().length === 0 || this.isRefreshing()),
  );

  skeletonRowCount = computed(() => {
    const size = this.pageSize() || this.skeletonRows();
    return Math.min(this.skeletonRows(), size);
  });

  // Checkbox Selection helper states
  isAllSelected = computed(() => {
    const list = this.displayedData();
    if (list.length === 0) return false;
    return list.every((row) => this.isRowSelected(row));
  });

  isSomeSelected = computed(() => {
    const list = this.displayedData();
    if (list.length === 0) return false;
    const count = list.filter((row) => this.isRowSelected(row)).length;
    return count > 0 && count < list.length;
  });

  // Pagination Foot descriptors
  lastPageIndex = computed(() => {
    const total = this.totalRecordsCount();
    const size = this.pageSize();
    if (total === 0) return 0;
    return Math.ceil(total / size) - 1;
  });

  rowRangeText = computed(() => {
    const total = this.totalRecordsCount();
    if (total === 0) return "0 - 0 of 0";
    const start = this.pageIndex() * this.pageSize() + 1;
    let end = start + this.pageSize() - 1;
    if (end > total) end = total;
    const more = this.hasMore() ? "+" : "";
    return `${start} - ${end} of ${total}${more}`;
  });

  visiblePageNumbers = computed(() => {
    const last = this.lastPageIndex();
    const current = this.pageIndex();
    const pages = [];

    // Display maximum 5 page numbers around the current page
    let start = Math.max(0, current - 2);
    let end = Math.min(last, start + 4);

    if (end - start < 4) {
      start = Math.max(0, end - 4);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });

  // Filter chips aggregate count
  activeChipsCount = computed(() => {
    let count = 0;
    if (this.globalSearch()) count++;
    count += Object.values(this.columnFilterValues()).filter((v) => !!v).length;
    if (this.dateRangeFrom() || this.dateRangeTo()) count++;
    count += this.appliedAdvancedRules().length;
    return count;
  });


  // --- Core Utility Functions ---

  // Read nested fields (e.g. 'customer.name')
  getCellValue(row: any, field: string): any {
    if (!row || !field) return "";
    return field.split(".").reduce((acc, part) => acc && acc[part], row);
  }

  // Emitted when a hyperlink cell (GridColumn.isLink) is clicked.
  // For real <a> cells (linkHref set), a modified click (Ctrl/Cmd/Shift/middle)
  // is left to the browser so it opens in a new tab; a plain left-click is
  // intercepted and emitted for in-app (current-tab) navigation.
  onLinkClick(column: GridColumn, row: any, event?: MouseEvent): void {
    if (
      event &&
      (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1)
    ) {
      return; // let the native anchor handle new-tab navigation
    }
    event?.preventDefault();
    this.linkClicked.emit({
      column,
      row,
      value: this.getCellValue(row, column.field),
    });
  }

  // Column width for <th> — in fixed-layout mode returns col.width or a type-based default;
  // in auto mode returns col.width only (undefined leaves the browser to auto-size).
  colThWidth(col: GridColumn): string | null {
    // Equal-width mode (default): every column gets the same share so the grid is
    // split into evenly-sized columns, ignoring per-column `width`.
    if (this.equalColumns()) {
      const n = this.allColumns().length || 1;
      return `${(100 / n).toFixed(4)}%`;
    }
    if (col.width) return col.width;
    if (!this.fixedLayout()) return null;
    if (col.isLink) return '120px';
    switch (col.type) {
      case 'date':     return '140px';
      case 'currency': return '130px';
      case 'status':   return '140px';
      case 'badge':    return '120px';
      case 'provider': return '180px';
      default:         return '160px';
    }
  }

  // Row unique identifier resolver
  getRowId(row: any, index?: number): string {
    if (!row) return String(index || 0);
    if (row.id !== undefined) return String(row.id);
    if (row.paymentId !== undefined) return String(row.paymentId);
    if (row.customerId !== undefined) return String(row.customerId);
    return String(index || 0);
  }

  // Renders a cell to plain text — used by text/link cells AND the CSV export.
  // Handles the non-text column types so the export never dumps a raw object
  // (e.g. "[object Object]" for a provider): a provider cell exports its name, a
  // currency cell its formatted amount, a date cell a readable date.
  formatCellText(row: any, col: GridColumn): string {
    const val = this.getCellValue(row, col.field);
    if (col.valueFormatter) {
      return col.valueFormatter(val, row);
    }
    if (col.type === "provider") return this.providerName(val);
    if (col.type === "currency") return val == null ? "" : this.formatCurrency(val, row);
    if (col.type === "date") return this.formatDateText(val);
    if (val === null || val === undefined) return "";
    // Defensive: any object value → its provider/name, never "[object Object]".
    if (typeof val === "object") return this.providerName(val);
    return String(val);
  }

  // Extracts a provider/display name from a value that may be a PaymentProvider
  // object, a plain string, or any object exposing a name-like field.
  private providerName(val: any): string {
    if (!val) return "";
    if (typeof val === "string") return val;
    return val.provider ?? val.name ?? val.providerName ?? val.friendlyName ?? "";
  }

  private formatDateText(val: any): string {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Format currency cell tabularly
  formatCurrency(value: any, row: any): string {
    const num = Number(value || 0);
    const currency = row.currency || "USD";
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    });
    return formatter.format(num);
  }

  // Get CSS background class for pill badges
  getBadgeClass(value: any, col: GridColumn): string {
    if (!value || !col.badgeMap) return "plain";
    const cleanVal = String(value).trim();
    const mapped = col.badgeMap[cleanVal];
    return mapped ? mapped : "plain";
  }

  trackByRowId = (index: number, row: any): string => {
    return this.getRowId(row, index);
  };

  // --- Filtering Event Handlers ---

  onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.globalSearch.set(val);
      this.pageIndex.set(0);
      this.emitFilterState();
    }, 300);
  }

  clearGlobalSearch(): void {
    this.globalSearch.set("");
    this.emitFilterState();
  }

  // Dynamically compute options for per-column dropdown filters
  getColumnFilterOptions(col: GridColumn): { label: string; value: any }[] {
    if (col.editOptions) {
      return col.editOptions.map((opt) => {
        if (typeof opt === "string") return { label: opt, value: opt };
        return opt;
      });
    }

    // fallback: scan current dataset for unique options
    const unique = new Set<any>();
    this.data().forEach((row) => {
      const val = this.getCellValue(row, col.field);
      if (val !== null && val !== undefined && val !== "") {
        unique.add(val);
      }
    });

    return Array.from(unique).map((v) => ({ label: String(v), value: v }));
  }

  onColumnFilterChange(field: string, event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.columnFilterValues.update((filters) => ({ ...filters, [field]: val }));
    this.pageIndex.set(0);
    this.emitFilterState();
  }

  clearQuickFilter(field: string): void {
    this.columnFilterValues.update((filters) => ({ ...filters, [field]: "" }));
    this.emitFilterState();
  }

  toggleDropdown(dropdownId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.activeDropdown.update((cur) =>
      cur === dropdownId ? null : dropdownId,
    );
  }

  selectOption(field: string, value: any): void {
    const strVal = value !== null && value !== undefined ? String(value) : "";
    this.columnFilterValues.update((filters) => ({
      ...filters,
      [field]: strVal,
    }));
    this.activeDropdown.set(null);
    this.pageIndex.set(0);
    this.emitFilterState();
  }

  isOptionSelected(field: string, optValue: any): boolean {
    const current = this.columnFilterValues()[field] || "";
    const strOpt =
      optValue !== null && optValue !== undefined ? String(optValue) : "";
    return current === strOpt;
  }

  getSelectedLabel(col: GridColumn): string {
    const current = this.columnFilterValues()[col.field];
    if (!current) return `All ${col.header.toLowerCase()}`;
    const opts = this.getColumnFilterOptions(col);
    return opts.find((o) => String(o.value) === current)?.label || current;
  }

  selectPageSize(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(0);
    this.activeDropdown.set(null);
    this.paginationChanged.emit({
      pageIndex: 0,
      pageSize: size,
    });
  }

  closeDropdowns(): void {
    this.activeDropdown.set(null);
    this.advancedFilterPanelOpen.set(false);
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    this.closeDropdowns();
  }

  onDateRangeChange(range: DateRange): void {
    this.dateRangeFrom.set(range.from);
    this.dateRangeTo.set(range.to);
    this.pageIndex.set(0);
    this.emitFilterState();
  }

  clearDateRange(): void {
    this.dateRangeFrom.set(null);
    this.dateRangeTo.set(null);
    this.pageIndex.set(0);
    this.emitFilterState();
  }

  clearAllFilters(): void {
    this.globalSearch.set("");
    this.columnFilterValues.set({});
    this.dateRangeFrom.set(null);
    this.dateRangeTo.set(null);
    this.advancedRules.set([]);
    this.appliedAdvancedRules.set([]);
    this.emitFilterState();
  }

  // --- Advanced Rules Builder Logic ---

  toggleAdvancedFilterPanel(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.advancedFilterPanelOpen.update((v) => !v);
  }

  addAdvancedRule(): void {
    const cols = this.columns();
    if (cols.length === 0) return;
    const defaultCol = cols[0];
    const newRule: AdvancedFilterRule = {
      id: Math.random().toString(36).substring(2, 9),
      field: defaultCol.field,
      operator: "contains",
      value: "",
    };
    this.advancedRules.update((rules) => [...rules, newRule]);
  }

  removeAdvancedRule(ruleId: string): void {
    this.advancedRules.update((rules) => rules.filter((r) => r.id !== ruleId));
  }

  updateRuleField(idx: number, event: Event): void {
    const field = (event.target as HTMLSelectElement).value;
    this.advancedRules.update((rules) => {
      const next = [...rules];
      next[idx] = { ...next[idx], field, value: "" };
      return next;
    });
  }

  updateRuleOperator(idx: number, event: Event): void {
    const operator = (event.target as HTMLSelectElement)
      .value as FilterOperator;
    this.advancedRules.update((rules) => {
      const next = [...rules];
      next[idx] = { ...next[idx], operator };
      return next;
    });
  }

  updateRuleValue(idx: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.advancedRules.update((rules) => {
      const next = [...rules];
      next[idx] = { ...next[idx], value };
      return next;
    });
  }

  updateRuleValue2(idx: number, event: Event): void {
    const value2 = (event.target as HTMLInputElement).value;
    this.advancedRules.update((rules) => {
      const next = [...rules];
      next[idx] = { ...next[idx], value2 };
      return next;
    });
  }

  applyAdvancedFilters(): void {
    this.appliedAdvancedRules.set([...this.advancedRules()]);
    this.advancedFilterPanelOpen.set(false);
    this.pageIndex.set(0);
    this.emitFilterState();
  }

  clearAdvancedRules(): void {
    this.advancedRules.set([]);
    this.appliedAdvancedRules.set([]);
    this.advancedFilterPanelOpen.set(false);
    this.emitFilterState();
  }

  removeAppliedRule(ruleId: string): void {
    this.appliedAdvancedRules.update(rules => rules.filter(r => r.id !== ruleId));
    this.advancedRules.update(rules => rules.filter(r => r.id !== ruleId));
    this.emitFilterState();
  }

  formatRuleChipLabel(rule: AdvancedFilterRule): string {
    const col = this.columns().find(c => c.field === rule.field);
    const header = col?.header || rule.field;
    const opLabels: Record<string, string> = {
      contains: 'contains', notContains: 'not contains', equals: '=',
      greaterThan: '>', lessThan: '<', between: 'between', before: 'before', after: 'after',
    };
    const op = opLabels[rule.operator] || rule.operator;
    if (rule.operator === 'between') return `${header} ${op} ${rule.value} – ${rule.value2 ?? ''}`;
    return `${header} ${op} ${rule.value}`;
  }

  isDateColumnField(field: string): boolean {
    return this.columns().some((c) => c.field === field && c.type === "date");
  }

  getFieldInputType(field: string): string {
    const col = this.columns().find((c) => c.field === field);
    if (col?.type === "date") return "date";
    if (col?.type === "number" || col?.type === "currency") return "number";
    return "text";
  }

  getColumnHeader(field: string): string {
    return this.columns().find((c) => c.field === field)?.header || field;
  }

  getFilterLabel(field: string, val: string): string {
    const col = this.columns().find((c) => c.field === field);
    if (!col) return val;
    const opts = this.getColumnFilterOptions(col);
    return opts.find((o) => String(o.value) === val)?.label || val;
  }

  private emitFilterState(): void {
    this.filterChanged.emit({
      globalSearch: this.globalSearch(),
      columnFilters: this.columnFilterValues(),
      advancedFilters: this.appliedAdvancedRules(),
    });
  }

  // --- Sorting Logic ---

  getSortDirection(field: string): "asc" | "desc" | null {
    const match = this.sortStates().find((s) => s.field === field);
    return match ? match.dir : null;
  }

  onHeaderSort(col: GridColumn): void {
    if (col.isSortable === false) return;

    this.sortStates.update((sorts) => {
      const match = sorts.find((s) => s.field === col.field);
      if (!match) {
        // Toggle single sort by default (clear others)
        return [{ field: col.field, dir: "asc" }];
      } else if (match.dir === "asc") {
        return [{ field: col.field, dir: "desc" }];
      } else {
        return [];
      }
    });

    this.sortingChanged.emit(this.sortStates());
  }

  // --- Pagination Logic ---

  setPage(idx: number): void {
    if (idx < 0) return;
    const last = this.lastPageIndex();

    if (idx > last) {
      // Past the loaded data — request the next chunk if available.
      if (this.hasMore()) this.loadMore.emit();
      return;
    }

    this.pageIndex.set(idx);
    this.paginationChanged.emit({
      pageIndex: idx,
      pageSize: this.pageSize(),
    });

    // Batched mode: prefetch the next chunk when we reach the last loaded page.
    if (idx >= last && this.hasMore()) {
      this.loadMore.emit();
    }
  }

  onPageSizeChange(event: Event): void {
    const size = Number((event.target as HTMLSelectElement).value);
    this.pageSize.set(size);
    this.pageIndex.set(0);
    this.paginationChanged.emit({
      pageIndex: 0,
      pageSize: size,
    });
  }

  // --- Selection Logic ---

  isRowSelected(row: any): boolean {
    const id = this.getRowId(row);
    return this.selectedRows().some((r) => this.getRowId(r) === id);
  }

  toggleRowSelection(row: any, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    const id = this.getRowId(row);

    if (this.selectionMode() === "single") {
      if (isChecked) {
        this.selectedRows.set([row]);
      } else {
        this.selectedRows.set([]);
      }
    } else if (this.selectionMode() === "multiple") {
      if (isChecked) {
        this.selectedRows.update((list) => [...list, row]);
      } else {
        this.selectedRows.update((list) =>
          list.filter((r) => this.getRowId(r) !== id),
        );
      }
    }

    this.rowSelectionChanged.emit(this.selectedRows());
  }

  toggleAllRows(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    const list = this.displayedData();

    if (isChecked) {
      // Append all displayed rows to selected list (no duplicates)
      this.selectedRows.update((current) => {
        const next = [...current];
        list.forEach((row) => {
          if (!next.some((r) => this.getRowId(r) === this.getRowId(row))) {
            next.push(row);
          }
        });
        return next;
      });
    } else {
      // Remove all displayed rows from selected list
      const idsToRemove = new Set(list.map((row) => this.getRowId(row)));
      this.selectedRows.update((current) => {
        return current.filter((row) => !idsToRemove.has(this.getRowId(row)));
      });
    }

    this.rowSelectionChanged.emit(this.selectedRows());
  }

  // --- Toolbar & Action Handlers ---

  onRefresh(): void {
    // Show the full skeleton (not the thin loading bar) while the host reloads.
    this.isRefreshing.set(true);
    this.refreshRequested.emit();
  }

  onExport(): void {
    const dataset = this.serverSide() ? this.data() : this.filteredData();
    if (dataset.length === 0) return;

    // Compose CSV string in memory
    const headers = this.columns()
      .map((c) => `"${c.header.replace(/"/g, '""')}"`)
      .join(",");
    const rows = dataset.map((row) => {
      return this.columns()
        .map((col) => {
          const text = this.formatCellText(row, col);
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(",");
    });

    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${this.title().toLowerCase().replace(/\s+/g, "_")}_export.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
