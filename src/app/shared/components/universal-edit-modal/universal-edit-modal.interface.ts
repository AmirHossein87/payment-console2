export type EditFieldType =
  "text" | "number" | "boolean" | "select" | "textarea" | "password";

export interface EditFieldOption {
  label: string;
  value: any;
}

/**
 * Declarative description of a single field to edit through the universal modal.
 * The host supplies a `save` callback that receives only the new field value
 * and performs the PATCH request (e.g. via patchOf(v)).
 */
export type NoticeType = 'info' | 'warning' | 'danger';

export interface EditFieldNotice {
  message: string;
  type: NoticeType;
}

export interface EditFieldConfig {
  title: string;
  label: string;
  type: EditFieldType;
  value: any;
  options?: EditFieldOption[];
  placeholder?: string;
  /**
   * Fields are MANDATORY by default (blank/empty is rejected) — even when this is
   * omitted. Set `required: false` ONLY to make a specific field optional; then
   * validation is skipped and a blank value is passed to `save` as `null`.
   * Optionality must be explicit — never assumed.
   */
  required?: boolean;
  helper?: string;
  helperClass?: string;
  icon?: string;
  /** Optional alert banner shown above the field (info / warning / danger). */
  notice?: EditFieldNotice;
  /** Overrides the default success toast ("{label} updated") shown after save. */
  successMessage?: string;
  /**
   * Where a save failure is surfaced. Default 'inline' shows it in the modal
   * footer (matches the field-level validation UX) and keeps the modal open so
   * the user can retry. 'toast' shows it via the global NotificationService
   * instead — use for callers where the modal doesn't stay open long enough,
   * or a global toast fits the surrounding UI better.
   */
  errorDisplay?: 'inline' | 'toast';
  save: (newValue: any) => Promise<void>;
}
