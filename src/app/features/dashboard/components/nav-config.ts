export interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: string;
  /** Permission scope required to display this item. Absent = always visible. */
  permission?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Full nav definition with permission scopes.
 * The sidebar component filters these by PermissionStore at render time.
 */
export function buildNavGroups(appId: string): NavGroup[] {
  return [
    {
      label: 'Overview',
      items: [
        // Overview is always visible — the guard redirects to /payments when
        // DashboardRead is missing rather than hiding it from the sidebar.
        { label: 'Overview', icon: 'monitoring', route: `/${appId}/overview` },
      ],
    },
    {
      label: 'Operations',
      items: [
        { label: 'Payments',      icon: 'receipt_long', route: `/${appId}/payments`,  permission: 'PaymentRead'      },
        { label: 'Gateways',      icon: 'hub',          route: `/${appId}/gateways`,  permission: 'GatewayListRead'  },
        { label: 'Customers',     icon: 'group',        route: `/${appId}/customers`, permission: 'CustomerRead'     },
        { label: 'Fraud Policies',icon: 'shield',       route: `/${appId}/policies`,  permission: 'FraudPolicyRead'  },
      ],
    },
  ];
}

export interface UserMenuItem {
  label: string;
  icon: string;
  route?: string;
  action?: 'signout';
  /** Permission scope required to display this user-menu item. Absent = always visible. */
  permission?: string;
}

export function buildUserMenuItems(appId: string): UserMenuItem[] {
  return [
    { label: 'Team',     icon: 'badge',         route: `/${appId}/team`,        permission: 'RoleRead'       },
    { label: 'Billing',  icon: 'request_quote', route: `/${appId}/billing`                                   },
    { label: 'Settings', icon: 'settings',      route: `/${appId}/app-setting`, permission: 'AppSettingRead' },
    { label: 'Sign out', icon: 'logout',        action: 'signout'                                            },
  ];
}

