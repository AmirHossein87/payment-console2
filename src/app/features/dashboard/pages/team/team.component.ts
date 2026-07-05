import {
  Component,
  computed,
  signal,
  inject,
  ViewChild,
  TemplateRef,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TeamClient, TeamUserRole, Role } from '@proxy/payment-app-proxy';
import { WorkspaceStore } from '@core/stores/workspace.store';
import { PermissionStore } from '@core/stores/permission.store';
import { NotificationService } from '@core/services/notification.service';
import { DataGridComponent } from '@shared/components/data-grid/data-grid.component';
import { GridColumn } from '@shared/components/data-grid/data-grid.interface';
import { UniversalEditModalComponent } from '@shared/components/universal-edit-modal/universal-edit-modal.component';

interface TeamRow {
  userId: string;
  email: string;
  displayName: string;
  roleName: string;
  roleId: string;
  isBot: boolean;
  isOwner: boolean;
  isDisabled: boolean;
  createdTime: Date | null;
}

const ROLE_PILL: Record<string, string> = {
  owner: 'info',
  admin: 'violet',
  manager: 'ok',
  viewer: 'muted',
  bot: 'muted',
};

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, UniversalEditModalComponent],
  templateUrl: './team.component.html',
  styleUrls: ['./team.component.scss'],
})
export class TeamComponent implements OnInit {
  @ViewChild('memberTemplate', { static: true }) memberTemplate!: TemplateRef<any>;
  @ViewChild('roleTemplate', { static: true }) roleTemplate!: TemplateRef<any>;
  @ViewChild('statusTemplate', { static: true }) statusTemplate!: TemplateRef<any>;
  @ViewChild('actionsTemplate', { static: true }) actionsTemplate!: TemplateRef<any>;
  @ViewChild('editModal') editModal!: UniversalEditModalComponent;

  private readonly teamClient = inject(TeamClient);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly permissionStore = inject(PermissionStore);
  private readonly notify = inject(NotificationService);

  /** True when the current user holds RoleWrite — controls action buttons and modals. */
  readonly canWrite = computed(() => this.permissionStore.hasPermission('RoleWrite'));

  readonly rows = signal<TeamRow[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly loading = signal(false);

  // Add member
  readonly addMemberOpen = signal(false);
  readonly addMemberSaving = signal(false);
  addMemberEmail = '';
  addMemberRoleId = '';
  addMemberTried = false;

  // Add bot
  readonly addBotOpen = signal(false);
  readonly addBotSaving = signal(false);
  readonly botToken = signal('');
  addBotName = '';
  addBotTried = false;

  // Delete
  readonly confirmDeleteRow = signal<TeamRow | null>(null);
  readonly deleting = signal(false);

  gridColumns: GridColumn[] = [];

  ngOnInit(): void {
    this.gridColumns = [
      {
        id: 'member',
        header: 'Member',
        field: 'displayName',
        type: 'custom',
        customTemplate: this.memberTemplate,
        width: '220px',
        isSortable: true,
        isFilterable: true,
      },
      {
        id: 'email',
        header: 'Email',
        field: 'email',
        isSortable: true,
        isFilterable: true,
      },
      {
        id: 'role',
        header: 'Role',
        field: 'roleName',
        type: 'custom',
        customTemplate: this.roleTemplate,
        width: '130px',
        isSortable: true,
        isFilterable: true,
      },
      {
        id: 'status',
        header: 'Status',
        field: 'isDisabled',
        type: 'custom',
        customTemplate: this.statusTemplate,
        width: '110px',
      },
      {
        id: 'actions',
        header: '',
        field: '__actions',
        type: 'custom',
        customTemplate: this.actionsTemplate,
        width: '80px',
      },
    ];

    this.loadTeam();
  }

  async loadTeam(): Promise<void> {
    const appId = this.workspaceStore.currentAppId();
    if (!appId) return;

    this.loading.set(true);
    try {
      const [membersResult, rolesResult] = await Promise.all([
        firstValueFrom(this.teamClient.listUserRoles(appId)),
        firstValueFrom(this.teamClient.getRoles(appId)),
      ]);
      this.roles.set(rolesResult ?? []);
      this.rows.set((membersResult?.items ?? []).map(m => this.toRow(m)));
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to load team members.'));
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  onLinkClicked(event: { column: GridColumn; row: TeamRow; value: any }): void {
    const row = event.row;
    if (row.isBot || row.isOwner) return;
    this.openEditRole(row);
  }

  openEditRole(row: TeamRow): void {
    const appId = this.workspaceStore.currentAppId();
    if (!appId || row.isBot) return;
    this.editModal.open({
      title: 'Change Role',
      label: 'Role',
      icon: 'manage_accounts',
      type: 'select',
      value: row.roleId,
      options: this.roles()
        .filter(r => r.roleName.toLowerCase() !== 'bot')
        .map(r => ({ label: r.roleName, value: r.roleId })),
      required: true,
      errorDisplay: 'toast',
      save: async (newRoleId: string) => {
        await firstValueFrom(this.teamClient.addUser(appId, newRoleId, row.userId));
        await this.loadTeam();
      },
    });
  }

  // --- Add Member ---
  openAddMember(): void {
    this.addMemberEmail = '';
    this.addMemberRoleId =
      this.roles().find(r => r.roleName.toLowerCase() !== 'bot')?.roleId ?? '';
    this.addMemberTried = false;
    this.addMemberOpen.set(true);
  }

  closeAddMember(): void {
    if (this.addMemberSaving()) return;
    this.addMemberOpen.set(false);
  }

  async confirmAddMember(): Promise<void> {
    this.addMemberTried = true;
    const appId = this.workspaceStore.currentAppId();
    if (!appId || !this.addMemberEmail.trim() || !this.addMemberRoleId) return;

    this.addMemberSaving.set(true);
    try {
      await firstValueFrom(
        this.teamClient.addUserByEmail(appId, this.addMemberRoleId, this.addMemberEmail.trim())
      );
      this.notify.showSuccess('Member added');
      this.addMemberOpen.set(false);
      await this.loadTeam();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to add member.'));
    } finally {
      this.addMemberSaving.set(false);
    }
  }

  // --- Add Bot ---
  openAddBot(): void {
    this.addBotName = '';
    this.botToken.set('');
    this.addBotTried = false;
    this.addBotOpen.set(true);
  }

  closeAddBot(): void {
    if (this.addBotSaving()) return;
    this.addBotOpen.set(false);
    this.botToken.set('');
  }

  async confirmAddBot(): Promise<void> {
    this.addBotTried = true;
    const appId = this.workspaceStore.currentAppId();
    if (!appId || !this.addBotName.trim()) return;

    this.addBotSaving.set(true);
    try {
      const apiKey = await firstValueFrom(
        this.teamClient.addBot(appId, this.addBotName.trim())
      );
      const scheme = apiKey?.accessToken?.scheme ?? '';
      const value = apiKey?.accessToken?.value ?? '';
      this.botToken.set(scheme ? `${scheme} ${value}` : value);
      await this.loadTeam();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to create bot.'));
    } finally {
      this.addBotSaving.set(false);
    }
  }

  async copyBotToken(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.botToken());
      this.notify.showSuccess('Token copied to clipboard');
    } catch { /* clipboard unavailable */ }
  }

  // --- Delete ---
  askDelete(row: TeamRow): void {
    this.confirmDeleteRow.set(row);
  }

  cancelDelete(): void {
    if (this.deleting()) return;
    this.confirmDeleteRow.set(null);
  }

  async doDelete(): Promise<void> {
    const row = this.confirmDeleteRow();
    const appId = this.workspaceStore.currentAppId();
    if (!row || !appId) return;

    this.deleting.set(true);
    try {
      await firstValueFrom(this.teamClient.removeUser(appId, row.roleId, row.userId));
      this.notify.showSuccess(`${row.isBot ? 'Bot' : 'Member'} removed`);
      this.confirmDeleteRow.set(null);
      await this.loadTeam();
    } catch (err: any) {
      this.notify.showError(this.extractError(err, 'Failed to remove member.'));
    } finally {
      this.deleting.set(false);
    }
  }

  // --- Helpers ---
  initials(row: TeamRow): string {
    const n = row.displayName || row.email;
    return n ? n.slice(0, 2).toUpperCase() : '?';
  }

  avatarGrad(seed: string): string {
    const palette = [
      '#f59e0b,#ef4444',
      '#6366f1,#8b5cf6',
      '#10b981,#059669',
      '#0ea5e9,#06b6d4',
      '#db2777,#9d174d',
      '#3880ff,#1f5bd0',
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return `linear-gradient(135deg, ${palette[Math.abs(hash) % palette.length]})`;
  }

  rolePillClass(roleName: string): string {
    return ROLE_PILL[roleName.toLowerCase()] ?? 'muted';
  }

  private toRow(m: TeamUserRole): TeamRow {
    const name =
      [m.user?.firstName, m.user?.lastName].filter(Boolean).join(' ') ||
      m.user?.name ||
      m.user?.email ||
      m.userId;
    const roleLower = (m.role?.roleName ?? '').toLowerCase();
    return {
      userId: m.userId,
      email: m.user?.email || m.userId,
      displayName: name || '',
      roleName: m.role?.roleName ?? '',
      roleId: m.role?.roleId ?? '',
      isBot: m.user?.isBot ?? false,
      isOwner: roleLower === 'owner',
      isDisabled: m.user?.isDisabled ?? false,
      createdTime: m.user?.createdTime ?? null,
    };
  }

  protected extractError(err: any, fallback: string): string {
    return err?.response?.message || err?.message || err?.exceptionMessage || fallback;
  }
}
