import { Component, signal, inject } from "@angular/core";
import { NgClass } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NotificationService } from "@core/services/notification.service";
import { EditFieldConfig } from "./universal-edit-modal.interface";

/**
 * Universal field editor — THE single reusable modal for editing ONE scalar field
 * (text, number, boolean, select, textarea, password) anywhere in the app. Use it
 * for every "pencil" edit (grids, detail pages, settings) — do not hand-roll inline
 * inputs or one-off edit modals.
 *
 * RULES (every caller must follow):
 *  1. Dismiss ONLY via the Cancel button or the X. The backdrop is NOT clickable and
 *     there is no Escape-to-close; `close()` is also blocked while a save is in flight.
 *     (Enforced here + in the template.)
 *  2. PATCH ONLY the edited field. The `save` callback receives just this field's new
 *     value. Build the request as a PLAIN-OBJECT CAST with only that one field —
 *     `{ field: patchOf(v) } as XUpdateRequest` — NEVER `new XUpdateRequest()`, whose
 *     generated `toJSON()` force-sends every field (the others as null) and would wipe
 *     them. See memory: single-field-patch-plain-object. `patchOf` ← `@core/utils/patch.util`.
 *
 * Usage:
 *   <app-universal-edit-modal #editor />
 *   editor.open({ title: 'Edit name', label: 'Name', type: 'text', value: row.name,
 *                 save: async (v) => {
 *                   const req = { name: patchOf(v) } as XUpdateRequest;  // ONLY this field
 *                   await firstValueFrom(client.update(id, req));
 *                 } });
 */
@Component({
  selector: "app-universal-edit-modal",
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: "./universal-edit-modal.component.html",
  styleUrls: ["./universal-edit-modal.component.scss"],
})
export class UniversalEditModalComponent {
  private readonly notify = inject(NotificationService);

  readonly isOpen = signal(false);
  readonly saving = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly fieldInvalid = signal(false);
  readonly config = signal<EditFieldConfig | null>(null);

  /** Local editable copy of the value, decoupled from the source row. */
  readonly localValue = signal<any>(null);
  readonly localBool = signal<boolean>(false);

  open(config: EditFieldConfig): void {
    this.errorMsg.set(null);
    this.fieldInvalid.set(false);
    this.saving.set(false);
    this.config.set(config);
    if (config.type === "boolean") {
      this.localBool.set(Boolean(config.value));
      this.localValue.set(Boolean(config.value));
    } else {
      this.localValue.set(config.value ?? "");
    }
    this.isOpen.set(true);
  }

  close(): void {
    if (this.saving()) return;
    this.isOpen.set(false);
  }

  onBoolChange(checked: boolean): void {
    this.localBool.set(checked);
    this.localValue.set(checked);
    this.fieldInvalid.set(false);
  }

  onSelectChange(value: any): void {
    this.localValue.set(value);
    this.fieldInvalid.set(false);
  }

  onInputChange(value: any): void {
    this.localValue.set(value);
    this.fieldInvalid.set(false);
  }

  async save(): Promise<void> {
    const cfg = this.config();
    if (!cfg) return;

    let newValue =
      cfg.type === "boolean" ? this.localBool() : this.localValue();

    // MANDATORY BY DEFAULT. A field is optional ONLY when `required: false` is set
    // explicitly by the caller — never assumed here.
    const optional = cfg.required === false;
    const isBlank =
      cfg.type !== "boolean" &&
      (newValue === null ||
        newValue === undefined ||
        String(newValue).trim() === "");

    // Mandatory field left blank → reject.
    if (!optional && isBlank) {
      this.fieldInvalid.set(true);
      return;
    }

    // Optional field left blank → save as null ("no value").
    if (optional && isBlank) {
      newValue = null;
    }

    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      await cfg.save(newValue);
      this.notify.showSuccess(cfg.successMessage ?? `${cfg.label} updated`);
      this.isOpen.set(false);
    } catch (err: any) {
      const msg =
        err?.response?.message ||
        err?.message ||
        err?.exceptionMessage ||
        "Failed to update field. Please try again.";
      const finalMsg = typeof msg === "string" ? msg : "Failed to update field.";
      if (cfg.errorDisplay === "toast") {
        this.notify.showError(finalMsg);
      } else {
        this.errorMsg.set(finalMsg);
      }
    } finally {
      this.saving.set(false);
    }
  }
}
