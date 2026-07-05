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
  FraudPoliciesClient,
  FraudPolicy,
  CreateFraudPolicyRequest,
} from "@proxy/payment-app-proxy";
import { WorkspaceStore } from "@core/stores/workspace.store";
import { PermissionStore } from "@core/stores/permission.store";
import { NotificationService } from "@core/services/notification.service";
import { DataGridComponent } from "@shared/components/data-grid/data-grid.component";
import { GridColumn } from "@shared/components/data-grid/data-grid.interface";

@Component({
  selector: "app-policies",
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent],
  template: `
    <app-data-grid
      title="Policies"
      [fill]="true"
      [searchInToolbar]="true"
      [data]="policies()"
      [columns]="gridColumns"
      [loading]="loading()"
      [defaultPageSize]="10"
      [rowActionsTemplate]="canWrite() ? rowActions : null"
      (refreshRequested)="loadPolicies()"
      (linkClicked)="onLinkClicked($event)"
    >
      @if (canWrite()) {
        <div toolbar-actions>
          <button class="btn btn-sm btn-primary" (click)="openCreate()">
            <span class="material-symbols-outlined">add</span>
            New policy
          </button>
        </div>
      }
    </app-data-grid>

    <!-- Name cell: name + inline "Default" badge -->
    <ng-template #nameTpl let-value let-row="row">
      <span class="name-cell">
        {{ value }}
        @if (row.isDefault) {
          <span class="badge-default">Default</span>
        }
      </span>
    </ng-template>

    <!-- Row action: open the editor -->
    <ng-template #rowActions let-row>
      <button class="icon-btn" (click)="openEditor(row)" title="Edit policy">
        <span class="material-symbols-outlined">edit</span>
      </button>
    </ng-template>

    <!-- Create policy modal (backdrop click does NOT close) -->
    <div class="overlay" [class.open]="createOpen()">
      <div class="modal">
        <div class="mh">
          <span class="material-symbols-outlined brand-ic">shield</span>
          <h3>New policy</h3>
          <div class="spacer"></div>
          <button class="icon-btn" (click)="closeCreate()" [disabled]="creating()" title="Close">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="mb">
          <div class="field">
            <label>Policy name *</label>
            <input
              class="input"
              [(ngModel)]="createForm.name"
              placeholder="e.g. High-risk subscriptions"
              [disabled]="creating()"
            />
          </div>
          <p class="err" *ngIf="createError()">
            <span class="material-symbols-outlined">error</span>{{ createError() }}
          </p>
        </div>
        <div class="mf">
          <div class="spacer"></div>
          <button class="btn" (click)="closeCreate()" [disabled]="creating()">Cancel</button>
          <button class="btn btn-primary" (click)="createPolicy()" [disabled]="creating()">
            <span class="material-symbols-outlined" [class.spin]="creating()">add</span>
            {{ creating() ? "Creating…" : "Create policy" }}
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ["./policies.component.scss"],
})
export class PoliciesComponent implements OnInit {
  private readonly fraudClient = inject(FraudPoliciesClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly permissionStore = inject(PermissionStore);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  @ViewChild("nameTpl", { static: true }) nameTpl!: TemplateRef<any>;

  /** True when the current user holds FraudPolicyWrite. */
  readonly canWrite = computed(() => this.permissionStore.hasPermission('FraudPolicyWrite'));

  readonly policies = signal<FraudPolicy[]>([]);
  readonly loading = signal(false);

  readonly createOpen = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  createForm = { name: "" };

  gridColumns: GridColumn[] = [];

  ngOnInit(): void {
    this.gridColumns = [
      {
        id: "fraudPolicyId",
        header: "ID",
        field: "fraudPolicyId",
        width: "120px",
        isSortable: true,
        isFilterable: true,
        isLink: true,
        linkHref: (row: any) => this.policyUrl(row.fraudPolicyId),
      },
      {
        id: "fraudPolicyName",
        header: "Name",
        field: "fraudPolicyName",
        type: "custom",
        customTemplate: this.nameTpl,
        isSortable: true,
        isFilterable: true,
      },
    ];

    this.loadPolicies();
  }

  async loadPolicies(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.fraudClient.list(appId));
      // Default policy sorts first, mirroring payment-admin.
      const sorted = [...(list ?? [])].sort(
        (a, b) => Number(b.isDefault) - Number(a.isDefault)
      );
      this.policies.set(sorted);
    } catch (err: any) {
      this.notify.showError(this.extractError(err, "Failed to load fraud policies."));
      this.policies.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  // --- Navigation to the editor ---

  onLinkClicked(event: { column: GridColumn; row: any; value: any }): void {
    this.openEditor(event.row);
  }

  openEditor(policy: FraudPolicy): void {
    const appId = this.workspaceStore.currentAppId();
    if (appId) this.router.navigate(["/", appId, "policies", policy.fraudPolicyId]);
  }

  private policyUrl(policyId: number): string {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return "";
    return this.router.serializeUrl(
      this.router.createUrlTree(["/", appId, "policies", policyId])
    );
  }

  // --- Create flow ---

  openCreate(): void {
    this.createForm = { name: "" };
    this.createError.set(null);
    this.creating.set(false);
    this.createOpen.set(true);
  }

  closeCreate(): void {
    if (this.creating()) return;
    this.createOpen.set(false);
  }

  async createPolicy(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    const name = this.createForm.name.trim();
    if (!name) {
      this.createError.set("Policy name is required.");
      return;
    }

    this.creating.set(true);
    this.createError.set(null);
    try {
      // Create with ONLY the name — a plain-object cast so the request body
      // carries just fraudPolicyName (not the class toJSON that emits every field).
      const req = { fraudPolicyName: name } as CreateFraudPolicyRequest;
      const created = await firstValueFrom(this.fraudClient.create(appId, req));
      this.notify.showSuccess("Policy created");
      this.createOpen.set(false);
      // Jump straight into the full editor for the new policy.
      if (created) {
        this.router.navigate(["/", appId, "policies", created.fraudPolicyId]);
      }
    } catch (err: any) {
      this.createError.set(this.extractError(err, "Failed to create policy."));
    } finally {
      this.creating.set(false);
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
