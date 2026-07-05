import { TemplateRef } from "@angular/core";

export type ColumnType =
  | "text"
  | "badge"
  | "status"
  | "icon"
  | "date"
  | "currency"
  | "number"
  | "provider"
  | "custom";
export type ColumnAlign = "left" | "right" | "center";

export interface GridColumn {
  id: string;
  header: string;
  field: string; // supports dot notation e.g., 'customer.email'
  type?: ColumnType;
  align?: ColumnAlign;
  width?: string; // e.g. '150px', '2fr', 'minmax(100px, 1fr)'
  isSortable?: boolean;
  isFilterable?: boolean;
  isLink?: boolean; // render the cell as a clickable hyperlink; emits (linkClicked)
  // Optional href builder for a link cell. When provided the cell renders a real
  // <a href> so the browser handles Ctrl/Cmd/middle-click natively (open in new
  // tab); a plain left-click is intercepted and emits (linkClicked) instead.
  linkHref?: (row: any) => string;
  badgeMap?: { [key: string]: string }; // maps cell value to pill class e.g. { 'Captured': 'ok', 'Pending': 'warn' }
  iconSize?: number; // pixel size override for a 'provider' column's logo (default 52)
  editOptions?: (string | { label: string; value: any })[]; // options for the quick column-filter dropdown
  valueFormatter?: (value: any, row: any) => string;
  customTemplate?: TemplateRef<any>;
}

export type FilterOperator =
  | "contains"
  | "notContains"
  | "equals"
  | "greaterThan"
  | "lessThan"
  | "between"
  | "before"
  | "after";

export interface AdvancedFilterRule {
  id: string; // unique ID for rules list
  field: string;
  operator: FilterOperator;
  value: any;
  value2?: any; // for ranges
}

export interface GridPaginationState {
  pageIndex: number; // 0-based
  pageSize: number;
}

export interface GridSortState {
  field: string;
  dir: "asc" | "desc" | null;
}
