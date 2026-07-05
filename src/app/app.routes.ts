import { Routes, UrlSegment, UrlSegmentGroup, Route, UrlMatchResult } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { licenseGuard } from '@core/guards/license.guard';
import { appRedirectGuard } from '@core/guards/app-redirect.guard';
import { AuthLayoutComponent } from '@features/auth/auth-layout/auth-layout.component';
import { SigninComponent } from '@features/auth/signin/signin.component';
import { AgreementComponent } from '@features/auth/agreement/agreement.component';
import { ForgetPasswordComponent } from '@features/auth/forget-password/forget-password.component';
import { ConfirmForgetPassComponent } from '@features/auth/confirm-forget-pass/confirm-forget-pass.component';
import { GrantAccessComponent } from '@features/auth/grant-access/grant-access.component';
import { ForbiddenComponent } from '@features/errors/forbidden/forbidden.component';
import { NotFoundComponent } from '@features/errors/not-found/not-found.component';
import { DashboardLayoutComponent } from '@features/dashboard/dashboard-layout/dashboard-layout.component';
import { OverviewComponent } from '@features/dashboard/pages/overview/overview.component';
import { PaymentsComponent } from '@features/dashboard/pages/payments/payments.component';
import { PaymentDetailComponent } from '@features/dashboard/pages/payment-detail/payment-detail.component';
import { CustomersComponent } from '@features/dashboard/pages/customers/customers.component';
import { CustomerDetailComponent } from '@features/dashboard/pages/customers/customer-detail/customer-detail.component';
import { GatewaysComponent } from '@features/dashboard/pages/gateways/gateways.component';
import { GatewayDetailComponent } from '@features/dashboard/pages/gateways/gateway-detail/gateway-detail.component';
import { PoliciesComponent } from '@features/dashboard/pages/policies/policies.component';
import { PolicyDetailComponent } from '@features/dashboard/pages/policies/policy-detail/policy-detail.component';
import { TeamComponent } from '@features/dashboard/pages/team/team.component';
import { BillingComponent } from '@features/dashboard/pages/billing/billing.component';
import { SettingsPageComponent } from '@features/dashboard/pages/settings/settings.component';

const RESERVED_KEYWORDS = new Set([
  'forbidden', 'undefined', 'null', 'app', 'login', 'register', 'auth',
  'dashboard', 'licenses', 'notfound', 'apps', 'billing', 'overview',
  'payments', 'gateways', 'app-setting', 'policies', 'fraud-activities',
  'customers', 'team', 'personalization', 'rules', 'fraud'
]);

function isReservedRoute(path: string): boolean {
  if (!path) return true;
  return RESERVED_KEYWORDS.has(path.trim().toLowerCase());
}

export function tenantWorkspaceIdMatcher(
  segments: UrlSegment[],
  group: UrlSegmentGroup,
  route: Route
): UrlMatchResult | null {
  if (segments.length === 0) {
    return null;
  }
  const firstSegment = segments[0].path;
  if (isReservedRoute(firstSegment)) {
    return null;
  }
  return {
    consumed: [segments[0]],
    posParams: {
      appId: segments[0],
    },
  };
}

export function appIdRedirectMatcher(
  segments: UrlSegment[],
  group: UrlSegmentGroup,
  route: Route
): UrlMatchResult | null {
  if (segments.length !== 1) {
    return null;
  }
  const segmentPath = segments[0].path;
  if (isReservedRoute(segmentPath)) {
    return null;
  }
  return {
    consumed: segments,
    posParams: {
      appName: segments[0],
    },
  };
}

export const routes: Routes = [
  {
    path: 'auth',
    component: AuthLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'signin' },
      { path: 'signin', component: SigninComponent },
      { path: 'signup', component: AgreementComponent },
      { path: 'forget-password', component: ForgetPasswordComponent },
      { path: 'confirm', component: ConfirmForgetPassComponent },
    ],
  },

  {
    path: 'auth/grant-access',
    component: GrantAccessComponent,
    canActivate: [authGuard],
  },

  {
    path: 'forbidden',
    component: ForbiddenComponent,
    canActivate: [authGuard],
  },
  {
    path: 'notfound',
    component: NotFoundComponent,
  },

  {
    matcher: tenantWorkspaceIdMatcher,
    component: DashboardLayoutComponent,
    canActivate: [authGuard, licenseGuard],
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: OverviewComponent },
      { path: 'payments', component: PaymentsComponent },
      { path: 'payments/:paymentId', component: PaymentDetailComponent },
      { path: 'customers', component: CustomersComponent },
      { path: 'customers/:customerId', component: CustomerDetailComponent },
      { path: 'gateways', component: GatewaysComponent },
      { path: 'gateways/:profileId', component: GatewayDetailComponent },
      { path: 'policies', component: PoliciesComponent },
      { path: 'policies/:policyId', component: PolicyDetailComponent },
      { path: 'team', component: TeamComponent },
      { path: 'billing', component: BillingComponent },
      { path: 'app-setting', component: SettingsPageComponent },
      { path: 'dashboard', redirectTo: 'overview', pathMatch: 'full' },
    ],
  },

  {
    path: '',
    pathMatch: 'full',
    component: DashboardLayoutComponent,
    canActivate: [authGuard, appRedirectGuard],
  },

  {
    matcher: appIdRedirectMatcher,
    redirectTo: ':appName/overview',
    pathMatch: 'full',
  },

  { path: '**', redirectTo: 'notfound', pathMatch: 'full' },
];
