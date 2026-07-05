# Architectural Implementation Plan: Pure Angular + Signals Fork (Strict Licensing Mode)

> **Document Type:** AI-Executable Technical Specification
> **Target Framework:** Angular 19+ (Pure, standalone components)
> **State Management:** Angular Signals (`signal`, `computed`, `effect`, `linkedSignal`)
> **Styling:** SCSS (structural Flexbox + CSS Grid, no UI component library)
> **Source Project:** `/home/salman/Projects/ezpin/payment-admin` (Angular 16 + Ionic 8 + Capacitor)
> **Constraint:** `isSupportLicenseManagement === true` is ALWAYS assumed. No non-licensed code paths exist.

---

## Table of Contents

- [Part 0: Executive Summary & Pruning Policy](#part-0-executive-summary--pruning-policy)
- [Part 1: Source Codebase Analysis (payment-admin)](#part-1-source-codebase-analysis-payment-admin)
- [Part 2: New Workspace Initialization & Tooling](#part-2-new-workspace-initialization--tooling)
- [Part 3: Proxy Contract Migration (Source of Truth)](#part-3-proxy-contract-migration-source-of-truth)
- [Part 4: Environment Configuration & API Base URLs](#part-4-environment-configuration--api-base-urls)
- [Part 5: Signal-Driven State Store Design](#part-5-signal-driven-state-store-design)
- [Part 6: Firebase Authentication Service (Pure Angular)](#part-6-firebase-authentication-service-pure-angular)
- [Part 7: License Flow Service](#part-7-license-flow-service)
- [Part 8: Auth Flow Orchestrator (Two-Stage Identity Exchange)](#part-8-auth-flow-orchestrator-two-stage-identity-exchange)
- [Part 9: HTTP Interceptors (Functional)](#part-9-http-interceptors-functional)
- [Part 10: Route Guards (Functional CanActivateFn)](#part-10-route-guards-functional-canactivatefn)
- [Part 11: Routing Configuration & Custom UrlMatcher](#part-11-routing-configuration--custom-urlmatcher)
- [Part 12: Global Styles & Theme System (SCSS)](#part-12-global-styles--theme-system-scss)
- [Part 13: Auth Layout & Feature Components](#part-13-auth-layout--feature-components)
- [Part 14: Grant Access Consent Screen](#part-14-grant-access-consent-screen)
- [Part 15: Shared UI Components (Pure HTML5/SCSS)](#part-15-shared-ui-components-pure-html5scss)
- [Part 16: Core Utility Services (Ionic-Free)](#part-16-core-utility-services-ionic-free)
- [Part 17: App Configuration & Bootstrap](#part-17-app-configuration--bootstrap)
- [Part 18: Migration Verification & Testing Checklist](#part-18-migration-verification--testing-checklist)

---

## Part 0: Executive Summary & Pruning Policy

### 0.1 Objective

Fork the `payment-admin` project (an Angular 16 + Ionic 8 + Capacitor hybrid application) into a **pure Angular 19+ web application** that exclusively handles **license-managed authentication flows** (`isSupportLicenseManagement === true`). The fork must:

1. **Remove** all Ionic framework dependencies (`@ionic/angular`, `@capacitor/*`, `@ionic/angular-toolkit`).
2. **Remove** all PrimeNG and Angular Material UI libraries.
3. **Retain** the NSwag auto-generated TypeScript API proxies (`payment-app-proxy.ts`, `payment-proxy.ts`, `api-exception.ts`) as the **absolute source of truth** for API types, DTO contracts, and HTTP endpoints — verbatim, unmodified.
4. **Replace** distributed RxJS `Subject`/`BehaviorSubject` state with centralized Angular **Signals** (`signal`, `computed`, `effect`).
5. **Enforce** that `isSupportLicenseManagement` is always `true` — all conditional branches that check this flag must resolve to the `true` path. The settings API call is retained (for branding/slogan data) but the license flag is hardcoded to `true` in the state layer.
6. **Preserve** the exact auth flow logic: Firebase auth → platform token swap → license evaluation → grant-access or dashboard routing.

### 0.2 What Stays

| Artifact | Action |
|---|---|
| `payment-app-proxy.ts` (14,282 lines) | Copy verbatim into `src/app/core/proxies/` |
| `payment-proxy.ts` (5,185 lines) | Copy verbatim into `src/app/core/proxies/` |
| `api-exception.ts` (74 lines) | Copy verbatim into `src/app/core/proxies/` |
| `environment.ts` / `environment.prod.ts` / `environment.stage.ts` | Copy with path adjustments |
| Auth flow logic (`AuthFlowOrchestratorService`) | Rewrite with Signals, same algorithm |
| License flow logic (`LicenseFlowService`) | Rewrite with Signals, same algorithm |
| Firebase auth logic (`FirebaseAuthService`) | Rewrite without Ionic `AlertController` |
| Signin / Signup (Agreement) / Grant-Access views | Rebuild with pure HTML5 + SCSS |
| `index.html` font/icon/theme links | Copy with adjustments |
| `theme-md-light-indigo.css` / `md-dark-indigo.css` | Copy verbatim |
| `dictionary.ts` | Copy only auth-related entries |

### 0.3 What Gets Removed

| Artifact | Reason |
|---|---|
| `@ionic/angular` and all `ion-*` components | Replaced by semantic HTML5 |
| `@capacitor/*` (all plugins) | Not a mobile app |
| `@codetrix-studio/capacitor-google-auth` | Replace with Firebase popup auth only |
| `primeng` / `primeicons` | Replaced by SCSS |
| `@angular/material` / `@angular/cdk` | Replaced by SCSS |
| `bootstrap` | Replaced by SCSS Flexbox/Grid |
| `highcharts` / `highcharts-angular` | No dashboards in this fork |
| `xlsx`, `jspdf`, `file-saver` | No reports in this fork |
| All feature modules (customer, fraud, gateway, overview, report, member, dashboard, personalization, app-setting, app-list) | Not part of license auth flow |
| `NgModules` (`.module.ts` files) | Replaced by standalone components |
| `LoadingController`, `ToastController`, `AlertController` | Replaced by Signal-driven overlays |
| `ionic.config.json`, `capacitor.config.ts` | Not applicable |

### 0.4 Strict Licensing Assumption

In the original code, `isSupportLicenseManagement` is fetched from `GET /api/settings` and conditionally gates behavior. In this fork:

- The settings API is still called (for `brand`, `signinSlogan`, `signinImageUri`, `signinTermsAndConditionUrl`, `signinPrivacyUrl`).
- The `isSupportLicenseManagement` field is **ignored** from the API response and **hardcoded to `true`** in the `SettingsStore`.
- All code paths that branched on `isSupportLicenseManagement === false` are **deleted**.
- The email/password form in signin/signup is **always visible** (in the original, it only showed when `isSupportLicenseManagement` was true).

### 0.5 High-Level Architecture Diagram

```
[ Browser (Pure Angular SPA) ]
           │
           ▼
[ app.config.ts (provideRouter, provideHttpClient, provideFirebaseApp, provideAuth) ]
           │
           ▼
[ app.routes.ts ─── Custom UrlMatcher (tenantWorkspaceIdMatcher) ]
           │
    ┌──────┴──────────────────────┐
    ▼                             ▼
[ /auth/* (public) ]     [ /{appId}/* (protected, canActivate: authGuard) ]
    │                             │
    ▼                             ▼
[ AuthLayoutComponent ]  [ DashboardLayoutComponent (stub) ]
    │                             │
    ├── SigninComponent           ├── (Future: overview, billing, etc.)
    ├── AgreementComponent        └── ForbiddenComponent / NotFoundComponent
    └── GrantAccessComponent
           │
           ▼
[ Signal Stores: AuthStore · SettingsStore · LicenseStore · WorkspaceStore ]
           │
           ▼
[ AuthFlowOrchestrator (processAuthentication → evaluatePostAuth → route) ]
           │
           ▼
[ NSwag Proxies: AuthenticationClient · SettingsClient · TeamClient · LicensesClient ]
           │
           ▼
[ Backend API Gateway ]
```

---

## Part 1: Source Codebase Analysis (payment-admin)

### 1.1 Current Technology Stack

The source project at `/home/salman/Projects/ezpin/payment-admin` uses:

| Layer | Technology | Version |
|---|---|---|
| Framework | Angular | ^16.0.0 |
| Mobile UI | `@ionic/angular` | ^8.0.0 |
| Mobile Bridge | `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` | ^6.0.0 |
| Google Auth (Mobile) | `@codetrix-studio/capacitor-google-auth` | ^3.4.0-rc.4 |
| Firebase Auth | `@angular/fire` | ^16.0.0 |
| UI Libraries | PrimeNG (^16.0.2), Angular Material (^15.1.0), Bootstrap (^5.2.3) | — |
| Charts | Highcharts (11.4.8) + highcharts-angular (^4.0.0) | — |
| State | RxJS Subjects/BehaviorSubjects (scattered across services) | ^7.5.0 |
| API Client | NSwag-generated TypeScript proxies | v14.6.3.0 |
| Module System | NgModule-based (NOT standalone) | — |
| Build | `@angular-devkit/build-angular:browser` (old builder) | — |

### 1.2 Path Aliases (tsconfig.json)

The source project defines these path aliases in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@app/*": ["src/app/*"],
      "@assets/*": ["src/assets/*"],
      "@proxies/*": ["src/app/proxies/*"],
      "@shared/*": ["src/app/shared/*"],
      "@modules/*": ["src/app/modules/*"],
      "@layout/*": ["src/app/layout/*"],
      "@core/*": ["src/app/core/*"],
      "@proxy/*": ["src/app/proxy/*"],
      "@auth/*": ["src/app/auth/*"],
      "@dictionary/*": ["src/dictionary/*"],
      "@environments/*": ["src/environments/*"]
    }
  }
}
```

**For the fork**, simplify to:

```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@core/*": ["src/app/core/*"],
      "@proxy/*": ["src/app/core/proxies/*"],
      "@shared/*": ["src/app/shared/*"],
      "@features/*": ["src/app/features/*"],
      "@environments/*": ["src/environments/*"]
    }
  }
}
```

### 1.3 Two API Base URLs

The source uses **two separate** `API_BASE_URL` InjectionTokens from two different proxy files:

| Proxy File | InjectionToken | Environment Key | Example Value (Stage) |
|---|---|---|---|
| `payment-proxy.ts` | `API_BASE_URL` (from payment-proxy) | `environment.base_Url` | `https://payment-service-stage.arthurcraftlab.com/` |
| `payment-app-proxy.ts` | `API_BASE_URL` (from payment-app-proxy) | `environment.appBaseUrl` | `https://payment-app-service-stage.arthurcraftlab.com` |

Both tokens share the same name `API_BASE_URL` but are from different files. In the `AppModule`, they are provided separately:

```typescript
{ provide: API_BASE_URL, useValue: environment.base_Url },           // from payment-proxy
{ provide: APP_BASE_URL, useValue: environment.appBaseUrl },          // from payment-app-proxy (imported as APP_BASE_URL)
```

**Critical:** The auth flow only uses `payment-app-proxy.ts` clients (`AuthenticationClient`, `SettingsClient`, `TeamClient`, `LicensesClient`). The `payment-proxy.ts` file's `API_BASE_URL` is used for customer/payment/gateway endpoints that are NOT needed in this fork. However, since `payment-app-proxy.ts` imports nothing from `payment-proxy.ts`, only the app-proxy's `API_BASE_URL` needs to be provided.

### 1.4 Auth Flow Sequence (Current Implementation)

The complete authentication flow as implemented in `payment-admin`:

```
User Action                    Component/Service                    API Call
─────────────────────────────────────────────────────────────────────────────
1. Click "Continue with Google"
   OR Enter email/password     SigninComponent / AuthComponent
                                │
                                ▼
2. Firebase Auth               FirebaseAuthService
   signInWithPopup() OR         │  (getAuth() from firebase/auth)
   signInWithEmailAndPassword() │
                                ▼
3. Get Firebase idToken         userCredential.user.getIdToken()
                                │
                                ▼
4. initiateFirebaseSession      AuthFlowOrchestratorService
   (idToken)                    │
                                ├── if signup URL → SignUpRequest{idToken, RefreshTokenType.Web}
                                │   → AuthenticationClient.signUp()  → POST /api/authentication/signup
                                │
                                └── if signin URL → SignInRequest{idToken, RefreshTokenType.Web}
                                    → AuthenticationClient.signIn()  → POST /api/authentication/signin
                                                                │
                                                                ▼
5. Receive ApiKey               FirebaseAuthService.callSigninToAppInternal()
   { accessToken.value,          │  stores: localStorage["token"] = res.accessToken.value
     userId }                    │  stores: localStorage["user"] = res.userId
                                │  starts: backgroundRefreshToken()
                                ▼
6. evaluatePostSignIn()         AuthFlowOrchestratorService
                                │
                                ├── GET /api/settings → Setting
                                │   (checks isSupportLicenseManagement === true)
                                │
                                ├── if returnUrl present AND license active:
                                │   → router.navigate(['/auth/grant-access'], {queryParams})
                                │
                                └── if no returnUrl:
                                    → proceedToDashboard(appId)
                                        │
                                        ├── GET /api/licenses/best-license → AppLicense[]
                                        │   (LicensesClient.getBestLicense())
                                        │
                                        ├── if no best license:
                                        │   POST /api/licenses?licenseId=X&licenseName=Y → CreateLicenseResponse
                                        │   (LicensesClient.createLicense())
                                        │
                                        └── navigateToDashboard()
                                            ├── GET /api/team/users/current/licenses → License[]
                                            │   (TeamClient.getLicenses())
                                            ├── Extract all apps from licenses
                                            ├── Find sandbox app (or first app)
                                            ├── Set localStorage["default-app"]
                                            └── router.navigate(['/{appId}/overview'])

7. Grant Access Flow (if returnUrl was present):
   GrantAccessComponent
        │
        ▼
   handleGrantAccessDecision(true, returnUrl, appId)
        │
        ├── LicenseFlowService.ensureLicenseToken(appId, returnUrl)
        │   ├── getBestLicense() → GET /api/licenses/best-license
        │   └── if null → createLicense() → POST /api/licenses
        │       returns { licenseId, authorizationCode }
        │
        └── window.location.href = returnUrl + ?licenseId=X&authorizationCode=Y
```

### 1.5 Unregistered User Handling

When `AuthenticationClient.signIn()` returns a 403 with `UnregisteredUserException`:

```
signin 403 → checkIfUnregistered(error) === true
    │
    ▼
handleUnregisteredUser(idToken)
    │
    ├── SignUpRequest{idToken, RefreshTokenType.Web}
    ├── AuthenticationClient.signUp() → POST /api/authentication/signup
    │
    ├── if current URL includes "signup":
    │   → evaluatePostSignIn() (continue normal flow)
    └── if current URL does NOT include "signup":
        → router.navigate(['/auth/signup'], {queryParams})
          (redirect to agreement page for email/password collection)
```

When signup returns 403 (and NOT `UnregisteredUserException`), it means the user is already registered:
```
signup 403 → firebaseAuthService.signupAlreadyRegistered.next(true)
    → AgreementComponent shows warning box: "A user with this Email has already registered"
```

### 1.6 Token Management

- **Storage:** `localStorage["token"]` (raw JWT string from `ApiKey.accessToken.value`)
- **JWT Parsing:** `parseJwt(token)` manually decodes the base64 payload to extract `exp` (expiration timestamp)
- **Expiry Check:** `hasExpireTime()` compares `exp` against current time
- **Background Refresh:** `backgroundRefreshToken()` sets a `setInterval` that fires `(exp - now - 60) * 1000` milliseconds before expiry, calling `reconnect()` which fetches a fresh Firebase idToken and re-signs in
- **Validation:** `AuthGuard.validToken()` checks token exists, is not expired, and can be base64-decoded

### 1.7 Query Parameter Contract

The auth flow relies on these URL query parameters being passed through redirects:

| Parameter | Type | Purpose |
|---|---|---|
| `returnUrl` | `string \| null` | External consumer app URL to redirect to after granting access |
| `appId` | `string \| null` | Target application/workspace ID for direct navigation |
| `grantAuthorization` | `"true" \| null` | Flag indicating the user came from a grant-access flow |
| `authorizationCode` | `string \| null` | Pre-existing authorization code (passed through) |
| `licenseId` | `string \| null` | License ID (used on grant-access page) |
| `isLicenseManagement` | `"true" \| null` | Explicit license management flag (passed through) |

All query params are preserved across auth route navigations via `queryParamsHandling: "preserve"`.

### 1.8 Reserved Route Keywords (UrlMatcher Block List)

The custom `appIdMatcher` in `app-routing.module.ts` blocks these keywords from being matched as dynamic `appId` segments:

```typescript
const RESERVED_KEYWORDS = new Set([
  'forbidden', 'undefined', 'null', 'app', 'login', 'register', 'auth',
  'dashboard', 'licenses', 'notfound', 'apps', 'billing', 'overview',
  'payments', 'gateways', 'app-setting', 'policies', 'fraud-activities',
  'customers', 'team', 'personalization', 'rules', 'fraud'
]);
```

If the first URL segment matches any of these, the `appIdMatcher` returns `null` (no match), causing the router to fall through to explicit route definitions.

### 1.9 StorageService LocalStorage Guard

The `StorageService` patches `localStorage.setItem` and `localStorage.getItem` to validate `default-app` values against an `INVALID_APP_IDS` set:

```typescript
private static readonly INVALID_APP_IDS = new Set([
  'undefined', 'null', 'forbidden', 'notfound', 'apps', 'auth', 'billing',
  'overview', 'payments', 'gateways', 'app-setting', 'policies',
  'fraud-activities', 'customers', 'team', 'personalization', 'dashboard'
]);
```

This prevents invalid workspace IDs from being persisted. The fork must retain this guard.

### 1.10 Key DTO Reference (from payment-app-proxy.ts)

#### Setting (line 10492)
```typescript
interface ISetting {
  signinImageUri?: string | null;      // Light theme logo URL
  signinImageUri2?: string | null;     // Dark theme logo URL
  signinSlogan?: string | null;        // Welcome text on auth pages
  brand?: string | null;               // App brand name
  isSupportSignupProcess: boolean;
  isSupportPaymentProfileEdit: boolean;
  isSupportLicenseManagement: boolean;  // ALWAYS TRUE in fork
  isSupportCustomizeCheckout: boolean;
  signinTermsAndConditionUrl?: string | null;
  signinPrivacyUrl?: string | null;
  signinTermsAndCondition?: string | null;
}
```

#### License (line 13470)
```typescript
interface ILicense {
  licenseId: string;
  licenseName: string;
  apps: App[];
}
```

#### App (line 5357)
```typescript
interface IApp {
  appId: string;
  friendlyName: string;
  isSandbox: boolean;
  logo?: string | null;
  licenseExpirationTime: Date;
  isActive: boolean;
  isSetupCompleted: boolean;
  isConnectFirstGateway: boolean;
  // ... (many more fields, all retained in proxy)
}
```

#### ApiKey (line 13528)
```typescript
interface IApiKey {
  accessToken: Token;   // { value: string, expirationTime: Date, scheme: string, issuedTime: Date }
  refreshToken?: Token | null;
  userId: string;
}
```

#### SignInRequest (line 14053)
```typescript
interface ISignInRequest {
  idToken: string;
  refreshTokenType: RefreshTokenType;  // "None" | "Web" | "App"
}
```

#### SignUpRequest (line 14099)
```typescript
interface ISignUpRequest {
  idToken: string;
  refreshTokenType: RefreshTokenType;
}
```

#### CreateLicenseResponse (line 8505)
```typescript
interface ICreateLicenseResponse {
  licenseId: string;
  authorizationCode: string;
}
```

#### AppLicense (line 8545)
```typescript
interface IAppLicense {
  isSandbox: boolean;
  appId: string;
  authorizationCode: string;
}
```

### 1.11 Key API Client Methods (from payment-app-proxy.ts)

| Client | Method | HTTP | Endpoint | Returns |
|---|---|---|---|---|
| `SettingsClient` | `get()` | GET | `/api/settings` | `Setting` |
| `AuthenticationClient` | `signIn(request)` | POST | `/api/authentication/signin` | `ApiKey` |
| `AuthenticationClient` | `signUp(request)` | POST | `/api/authentication/signup` | `ApiKey` |
| `AuthenticationClient` | `getCurrentUser()` | GET | `/api/authentication/current` | `User2` |
| `TeamClient` | `getLicenses()` | GET | `/api/team/users/current/licenses` | `License[]` |
| `TeamClient` | `getApps()` | GET | `/api/team/users/current/apps` | `App[]` |
| `TeamClient` | `getAppPermissions(appId)` | GET | `/api/team/users/current/apps/{appId}/permissions` | `string[]` |
| `LicensesClient` | `getBestLicense()` | GET | `/api/licenses/best-license` | `AppLicense[]` |
| `LicensesClient` | `createLicense(licenseId?, licenseName?)` | POST | `/api/licenses?licenseId=X&licenseName=Y` | `CreateLicenseResponse` |
| `LicensesClient` | `getAppsLicense(licenseId)` | GET | `/api/licenses/{licenseId}` | `AppLicense[]` |
| `AppsClient` | `getSettings(appId)` | GET | `/api/apps/{appId}` | `App` |

---

## Part 2: New Workspace Initialization & Tooling

### 2.1 Create Angular Workspace

```bash
# Create a new Angular 19+ workspace with SCSS and standalone components
ng new payment-console --style=scss --routing=true --ssr=false --package-manager=npm

cd payment-console
```

This generates a project with:
- `@angular-devkit/build-angular:application` builder (esbuild-based, replaces old `browser` builder)
- Standalone components by default (no NgModules)
- SCSS as the default style preprocessor
- `app.config.ts` instead of `app.module.ts`

### 2.2 Install Required Dependencies

```bash
# Firebase (AngularFire for Angular 19)
npm install @angular/fire firebase

# RxJS (needed by NSwag proxies — they return Observables)
# Already included with Angular, but ensure version compatibility
npm install rxjs
```

**Do NOT install** any of the following (they are explicitly removed from this fork):
- `@ionic/angular`, `@ionic/angular-toolkit`, `@ionic/pwa-elements`
- `@capacitor/*` (any capacitor packages)
- `@codetrix-studio/capacitor-google-auth`
- `primeng`, `primeicons`
- `@angular/material`, `@angular/cdk`
- `bootstrap`
- `highcharts`, `highcharts-angular`
- `xlsx`, `jspdf`, `jspdf-autotable`, `file-saver`
- `json-formatter-js`, `angularx-qrcode`
- `ionicons`, `material-icons` (use Material Symbols Outlined via CDN link in index.html instead)

### 2.3 tsconfig.json Configuration

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@core/*": ["src/app/core/*"],
      "@proxy/*": ["src/app/core/proxies/*"],
      "@shared/*": ["src/app/shared/*"],
      "@features/*": ["src/app/features/*"],
      "@environments/*": ["src/environments/*"]
    },
    "outDir": "./dist/out-tsc",
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "sourceMap": true,
    "declaration": false,
    "downlevelIteration": true,
    "experimentalDecorators": true,
    "moduleResolution": "bundler",
    "importHelpers": true,
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022", "dom"],
    "useDefineForClassFields": false,
    "skipLibCheck": true
  },
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  }
}
```

**Key changes from source:**
- `target` upgraded from `es2015` to `ES2022` (supports signals, optional chaining in switch)
- `module` upgraded from `es2020` to `ES2022`
- `moduleResolution` changed from `node` to `bundler` (Angular 19 default)
- `lib` upgraded to include `ES2022`
- `skipLibCheck: true` added (NSwag proxy files have loose typing that would fail strict checks)
- Path aliases simplified and consolidated

### 2.4 angular.json Configuration

```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "payment-console": {
      "projectType": "application",
      "schematics": {
        "@schematics/angular:component": {
          "style": "scss",
          "standalone": true
        }
      },
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": "dist/payment-console",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": ["zone.js"],
            "tsConfig": "tsconfig.app.json",
            "inlineStyleLanguage": "scss",
            "assets": [
              {
                "glob": "**/*",
                "input": "src/assets",
                "output": "assets"
              }
            ],
            "styles": [
              "src/styles.scss"
            ],
            "scripts": []
          },
          "configurations": {
            "production": {
              "budgets": [
                { "type": "initial", "maximumWarning": "500kb", "maximumError": "5mb" },
                { "type": "anyComponentStyle", "maximumWarning": "20kb", "maximumError": "40kb" }
              ],
              "fileReplacements": [
                { "replace": "src/environments/environment.ts", "with": "src/environments/environment.prod.ts" }
              ],
              "outputHashing": "all"
            },
            "staging": {
              "fileReplacements": [
                { "replace": "src/environments/environment.ts", "with": "src/environments/environment.stage.ts" }
              ],
              "outputHashing": "all"
            },
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true,
              "namedChunks": true
            }
          },
          "defaultConfiguration": "development"
        },
        "serve": {
          "builder": "@angular-devkit/build-angular:dev-server",
          "configurations": {
            "production": { "buildTarget": "payment-console:build:production" },
            "development": { "buildTarget": "payment-console:build:development" }
          },
          "defaultConfiguration": "development"
        },
        "lint": {
          "builder": "@angular-eslint/builder:lint",
          "options": { "lintFilePatterns": ["src/**/*.ts", "src/**/*.html"] }
        }
      }
    }
  },
  "cli": {
    "analytics": false
  }
}
```

**Key changes from source:**
- Builder changed from `browser` to `application` (esbuild-based)
- `main` replaced by `browser` entry point
- `polyfills` is now an array (not a file path)
- Removed ionicons SVG glob asset
- Removed PrimeNG/Bootstrap/Material CSS from styles array
- Removed `@ionic/angular-toolkit` schematic collections
- Theme CSS files loaded dynamically via `<link>` in index.html (not bundled in angular.json)

### 2.5 Directory Structure Blueprint

```
payment-console/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── proxies/                    # NSwag-generated (verbatim copies)
│   │   │   │   ├── payment-app-proxy.ts    # 14,282 lines — DO NOT MODIFY
│   │   │   │   ├── payment-proxy.ts        # 5,185 lines — DO NOT MODIFY
│   │   │   │   └── api-exception.ts        # 74 lines — DO NOT MODIFY
│   │   │   ├── stores/                     # Signal-driven state stores
│   │   │   │   ├── auth.store.ts           # AuthStore: token, user, isAuthenticated
│   │   │   │   ├── settings.store.ts       # SettingsStore: branding, theme, settings
│   │   │   │   ├── license.store.ts        # LicenseStore: licenses, activeLicense
│   │   │   │   └── workspace.store.ts      # WorkspaceStore: currentAppId, activeApp
│   │   │   ├── services/                   # Utility services (Ionic-free)
│   │   │   │   ├── storage.service.ts      # LocalStorage wrapper with default-app guard
│   │   │   │   ├── loading.service.ts      # Signal-based loading overlay
│   │   │   │   ├── notification.service.ts # Signal-based toast notifications
│   │   │   │   ├── theme.service.ts        # Signal-based theme switcher
│   │   │   │   ├── firebase-auth.service.ts # Firebase auth (no Ionic/Capacitor)
│   │   │   │   ├── license-flow.service.ts # License token exchange logic
│   │   │   │   ├── auth-flow-orchestrator.service.ts # Main auth orchestrator
│   │   │   │   └── logger.service.ts       # Environment-aware console logger
│   │   │   ├── guards/                     # Functional route guards
│   │   │   │   ├── auth.guard.ts           # CanActivateFn — checks token validity
│   │   │   │   └── license.guard.ts        # CanActivateFn — checks license validity
│   │   │   ├── interceptors/               # Functional HTTP interceptors
│   │   │   │   ├── auth.interceptor.ts     # Token injection + workspace header
│   │   │   │   └── error.interceptor.ts    # 401/403 handling + state reset
│   │   │   └── utils/                      # Pure utility functions
│   │   │       ├── jwt.util.ts             # parseJwt, isExpired
│   │   │       └── url.util.ts             # extractBaseDomain, appendToken
│   │   ├── features/
│   │   │   ├── auth/                       # Authentication feature
│   │   │   │   ├── auth-layout/            # Shell component for auth routes
│   │   │   │   │   ├── auth-layout.component.ts
│   │   │   │   │   ├── auth-layout.component.html
│   │   │   │   │   └── auth-layout.component.scss
│   │   │   │   ├── signin/                 # Sign-in page
│   │   │   │   │   ├── signin.component.ts
│   │   │   │   │   ├── signin.component.html
│   │   │   │   │   └── signin.component.scss
│   │   │   │   ├── agreement/              # Sign-up / agreement page
│   │   │   │   │   ├── agreement.component.ts
│   │   │   │   │   ├── agreement.component.html
│   │   │   │   │   └── agreement.component.scss
│   │   │   │   └── grant-access/           # OAuth-style consent screen
│   │   │   │       ├── grant-access.component.ts
│   │   │   │       ├── grant-access.component.html
│   │   │   │       └── grant-access.component.scss
│   │   │   ├── errors/                     # Error pages
│   │   │   │   ├── forbidden/
│   │   │   │   └── not-found/
│   │   │   └── dashboard/                  # Stub dashboard layout (for post-auth routing)
│   │   │       └── dashboard-layout/
│   │   ├── shared/                         # Reusable pure HTML5/SCSS components
│   │   │   ├── components/
│   │   │   │   ├── loading-overlay/        # Full-screen or card-level spinner
│   │   │   │   ├── toast-container/        # Notification toast queue
│   │   │   │   ├── google-button/          # "Continue with Google" button
│   │   │   │   └── auth-error-modal/       # Popup-blocked error dialog
│   │   │   └── directives/
│   │   ├── app.component.ts                # Root standalone component
│   │   ├── app.component.html
│   │   ├── app.component.scss
│   │   ├── app.config.ts                   # provideRouter, provideHttpClient, provideFirebase
│   │   └── app.routes.ts                   # Route definitions + custom UrlMatcher
│   ├── assets/
│   │   ├── css/
│   │   │   ├── theme-md-light-indigo.css   # Copied verbatim from source
│   │   │   └── md-dark-indigo.css          # Copied verbatim from source
│   │   ├── img/
│   │   │   └── (logo images)
│   │   └── icon/
│   │       └── logo__app.ico
│   ├── environments/
│   │   ├── environment.ts                  # Dev
│   │   ├── environment.prod.ts             # Production
│   │   └── environment.stage.ts            # Staging
│   ├── styles.scss                         # Global SCSS entry (variables, resets)
│   ├── index.html                          # HTML shell with font/theme links
│   └── main.ts                             # bootstrapApplication(AppComponent, appConfig)
├── angular.json
├── tsconfig.json
├── tsconfig.app.json
├── package.json
└── IMPLEMENTATION-PLAN.md                  # This file
```

### 2.6 package.json (Target)

```json
{
  "name": "payment-console",
  "version": "1.0.0",
  "scripts": {
    "ng": "ng",
    "start": "ng serve --port 8083",
    "build": "ng build",
    "build-stage": "ng build --configuration staging",
    "build-prod": "ng build --configuration production",
    "watch": "ng build --watch --configuration development",
    "lint": "ng lint --fix",
    "format": "npx prettier --write ."
  },
  "private": true,
  "dependencies": {
    "@angular/animations": "^19.0.0",
    "@angular/common": "^19.0.0",
    "@angular/compiler": "^19.0.0",
    "@angular/core": "^19.0.0",
    "@angular/fire": "^19.0.0",
    "@angular/forms": "^19.0.0",
    "@angular/platform-browser": "^19.0.0",
    "@angular/router": "^19.0.0",
    "firebase": "^11.0.0",
    "rxjs": "^7.8.0",
    "tslib": "^2.6.0",
    "zone.js": "^0.15.0"
  },
  "devDependencies": {
    "@angular-devkit/build-angular": "^19.0.0",
    "@angular/cli": "^19.0.0",
    "@angular/compiler-cli": "^19.0.0",
    "@angular-eslint/builder": "^19.0.0",
    "@angular-eslint/eslint-plugin": "^19.0.0",
    "typescript": "^5.5.0"
  }
}
```

---

## Part 3: Proxy Contract Migration (Source of Truth)

### 3.1 Copy Strategy

The three NSwag-generated proxy files are the **absolute source of truth** for all API types, DTO contracts, and HTTP endpoints. They must be copied **verbatim** — no modifications, no reformatting, no lint fixes.

```bash
# From the payment-console project root:
mkdir -p src/app/core/proxies

# Copy all three proxy files verbatim
cp /home/salman/Projects/ezpin/payment-admin/src/app/proxy/payment-app-proxy.ts src/app/core/proxies/
cp /home/salman/Projects/ezpin/payment-admin/src/app/proxy/payment-proxy.ts src/app/core/proxies/
cp /home/salman/Projects/ezpin/payment-admin/src/app/proxy/api-exception.ts src/app/core/proxies/
```

### 3.2 File Inventory

| File | Lines | Purpose |
|---|---|---|
| `payment-app-proxy.ts` | 14,282 | All app-service API clients + DTOs (auth, settings, team, licenses, apps) |
| `payment-proxy.ts` | 5,185 | Payment-service API clients + DTOs (customers, payments, gateways) — retained for type completeness but most clients unused |
| `api-exception.ts` | 74 | `ApiException` class + `ServerException` parser for HTTP error handling |

### 3.3 NSwag Proxy Architecture

Each proxy file is self-contained with this structure:

```typescript
// Top of file
import { mergeMap as _observableMergeMap, catchError as _observableCatch } from 'rxjs/operators';
import { Observable, throwError as _observableThrow, of as _observableOf } from 'rxjs';
import { Injectable, Inject, Optional, InjectionToken } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse, HttpResponseBase, HttpContext } from '@angular/common/http';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

@Injectable()
export class SomeClient {
  constructor(@Inject(HttpClient) http: HttpClient, @Optional() @Inject(API_BASE_URL) baseUrl?: string) {
    this.http = http;
    this.baseUrl = baseUrl ?? "";
  }

  someMethod(): Observable<SomeDto> {
    let url_ = this.baseUrl + "/api/some-endpoint";
    // ... builds HTTP request, returns Observable
  }
}

// DTO classes follow (App, License, Setting, ApiKey, etc.)
// Each has: constructor(data?), init(_data), static fromJS(data), toJSON(data)
```

**Key characteristics:**
- Clients are `@Injectable()` classes (NOT `providedIn: 'root'`) — they must be explicitly provided
- Each file declares its own `API_BASE_URL` InjectionToken
- All methods return `Observable<T>` (not Promises or Signals)
- DTOs have `fromJS()` static factory methods for JSON deserialization
- The bottom of each file contains helper functions (`blobToText`, `throwException`)

### 3.4 Import Path Adjustments

The proxy files use no internal path aliases — they are fully self-contained. However, importing FROM the proxy files in the new project must use the new path alias:

```typescript
// OLD (payment-admin):
import { TeamClient, SettingsClient, SignInRequest } from "@app/proxy/payment-app-proxy";
import { ApiException } from "@app/proxy/api-exception";
import { API_BASE_URL } from "@app/proxy/payment-proxy";

// NEW (payment-console):
import { TeamClient, SettingsClient, SignInRequest } from "@proxy/payment-app-proxy";
import { ApiException } from "@proxy/api-exception";
import { API_BASE_URL } from "@proxy/payment-proxy";
```

### 3.5 API_BASE_URL Provider Configuration

Both proxy files export an `API_BASE_URL` token. Since they are in different files, they are technically different tokens (different InjectionToken instances). In the source `AppModule`, they are provided as:

```typescript
// From payment-admin AppModule:
import { API_BASE_URL } from "@app/proxy/payment-proxy";
import { API_BASE_URL as APP_BASE_URL } from "@proxy/payment-app-proxy";

providers: [
  { provide: API_BASE_URL, useValue: environment.base_Url },     // payment-proxy
  { provide: APP_BASE_URL, useValue: environment.appBaseUrl },   // payment-app-proxy
]
```

**For the fork**, since we only use `payment-app-proxy.ts` clients, we only need to provide that file's `API_BASE_URL`:

```typescript
// In app.config.ts:
import { API_BASE_URL } from '@proxy/payment-app-proxy';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: API_BASE_URL, useValue: environment.appBaseUrl },
    // ... other providers
  ]
};
```

If any shared component or service also needs the `payment-proxy.ts` base URL (unlikely in this fork), provide it separately:

```typescript
import { API_BASE_URL as PAYMENT_SERVICE_BASE_URL } from '@proxy/payment-proxy';

{ provide: PAYMENT_SERVICE_BASE_URL, useValue: environment.base_Url },
```

### 3.6 Client Registration

All NSwag clients are `@Injectable()` without `providedIn`, so they must be explicitly registered. In the fork, register only the clients actually used:

```typescript
// In app.config.ts providers array:
import { 
  AuthenticationClient, 
  SettingsClient, 
  TeamClient, 
  LicensesClient,
  AppsClient 
} from '@proxy/payment-app-proxy';

providers: [
  AuthenticationClient,
  SettingsClient,
  TeamClient,
  LicensesClient,
  AppsClient,
]
```

### 3.7 ESLint Exemption

The NSwag proxy files contain code that violates modern TypeScript lint rules (e.g., `var`, `any`, non-null assertions). Add an ESLint ignore rule:

```json
// .eslintrc.json
{
  "ignorePatterns": ["src/app/core/proxies/**/*"]
}
```

Or in eslint config:
```javascript
// eslint.config.js
export default [
  {
    ignores: ["src/app/core/proxies/**/*"]
  },
  // ... rest of config
];
```

### 3.8 TypeScript Compatibility

The proxy files target ES5/ES2015 patterns but are compatible with ES2022 compilation. The key settings that ensure compatibility:

- `"skipLibCheck": true` in tsconfig.json (prevents deep type checking of proxy internals)
- `"experimentalDecorators": true` (proxies use `@Injectable()` and `@Inject()`)
- `"downlevelIteration": true` (proxies use `for...of` with arrays)

**Do NOT run `ng lint --fix` on the proxy directory.** The auto-formatter would break the generated code.

---

## Part 4: Environment Configuration & API Base URLs

### 4.1 Environment Files

Copy the three environment files from the source project and adapt them. The structure stays identical — only path imports change.

#### `src/environments/environment.ts` (Development)

```typescript
export const environment = {
  production: false,
  enableLogging: true,
  enableTagManager: false,
  gtmContainerId: "",
  baseUrl: "https://payment-service-stage.arthurcraftlab.com/api/v1/",
  base_Url: "https://payment-service-stage.arthurcraftlab.com/",
  appBaseUrl: "https://payment-app-service-stage.arthurcraftlab.com",
  CHECK__BUILD__TIME: 1000 * 60,
  Client_id: "215465091608-8v4p5khbsse4jbbrpmkkjoagl3dgi7ss.apps.googleusercontent.com",
  Scopes: ["email", "profile"],
  firebaseConfig: {
    apiKey: "AIzaSyCf9UwO2BrY8AI_yH-GlyBxFOfliuoCTJ0",
    authDomain: "payment-stage-b5e36.firebaseapp.com",
    projectId: "payment-stage-b5e36",
    storageBucket: "payment-stage-b5e36.firebasestorage.app",
    messagingSenderId: "766561037719",
    appId: "1:766561037719:web:8dc9a23ea9f25f864ca8d2",
    measurementId: "G-9WQCWY56ZG",
  },
  api_version: "1.0",
};
```

#### `src/environments/environment.stage.ts` (Staging)

Same as above — values are identical to dev in the source project.

#### `src/environments/environment.prod.ts` (Production)

```typescript
export const environment = {
  production: true,
  enableLogging: false,
  enableTagManager: true,
  gtmContainerId: "",  // Fill with production GTM container ID
  baseUrl: "https://payment-service.arthurcraftlab.com/api/v1/",
  base_Url: "https://payment-service.arthurcraftlab.com/",
  appBaseUrl: "https://payment-app-service.arthurcraftlab.com",
  CHECK__BUILD__TIME: 1000 * 60,
  Client_id: "215465091608-8v4p5khbsse4jbbrpmkkjoagl3dgi7ss.apps.googleusercontent.com",
  Scopes: ["email", "profile"],
  firebaseConfig: {
    apiKey: "AIzaSyCf9UwO2BrY8AI_yH-GlyBxFOfliuoCTJ0",
    authDomain: "payment-stage-b5e36.firebaseapp.com",
    projectId: "payment-stage-b5e36",
    storageBucket: "payment-stage-b5e36.firebasestorage.app",
    messagingSenderId: "766561037719",
    appId: "1:766561037719:web:8dc9a23ea9f25f864ca8d2",
    measurementId: "G-9WQCWY56ZG",
  },
  api_version: "1.0",
};
```

> **Note:** The Firebase config values above are copied from the source project's stage environment. Update production Firebase config to point to the production Firebase project.

### 4.2 Environment Key Reference

| Key | Used By | Purpose |
|---|---|---|
| `production` | `main.ts` (enableProdMode) | Enables Angular production mode |
| `enableLogging` | `Logger` service | Controls rich console output (dev only) |
| `appBaseUrl` | `API_BASE_URL` provider | Base URL for all `payment-app-proxy.ts` API calls |
| `base_Url` | `API_BASE_URL` (payment-proxy) provider | Base URL for payment-service API calls (unused in this fork) |
| `Client_id` | Google OAuth | Google Sign-In client ID |
| `Scopes` | `FirebaseAuthService.signInWithPopup()` | OAuth scopes (`["email", "profile"]`) |
| `firebaseConfig` | `provideFirebaseApp()` | Firebase initialization config |
| `enableTagManager` / `gtmContainerId` | Tag manager (optional) | GTM integration — can be omitted if not needed |

### 4.3 File Replacement Strategy

The `angular.json` configurations use `fileReplacements` to swap environment files:

```json
"configurations": {
  "production": {
    "fileReplacements": [
      { "replace": "src/environments/environment.ts", "with": "src/environments/environment.prod.ts" }
    ]
  },
  "staging": {
    "fileReplacements": [
      { "replace": "src/environments/environment.ts", "with": "src/environments/environment.stage.ts" }
    ]
  }
}
```

Build commands:
```bash
npm run build         # development build
npm run build-stage   # staging build
npm run build-prod    # production build
```

---

## Part 5: Signal-Driven State Store Design

### 5.1 Design Philosophy

The source project scatters state across multiple services using RxJS `Subject` and `BehaviorSubject`:
- `FirebaseAuthService` has 6 different `Subject` instances (`currentUser`, `signinWithGoogle`, `signinWithGoogleLoading`, `onSuccessfulFirebaseLogin`, `autoLicenseLoading`, `signupAlreadyRegistered`)
- `LayoutService` has 7 `Subject`/`BehaviorSubject` instances (`menu`, `isSmallMode`, `backButton`, `changeApp`, `breadcrumbVariable`, `appLogoSubject`, `dynamicBreadcrumbSubject`, `isSandboxSubject`, `selectedAppSubject`)
- `StorageService` patches `localStorage` globally
- Token/user data stored directly in `localStorage` with string keys

The fork replaces ALL of this with **four centralized Signal-based stores** using Angular's `signal()`, `computed()`, and `effect()` primitives. No RxJS Subjects are used for application state. RxJS Observables are only consumed from the NSwag proxy client methods (which inherently return `Observable<T>`), converted to Promises via `firstValueFrom()` at the call site.

### 5.2 AuthStore (`src/app/core/stores/auth.store.ts`)

Manages authentication identity, session tokens, and auth UI loading states.

```typescript
import { signal, computed, effect, Injectable } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { parseJwt, isTokenExpired } from '../utils/jwt.util';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  // ── Writable Signals ──────────────────────────────────

  /** Raw JWT platform token (from ApiKey.accessToken.value). null when logged out. */
  readonly token = signal<string | null>(this.storage.get('token'));

  /** User ID from ApiKey.userId. null when logged out. */
  readonly userId = signal<string | null>(this.storage.get('user'));

  /** Layout lock flag — true while auth operations are in progress. */
  readonly isAuthenticating = signal<boolean>(false);

  /** Loading message for auth overlay (e.g., "Signing in...", "Registering..."). */
  readonly authLoadingMessage = signal<string | null>(null);

  /** True when the Google sign-in button has been clicked and flow is in progress. */
  readonly isGoogleLoading = signal<boolean>(false);

  /** True when auto-license creation is in progress (post-signup). */
  readonly isAutoLicenseLoading = signal<boolean>(false);

  /** True when the user attempted signup but was already registered (shows warning box). */
  readonly signupAlreadyRegistered = signal<boolean>(false);

  /** True when redirecting to dashboard (triggers full-page loader). */
  readonly isRedirectingToDashboard = signal<boolean>(false);

  // ── Computed Signals ──────────────────────────────────

  /** Derived: true when a valid, non-expired token exists. */
  readonly isAuthenticated = computed(() => {
    const t = this.token();
    if (!t) return false;
    return !isTokenExpired(t);
  });

  /** Derived: decoded JWT payload (or null). */
  readonly decodedToken = computed(() => {
    const t = this.token();
    return t ? parseJwt(t) : null;
  });

  /** Derived: token expiration timestamp (or null). */
  readonly tokenExpiration = computed(() => {
    const decoded = this.decodedToken();
    return decoded ? decoded.exp : null;
  });

  // ── Effects (Persistence) ─────────────────────────────

  constructor(private storage: StorageService) {
    // Persist token to localStorage
    effect(() => {
      const t = this.token();
      if (t) {
        this.storage.set('token', t);
      } else {
        this.storage.remove('token');
      }
    });

    // Persist userId to localStorage
    effect(() => {
      const u = this.userId();
      if (u) {
        this.storage.set('user', u);
      } else {
        this.storage.remove('user');
      }
    });
  }

  // ── Actions ───────────────────────────────────────────

  /** Called after successful signIn/signUp API response. */
  setSession(token: string, userId: string): void {
    this.token.set(token);
    this.userId.set(userId);
  }

  /** Clears all auth state (used on signout or 401/403). */
  clearSession(): void {
    this.token.set(null);
    this.userId.set(null);
    this.isAuthenticating.set(false);
    this.isGoogleLoading.set(false);
    this.isAutoLicenseLoading.set(false);
    this.isRedirectingToDashboard.set(false);
    this.authLoadingMessage.set(null);
  }

  /** Sets the loading state with a message. */
  startLoading(message: string): void {
    this.isAuthenticating.set(true);
    this.authLoadingMessage.set(message);
  }

  /** Stops the loading state. */
  stopLoading(): void {
    this.isAuthenticating.set(false);
    this.authLoadingMessage.set(null);
  }
}
```

### 5.3 SettingsStore (`src/app/core/stores/settings.store.ts`)

Manages branding, theme, and system settings. **Hardcodes `isSupportLicenseManagement` to `true`.**

```typescript
import { signal, computed, effect, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SettingsClient, Setting } from '@proxy/payment-app-proxy';

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  // ── Writable Signals ──────────────────────────────────

  /** Raw settings from API (or null if not yet loaded / failed). */
  private readonly _settings = signal<Setting | null>(null);

  /** True while settings are being fetched. */
  readonly isLoading = signal<boolean>(false);

  /** True if settings fetch has completed (success or error). */
  readonly isLoaded = signal<boolean>(false);

  /** Current dark-mode state. */
  readonly isDark = signal<boolean>(this.resolveInitialDarkMode());

  // ── Computed Signals ──────────────────────────────────

  /**
   * STRICT LICENSING: Always returns true.
   * The API field `isSupportLicenseManagement` is ignored.
   */
  readonly isSupportLicenseManagement = computed(() => true);

  /** Brand name for display (fallback: "PaymentHub"). */
  readonly brand = computed(() => this._settings()?.brand ?? 'PaymentHub');

  /** Light theme logo URL. */
  readonly signinImageUri = computed(() => this._settings()?.signinImageUri ?? null);

  /** Dark theme logo URL (falls back to light if not set). */
  readonly signinImageUriDark = computed(() => this._settings()?.signinImageUri2 ?? null);

  /** Active logo URL based on current theme. */
  readonly activeLogoUri = computed(() => {
    return this.isDark() 
      ? (this.signinImageUriDark() ?? this.signinImageUri()) 
      : this.signinImageUri();
  });

  /** Slogan text for auth pages. */
  readonly signinSlogan = computed(() => this._settings()?.signinSlogan ?? null);

  /** Terms & Conditions URL. */
  readonly termsUrl = computed(() => this._settings()?.signinTermsAndConditionUrl ?? null);

  /** Privacy Policy URL. */
  readonly privacyUrl = computed(() => this._settings()?.signinPrivacyUrl ?? null);

  /** Terms text (inline). */
  readonly termsText = computed(() => this._settings()?.signinTermsAndCondition ?? null);

  /** Whether signup process is supported. */
  readonly isSupportSignupProcess = computed(() => this._settings()?.isSupportSignupProcess ?? false);

  constructor(private settingsClient: SettingsClient) {
    // Persist theme preference and apply body class
    effect(() => {
      const dark = this.isDark();
      localStorage.setItem('app-theme', dark ? 'dark' : 'light');
      
      const body = document.body;
      body.classList.remove('theme-dark', 'theme-light');
      body.classList.add(dark ? 'theme-dark' : 'theme-light');
      
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', dark ? 'dark' : 'light');
    });
  }

  // ── Actions ───────────────────────────────────────────

  /** Fetches settings from GET /api/settings. */
  async load(): Promise<void> {
    if (this.isLoaded()) return;
    this.isLoading.set(true);
    try {
      const settings = await firstValueFrom(this.settingsClient.get());
      this._settings.set(settings);
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      this.isLoading.set(false);
      this.isLoaded.set(true);
    }
  }

  /** Toggles dark/light theme. */
  toggleTheme(): void {
    this.isDark.set(!this.isDark());
  }

  /** Resolves initial dark mode from localStorage or OS preference. */
  private resolveInitialDarkMode(): boolean {
    const saved = localStorage.getItem('app-theme') as 'dark' | 'light' | 'system' | null;
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
```

### 5.4 LicenseStore (`src/app/core/stores/license.store.ts`)

Manages multi-tenant license/workspace data. Always operates in license-managed mode.

```typescript
import { signal, computed, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TeamClient, LicensesClient, License, App, AppLicense, CreateLicenseResponse } from '@proxy/payment-app-proxy';
import { StorageService } from '../services/storage.service';

@Injectable({ providedIn: 'root' })
export class LicenseStore {
  // ── Writable Signals ──────────────────────────────────

  /** All licenses for the current user (from GET /api/team/users/current/licenses). */
  readonly licenses = signal<License[]>([]);

  /** The active license ID (nullable). */
  readonly activeLicenseId = signal<string | null>(null);

  /** True while licenses are being fetched. */
  readonly isLoadingLicenses = signal<boolean>(false);

  /** Newly created license ID (used during post-signup flow). */
  readonly newlyCreatedLicenseId = signal<string | null>(null);

  // ── Computed Signals ──────────────────────────────────

  /**
   * Extracts ALL apps across all licenses into a flat array.
   * Equivalent to: licenses.reduce((acc, l) => acc.concat(l.apps), [])
   */
  readonly permissibleApps = computed<App[]>(() => {
    return this.licenses().reduce<App[]>((acc, l) => acc.concat(l.apps || []), []);
  });

  /** Finds the first sandbox app (isSandbox === true). */
  readonly sandboxApp = computed<App | null>(() => {
    return this.permissibleApps().find(app => app.isSandbox) ?? null;
  });

  /** First available app (fallback when no sandbox exists). */
  readonly firstApp = computed<App | null>(() => {
    const apps = this.permissibleApps();
    return apps.length > 0 ? apps[0] : null;
  });

  /** The active license object (or null). */
  readonly activeLicense = computed<License | null>(() => {
    const id = this.activeLicenseId();
    if (!id) return null;
    return this.licenses().find(l => l.licenseId === id) ?? null;
  });

  /** True if the active license has expired (based on app.licenseExpirationTime). */
  readonly isCurrentLicenseExpired = computed<boolean>(() => {
    const app = this.permissibleApps().find(a => a.appId === this.activeLicenseId());
    if (!app?.licenseExpirationTime) return false;
    return new Date(app.licenseExpirationTime).getTime() <= Date.now();
  });

  // ── Actions ───────────────────────────────────────────

  constructor(
    private teamClient: TeamClient,
    private licensesClient: LicensesClient,
    private storage: StorageService
  ) {}

  /** Fetches all licenses from GET /api/team/users/current/licenses. */
  async loadLicenses(): Promise<License[]> {
    this.isLoadingLicenses.set(true);
    try {
      const licenses = await firstValueFrom(this.teamClient.getLicenses());
      this.licenses.set(licenses);
      return licenses;
    } catch (e) {
      console.error('Failed to load licenses:', e);
      this.licenses.set([]);
      return [];
    } finally {
      this.isLoadingLicenses.set(false);
    }
  }

  /** Fetches best license from GET /api/licenses/best-license. */
  async getBestLicense(): Promise<AppLicense[] | null> {
    try {
      return await firstValueFrom(this.licensesClient.getBestLicense());
    } catch (e) {
      console.error('Failed to get best license:', e);
      return null;
    }
  }

  /** Creates a new license via POST /api/licenses. */
  async createLicense(appId: string | null, returnUrl: string | null): Promise<CreateLicenseResponse> {
    this.storage.remove('default-app');
    localStorage.removeItem('default-app');

    const targetLicenseId = (appId && appId !== 'null') ? appId : undefined;
    const licenseName = this.extractBaseDomain(returnUrl);

    const license = await firstValueFrom(
      this.licensesClient.createLicense(targetLicenseId, licenseName)
    );
    
    this.newlyCreatedLicenseId.set(license.licenseId);
    return license;
  }

  /**
   * Ensures a license token exists: reuses best license or creates new.
   * Returns { licenseId, authorizationCode }.
   */
  async ensureLicenseToken(appId: string | null, returnUrl: string | null): Promise<{ licenseId: string; authorizationCode: string }> {
    // Try best license first
    const bestLicenses = await this.getBestLicense();
    if (bestLicenses && bestLicenses.length > 0) {
      const targetId = this.storage.get('default-app');
      let appLicense = targetId 
        ? bestLicenses.find(al => al.appId === targetId) 
        : null;
      if (!appLicense) {
        appLicense = bestLicenses.find(al => al.isSandbox) ?? bestLicenses[0];
      }
      return {
        licenseId: appLicense.appId,
        authorizationCode: appLicense.authorizationCode,
      };
    }

    // No best license — create new
    const newLicense = await this.createLicense(appId, returnUrl);
    if (!newLicense || !newLicense.authorizationCode) {
      throw new Error('Failed to secure authorization code from created license.');
    }
    return {
      licenseId: newLicense.licenseId,
      authorizationCode: newLicense.authorizationCode,
    };
  }

  /** Helper: extracts root domain from URL. */
  private extractBaseDomain(url: string | null): string | undefined {
    if (!url) return undefined;
    try {
      const urlString = url.startsWith('http') ? url : `https://${url}`;
      const hostname = new URL(urlString).hostname;
      const parts = hostname.split('.');
      if (parts.length > 2) return parts.slice(-2).join('.');
      return hostname;
    } catch {
      return undefined;
    }
  }
}
```

### 5.5 WorkspaceStore (`src/app/core/stores/workspace.store.ts`)

Manages the active workspace/app context with the defensive localStorage guard.

```typescript
import { signal, computed, effect, Injectable } from '@angular/core';
import { App } from '@proxy/payment-app-proxy';
import { StorageService } from '../services/storage.service';
import { LicenseStore } from './license.store';

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  // ── Reserved keywords that cannot be used as appId ───

  private static readonly INVALID_APP_IDS = new Set([
    'undefined', 'null', 'forbidden', 'notfound', 'apps', 'auth', 'billing',
    'overview', 'payments', 'gateways', 'app-setting', 'policies',
    'fraud-activities', 'customers', 'team', 'personalization', 'dashboard',
    'login', 'register', 'app', 'licenses', 'rules', 'fraud'
  ]);

  // ── Writable Signals ──────────────────────────────────

  /** Active workspace/app ID (nullable). */
  readonly currentAppId = signal<string | null>(this.loadInitialAppId());

  /** Currently selected app object (nullable). */
  readonly selectedApp = signal<App | null>(null);

  // ── Computed Signals ──────────────────────────────────

  /** Combines currentAppId with LicenseStore.permissibleApps to find matching metadata. */
  readonly activeAppMetadata = computed<App | null>(() => {
    const appId = this.currentAppId();
    if (!appId) return null;
    const apps = this.licenseStore.permissibleApps();
    return apps.find(a => a.appId === appId) ?? null;
  });

  /** True if current app is a sandbox. */
  readonly isSandbox = computed<boolean>(() => {
    return this.activeAppMetadata()?.isSandbox ?? false;
  });

  // ── Effects ───────────────────────────────────────────

  constructor(
    private storage: StorageService,
    private licenseStore: LicenseStore
  ) {
    // Persist currentAppId to localStorage with validation guard
    effect(() => {
      const appId = this.currentAppId();
      if (appId && WorkspaceStore.isValidAppId(appId)) {
        this.storage.set('default-app', appId);
      } else if (appId === null) {
        this.storage.remove('default-app');
      }
    });
  }

  // ── Actions ───────────────────────────────────────────

  /** Sets the current app ID with validation. */
  setAppId(appId: string | null): void {
    if (appId && !WorkspaceStore.isValidAppId(appId)) {
      console.warn(`Blocked setting invalid appId: ${appId}`);
      return;
    }
    this.currentAppId.set(appId);
  }

  /** Sets the selected app object. */
  setSelectedApp(app: App | null): void {
    this.selectedApp.set(app);
  }

  /** Validates an appId against the reserved keyword block list. */
  static isValidAppId(appId: any): boolean {
    if (typeof appId !== 'string') return false;
    const clean = appId.trim().toLowerCase();
    if (!clean) return false;
    return !WorkspaceStore.INVALID_APP_IDS.has(clean);
  }

  /** Loads initial appId from localStorage (with validation). */
  private loadInitialAppId(): string | null {
    const stored = this.storage.get('default-app');
    if (stored && WorkspaceStore.isValidAppId(stored)) {
      return stored;
    }
    if (stored) {
      this.storage.remove('default-app');
    }
    return null;
  }
}
```

### 5.6 Signal Store Interaction Diagram

```
┌──────────────┐     reads      ┌──────────────┐
│  AuthStore   │◄──────────────│  StorageSvc  │
│  token       │── persists ──►│  (localStorage│
│  userId      │               │   wrapper)   │
│  isAuthentic │               └──────────────┘
│  isGoogleLdg │                      ▲
└──────┬───────┘                      │ reads
       │ reads                        │
       ▼                              │
┌──────────────┐     reads    ┌──────────────┐
│ SettingsStore│◄────────────│  API (GET    │
│  brand       │              │  /settings)  │
│  isDark      │── effect ──► │              │
│  activeLogo  │  (body class)└──────────────┘
│  isLicense=  │
│   TRUE       │  (hardcoded)
└──────────────┘
                       
┌──────────────┐     reads    ┌──────────────┐
│ LicenseStore │◄────────────│  API (GET    │
│  licenses    │              │  /licenses)  │
│  activeLic   │── reads ───► └──────────────┘
│  bestLicense │
│  permissible │
│   Apps       │
└──────┬───────┘
       │ computed reads
       ▼
┌──────────────┐     reads    ┌──────────────┐
│WorkspaceStore│◄────────────│ LicenseStore │
│  currentAppId │── persists─►│ permissibleApps│
│  activeApp   │   (localStorage)            │
│  Metadata    │              └──────────────┘
│  isSandbox   │
└──────────────┘
```

---

## Part 6: Firebase Authentication Service (Pure Angular)

### 6.1 Source Analysis

The source `FirebaseAuthService` (`payment-admin/src/app/auth/service/firebase-auth.service.ts`, 360 lines) handles:

1. Email/password sign-in via Firebase Auth (`signInWithEmailAndPassword`)
2. Email/password sign-up via Firebase Auth (`createUserWithEmailAndPassword`)
3. Google sign-in via popup (`signInWithPopup` using `OAuthProvider`)
4. Google sign-in via Capacitor native plugin (`GoogleAuth.signIn()`) — **REMOVED in fork**
5. Platform token exchange (`callSigninToAppInternal`, `callSignupToAppInternal`)
6. Background token refresh (`backgroundRefreshToken`, `reconnect`)
7. JWT parsing (`parseJwt`, `hasExpireTime`)
8. Session validation (`isUserAuthenticated`)
9. Signout flow (`signout`)
10. Error alert via Ionic `AlertController` — **REPLACED with Signal-based modal in fork**

### 6.2 Dependencies Removed

| Source Dependency | Replacement |
|---|---|
| `@angular/fire/compat/auth` (`AngularFireAuth`) | `@angular/fire/auth` (modern, non-compat) |
| `@codetrix-studio/capacitor-google-auth` | Removed — use Firebase `signInWithPopup` only |
| `@ionic/angular` `AlertController` | `NotificationService` (Signal-based toast) |
| `LoadingService` (Ionic `LoadingController`) | `AuthStore.startLoading()` / `stopLoading()` |
| `StorageService` for token | `AuthStore.token` signal (with effect persistence) |
| RxJS `Subject` instances | `AuthStore` signals |

### 6.3 Implementation (`src/app/core/services/firebase-auth.service.ts`)

```typescript
import { Injectable, inject } from '@angular/core';
import {
  OAuthProvider,
  UserCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  getAuth,
  signInWithCredential,
  signOut,
} from '@angular/fire/auth';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import {
  ApiKey,
  AuthenticationClient,
  SignInRequest,
  SignUpRequest,
  RefreshTokenType,
} from '@proxy/payment-app-proxy';
import { ApiException } from '@proxy/api-exception';
import { AuthStore } from '../stores/auth.store';
import { SettingsStore } from '../stores/settings.store';
import { NotificationService } from './notification.service';
import { StorageService } from './storage.service';
import { Logger } from './logger.service';
import { parseJwt, isTokenExpired } from '../utils/jwt.util';
import { environment } from '@environments/environment';

@Injectable({ providedIn: 'root' })
export class FirebaseAuthService {
  private readonly log = Logger.create('FirebaseAuth');
  private readonly auth = inject(Auth);
  
  private backgroundRefreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private authenticationClient: AuthenticationClient,
    private authStore: AuthStore,
    private notificationService: NotificationService,
    private storage: StorageService,
    private router: Router,
  ) {}

  // ── Email/Password Auth ───────────────────────────────

  /** Signs in with Firebase email/password. Returns UserCredential. */
  async signInWithEmail(email: string, password: string): Promise<UserCredential> {
    return await signInWithEmailAndPassword(this.auth, email, password);
  }

  /** Creates a Firebase account with email/password. Returns UserCredential. */
  async signUpWithEmail(email: string, password: string): Promise<UserCredential> {
    return await createUserWithEmailAndPassword(this.auth, email, password);
  }

  /** Sends a password reset email via Firebase. */
  async sendPasswordResetEmail(email: string): Promise<void> {
    await this.auth.sendPasswordResetEmail(email);
  }

  // ── Google Auth (Popup only — no Capacitor) ───────────

  /**
   * Opens a Google sign-in popup.
   * Returns UserCredential on success, null if user closes popup.
   */
  async signInWithPopup(): Promise<UserCredential | null> {
    try {
      const provider = new OAuthProvider(GoogleAuthProvider.PROVIDER_ID);
      environment.Scopes.forEach((scope: string) => provider.addScope(scope));
      return await signInWithPopup(this.auth, provider);
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user') {
        return null;
      }
      this.log.error('Google sign-in popup error:', error);
      throw error;
    }
  }

  // ── Platform Token Exchange ───────────────────────────

  /**
   * Exchanges Firebase idToken for platform ApiKey via POST /api/authentication/signin.
   * Stores token and userId in AuthStore.
   */
  async callSignIn(signInRequest: SignInRequest): Promise<ApiKey> {
    const result = await firstValueFrom(
      this.authenticationClient.signIn(signInRequest)
    );
    this.authStore.setSession(result.accessToken.value, result.userId);
    this.startBackgroundTokenRefresh();
    return result;
  }

  /**
   * Exchanges Firebase idToken for platform ApiKey via POST /api/authentication/signup.
   * Stores token and userId in AuthStore.
   * @param keepLoading If true, does not stop the loading indicator (used for auto-signup flow).
   */
  async callSignUp(signUpRequest: SignUpRequest, keepLoading = false): Promise<ApiKey> {
    const result = await firstValueFrom(
      this.authenticationClient.signUp(signUpRequest)
    );
    this.authStore.setSession(result.accessToken.value, result.userId);
    this.startBackgroundTokenRefresh();
    return result;
  }

  // ── Session Management ────────────────────────────────

  /** Returns true if a valid, non-expired token exists. */
  isUserAuthenticated(): boolean {
    return this.authStore.isAuthenticated();
  }

  /** Checks if the current token has expired. */
  hasExpired(): boolean {
    const token = this.authStore.token();
    if (!token) return true;
    return isTokenExpired(token);
  }

  /**
   * Signs out of Firebase, clears auth state, and redirects to signin.
   * Preserves query params and the default-app value.
   */
  async signout(preserveQueryParams?: Record<string, any>): Promise<void> {
    await signOut(this.auth);
    
    const defaultApp = this.storage.get('default-app');
    this.authStore.clearSession();
    this.storage.clear();
    
    // Restore default-app (cleared by storage.clear())
    if (defaultApp && this.storage.constructor !== undefined) {
      // Use direct localStorage since storage.clear() already ran
      localStorage.setItem('default-app', defaultApp);
    }
    
    if (this.backgroundRefreshInterval) {
      clearInterval(this.backgroundRefreshInterval);
      this.backgroundRefreshInterval = null;
    }

    // Redirect to signin with preserved query params
    let targetUrl = `${location.origin}/auth/signin`;
    if (preserveQueryParams) {
      const qParams = new URLSearchParams();
      Object.keys(preserveQueryParams).forEach((key) => {
        const val = preserveQueryParams[key];
        if (val !== null && val !== undefined) {
          qParams.set(key, String(val));
        }
      });
      const qStr = qParams.toString();
      if (qStr) targetUrl += `?${qStr}`;
    }
    location.href = targetUrl;
  }

  // ── Background Token Refresh ──────────────────────────

  /**
   * Schedules a token refresh 60 seconds before the current JWT expires.
   * On refresh, fetches a new Firebase idToken and re-signs in.
   */
  startBackgroundTokenRefresh(): void {
    if (this.backgroundRefreshInterval) {
      clearInterval(this.backgroundRefreshInterval);
    }
    
    const token = this.authStore.token();
    if (!token) return;

    const decoded = parseJwt(token);
    const exp = decoded.exp;
    const nowTime = Math.round(Date.now() / 1000);
    const jobTime = (exp - nowTime - 60) * 1000;

    if (jobTime <= 0) {
      this.reconnect();
      return;
    }

    this.backgroundRefreshInterval = setInterval(async () => {
      await this.reconnect(false);
    }, jobTime);
  }

  /**
   * Refreshes the platform token by getting a new Firebase idToken
   * and calling signIn again with RefreshTokenType.None.
   */
  async reconnect(showLoader = true): Promise<void> {
    if (showLoader) {
      this.authStore.startLoading('Refreshing session...');
    }
    
    try {
      const idToken = await this.getRefreshToken();
      const signInRequest = new SignInRequest({
        idToken,
        refreshTokenType: RefreshTokenType.None,
      });
      const result: ApiKey = await lastValueFrom(
        this.authenticationClient.signIn(signInRequest)
      );
      this.authStore.setSession(result.accessToken.value, result.userId);
      this.startBackgroundTokenRefresh();
    } catch (error) {
      if (showLoader) {
        this.authStore.stopLoading();
      }
      if (this.backgroundRefreshInterval) {
        clearInterval(this.backgroundRefreshInterval);
      }
      this.notificationService.showError(
        'Session expired. Please sign in again.'
      );
      await this.signout();
    }
  }

  /** Gets a fresh Firebase idToken (or signs out if unavailable). */
  private async getRefreshToken(): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) {
      await this.signout();
      throw new Error('No authenticated user');
    }
    return await user.getIdToken();
  }
}
```

### 6.4 Key Differences from Source

| Aspect | Source (payment-admin) | Fork (payment-console) |
|---|---|---|
| Auth import | `@angular/fire/compat/auth` (AngularFireAuth) | `@angular/fire/auth` (modern Auth) |
| Google sign-in | Popup + Capacitor native (`GoogleAuth.signIn()`) | Popup only (`signInWithPopup`) |
| Token storage | `StorageService.set('token', ...)` directly | `AuthStore.setSession()` → effect persists to localStorage |
| Loading state | `LoadingService.present()` / `dismiss()` (Ionic) | `AuthStore.startLoading()` / `stopLoading()` (Signal) |
| Error alerts | `AlertController.create()` (Ionic modal) | `NotificationService.showError()` (Signal toast) |
| State subjects | 6 RxJS `Subject` instances | `AuthStore` signals |
| JWT parsing | Inline `parseJwt()` method | Extracted to `jwt.util.ts` |
| Signout | `location.href` redirect | Same, but clears via `AuthStore.clearSession()` |

### 6.5 JWT Utility (`src/app/core/utils/jwt.util.ts`)

```typescript
export interface DecodedToken {
  at_hash?: string;
  aud?: string;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
  exp: number;
  iat?: number;
  iss?: string;
  sub?: string;
  [key: string]: any;
}

/** Decodes a JWT token's payload (without verification). */
export function parseJwt(token: string): DecodedToken {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    window
      .atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

/** Returns true if the token has expired (exp <= now). */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = parseJwt(token);
    const nowTime = Date.now() / 1000;
    return decoded.exp <= nowTime;
  } catch {
    return true;
  }
}
```

---

## Part 7: License Flow Service

### 7.1 Source Analysis

The source `LicenseFlowService` (`payment-admin/src/app/auth/service/license-flow.service.ts`, 117 lines) handles:

1. `getBestLicense()` — queries `GET /api/licenses/best-license`, finds matching `AppLicense` by appId, falls back to sandbox or first
2. `createLicense(appId, returnUrl)` — calls `POST /api/licenses?licenseId=X&licenseName=Y`, extracts domain from returnUrl for license name
3. `ensureLicenseToken(appId, returnUrl)` — tries `getBestLicense()`, falls back to `createLicense()`, returns `{ licenseId, authorizationCode }`
4. `extractBaseDomain(url)` — extracts root domain (e.g., `domain.com` from `sub.domain.com`)

In the fork, this logic moves into `LicenseStore` (Part 5.4) which already contains `getBestLicense()`, `createLicense()`, and `ensureLicenseToken()`. However, a thin **LicenseFlowService** wrapper is retained for backward compatibility and to keep the orchestrator clean.

### 7.2 Implementation (`src/app/core/services/license-flow.service.ts`)

```typescript
import { Injectable, inject } from '@angular/core';
import { LicenseStore } from '../stores/license.store';
import { CreateLicenseResponse } from '@proxy/payment-app-proxy';
import { Logger } from './logger.service';

@Injectable({ providedIn: 'root' })
export class LicenseFlowService {
  private readonly log = Logger.create('LicenseFlow');
  private readonly licenseStore = inject(LicenseStore);

  /**
   * Retrieves the best license matching the given target ID using
   * GET /api/licenses/best-license.
   * Returns { licenseId, authorizationCode } or null.
   */
  async getBestLicense(): Promise<{ licenseId: string; authorizationCode: string } | null> {
    const appLicenses = await this.licenseStore.getBestLicense();

    if (appLicenses && appLicenses.length > 0) {
      // Try to find license matching stored default-app
      const targetId = this.licenseStore['storage'].get('default-app');
      let appLicense = targetId
        ? appLicenses.find((al) => al.appId === targetId)
        : null;

      // Fallback to sandbox or first available
      if (!appLicense) {
        appLicense = appLicenses.find((al) => al.isSandbox) || appLicenses[0];
      }

      return {
        licenseId: appLicense.appId,
        authorizationCode: appLicense.authorizationCode,
      };
    }

    this.log.info('No best license returned by API.');
    return null;
  }

  /**
   * Creates a new license for the given appId and returnUrl's domain.
   * Calls POST /api/licenses?licenseId=X&licenseName=Y.
   */
  async createLicense(
    appId: string | null,
    returnUrl: string | null
  ): Promise<CreateLicenseResponse> {
    return await this.licenseStore.createLicense(appId, returnUrl);
  }

  /**
   * Guarantees a license token (authorization code) is returned,
   * reusing the best matching license if possible, otherwise creating a new one.
   */
  async ensureLicenseToken(
    appId: string | null,
    returnUrl: string | null
  ): Promise<{ licenseId: string; authorizationCode: string }> {
    return await this.licenseStore.ensureLicenseToken(appId, returnUrl);
  }
}
```

> **Note:** The `LicenseStore` already implements `getBestLicense()`, `createLicense()`, and `ensureLicenseToken()` directly (see Part 5.4). The `LicenseFlowService` is a thin facade that delegates to the store. Alternatively, the orchestrator can call `LicenseStore` directly and this service can be omitted. It is retained here to mirror the source architecture.

---

## Part 8: Auth Flow Orchestrator (Two-Stage Identity Exchange)

### 8.1 Source Analysis

The source `AuthFlowOrchestratorService` (`payment-admin/src/app/auth/service/auth-flow-orchestrator.service.ts`, 387 lines) is the **central brain** of the authentication flow. It coordinates:

1. `initiateFirebaseSession(idToken)` — entry point after Firebase auth resolves
2. `evaluatePostSignIn()` — decides routing after successful auth (grant-access vs dashboard)
3. `handleUnregisteredUser(idToken)` — auto-signup when signin returns 403 UnregisteredUserException
4. `completeAgreement()` — called when user accepts terms on agreement page
5. `handleGrantAccessDecision(isGranted, returnUrl, appId)` — grant-access consent flow
6. `proceedToDashboard(appId)` — license evaluation + dashboard routing
7. `navigateToDashboard(newlyCreatedLicenseId)` — workspace selection and navigation
8. `appendToken(urlStr, licenseId, authorizationCode)` — URL query param builder
9. `checkIfUnregistered(error)` — error inspection for 403 UnregisteredUserException
10. `getQueryParams()` — extracts all query params from the router state tree
11. `getErrorMessage(error, fallback)` — error message extractor

### 8.2 Fork Adaptations

| Source Pattern | Fork Pattern |
|---|---|
| `LoadingService.present()` / `dismiss()` | `AuthStore.startLoading()` / `stopLoading()` |
| `NotificationService.showErrorNotification()` | `NotificationService.showError()` |
| `firebaseAuthService.changeSigninWithGoogleLoading(bool)` | `AuthStore.isGoogleLoading.set(bool)` |
| `firebaseAuthService.signupAlreadyRegistered.next(bool)` | `AuthStore.signupAlreadyRegistered.set(bool)` |
| `settingsClient.get()` via `firstValueFrom` | `SettingsStore.load()` (cached) |
| `isLicenseActive = settings?.isSupportLicenseManagement` | `SettingsStore.isSupportLicenseManagement()` (always `true`) |
| `teamClient.getLicenses()` | `LicenseStore.loadLicenses()` |
| `layoutService.initApps(allApps)` | `WorkspaceStore` (apps derived from `LicenseStore.permissibleApps()`) |
| `storage.set('default-app', appId)` | `WorkspaceStore.setAppId(appId)` |

### 8.3 Implementation (`src/app/core/services/auth-flow-orchestrator.service.ts`)

```typescript
import { Injectable, inject } from '@angular/core';
import { Router, Params } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  TeamClient,
  SettingsClient,
  SignInRequest,
  SignUpRequest,
  RefreshTokenType,
  App,
} from '@proxy/payment-app-proxy';
import { FirebaseAuthService } from './firebase-auth.service';
import { LicenseFlowService } from './license-flow.service';
import { AuthStore } from '../stores/auth.store';
import { SettingsStore } from '../stores/settings.store';
import { LicenseStore } from '../stores/license.store';
import { WorkspaceStore } from '../stores/workspace.store';
import { NotificationService } from './notification.service';
import { StorageService } from './storage.service';
import { Logger } from './logger.service';

@Injectable({ providedIn: 'root' })
export class AuthFlowOrchestratorService {
  private readonly log = Logger.create('AuthFlowOrchestrator');

  private readonly router = inject(Router);
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly licenseFlow = inject(LicenseFlowService);
  private readonly teamClient = inject(TeamClient);
  private readonly settingsClient = inject(SettingsClient);
  private readonly notificationService = inject(NotificationService);
  private readonly storage = inject(StorageService);
  private readonly authStore = inject(AuthStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly licenseStore = inject(LicenseStore);
  private readonly workspaceStore = inject(WorkspaceStore);

  /**
   * MAIN ENTRY POINT.
   * Called after Firebase auth resolves with an idToken.
   * Determines if this is a signin or signup, calls the appropriate API,
   * then evaluates post-auth routing.
   */
  async initiateFirebaseSession(idToken: string): Promise<void> {
    const isSignup = this.router.url.includes('signup');
    this.authStore.signupAlreadyRegistered.set(false);

    try {
      this.authStore.isGoogleLoading.set(true);

      if (isSignup) {
        this.authStore.startLoading('Registering your user account...');
        const signUpRequest = new SignUpRequest({
          idToken,
          refreshTokenType: RefreshTokenType.Web,
        });
        await this.firebaseAuth.callSignUp(signUpRequest, false);
      } else {
        this.authStore.startLoading('Signing in...');
        const signInRequest = new SignInRequest({
          idToken,
          refreshTokenType: RefreshTokenType.Web,
        });
        await this.firebaseAuth.callSignIn(signInRequest);
      }

      this.authStore.stopLoading();
      this.log.info(
        isSignup
          ? 'Sign up successful, evaluating post-login flow.'
          : 'Sign in successful, evaluating post-login flow.'
      );
      await this.evaluatePostAuth();
    } catch (error: any) {
      this.authStore.isRedirectingToDashboard.set(false);
      this.authStore.stopLoading();
      this.log.warn(isSignup ? 'Sign up failed:' : 'Sign in failed:', error);

      const is403 = error?.status === 403;
      const isUnregisteredException =
        error?.typeName === 'UnregisteredUserException' ||
        error?.exceptionTypeName === 'UnregisteredUserException' ||
        error?.response?.includes('UnregisteredUserException') ||
        error?.response?.includes('UnregsistredUserException') ||
        error?.message?.includes('UnregisteredUserException') ||
        error?.message?.includes('UnregsistredUserException');

      if (isSignup && is403 && !isUnregisteredException) {
        // User already registered during signup attempt
        this.authStore.signupAlreadyRegistered.set(true);
        this.authStore.isGoogleLoading.set(false);
      } else if (!isSignup && this.checkIfUnregistered(error)) {
        // Signin returned 403 UnregisteredUserException — auto-signup
        this.log.info('User is unregistered. Triggering signup flow.');
        await this.handleUnregisteredUser(idToken);
      } else {
        const errorMsg = this.getErrorMessage(
          error,
          isSignup ? 'Registration failed.' : 'Authentication failed.'
        );
        this.notificationService.showError(errorMsg);
        this.authStore.isGoogleLoading.set(false);
      }
    }
  }

  /**
   * Evaluates routing after a successful sign-in or agreement.
   * STRICT LICENSING: isLicenseActive is always true.
   */
  async evaluatePostAuth(): Promise<void> {
    const params = this.getQueryParams();
    const returnUrl = params['returnUrl'];

    // Ensure settings are loaded (cached)
    await this.settingsStore.load();

    // STRICT LICENSING: always true
    const isLicenseActive = this.settingsStore.isSupportLicenseManagement();

    if (isLicenseActive && returnUrl) {
      // Branch A: Third-party consumer app — redirect to grant-access consent
      this.log.info(
        'returnUrl detected and licensing active. Redirecting to grant access.'
      );
      this.authStore.isRedirectingToDashboard.set(false);
      this.router.navigate(['/auth/grant-access'], { queryParams: params });
      this.authStore.isGoogleLoading.set(false);
    } else {
      // Branch B: Standard admin login — proceed to dashboard
      this.log.info('Navigating to admin dashboard (licensing active).');
      this.authStore.isRedirectingToDashboard.set(true);
      await this.proceedToDashboard(params['appId']);
    }
  }

  /**
   * Handles 403 / UnregisteredUserException by auto-signing up.
   */
  private async handleUnregisteredUser(idToken: string): Promise<void> {
    try {
      this.authStore.startLoading('Registering your user account...');
      const signUpRequest = new SignUpRequest({
        idToken,
        refreshTokenType: RefreshTokenType.Web,
      });
      await this.firebaseAuth.callSignUp(signUpRequest, true);
      this.authStore.stopLoading();

      const currentUrl = this.router.url;
      this.log.info('Signup API succeeded. Current URL:', currentUrl);

      if (currentUrl.includes('signup')) {
        // Came from signup page — continue normal flow
        await this.evaluatePostAuth();
      } else {
        // Came from signin — redirect to agreement page
        this.log.info('Redirecting to agreement / signup page.');
        const params = this.getQueryParams();
        this.router.navigate(['/auth/signup'], { queryParams: params });
        this.authStore.isGoogleLoading.set(false);
      }
    } catch (err: any) {
      this.authStore.stopLoading();
      this.log.error('Automatic signup failed:', err);
      const errorMsg = this.getErrorMessage(
        err,
        'User already exists or sign-up failed.'
      );
      this.notificationService.showError(errorMsg);
      this.authStore.isGoogleLoading.set(false);
    }
  }

  /**
   * Called when user accepts terms and clicks signup on the agreement page.
   */
  async completeAgreement(): Promise<void> {
    this.log.info('Agreement completed. Continuing flow.');
    await this.evaluatePostAuth();
  }

  /**
   * Handles user decision on the Grant Access page.
   * If granted: ensures license token, appends to returnUrl, redirects.
   * If denied: redirects to returnUrl without token.
   */
  async handleGrantAccessDecision(
    isGranted: boolean,
    returnUrl: string | null,
    appId: string | null
  ): Promise<void> {
    if (!returnUrl) {
      this.log.warn('No returnUrl provided. Navigating to signin.');
      this.router.navigate(['/auth/signin']);
      return;
    }

    if (!isGranted) {
      this.log.info('Access denied. Redirecting to returnUrl without token.');
      const fullReturnUrl = returnUrl.startsWith('http')
        ? returnUrl
        : `https://${returnUrl}`;
      window.location.href = fullReturnUrl;
      return;
    }

    try {
      this.authStore.startLoading('Preparing authorization...');
      const licenseInfo = await this.licenseFlow.ensureLicenseToken(
        appId,
        returnUrl
      );
      this.authStore.stopLoading();

      const finalUrl = this.appendToken(
        returnUrl,
        licenseInfo.licenseId,
        licenseInfo.authorizationCode
      );
      this.log.info('Redirecting to returnUrl with authorization code:', finalUrl);
      window.location.href = finalUrl;
    } catch (err: any) {
      this.authStore.stopLoading();
      this.log.error('Failed to secure authorization code:', err);
      const errorMsg = this.getErrorMessage(err, 'Failed to grant access.');
      this.notificationService.showError(errorMsg);
    }
  }

  /**
   * Handles checking licenses and routing to dashboard when returnUrl is absent.
   * STRICT LICENSING: always evaluates license flow.
   */
  private async proceedToDashboard(appId: string | null): Promise<void> {
    this.authStore.isRedirectingToDashboard.set(true);
    let newlyCreatedLicenseId: string | undefined;

    try {
      this.authStore.startLoading('Securing license...');
      await this.settingsStore.load();

      // STRICT LICENSING: always true — no need to check the flag
      const bestLicense = await this.licenseFlow.getBestLicense();
      if (bestLicense) {
        this.log.info('Reusing existing license:', bestLicense.licenseId);
      } else {
        this.log.info('No matching license. Creating new license.');
        const newLicense = await this.licenseFlow.createLicense(appId, null);
        if (newLicense && newLicense.licenseId) {
          newlyCreatedLicenseId = newLicense.licenseId;
        }
      }
    } catch (err) {
      this.log.warn('Non-fatal licensing evaluation error:', err);
    } finally {
      this.authStore.stopLoading();
    }

    await this.navigateToDashboard(newlyCreatedLicenseId);
  }

  /**
   * Navigates user to their active workspace overview or choose-app page.
   * STRICT LICENSING: always uses license-based app discovery.
   */
  async navigateToDashboard(newlyCreatedLicenseId?: string): Promise<void> {
    this.authStore.isRedirectingToDashboard.set(true);
    const params = this.getQueryParams();
    const appId = params['appId'];

    // If appId is in query params, navigate directly
    if (appId) {
      this.workspaceStore.setAppId(appId);
      this.router.navigate([`/${appId}/overview`]);
      return;
    }

    // Check stored default-app
    const storedAppId = this.storage.get('default-app');
    if (storedAppId && WorkspaceStore.isValidAppId(storedAppId)) {
      this.router.navigate([`/${storedAppId}/overview`]);
      return;
    }

    // No stored app — fetch licenses and find sandbox or first app
    try {
      this.authStore.startLoading('Loading workspaces...');
      const licenses = await this.licenseStore.loadLicenses();
      const allApps = this.licenseStore.permissibleApps();

      // If a new license was just created, try to find its sandbox app first
      if (newlyCreatedLicenseId) {
        const targetLicense = licenses.find(
          (l) => l.licenseId === newlyCreatedLicenseId
        );
        if (targetLicense?.apps?.length) {
          const sandboxApp = targetLicense.apps.find((app) => app.isSandbox);
          if (sandboxApp) {
            this.navigateWithDelay(sandboxApp.appId);
            return;
          }
        }
      }

      // Fallback: find sandbox app across all licenses
      const sandboxApp = this.licenseStore.sandboxApp();
      if (sandboxApp) {
        this.navigateWithDelay(sandboxApp.appId);
      } else if (allApps.length >= 1) {
        this.navigateWithDelay(allApps[0].appId);
      } else {
        this.router.navigate(['/notfound']);
      }
    } catch (err: any) {
      this.log.error('Failed to load dashboard data:', err);
      const errorMsg = this.getErrorMessage(
        err,
        'Failed to load dashboard workspaces.'
      );
      this.notificationService.showError(errorMsg);
    } finally {
      this.authStore.stopLoading();
      this.authStore.isGoogleLoading.set(false);
    }
  }

  /** Helper: sets appId and navigates after a short delay (matches source timing). */
  private navigateWithDelay(appId: string): void {
    setTimeout(() => {
      this.workspaceStore.setAppId(appId);
      this.router.navigate([`/${appId}/overview`]);
    }, 200);
  }

  // ── Utility Methods ───────────────────────────────────

  /** Appends licenseId and authorizationCode as query params to a URL. */
  private appendToken(
    urlStr: string,
    licenseId: string,
    authorizationCode: string
  ): string {
    const fullUrl = urlStr.startsWith('http')
      ? urlStr
      : `https://${urlStr}`;
    const url = new URL(fullUrl);
    url.searchParams.set('licenseId', licenseId);
    url.searchParams.set('authorizationCode', authorizationCode);
    return url.toString();
  }

  /** Checks if an API error indicates an unregistered user (403). */
  private checkIfUnregistered(error: any): boolean {
    if (!error) return false;
    return (
      error.status === 403 ||
      error.typeName === 'UnregisteredUserException' ||
      error.exceptionTypeName === 'UnregisteredUserException' ||
      error.response?.includes('UnregisteredUserException') ||
      error.response?.includes('UnregsistredUserException') ||
      error.message?.includes('UnregisteredUserException') ||
      error.message?.includes('UnregsistredUserException')
    );
  }

  /** Extracts all query parameters from the active router state tree. */
  private getQueryParams(): Params {
    let route = this.router.routerState.snapshot.root;
    const params = { ...route.queryParams };
    while (route.firstChild) {
      route = route.firstChild;
      Object.assign(params, route.queryParams);
    }
    return params;
  }

  /** Extracts a user-friendly error message from ApiException or standard error. */
  private getErrorMessage(error: any, fallback: string): string {
    if (!error) return fallback;

    if (
      error.message &&
      typeof error.message === 'string' &&
      error.message.trim() !== ''
    ) {
      return error.message;
    }

    if (error.response) {
      try {
        let parsed: any = error.response;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (parsed && typeof parsed === 'object') {
          if (parsed.Message) return parsed.Message;
          if (parsed.message) return parsed.message;
        }
      } catch {}
    }

    if (
      error.Message &&
      typeof error.Message === 'string' &&
      error.Message.trim() !== ''
    ) {
      return error.Message;
    }

    return fallback;
  }
}
```

### 8.4 Flow Decision Tree (Strict Licensing)

```
initiateFirebaseSession(idToken)
    │
    ├── isSignup? 
    │   ├── YES → AuthenticationClient.signUp(SignUpRequest{idToken, Web})
    │   └── NO  → AuthenticationClient.signIn(SignInRequest{idToken, Web})
    │
    ├── SUCCESS → evaluatePostAuth()
    │   │
    │   ├── returnUrl present?
    │   │   ├── YES → router.navigate(['/auth/grant-access'])
    │   │   └── NO  → proceedToDashboard(appId)
    │   │       │
    │   │       ├── getBestLicense() → GET /api/licenses/best-license
    │   │       │   ├── found → reuse
    │   │       │   └── null → createLicense() → POST /api/licenses
    │   │       │
    │   │       └── navigateToDashboard()
    │   │           ├── appId in queryParams? → navigate /{appId}/overview
    │   │           ├── stored default-app? → navigate /{storedAppId}/overview
    │   │           └── else: loadLicenses() → find sandbox/first app → navigate
    │   │
    │   └── (done)
    │
    └── ERROR
        ├── isSignup && 403 && !UnregisteredUserException
        │   → signupAlreadyRegistered = true (show warning)
        │
        ├── !isSignup && 403 UnregisteredUserException
        │   → handleUnregisteredUser(idToken)
        │       → AuthenticationClient.signUp()
        │       ├── from signup URL → evaluatePostAuth()
        │       └── from signin URL → navigate /auth/signup
        │
        └── else → showErrorNotification(message)
```

---

## Part 9: HTTP Interceptors (Functional)

### 9.1 Source Analysis

The source project has two HTTP interceptors:

1. **`HttpConfigInterceptor`** (`interceptor.ts`, 58 lines) — class-based `HttpInterceptor`:
   - Injects `Authorization: Bearer {token}` header from `localStorage.getItem("token")`
   - Sets `Content-Type: application/json` (unless body is `FormData`)
   - Sets `Accept: application/json`
   - Skips auth header for `.svg` requests

2. **`HttpErrorInterceptor`** (`errorInterceptor.ts`, 85 lines) — class-based `HttpInterceptor`:
   - Catches `HttpErrorResponse`
   - Parses error body (Blob, JSON object, or string)
   - Detects `AppInactiveException` and shows alert
   - Wraps errors into `ResponseErrorDto` and re-throws

### 9.2 Fork Adaptation

The fork replaces both class-based interceptors with **functional interceptors** (`HttpInterceptorFn`), which is the Angular 19+ preferred pattern. The interceptors read from `AuthStore` signals instead of `localStorage` directly.

### 9.3 Auth Interceptor (`src/app/core/interceptors/auth.interceptor.ts`)

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthStore } from '../stores/auth.store';
import { WorkspaceStore } from '../stores/workspace.store';

/**
 * Injects the Bearer token and workspace header into all outbound HTTP requests.
 * Skips authentication for static asset requests (.svg, .png, .ico, etc.).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const workspaceStore = inject(WorkspaceStore);

  const token = authStore.token();
  const appId = workspaceStore.currentAppId();

  // List of file extensions that should NOT receive auth headers
  const skipAuthExtensions = ['.svg', '.png', '.ico', '.jpg', '.jpeg', '.gif', '.css', '.js'];
  const shouldSkipAuth = skipAuthExtensions.some(ext => req.url.includes(ext));

  let headers = req.headers;

  // 1. Inject Authorization header
  if (token && !shouldSkipAuth) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  // 2. Inject workspace isolation header
  if (appId && WorkspaceStore.isValidAppId(appId)) {
    headers = headers.set('X-App-Id', appId);
  }

  // 3. Set Content-Type (unless FormData)
  if (!(req.body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers = headers.set('Content-Type', 'application/json');
    }
  }

  // 4. Set Accept header
  headers = headers.set('Accept', 'application/json');

  const clonedReq = req.clone({ headers });
  return next(clonedReq);
};
```

### 9.4 Error Interceptor (`src/app/core/interceptors/error.interceptor.ts`)

```typescript
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError, EMPTY } from 'rxjs';
import { AuthStore } from '../stores/auth.store';
import { NotificationService } from '../services/notification.service';
import { Logger } from '../services/logger.service';

/**
 * Catches HTTP errors, handles 401/403 by resetting auth state,
 * and normalizes error objects for downstream consumers.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const notificationService = inject(NotificationService);
  const router = inject(Router);
  const logger = Logger.create('HttpError');

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorResponse: any = null;

      // Parse error body
      if (error.error && error.error instanceof Blob) {
        // Blob errors need async conversion — for simplicity, use error.message
        errorResponse = { message: error.message };
      } else if (typeof error.error === 'object' && error.error !== null) {
        errorResponse = error.error;
      } else if (typeof error.error === 'string') {
        try {
          errorResponse = JSON.parse(error.error);
        } catch {
          errorResponse = { message: error.error };
        }
      }

      // Detect AppInactiveException
      if (errorResponse?.TypeName === 'AppInactiveException') {
        const url = req.url;
        const isLicenseUrl = 
          /\/api\/apps\/[^/]+\/(renew-license|license-invoices)/.test(url) ||
          /\/api\/apps\/[^/]+$/.test(url);

        if (!isLicenseUrl) {
          notificationService.showError(
            'This application is inactive. Please renew your license.'
          );
          return EMPTY;
        }
      }

      // Handle 401/403 — reset auth state and redirect
      if (error.status === 401) {
        logger.warn('401 Unauthorized — clearing session.');
        authStore.clearSession();
        router.navigate(['/auth/signin']);
        return EMPTY;
      }

      if (error.status === 403) {
        // 403 is handled by the auth flow orchestrator (UnregisteredUserException check)
        // Do NOT auto-redirect here — let the calling service inspect the error
      }

      // Normalize and re-throw
      const normalizedError = {
        message:
          errorResponse?.message ||
          errorResponse?.Message ||
          error.message ||
          'An unknown error occurred',
        type: error.statusText,
        typeName: errorResponse?.TypeName,
        status: error.status,
        response: errorResponse,
      };

      return throwError(() => normalizedError);
    })
  );
};
```

### 9.5 Interceptor Registration

In `app.config.ts`:

```typescript
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { errorInterceptor } from '@core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // ... other providers
  ],
};
```

**Order matters:** `authInterceptor` runs first (adds headers), then `errorInterceptor` catches response errors.

### 9.6 Key Differences from Source

| Aspect | Source (payment-admin) | Fork (payment-console) |
|---|---|---|
| Pattern | Class-based `HttpInterceptor` | Functional `HttpInterceptorFn` |
| Token source | `localStorage.getItem("token")` | `AuthStore.token()` signal |
| App ID source | Not injected | `WorkspaceStore.currentAppId()` signal |
| 401 handling | Commented out | Active — clears session, redirects to signin |
| AppInactiveException | Shows Ionic alert via `ErrorHandlerUiService` | Shows `NotificationService.showError()` |
| Error normalization | `ResponseErrorDto` class | Plain object with same shape |

---

## Part 10: Route Guards (Functional CanActivateFn)

### 10.1 Source Analysis

The source `AuthGuard` (`payment-admin/src/app/auth/guard/auth.guard.ts`, 52 lines) is a class-based `CanActivate` guard that:

1. Reads `token` from `StorageService`
2. Checks if token exists, is not expired (`firebaseAuthService.hasExpireTime()`), and can be base64-decoded
3. If invalid: clears storage and redirects to `/auth/signin` with preserved query params
4. If valid: returns `true`

### 10.2 Fork: AuthGuard (`src/app/core/guards/auth.guard.ts`)

```typescript
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthStore } from '../stores/auth.store';
import { StorageService } from '../services/storage.service';
import { isTokenExpired } from '../utils/jwt.util';

/**
 * Validates user identity before allowing navigation to protected routes.
 * If not authenticated, redirects to /auth/signin with preserved query params.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authStore = inject(AuthStore);
  const storage = inject(StorageService);
  const router = inject(Router);

  const token = authStore.token();

  if (!validToken(token)) {
    storage.clear();
    router.navigate(['/auth/signin'], {
      queryParams: route.queryParams,
    });
    return false;
  }

  return true;
};

/** Validates a JWT token: exists, not expired, and decodable. */
function validToken(token: string | null | undefined): boolean {
  if (!token) return false;
  if (isTokenExpired(token)) return false;
  
  // Verify it can be base64-decoded
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    window.atob(base64);
    return true;
  } catch {
    return false;
  }
}
```

### 10.3 Fork: LicenseGuard (`src/app/core/guards/license.guard.ts`)

This guard is NEW in the fork — it enforces that the active workspace has a valid, non-expired license. In the source project, this logic was embedded in the `ApplicationComponent` via expiration checks. The fork extracts it into a dedicated guard for the protected workspace subtree.

```typescript
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { LicenseStore } from '../stores/license.store';
import { WorkspaceStore } from '../stores/workspace.store';

/**
 * Secures licensed routes. Verifies that the workspace appId
 * exists in the user's permissible apps and the license is not expired.
 * If invalid, redirects to /forbidden.
 */
export const licenseGuard: CanActivateFn = (route, state) => {
  const licenseStore = inject(LicenseStore);
  const workspaceStore = inject(WorkspaceStore);
  const router = inject(Router);

  const appId = route.paramMap.get('appId');
  
  if (!appId) {
    router.navigate(['/forbidden']);
    return false;
  }

  // Check if appId is in permissible apps
  const apps = licenseStore.permissibleApps();
  const matchingApp = apps.find(a => a.appId === appId);

  if (!matchingApp) {
    router.navigate(['/forbidden']);
    return false;
  }

  // Check if license has expired
  if (matchingApp.licenseExpirationTime) {
    const expDate = new Date(matchingApp.licenseExpirationTime);
    if (expDate.getTime() <= Date.now()) {
      router.navigate(['/forbidden']);
      return false;
    }
  }

  // Update workspace store with the validated app
  workspaceStore.setAppId(appId);
  workspaceStore.setSelectedApp(matchingApp);

  return true;
};
```

### 10.4 Guard Registration

Guards are applied directly in route definitions (see Part 11):

```typescript
{
  matcher: tenantWorkspaceIdMatcher,
  component: DashboardLayoutComponent,
  canActivate: [authGuard, licenseGuard],
  children: [/* ... */],
}
```

### 10.5 Key Differences from Source

| Aspect | Source (payment-admin) | Fork (payment-console) |
|---|---|---|
| Pattern | Class-based `CanActivate` | Functional `CanActivateFn` |
| Token source | `StorageService.get("token")` | `AuthStore.token()` signal |
| Expiry check | `FirebaseAuthService.hasExpireTime()` | `isTokenExpired()` utility function |
| License check | Embedded in `ApplicationComponent` | Dedicated `licenseGuard` |
| Redirect target | `/auth/signin` | `/auth/signin` (same) |
| Query param preservation | `queryParams: route.queryParams` | Same |

---

## Part 11: Routing Configuration & Custom UrlMatcher

### 11.1 Source Analysis

The source routing system (`app-routing.module.ts`, 147 lines) uses:

1. **Custom `UrlMatcher`** (`appIdMatcher`) — matches the first URL segment as a dynamic `appId` parameter, UNLESS it matches a reserved keyword. This allows routes like `/{appId}/overview` while preventing `forbidden` or `auth` from being captured as appIds.

2. **Module-based lazy loading** — `loadChildren: () => import(...)` for feature modules.

3. **Route structure:**
   - `/auth` → `AuthComponent` (layout) with child `AUTH_ROUTES`
   - `/auth/grant-access` → `GrantAccessComponent` (standalone, guarded)
   - `/auth/choose-app` → `AuthChooseAppComponent`
   - `/forbidden` → `ApplicationComponent` + lazy `ForbiddenModule`
   - `/notfound` → `NotfoundComponent`
   - `/apps` → lazy `AppListModule`
   - `{matcher: appIdMatcher}` → `ApplicationComponent` + `CONTENT_ROUTES` (guarded)
   - `""` → `ApplicationComponent` (guarded)
   - `{matcher: appIdRedirectMatcher}` → redirect `:appName` → `:appName/overview`
   - `**` → redirect to `notfound`

### 11.2 Fork Adaptation

| Source Pattern | Fork Pattern |
|---|---|
| `NgModule` with `RouterModule.forRoot()` | `provideRouter(routes)` in `app.config.ts` |
| `RouteReuseStrategy` (IonicRouteStrategy) | Removed (not needed) |
| `PreloadAllModules` | `withPreloading(NoPreloading)` (auth-only app, no lazy feature modules) |
| `AuthComponent` (Ionic layout) | `AuthLayoutComponent` (pure HTML5) |
| `ApplicationComponent` (Ionic layout) | `DashboardLayoutComponent` (stub) |
| `CONTENT_ROUTES` (all feature modules) | Minimal stub routes (overview, forbidden) |
| `AUTH_ROUTES` (NgModule children) | Inline route definitions |

### 11.3 Custom UrlMatcher (`src/app/app.routes.ts`)

```typescript
import { Routes, UrlSegment, UrlSegmentGroup, Route, UrlMatchResult } from '@angular/router';

/**
 * Reserved keywords that cannot be matched as dynamic appId segments.
 * This prevents /forbidden, /auth, /notfound, etc. from being
 * captured as workspace IDs by the dynamic matcher.
 */
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

/**
 * Matches a single URL segment as an appId parameter.
 * Returns null (no match) if the segment is a reserved keyword,
 * causing the router to fall through to explicit route definitions.
 */
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

/**
 * Matches a single non-reserved segment for redirect to :appName/overview.
 * Used as a catch-all for /{appId} → /{appId}/overview.
 */
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
```

### 11.4 Route Configuration (`src/app/app.routes.ts`)

```typescript
import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { licenseGuard } from '@core/guards/license.guard';
import { AuthLayoutComponent } from '@features/auth/auth-layout/auth-layout.component';
import { SigninComponent } from '@features/auth/signin/signin.component';
import { AgreementComponent } from '@features/auth/agreement/agreement.component';
import { GrantAccessComponent } from '@features/auth/grant-access/grant-access.component';
import { ForbiddenComponent } from '@features/errors/forbidden/forbidden.component';
import { NotFoundComponent } from '@features/errors/not-found/not-found.component';
import { DashboardLayoutComponent } from '@features/dashboard/dashboard-layout/dashboard-layout.component';
import { OverviewComponent } from '@features/dashboard/overview/overview.component';
import { tenantWorkspaceIdMatcher, appIdRedirectMatcher } from './app.routes';

export const routes: Routes = [
  // ── Auth Feature Routes (public) ─────────────────────
  {
    path: 'auth',
    component: AuthLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'signin' },
      { path: 'signin', component: SigninComponent },
      { path: 'signup', component: AgreementComponent },
      { path: 'forget-password', component: ForgetPasswordComponent },
    ],
  },

  // ── Grant Access (guarded — requires auth) ───────────
  {
    path: 'auth/grant-access',
    component: GrantAccessComponent,
    canActivate: [authGuard],
  },

  // ── Error Pages ──────────────────────────────────────
  {
    path: 'forbidden',
    component: ForbiddenComponent,
    canActivate: [authGuard],
  },
  {
    path: 'notfound',
    component: NotFoundComponent,
  },

  // ── Tenant Workspace Subtree (guarded) ───────────────
  // Matches /{appId}/overview, /{appId}/billing, etc.
  // appId is extracted via custom UrlMatcher
  {
    matcher: tenantWorkspaceIdMatcher,
    component: DashboardLayoutComponent,
    canActivate: [authGuard, licenseGuard],
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: OverviewComponent },
      // Future routes: billing, team, app-setting, etc.
    ],
  },

  // ── Root redirect (guarded) ──────────────────────────
  {
    path: '',
    pathMatch: 'full',
    component: DashboardLayoutComponent,
    canActivate: [authGuard],
  },

  // ── Single-segment redirect: /{appId} → /{appId}/overview ──
  {
    matcher: appIdRedirectMatcher,
    redirectTo: ':appName/overview',
    pathMatch: 'full',
  },

  // ── Wildcard catch-all ────────────────────────────────
  { path: '**', redirectTo: 'notfound', pathMatch: 'full' },
];
```

### 11.5 Router Provider Configuration

In `app.config.ts`:

```typescript
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    // withComponentInputBinding() allows route params to be bound
    // directly to component inputs (e.g., @Input() appId)
  ],
};
```

### 11.6 Key Differences from Source

| Aspect | Source | Fork |
|---|---|---|
| Router setup | `RouterModule.forRoot()` in `AppRoutingModule` | `provideRouter()` in `app.config.ts` |
| Preloading | `PreloadAllModules` | None (no lazy feature modules) |
| Route reuse | `IonicRouteStrategy` | Default Angular strategy |
| Auth routes | 6 routes (signin, signup, oldsignup, forget-password, confirm, agreement) | 3 routes (signin, signup/agreement, forget-password) — `confirm` removed; **forget-password re-added** (see Part 13.6) |
| Content routes | 11 feature module routes | 1 stub (overview) |
| Guard pattern | Class-based `AuthGuard` | Functional `authGuard` + `licenseGuard` |
| Choose-app route | `/auth/choose-app` standalone | Removed (license-only flow auto-selects app) |

---

## Part 12: Global Styles & Theme System (SCSS)

### 12.1 Source Style Architecture

The source project's styling is layered:

| Layer | File | Purpose |
|---|---|---|
| HTML shell | `src/index.html` | Font links (Inter, Material Symbols Outlined), theme CSS link |
| Global SCSS | `src/global.scss` (629 lines) | Ionic CSS imports, PrimeNG imports, global utility classes, table styles |
| Theme variables | `src/theme/variables.scss` (759 lines) | Ionic CSS variables, light/dark theme tokens, dashboard tokens |
| Auth layout | `src/app/auth/layout/auth/auth.component.scss` (173 lines) | Auth card, page shell, spinner, loader overlay |
| Signin page | `src/app/auth/view/signin/signin.component.scss` (226 lines) | Brand, social button, form inputs, submit button |
| Agreement page | `src/app/auth/view/agreement/agreement.component.scss` (278 lines) | Same as signin + checkbox stack, warning box |
| Grant access | `src/app/auth/view/grant-access/grant-access.component.scss` (181 lines) | Card, permissions box, actions, status states |
| Theme CSS | `src/assets/css/theme-md-light-indigo.css` | Angular Material light theme |
| Theme CSS | `src/assets/css/md-dark-indigo.css` | Angular Material dark theme |

### 12.2 Fork Style Strategy

The fork **removes** all Ionic, PrimeNG, and Angular Material CSS. The auth component SCSS files are **adapted** to use standalone CSS custom properties (no Ionic variable dependencies). The theme CSS files are retained for the `<link>` tag dynamic switching (they only contain Material Design color tokens, not component styles).

### 12.3 `src/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Payment Console</title>
    <base href="/" />

    <meta name="color-scheme" content="light dark" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no"
    />

    <link rel="icon" type="ICO" href="./assets/icon/logo__app.ico" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <link
      href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
      rel="stylesheet"
    />

    <link
      id="app-theme"
      rel="stylesheet"
      href="./assets/css/theme-md-light-indigo.css"
      type="text/css"
    />

    <meta
      name="google-signin-client_id"
      content="215465091608-8v4p5khbsse4jbbrpmkkjoagl3dgi7ss.apps.googleusercontent.com"
    />
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
```

### 12.4 `src/styles.scss` (Global)

This replaces the source's `global.scss` + `theme/variables.scss`. Only retains auth-relevant tokens and removes all Ionic/PrimeNG references.

```scss
// ═══════════════════════════════════════════════════════════
//  GLOBAL STYLES — Payment Console (Pure Angular)
//  Replaces: global.scss + theme/variables.scss (Ionic-free)
// ═══════════════════════════════════════════════════════════

// ── Reset ──────────────────────────────────────────────
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}

html {
  font-size: 15px;
  font-family: 'Inter', sans-serif;
}

body {
  min-height: 100vh;
}

a {
  color: var(--primary);
  text-decoration: none;
  transition: color 0.2s ease;

  &:hover {
    text-decoration: underline;
  }
}

// ── Auth Theme Variables (Light — default) ─────────────
:root,
body.theme-light {
  --primary: #5b7cfa;
  --primary-hover: #4765e0;
  --radius: 18px;

  --bg: #f5f7ff;
  --surface: #ffffff;
  --surface-alt: #f8f9ff;
  --text: #111827;
  --muted: #6b7280;
  --border: #e5e7eb;
  --shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
  --input-bg: #ffffff;
  --auth-gradient: radial-gradient(
    circle at top,
    #eef3ff 0%,
    #f7f7ff 45%,
    var(--bg) 100%
  );
  --surface-overlay: rgba(255, 255, 255, 0.75);

  // Status colors
  --ion-color-danger: #eb445a;
  --ion-color-success: #2dd36f;
  --ion-color-warning: #ffc409;
  --ion-color-primary: #3880ff;

  // Dashboard tokens (retained for future use)
  --qa-bg-color: #f8fafc;
  --qa-card-bg: #ffffff;
  --qa-text-main: #0f172a;
  --qa-text-muted: #475569;
  --qa-border-color: #e2e8f0;
}

// ── Auth Theme Variables (Dark) ────────────────────────
body.theme-dark {
  --bg: #0f1220;
  --surface: #161b32;
  --surface-alt: #1f2748;
  --text: #eef2ff;
  --muted: #a7afcf;
  --border: #2d365f;
  --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  --input-bg: #10162c;
  --auth-gradient: radial-gradient(
    circle at top,
    #1a234d 0%,
    #0f1220 45%,
    #0a0d18 100%
  );
  --surface-overlay: rgba(22, 27, 50, 0.75);

  --ion-color-danger: #ff4961;
  --ion-color-success: #2fdf75;
  --ion-color-warning: #ffd534;
  --ion-color-primary: #428cff;

  --qa-bg-color: #0b0f19;
  --qa-card-bg: #121826;
  --qa-text-main: #ffffff;
  --qa-text-muted: #8b949e;
  --qa-border-color: #1f2937;
}

// ── System theme (follows OS preference when no explicit class) ──
@media (prefers-color-scheme: dark) {
  body:not(.theme-light):not(.theme-dark) {
    --bg: #0f1220;
    --surface: #161b32;
    --surface-alt: #1f2748;
    --text: #eef2ff;
    --muted: #a7afcf;
    --border: #2d365f;
    --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
    --input-bg: #10162c;
    --auth-gradient: radial-gradient(
      circle at top,
      #1a234d 0%,
      #0f1220 45%,
      #0a0d18 100%
    );
    --surface-overlay: rgba(22, 27, 50, 0.75);
  }
}

// ── Spinner Animation ──────────────────────────────────
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

// ── Utility Classes ────────────────────────────────────
.cursor-pointer {
  cursor: pointer;
}

.p-relative {
  position: relative;
}
```

### 12.5 Theme CSS Files

Copy these verbatim from the source:

```bash
cp /home/salman/Projects/ezpin/payment-admin/src/assets/css/theme-md-light-indigo.css src/assets/css/
cp /home/salman/Projects/ezpin/payment-admin/src/assets/css/md-dark-indigo.css src/assets/css/
```

These files are loaded dynamically via the `<link id="app-theme">` tag in `index.html`. The `ThemeService` (or `SettingsStore` effect) switches the `href` attribute between:
- `./assets/css/theme-md-light-indigo.css` (light mode)
- `md-dark-indigo.css` (dark mode)

### 12.6 Theme Switching Logic

In `SettingsStore` (Part 5.3), the `toggleTheme()` method updates the `isDark` signal. An effect watches `isDark` and:

1. Updates `localStorage["app-theme"]`
2. Adds/removes `body.theme-dark` / `body.theme-light` classes
3. Updates the `<meta name="color-scheme">` content
4. Switches the `<link id="app-theme">` href

The `<link>` href switching (step 4) can be added as a separate effect or inline:

```typescript
// In SettingsStore constructor:
effect(() => {
  const dark = this.isDark();
  const themeLink = document.getElementById('app-theme') as HTMLLinkElement;
  if (themeLink) {
    themeLink.href = dark 
      ? './assets/css/md-dark-indigo.css' 
      : './assets/css/theme-md-light-indigo.css';
  }
});
```

### 12.7 Auth Layout SCSS

The auth layout SCSS from the source (`auth.component.scss`, 173 lines) is adapted to remove `:host-context(ion-content)` selectors and Ionic CSS variable references. The core design tokens (`--bg`, `--surface`, `--text`, `--border`, `--primary`, etc.) are defined globally in `styles.scss` (Part 12.4) and referenced in the component SCSS.

See Part 13 for the complete auth layout component SCSS.

---

## Part 13: Auth Layout & Feature Components

### 13.1 AuthLayoutComponent (Shell)

This replaces the source `AuthComponent` (`payment-admin/src/app/auth/layout/auth/auth.component.ts`, 329 lines). The source component subscribes to 6 RxJS Subjects from `FirebaseAuthService` and orchestrates the Google sign-in popup flow. The fork replaces all RxJS subscriptions with Signal reads from `AuthStore` and `SettingsStore`.

#### Component (`src/app/features/auth/auth-layout/auth-layout.component.ts`)

```typescript
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subject, takeUntil } from 'rxjs';
import { AuthStore } from '@core/stores/auth.store';
import { SettingsStore } from '@core/stores/settings.store';
import { AuthFlowOrchestratorService } from '@core/services/auth-flow-orchestrator.service';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { NotificationService } from '@core/services/notification.service';
import { Logger } from '@core/services/logger.service';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './auth-layout.component.html',
  styleUrls: ['./auth-layout.component.scss'],
})
export class AuthLayoutComponent implements OnInit, OnDestroy {
  private readonly log = Logger.create('AuthLayout');
  private readonly destroy$ = new Subject<void>();

  // Inject stores and services
  readonly authStore = inject(AuthStore);
  readonly settingsStore = inject(SettingsStore);
  private readonly orchestrator = inject(AuthFlowOrchestratorService);
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Local state for popup-blocked error modal
  showAuthErrorModal = false;

  async ngOnInit(): Promise<void> {
    // Load settings (cached — only fetches once)
    await this.settingsStore.load();

    // Check if user is already authenticated → redirect to dashboard
    if (this.authStore.isAuthenticated()) {
      await this.orchestrator.evaluatePostAuth();
    }

    // Watch for confirm route to adjust UI
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        // Could be used for route-specific UI adjustments
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initiates Google sign-in popup flow.
   * Called when the Google button is clicked in child components.
   * The child components call this via the orchestrator directly.
   */
  async signinWithGoogle(): Promise<void> {
    this.authStore.isGoogleLoading.set(true);
    
    try {
      const userCredential = await this.firebaseAuth.signInWithPopup();
      
      if (userCredential) {
        const idToken = await userCredential.user.getIdToken();
        await this.orchestrator.initiateFirebaseSession(idToken);
      } else {
        // Popup was closed by user
        this.authStore.isGoogleLoading.set(false);
        this.notificationService.showError(
          'Sign-in was cancelled because the Google login popup was closed.'
        );
      }
    } catch (error: any) {
      this.authStore.isGoogleLoading.set(false);
      
      const errorMsg = error?.code || error?.message || '';
      const isPopupClosed = errorMsg.includes('popup-closed-by-user');
      const isPopupBlocked = errorMsg.includes('popup_blocked_by_browser');

      if (isPopupBlocked) {
        this.showAuthErrorModal = true;
      } else if (isPopupClosed) {
        this.notificationService.showError(
          'Sign-in was cancelled because the Google login popup was closed.'
        );
      } else if (errorMsg.includes('network')) {
        this.notificationService.showError('Network error.');
      } else {
        this.notificationService.showError(
          'An error occurred during Google Sign-In.'
        );
      }
    }
  }

  /** Closes the auth error modal. */
  closeAuthErrorModal(): void {
    this.showAuthErrorModal = false;
  }
}
```

#### Template (`auth-layout.component.html`)

```html
<div class="page-shell">
  <!-- Full-page loader (shown when redirecting to dashboard or during non-license loading) -->
  <div
    class="full-page-loader"
    *ngIf="authStore.isRedirectingToDashboard() || authStore.isAutoLicenseLoading()"
  >
    <div class="spinner"></div>
    <p class="loader-message">
      {{
        authStore.isRedirectingToDashboard()
          ? 'Loading dashboard...'
          : 'Setting up your account...'
      }}
    </p>
  </div>

  <!-- Auth Card -->
  <div
    class="auth-card"
    [class.hide-card]="
      authStore.isRedirectingToDashboard() || authStore.isAutoLicenseLoading()
    "
    [class.is-loading]="
      authStore.isGoogleLoading() && !authStore.isRedirectingToDashboard()
    "
  >
    <!-- Card-level overlay loader -->
    <div
      class="card-loader-overlay"
      *ngIf="authStore.isGoogleLoading() && !authStore.isRedirectingToDashboard()"
    >
      <div class="spinner"></div>
      <p class="loader-message">
        {{ authStore.authLoadingMessage() || 'Please wait...' }}
      </p>
    </div>

    <!-- Theme toggle button -->
    <button
      class="theme-toggle"
      type="button"
      (click)="settingsStore.toggleTheme()"
      [attr.aria-label]="settingsStore.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
    >
      <span class="material-symbols-outlined">
        {{ settingsStore.isDark() ? 'light_mode' : 'dark_mode' }}
      </span>
    </button>

    <!-- Child route outlet (signin / agreement) -->
    <div class="content-wrapper">
      <router-outlet />
    </div>
  </div>
</div>

<!-- Auth Error Modal (popup blocked) -->
<dialog [open]="showAuthErrorModal" class="auth-error-dialog">
  <div class="auth-error-content">
    <h2>Popup Blocked</h2>
    <p>Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.</p>
    <div class="auth-error-actions">
      <button type="button" (click)="closeAuthErrorModal()">Close</button>
    </div>
  </div>
</dialog>
```

#### Styles (`auth-layout.component.scss`)

Adapted from source `auth.component.scss` — same design, Ionic selectors removed:

```scss
:host {
  display: block;
  width: 100%;
  height: 100%;
}

.page-shell {
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 48px 16px;
  background: var(--auth-gradient);
  color: var(--text);
  font-family: 'Inter', sans-serif;
  transition: background 0.3s ease, color 0.3s ease;
}

.auth-card {
  position: relative;
  overflow: hidden;
  width: min(460px, 100%);
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 36px 32px;
  border: 1px solid var(--border);
  transition: background-color 0.3s ease, border-color 0.3s ease,
    box-shadow 0.3s ease;
  box-sizing: border-box;

  .content-wrapper {
    transition: filter 0.3s ease;
    width: 100%;
    height: 100%;
  }

  &.is-loading .content-wrapper {
    filter: blur(5px);
    pointer-events: none;
  }

  &.hide-card {
    display: none;
  }
}

.card-loader-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--surface-overlay, rgba(255, 255, 255, 0.75));
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  z-index: 100;
  animation: fadeIn 0.3s ease forwards;
}

.full-page-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  animation: fadeIn 0.3s ease forwards;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loader-message {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  text-align: center;
}

.theme-toggle {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 46px;
  height: 46px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: var(--shadow);
  z-index: 10;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.05);
    background: var(--surface-alt);
  }

  &:active {
    transform: scale(0.95);
  }

  .material-symbols-outlined {
    font-size: 1.2rem;
  }
}

.auth-error-dialog {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 32px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);

  .auth-error-content {
    text-align: center;

    h2 {
      margin-bottom: 12px;
      font-size: 1.3rem;
    }

    p {
      color: var(--muted);
      margin-bottom: 20px;
      line-height: 1.5;
    }

    button {
      padding: 10px 24px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--primary);
      color: #fff;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      transition: background 0.2s ease;

      &:hover {
        background: var(--primary-hover);
      }
    }
  }
}

@media (max-width: 480px) {
  .auth-card {
    padding: 28px 18px;
  }
}
```

### 13.2 SigninComponent

Replaces source `SigninComponent` (`payment-admin/src/app/auth/view/signin/signin.component.ts`, 123 lines).

**Key changes:**
- Uses `SettingsStore` signals instead of subscribing to `SettingsClient.get()` directly
- Always shows the email/password form (no `isSupportLicenseManagement` check — it's always true)
- Calls `AuthFlowOrchestrator.initiateFirebaseSession()` after Firebase auth
- Replaces `ion-skeleton-text` with a CSS skeleton loader

#### Component (`src/app/features/auth/signin/signin.component.ts`)

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '@core/stores/auth.store';
import { SettingsStore } from '@core/stores/settings.store';
import { AuthFlowOrchestratorService } from '@core/services/auth-flow-orchestrator.service';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-signin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.scss'],
})
export class SigninComponent {
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly orchestrator = inject(AuthFlowOrchestratorService);
  private readonly notificationService = inject(NotificationService);
  readonly authStore = inject(AuthStore);
  readonly settingsStore = inject(SettingsStore);

  email = '';
  password = '';

  async signinWithGoogle(): Promise<void> {
    this.authStore.isGoogleLoading.set(true);
    try {
      const userCredential = await this.firebaseAuth.signInWithPopup();
      if (userCredential) {
        const idToken = await userCredential.user.getIdToken();
        await this.orchestrator.initiateFirebaseSession(idToken);
      } else {
        this.authStore.isGoogleLoading.set(false);
      }
    } catch (error: any) {
      this.authStore.isGoogleLoading.set(false);
      this.notificationService.showError(
        this.getFirebaseErrorMessage(error)
      );
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.email || !this.password) return;
    try {
      this.authStore.isGoogleLoading.set(true);
      const userCredential = await this.firebaseAuth.signInWithEmail(
        this.email,
        this.password
      );
      const idToken = await userCredential.user.getIdToken();
      await this.orchestrator.initiateFirebaseSession(idToken);
    } catch (error: any) {
      this.authStore.isGoogleLoading.set(false);
      this.notificationService.showError(this.getFirebaseErrorMessage(error));
    } finally {
      this.password = '';
    }
  }

  private getFirebaseErrorMessage(error: any): string {
    if (!error) return 'An error occurred.';
    if (error.code) {
      switch (error.code) {
        case 'auth/invalid-email': return 'Invalid email address format.';
        case 'auth/user-disabled': return 'This user account has been disabled.';
        case 'auth/user-not-found': return 'User not found.';
        case 'auth/wrong-password': return 'Incorrect password.';
        case 'auth/email-already-in-use': return 'Email address is already in use.';
        case 'auth/weak-password': return 'Password should be at least 6 characters.';
        case 'auth/invalid-credential': return 'Invalid credentials provided.';
        default: return error.message || 'An unexpected authentication error occurred.';
      }
    }
    return error.message || 'An unexpected authentication error occurred.';
  }
}
```

#### Template (`signin.component.html`)

Same structure as source — with `ion-skeleton-text` replaced by CSS skeleton:

```html
<!-- Brand -->
<div class="brand">
  <div class="brand-icon" [class.no-bg]="settingsStore.activeLogoUri()">
    <img
      *ngIf="settingsStore.activeLogoUri()"
      [src]="settingsStore.activeLogoUri()"
      alt="Logo"
      class="logo-img"
    />
    <span *ngIf="!settingsStore.activeLogoUri()">
      {{ settingsStore.brand().charAt(0) }}
    </span>
  </div>
  <span>{{ settingsStore.brand() }}</span>
</div>

<!-- Slogan -->
<h1 *ngIf="settingsStore.isLoaded(); else sloganSkeleton">
  {{ settingsStore.signinSlogan() || 'Welcome back' }}
</h1>
<ng-template #sloganSkeleton>
  <div class="slogan-skeleton"></div>
</ng-template>

<p class="subtitle">Sign in to continue to your account</p>

<!-- Google Button -->
<button class="social-btn" type="button" (click)="signinWithGoogle()">
  <span class="social-icon">
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  </span>
  Continue with Google
</button>

<!-- Email/Password Form (ALWAYS visible — isSupportLicenseManagement is always true) -->
<div class="divider"><span>or</span></div>

<form (ngSubmit)="onSubmit()" #signInForm="ngForm">
  <label for="email">Email</label>
  <input
    id="email"
    type="email"
    name="email"
    [(ngModel)]="email"
    required
    pattern="[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    placeholder="you@example.com"
  />

  <div class="row-between">
    <label for="password">Password</label>
    <a routerLink="/auth/forget-password" queryParamsHandling="preserve" class="forgot-link">
      Forgot password?
    </a>
  </div>
  <input
    id="password"
    type="password"
    name="password"
    [(ngModel)]="password"
    required
    placeholder="Enter your password"
  />

  <button class="submit-btn" type="submit" [disabled]="!signInForm.form.valid">
    Sign In
  </button>
</form>

<p class="toggle-text">
  Don't have an account?
  <a routerLink="/auth/signup" queryParamsHandling="preserve">Sign up</a>
</p>
```

#### Styles (`signin.component.scss`)

Copied **verbatim** from source `signin.component.scss` (226 lines) — it already uses CSS custom properties (`--primary`, `--surface`, `--text`, `--muted`, `--border`, `--input-bg`) that are defined globally in `styles.scss`. Add the skeleton CSS:

```scss
// Add to bottom of signin.component.scss:
.slogan-skeleton {
  width: 60%;
  height: 38px;
  border-radius: 6px;
  margin-bottom: 6px;
  background: var(--surface-alt);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### 13.3 AgreementComponent (Signup)

Replaces source `AgreementComponent` (`payment-admin/src/app/auth/view/agreement/agreement.component.ts`, 227 lines).

**Key changes:**
- Uses `SettingsStore` and `AuthStore` signals
- Removes `LoadingController` and `LoadingService` references
- Removes `HttpClient` direct usage (was used for fetching terms — now just uses URLs from settings)
- `isSupportLicenseManagement` check removed (always true)
- `ion-skeleton-text` replaced with CSS skeleton

#### Component (`src/app/features/auth/agreement/agreement.component.ts`)

```typescript
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthStore } from '@core/stores/auth.store';
import { SettingsStore } from '@core/stores/settings.store';
import { AuthFlowOrchestratorService } from '@core/services/auth-flow-orchestrator.service';
import { FirebaseAuthService } from '@core/services/firebase-auth.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-agreement',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './agreement.component.html',
  styleUrls: ['./agreement.component.scss'],
})
export class AgreementComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly orchestrator = inject(AuthFlowOrchestratorService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  readonly authStore = inject(AuthStore);
  readonly settingsStore = inject(SettingsStore);

  // Form fields
  email = '';
  password = '';
  confirmPassword = '';
  agreeToTerms = false;

  // Query params
  queryParams: any = {};

  ngOnInit(): void {
    this.authStore.signupAlreadyRegistered.set(false);

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        this.queryParams = params;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isFormValid(): boolean {
    if (!this.email || !this.password || !this.confirmPassword || !this.agreeToTerms) {
      return false;
    }
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailPattern.test(this.email)) return false;
    if (this.password.length < 6 || this.password !== this.confirmPassword) return false;
    return true;
  }

  getPasswordError(): string | null {
    if (this.password && this.password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    if (this.password && this.confirmPassword && this.password !== this.confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  }

  async onLeave(): Promise<void> {
    await this.firebaseAuth.signout(this.queryParams);
  }

  async signinWithGoogle(): Promise<void> {
    this.authStore.signupAlreadyRegistered.set(false);
    this.authStore.isGoogleLoading.set(true);
    try {
      const userCredential = await this.firebaseAuth.signInWithPopup();
      if (userCredential) {
        const idToken = await userCredential.user.getIdToken();
        await this.orchestrator.initiateFirebaseSession(idToken);
      } else {
        this.authStore.isGoogleLoading.set(false);
      }
    } catch (error: any) {
      this.authStore.isGoogleLoading.set(false);
      this.notificationService.showError(this.getFirebaseErrorMessage(error));
    }
  }

  async onSignUp(): Promise<void> {
    this.authStore.signupAlreadyRegistered.set(false);
    if (!this.isFormValid()) return;

    if (!this.firebaseAuth.isUserAuthenticated()) {
      try {
        this.authStore.isGoogleLoading.set(true);
        const userCredential = await this.firebaseAuth.signUpWithEmail(
          this.email,
          this.password
        );
        const idToken = await userCredential.user.getIdToken();
        await this.orchestrator.initiateFirebaseSession(idToken);
      } catch (error: any) {
        this.authStore.isGoogleLoading.set(false);
        this.notificationService.showError(this.getFirebaseErrorMessage(error));
      } finally {
        this.password = '';
        this.confirmPassword = '';
      }
      return;
    }

    // User is already authenticated — complete agreement
    await this.orchestrator.completeAgreement();
  }

  private getFirebaseErrorMessage(error: any): string {
    if (!error) return 'An error occurred.';
    if (error.code) {
      switch (error.code) {
        case 'auth/invalid-email': return 'Invalid email address format.';
        case 'auth/email-already-in-use': return 'Email address is already in use.';
        case 'auth/weak-password': return 'Password should be at least 6 characters.';
        case 'auth/operation-not-allowed': return 'Email/password accounts are not enabled.';
        default: return error.message || 'An unexpected registration error occurred.';
      }
    }
    return error.message || 'An unexpected registration error occurred.';
  }
}
```

#### Template (`agreement.component.html`)

Same structure as source — `ion-skeleton-text` replaced, `isSupportLicenseManagement` check removed (always shows the form):

```html
<!-- Brand -->
<div class="brand">
  <div class="brand-icon" [class.no-bg]="settingsStore.activeLogoUri()">
    <img
      *ngIf="settingsStore.activeLogoUri()"
      [src]="settingsStore.activeLogoUri()"
      alt="Logo"
      class="logo-img"
    />
    <span *ngIf="!settingsStore.activeLogoUri()">
      {{ settingsStore.brand().charAt(0) }}
    </span>
  </div>
  <span>{{ settingsStore.brand() }}</span>
</div>

<!-- Slogan -->
<h1 *ngIf="settingsStore.isLoaded(); else sloganSkeleton">
  {{ settingsStore.signinSlogan() || 'Create account' }}
</h1>
<ng-template #sloganSkeleton>
  <div class="slogan-skeleton"></div>
</ng-template>

<p class="subtitle">Create account</p>

<!-- Google Button -->
<button class="social-btn" type="button" (click)="signinWithGoogle()">
  <span class="social-icon">
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  </span>
  Sign up with Google
</button>

<!-- Already registered warning -->
<div class="warning-box" *ngIf="authStore.signupAlreadyRegistered()">
  <span>
    A user with this Email has already registered. Please use the
    <a routerLink="/auth/signin" queryParamsHandling="preserve">sign in</a> page.
  </span>
</div>

<!-- Email/Password Form (ALWAYS visible) -->
<div class="divider"><span>or</span></div>

<form (ngSubmit)="onSignUp()" #signUpForm="ngForm">
  <label for="name">Email</label>
  <input
    id="name"
    type="email"
    name="email"
    [(ngModel)]="email"
    required
    pattern="[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    placeholder="Jane Doe"
  />

  <label for="signup-password">Password</label>
  <input
    id="signup-password"
    type="password"
    name="password"
    [(ngModel)]="password"
    required
    placeholder="Create a password"
  />

  <label for="confirm-password">Confirm password</label>
  <input
    id="confirm-password"
    type="password"
    name="confirmPassword"
    [(ngModel)]="confirmPassword"
    required
    placeholder="Confirm your password"
  />

  <div class="error-container" *ngIf="getPasswordError()">
    <span class="error-message">{{ getPasswordError() }}</span>
  </div>

  <div class="checkbox-stack">
    <label class="checkbox-row">
      <input
        type="checkbox"
        name="agreeToTerms"
        [(ngModel)]="agreeToTerms"
        required
      />
      <span>
        By continuing, I agree to
        <a *ngIf="settingsStore.termsUrl()" [href]="settingsStore.termsUrl()" target="_blank">terms</a>
        <span *ngIf="!settingsStore.termsUrl()">terms</span>
        and
        <a *ngIf="settingsStore.privacyUrl()" [href]="settingsStore.privacyUrl()" target="_blank">privacy policy</a>
        <span *ngIf="!settingsStore.privacyUrl()">privacy policy</span>
      </span>
    </label>
  </div>

  <button class="submit-btn" type="submit" [disabled]="!signUpForm.form.valid || !isFormValid()">
    Create Account
  </button>
</form>

<p class="toggle-text">
  Already have an account?
  <a href="#" (click)="$event.preventDefault(); onLeave()">Sign in</a>
</p>
```

#### Styles (`agreement.component.scss`)

Copied **verbatim** from source `agreement.component.scss` (278 lines). Add skeleton CSS:

```scss
.slogan-skeleton {
  width: 60%;
  height: 38px;
  border-radius: 6px;
  margin-bottom: 6px;
  background: var(--surface-alt);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## Part 14: Grant Access Consent Screen

### 14.1 Source Analysis

The source `GrantAccessComponent` (`payment-admin/src/app/auth/view/grant-access/grant-access.component.ts`, 76 lines) is an OAuth-style consent screen displayed when a third-party consumer app requests access. It:

1. Reads `licenseId`, `returnUrl` from query params
2. Extracts the domain name from `returnUrl` for display
3. Shows "Access Request" card with domain, permissions, warning
4. On "Grant Access" → calls `orchestrator.handleGrantAccessDecision(true, returnUrl, licenseId)`
5. On "Deny Access" → calls `orchestrator.handleGrantAccessDecision(false, returnUrl, licenseId)`
6. Shows granted/denied status states

The source template uses Ionic components (`ion-content`, `ion-card`, `ion-icon`, `ion-button`). The fork replaces ALL with semantic HTML5 + SCSS.

### 14.2 Fork Implementation

#### Component (`src/app/features/auth/grant-access/grant-access.component.ts`)

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthFlowOrchestratorService } from '@core/services/auth-flow-orchestrator.service';
import { Logger } from '@core/services/logger.service';

@Component({
  selector: 'app-grant-access',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './grant-access.component.html',
  styleUrls: ['./grant-access.component.scss'],
})
export class GrantAccessComponent implements OnInit {
  private readonly log = Logger.create('GrantAccess');
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orchestrator = inject(AuthFlowOrchestratorService);

  licenseId: string | null = null;
  appName = 'An application';
  domainName: string | null = null;
  returnUrl: string | null = null;
  accessStatus: 'pending' | 'granted' | 'denied' = 'pending';
  permissions: string[] = ['Manage profiles', 'Payments history'];

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      this.licenseId = params['licenseId'] || null;
      this.returnUrl = params['returnUrl'];

      if (this.returnUrl) {
        let hostname: string;
        try {
          const urlString = this.returnUrl.startsWith('http')
            ? this.returnUrl
            : `https://${this.returnUrl}`;
          const url = new URL(urlString);
          hostname = url.hostname;
        } catch (e) {
          this.log.error('Invalid returnUrl:', this.returnUrl);
          hostname = this.returnUrl.split('/')[0];
        }

        this.domainName = this.getRootDomain(hostname);
        this.appName = this.domainName;
      } else {
        this.appName = this.licenseId || 'An application';
      }
    });
  }

  private getRootDomain(hostname: string): string {
    const parts = hostname.split('.');
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  }

  async grantAccess(): Promise<void> {
    this.accessStatus = 'granted';
    await this.orchestrator.handleGrantAccessDecision(
      true,
      this.returnUrl,
      this.licenseId
    );
  }

  denyAccess(): void {
    this.accessStatus = 'denied';
    this.orchestrator.handleGrantAccessDecision(
      false,
      this.returnUrl,
      this.licenseId
    );
  }

  reset(): void {
    this.router.navigate(['/auth/signin'], {
      queryParams: { grantAuthorization: 'true' },
      queryParamsHandling: 'merge',
    });
  }
}
```

#### Template (`grant-access.component.html`)

Pure HTML5 — replaces all `ion-*` components:

```html
<div class="grant-access-container">
  <div class="card-wrapper">
    <!-- Pending State -->
    <div class="grant-access-card" *ngIf="accessStatus === 'pending'">
      <div class="card-content">
        <h1 class="card-title">
          <span class="material-symbols-outlined title-icon">key</span>
          Access Request
        </h1>

        <p class="description">
          <ng-container *ngIf="domainName; else genericApp">
            <strong>{{ appName }}</strong> is requesting access to your account.
          </ng-container>
          <ng-template #genericApp>
            An application is requesting access to your account.
          </ng-template>
          Please review the details below before granting access.
        </p>

        <div class="permissions-box">
          <div *ngIf="domainName">
            <span class="font-semibold">Domain Name: </span>
            <span class="text-gray">{{ domainName }}</span>
          </div>
          <div>
            <span class="font-semibold block mb-1">
              Requested Permissions:
            </span>
            <ul class="permissions-list">
              <li *ngFor="let permission of permissions">{{ permission }}</li>
            </ul>
          </div>
        </div>

        <p class="warning-text">
          <span class="material-symbols-outlined warning-icon">warning</span>
          Only grant access if you trust this application. You can revoke access
          at any time in your account settings.
        </p>

        <div class="actions">
          <button class="btn-outline" type="button" (click)="denyAccess()">
            Deny Access
          </button>
          <button class="btn-primary grant-button" type="button" (click)="grantAccess()">
            Grant Access
          </button>
        </div>
      </div>
    </div>

    <!-- Granted State -->
    <div class="grant-access-card text-center" *ngIf="accessStatus === 'granted'">
      <div class="card-content">
        <span class="material-symbols-outlined status-icon status-success">
          check_circle
        </span>
        <h2 class="status-title">Access Granted!</h2>
        <p class="status-description">
          You have successfully granted access to {{ appName }}.
        </p>
        <p class="status-description">Redirecting...</p>
      </div>
    </div>

    <!-- Denied State -->
    <div class="grant-access-card text-center" *ngIf="accessStatus === 'denied'">
      <div class="card-content">
        <span class="material-symbols-outlined status-icon status-error">
          cancel
        </span>
        <h2 class="status-title">Access Denied</h2>
        <p class="status-description">
          You have denied access for {{ appName }}.
        </p>
        <button class="btn-link back-button" type="button" (click)="reset()">
          Back to Sign In
        </button>
      </div>
    </div>
  </div>
</div>
```

#### Styles (`grant-access.component.scss`)

Adapted from source — Ionic variables replaced with CSS custom properties:

```scss
.grant-access-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg, #f5f7ff);
  padding: 1rem;
  font-family: 'Inter', sans-serif;

  .card-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .grant-access-card {
    max-width: 480px;
    width: 100%;
    box-shadow: var(--shadow);
    border-radius: 16px;
    background: var(--surface, #ffffff);
    border: 1px solid var(--border);

    &.text-center {
      text-align: center;
    }
  }

  .card-content {
    padding: 24px;
  }

  .card-title {
    font-size: 1.5rem;
    font-weight: bold;
    color: var(--text, #1f2937);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .title-icon {
    font-size: 1.75rem;
    color: var(--primary);
  }

  .description {
    color: var(--muted, #4b5563);
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }

  .permissions-box {
    background-color: var(--surface-alt, #f8f9ff);
    padding: 1rem;
    border-radius: 12px;
    border: 1px solid var(--border);
    font-size: 0.9rem;
    margin-bottom: 1.5rem;

    .font-semibold {
      font-weight: 600;
      color: var(--text, #111827);
    }
    .block {
      display: block;
    }
    .mb-1 {
      margin-bottom: 0.25rem;
    }

    .permissions-list {
      list-style: disc;
      padding-left: 20px;
      color: var(--muted, #374151);
      margin-top: 0.5rem;

      li {
        margin-bottom: 0.25rem;
      }
    }
  }

  .warning-text {
    font-size: 0.875rem;
    color: var(--muted, #6b7280);
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .warning-icon {
    color: var(--ion-color-warning, #ffc409);
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .btn-outline {
    padding: 10px 20px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    transition: all 0.2s ease;

    &:hover {
      background: var(--surface-alt);
    }
  }

  .btn-primary {
    padding: 10px 20px;
    border: none;
    border-radius: 10px;
    background: var(--primary);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    transition: all 0.2s ease;

    &:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
    }
  }

  .status-icon {
    font-size: 4rem;
    margin-bottom: 1rem;

    &.status-success {
      color: var(--ion-color-success, #2dd36f);
    }
    &.status-error {
      color: var(--ion-color-danger, #eb445a);
    }
  }

  .status-title {
    font-size: 1.5rem;
    font-weight: bold;
    color: var(--text, #1f2937);
    margin-top: 1rem;
  }

  .status-description {
    color: var(--muted, #4b5563);
    margin-top: 0.5rem;
  }

  .btn-link {
    margin-top: 1.5rem;
    background: none;
    border: none;
    color: var(--primary);
    cursor: pointer;
    font: inherit;
    font-weight: 600;

    &:hover {
      text-decoration: underline;
    }
  }
}
```

---

## Part 15: Shared UI Components (Pure HTML5/SCSS)

### 15.1 LoadingOverlayComponent

Replaces Ionic `LoadingController` with a Signal-driven overlay component.

#### Component (`src/app/shared/components/loading-overlay/loading-overlay.component.ts`)

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '@core/stores/auth.store';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-overlay" *ngIf="authStore.isAuthenticating()">
      <div class="spinner"></div>
      <p class="loading-message">
        {{ authStore.authLoadingMessage() || 'Loading...' }}
      </p>
    </div>
  `,
  styles: [`
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(2px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 9999;
      animation: fadeIn 0.3s ease forwards;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .loading-message {
      color: #fff;
      font-size: 0.95rem;
      font-weight: 600;
      font-family: 'Inter', sans-serif;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `],
})
export class LoadingOverlayComponent {
  readonly authStore = inject(AuthStore);
}
```

### 15.2 ToastContainerComponent

Replaces Ionic `ToastController` with a Signal-driven toast queue.

#### NotificationService (`src/app/core/services/notification.service.ts`)

```typescript
import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error';
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 0;
  
  readonly toasts = signal<ToastMessage[]>([]);
  private queue: ToastMessage[] = [];
  private isShowing = false;

  showError(message: string): void {
    this.enqueue({ message, type: 'error', duration: 5000 });
  }

  showSuccess(message: string): void {
    this.enqueue({ message, type: 'success', duration: 5000 });
  }

  dismiss(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  private enqueue(toast: Omit<ToastMessage, 'id'>): void {
    const message: ToastMessage = { ...toast, id: ++this.nextId };
    this.queue.push(message);
    if (!this.isShowing) {
      this.showNext();
    }
  }

  private showNext(): void {
    if (this.queue.length === 0) {
      this.isShowing = false;
      return;
    }

    this.isShowing = true;
    const message = this.queue.shift()!;
    this.toasts.update(list => [...list, message]);

    setTimeout(() => {
      this.dismiss(message.id);
      this.showNext();
    }, message.duration);
  }
}
```

#### Component (`src/app/shared/components/toast-container/toast-container.component.ts`)

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div
        *ngFor="let toast of notificationService.toasts()"
        class="toast"
        [class.toast-error]="toast.type === 'error'"
        [class.toast-success]="toast.type === 'success'"
      >
        <span class="toast-message">{{ toast.message }}</span>
        <button class="toast-dismiss" (click)="notificationService.dismiss(toast.id)">
          &times;
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(500px, 90vw);
    }
    .toast {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: 'Inter', sans-serif;
      font-size: 0.9rem;
      animation: slideDown 0.3s ease forwards;
    }
    .toast-error {
      background: #eb445a;
      color: #fff;
    }
    .toast-success {
      background: #2dd36f;
      color: #fff;
    }
    .toast-dismiss {
      background: none;
      border: none;
      color: inherit;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0 0 0 12px;
      opacity: 0.8;
      &:hover { opacity: 1; }
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class ToastContainerComponent {
  readonly notificationService = inject(NotificationService);
}
```

### 15.3 Error Pages

#### ForbiddenComponent (`src/app/features/errors/forbidden/forbidden.component.ts`)

```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="error-page">
      <span class="material-symbols-outlined error-icon">block</span>
      <h1>403</h1>
      <p>Access Forbidden</p>
      <p class="error-detail">You don't have permission to access this resource.</p>
      <a routerLink="/auth/signin" class="back-link">Back to Sign In</a>
    </div>
  `,
  styles: [`
    .error-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 12px;
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .error-icon { font-size: 4rem; color: var(--ion-color-danger, #eb445a); }
    h1 { font-size: 3rem; font-weight: 700; }
    p { color: var(--muted); }
    .error-detail { font-size: 0.9rem; }
    .back-link {
      margin-top: 16px;
      padding: 10px 24px;
      background: var(--primary);
      color: #fff;
      border-radius: 10px;
      font-weight: 600;
    }
  `],
})
export class ForbiddenComponent {}
```

#### NotFoundComponent — same pattern with 404 and `error_404` icon.

---

## Part 16: Core Utility Services (Ionic-Free)

### 16.1 StorageService (`src/app/core/services/storage.service.ts`)

Copied from source with minor cleanup. Retains the localStorage patching logic for `default-app` validation.

```typescript
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private static readonly INVALID_APP_IDS = new Set([
    'undefined', 'null', 'forbidden', 'notfound', 'apps', 'auth', 'billing',
    'overview', 'payments', 'gateways', 'app-setting', 'policies',
    'fraud-activities', 'customers', 'team', 'personalization', 'dashboard',
    'login', 'register', 'app', 'licenses', 'rules', 'fraud'
  ]);

  private static readonly PRESERVED_KEYS = ['app-theme'];

  static isValidAppId(appId: any): boolean {
    if (typeof appId !== 'string') return false;
    const clean = appId.trim().toLowerCase();
    if (!clean) return false;
    return !StorageService.INVALID_APP_IDS.has(clean);
  }

  constructor() {
    StorageService.patchLocalStorage();
  }

  static patchLocalStorage(): void {
    if ((window as any).__local_storage_patched__) return;
    (window as any).__local_storage_patched__ = true;

    const originalSet = localStorage.setItem;
    localStorage.setItem = function (key: string, value: string) {
      if (key === 'default-app') {
        if (!StorageService.isValidAppId(value)) {
          console.warn(`[LocalStorage] Blocked invalid default-app: ${value}`);
          localStorage.removeItem(key);
          return;
        }
      }
      originalSet.call(localStorage, key, value);
    };

    const originalGet = localStorage.getItem;
    localStorage.getItem = function (key: string): string | null {
      const val = originalGet.call(localStorage, key);
      if (key === 'default-app' && val) {
        if (!StorageService.isValidAppId(val)) {
          console.warn(`[LocalStorage] Cleaned up invalid default-app: ${val}`);
          localStorage.removeItem(key);
          return null;
        }
      }
      return val;
    };
  }

  set(key: string, data: any): void {
    if (typeof data === 'string') {
      localStorage.setItem(key, data);
    } else {
      localStorage.setItem(key, JSON.stringify(data));
    }
  }

  get(key: string): any {
    return localStorage.getItem(key);
  }

  clear(): void {
    const preserved: Record<string, string | null> = {};
    StorageService.PRESERVED_KEYS.forEach((key) => {
      preserved[key] = localStorage.getItem(key);
    });
    localStorage.clear();
    StorageService.PRESERVED_KEYS.forEach((key) => {
      if (preserved[key] !== null) {
        localStorage.setItem(key, preserved[key]!);
      }
    });
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }
}
```

### 16.2 LoggerService (`src/app/core/services/logger.service.ts`)

Copied **verbatim** from source (`logger.service.ts`, 230 lines). It is already framework-agnostic (no Ionic dependencies). The only change is the import path for environment:

```typescript
// Change from:
import { environment } from '@environments/environment';
// To (same — path alias preserved):
import { environment } from '@environments/environment';
```

### 16.3 LoadingService (REMOVED)

The source `LoadingService` wraps Ionic's `LoadingController`. In the fork, loading state is managed by `AuthStore` signals (`isAuthenticating`, `authLoadingMessage`). The `LoadingOverlayComponent` (Part 15.1) reads these signals. **No `LoadingService` class exists in the fork.**

### 16.4 ThemeService (MERGED into SettingsStore)

The source `ThemeService` (`theme.service.ts`, 32 lines) uses a `BehaviorSubject<boolean>` for theme state and a `switchTheme()` method that updates the `<link>` href. In the fork, this logic is merged into `SettingsStore` (Part 5.3):
- `isDark` signal replaces `BehaviorSubject`
- `toggleTheme()` replaces the toggle logic
- An effect handles the `<link>` href switching

**No separate `ThemeService` class exists in the fork.**

### 16.5 URL Utility (`src/app/core/utils/url.util.ts`)

```typescript
/** Extracts root domain (e.g., "domain.com" from "sub.domain.com"). */
export function extractBaseDomain(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const urlString = url.startsWith('http') ? url : `https://${url}`;
    const hostname = new URL(urlString).hostname;
    const parts = hostname.split('.');
    if (parts.length > 2) return parts.slice(-2).join('.');
    return hostname;
  } catch {
    return undefined;
  }
}

/** Appends licenseId and authorizationCode as query params to a URL. */
export function appendTokenParams(
  urlStr: string,
  licenseId: string,
  authorizationCode: string
): string {
  const fullUrl = urlStr.startsWith('http') ? urlStr : `https://${urlStr}`;
  const url = new URL(fullUrl);
  url.searchParams.set('licenseId', licenseId);
  url.searchParams.set('authorizationCode', authorizationCode);
  return url.toString();
}
```

### 16.6 Service Inventory (Fork vs Source)

| Source Service | Fork Equivalent | Status |
|---|---|---|
| `StorageService` | `StorageService` | Copied (minor cleanup) |
| `LoadingService` | `AuthStore` signals | Replaced |
| `NotificationService` | `NotificationService` | Rewritten (Signal-based) |
| `ThemeService` | `SettingsStore` | Merged |
| `Logger` | `Logger` | Copied verbatim |
| `FirebaseAuthService` | `FirebaseAuthService` | Rewritten (no Ionic) |
| `LicenseFlowService` | `LicenseFlowService` | Thin wrapper over `LicenseStore` |
| `AuthFlowOrchestratorService` | `AuthFlowOrchestratorService` | Rewritten (Signals) |
| `CoreService` | Removed (not needed) | Deleted |
| `UserInfoService` | Removed (not needed) | Deleted |
| `ErrorService` | Inline in `errorInterceptor` | Merged |
| `ErrorHandlerUiService` | Inline in `errorInterceptor` | Merged |
| `InitGateService` | Removed (not needed) | Deleted |
| `RenewalService` | Removed (not needed) | Deleted |
| `TagManagerService` | Removed (optional) | Deleted |
| `PaymentIconService` | Retained & rewritten — resolves provider icon URIs (SVG inline, PNG raw URL, cached per URI) | Active |
| `GlobalAlertService` | Removed (not needed) | Deleted |
| `JsonFormatterService` | Removed (not needed) | Deleted |

---

## Part 17: App Configuration & Bootstrap

### 17.1 main.ts (Bootstrap)

The fork uses `bootstrapApplication()` (standalone API) instead of `platformBrowserDynamic().bootstrapModule()`.

```typescript
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err)
);
```

### 17.2 app.config.ts (Providers)

Replaces the source `AppModule` (78 lines) with a single `ApplicationConfig` object.

```typescript
// src/app/app.config.ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { environment } from '@environments/environment';
import { routes } from './app.routes';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { API_BASE_URL } from '@proxy/payment-app-proxy';
import {
  AuthenticationClient,
  SettingsClient,
  TeamClient,
  LicensesClient,
  AppsClient,
} from '@proxy/payment-app-proxy';

export const appConfig: ApplicationConfig = {
  providers: [
    // ── Core Angular Providers ────────────────────────────
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),

    // ── Firebase ──────────────────────────────────────────
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),

    // ── API Base URL ──────────────────────────────────────
    { provide: API_BASE_URL, useValue: environment.appBaseUrl },

    // ── NSwag Client Registration ─────────────────────────
    AuthenticationClient,
    SettingsClient,
    TeamClient,
    LicensesClient,
    AppsClient,
  ],
};
```

**Key differences from source `AppModule`:**
- No `BrowserModule`, `BrowserAnimationsModule` (not needed with standalone bootstrap)
- No `IonicModule.forRoot()`
- No `SharedModule`, `CoreModule`, `AuthModule` (NgModules removed)
- No `RouteReuseStrategy` (IonicRouteStrategy removed)
- No `OverlayPanelModule` (PrimeNG removed)
- Firebase provided via `provideFirebaseApp()` + `provideAuth()` (functional providers, not module imports)
- `ScreenTrackingService` and `UserTrackingService` removed (AngularFire Analytics not needed)

### 17.3 AppComponent (Root)

```typescript
// src/app/app.component.ts
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LoadingOverlayComponent } from '@shared/components/loading-overlay/loading-overlay.component';
import { ToastContainerComponent } from '@shared/components/toast-container/toast-container.component';
import { SettingsStore } from '@core/stores/settings.store';
import { Logger } from '@core/services/logger.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    LoadingOverlayComponent,
    ToastContainerComponent,
  ],
  template: `
    <router-outlet />
    <app-loading-overlay />
    <app-toast-container />
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
    }
  `],
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly settingsStore = inject(SettingsStore);

  ngOnInit(): void {
    Logger.printBootBanner();

    // Resolve and apply theme on startup
    // (SettingsStore constructor already handles this via effect)

    // Listen for OS theme preference changes
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => {
        const saved = localStorage.getItem('app-theme');
        if (!saved || saved === 'system') {
          this.settingsStore.isDark.set(e.matches);
        }
      });

    // Listen for custom theme change events
    window.addEventListener('app-theme-changed', (event: any) => {
      this.settingsStore.isDark.set(event.detail.isDark);
    });
  }

  ngOnDestroy(): void {
    // Cleanup is handled by Angular's DI
  }
}
```

### 17.4 Dictionary (Minimal)

Only auth-related dictionary entries are retained:

```typescript
// src/dictionary/dictionary.ts
export const dictionary = {
  Signin: 'Sign in',
  Signup: 'Sign up',
  SignOut: 'Sign out',
  SignOutConfirmMessage: 'Are you sure you want to sign out?',
  Cancel: 'Cancel',
  Update: 'Update',
  Loading: 'Loading...',
  Empty: '',
  ContinueWithGoogle: 'Continue with Google',
  WelcomeBack: 'Welcome back',
  CreateAccount: 'Create account',
  GrantAccess: 'Grant Access',
  DenyAccess: 'Deny Access',
  AccessRequest: 'Access Request',
  AccessGranted: 'Access Granted!',
  AccessDenied: 'Access Denied',
  BackToSignIn: 'Back to Sign In',
  PageNotFound: 'Page not found',
  Forbidden: 'Forbidden',
  Overview: 'Overview',
  Dashboard: 'Dashboard',
  Billing: 'Billing',
  Team: 'Team',
  AppSetting: 'App Setting',
  Customers: 'Customers',
  Payments: 'Payments',
  GateWays: 'Gateways',
  Policies: 'Policies',
  FraudActivities: 'Fraud Activities',
  ChooseApp: 'Choose App',
  ChooseLicenseApp: 'Choose License App',
} as const;
```

### 17.5 Complete File Checklist

All files that need to be created in the fork:

```
src/
├── app/
│   ├── app.component.ts                          ✓ Part 17.3
│   ├── app.config.ts                             ✓ Part 17.2
│   ├── app.routes.ts                             ✓ Part 11.3-11.4
│   ├── core/
│   │   ├── proxies/
│   │   │   ├── payment-app-proxy.ts              ✓ Part 3 (verbatim copy)
│   │   │   ├── payment-proxy.ts                  ✓ Part 3 (verbatim copy)
│   │   │   └── api-exception.ts                  ✓ Part 3 (verbatim copy)
│   │   ├── stores/
│   │   │   ├── auth.store.ts                     ✓ Part 5.2
│   │   │   ├── settings.store.ts                 ✓ Part 5.3
│   │   │   ├── license.store.ts                  ✓ Part 5.4
│   │   │   └── workspace.store.ts                ✓ Part 5.5
│   │   ├── services/
│   │   │   ├── storage.service.ts                ✓ Part 16.1
│   │   │   ├── notification.service.ts           ✓ Part 15.2
│   │   │   ├── firebase-auth.service.ts          ✓ Part 6.3
│   │   │   ├── license-flow.service.ts           ✓ Part 7.2
│   │   │   ├── auth-flow-orchestrator.service.ts ✓ Part 8.3
│   │   │   └── logger.service.ts                 ✓ Part 16.2 (verbatim copy)
│   │   ├── guards/
│   │   │   ├── auth.guard.ts                     ✓ Part 10.2
│   │   │   └── license.guard.ts                  ✓ Part 10.3
│   │   ├── interceptors/
│   │   │   ├── auth.interceptor.ts               ✓ Part 9.3
│   │   │   └── error.interceptor.ts              ✓ Part 9.4
│   │   └── utils/
│   │       ├── jwt.util.ts                       ✓ Part 6.5
│   │       └── url.util.ts                       ✓ Part 16.5
│   ├── features/
│   │   ├── auth/
│   │   │   ├── auth-layout/                      ✓ Part 13.1
│   │   │   ├── signin/                           ✓ Part 13.2
│   │   │   ├── agreement/                        ✓ Part 13.3
│   │   │   └── grant-access/                     ✓ Part 14
│   │   ├── errors/
│   │   │   ├── forbidden/                        ✓ Part 15.3
│   │   │   └── not-found/                        ✓ Part 15.3
│   │   └── dashboard/
│   │       ├── dashboard-layout/                 ✓ Stub component
│   │       └── overview/                         ✓ Stub component
│   └── shared/
│       └── components/
│           ├── loading-overlay/                  ✓ Part 15.1
│           └── toast-container/                  ✓ Part 15.2
├── assets/
│   ├── css/
│   │   ├── theme-md-light-indigo.css             ✓ Part 12.5 (verbatim copy)
│   │   └── md-dark-indigo.css                    ✓ Part 12.5 (verbatim copy)
│   ├── img/                                      ✓ Copy logo images
│   └── icon/
│       └── logo__app.ico                         ✓ Copy
├── environments/
│   ├── environment.ts                            ✓ Part 4.1
│   ├── environment.stage.ts                      ✓ Part 4.1
│   └── environment.prod.ts                       ✓ Part 4.1
├── dictionary/
│   └── dictionary.ts                             ✓ Part 17.4
├── styles.scss                                   ✓ Part 12.4
├── index.html                                    ✓ Part 12.3
└── main.ts                                       ✓ Part 17.1
```

---

## Part 18: Migration Verification & Testing Checklist

### 18.1 Build Verification

```bash
# 1. Install dependencies
npm install

# 2. Verify TypeScript compilation
npx tsc --noEmit

# 3. Verify Angular build (development)
npm run build

# 4. Verify Angular build (staging)
npm run build-stage

# 5. Verify Angular build (production)
npm run build-prod

# 6. Run linter (excluding proxies)
npm run lint

# 7. Run unit tests (headless)
npm run test:ci
```

### 18.2 Functional Test Scenarios

Each scenario must be verified against the source project's behavior:

#### Scenario 1: Sign in with Google (No returnUrl)
```
1. Navigate to /auth/signin
2. Verify settings load (brand name, slogan, logo appear)
3. Verify email/password form is visible (isSupportLicenseManagement always true)
4. Click "Continue with Google"
5. Complete Google popup auth
6. Verify loading overlay shows "Signing in..."
7. Verify POST /api/authentication/signin is called
8. Verify token is stored in localStorage["token"]
9. Verify "Securing license..." loading message
10. Verify GET /api/licenses/best-license is called
11. If no best license: verify POST /api/licenses is called
12. Verify GET /api/team/users/current/licenses is called
13. Verify redirect to /{appId}/overview
14. Verify localStorage["default-app"] is set
```

#### Scenario 2: Sign in with Email/Password
```
1. Navigate to /auth/signin
2. Enter email and password
3. Click "Sign In"
4. Verify Firebase signInWithEmailAndPassword is called
5. Verify idToken is obtained
6. Follow steps 6-14 from Scenario 1
```

#### Scenario 3: Sign in with returnUrl (Grant Access Flow)
```
1. Navigate to /auth/signin?returnUrl=https://consumer-app.com/callback&appId=test-app
2. Complete authentication (Google or email)
3. Verify POST /api/authentication/signin succeeds
4. Verify redirect to /auth/grant-access?returnUrl=...&appId=...
5. Verify GrantAccessComponent shows domain name "consumer-app.com"
6. Click "Grant Access"
7. Verify GET /api/licenses/best-license is called
8. If no best license: verify POST /api/licenses is called
9. Verify window.location.href is set to returnUrl + ?licenseId=X&authorizationCode=Y
10. Verify browser navigates to the consumer app
```

#### Scenario 4: Sign in with returnUrl — Deny Access
```
1-5. Same as Scenario 3
6. Click "Deny Access"
7. Verify window.location.href is set to returnUrl WITHOUT licenseId/authorizationCode
8. Verify browser navigates to the consumer app (without token)
```

#### Scenario 5: Unregistered User (Auto-Signup)
```
1. Sign in with an email that has Firebase auth but no platform account
2. Verify POST /api/authentication/signin returns 403 UnregisteredUserException
3. Verify POST /api/authentication/signup is automatically called
4. If current URL includes "signup": verify evaluatePostAuth() is called
5. If current URL does NOT include "signup": verify redirect to /auth/signup
```

#### Scenario 6: Signup with Already Registered Email
```
1. Navigate to /auth/signup
2. Sign up with Google using an already-registered email
3. Verify POST /api/authentication/signup returns 403 (not UnregisteredUserException)
4. Verify signupAlreadyRegistered signal is set to true
5. Verify warning box appears: "A user with this Email has already registered"
```

#### Scenario 7: Agreement Flow
```
1. Navigate to /auth/signup
2. Enter email, password, confirm password
3. Check "I agree to terms" checkbox
4. Click "Create Account"
5. Verify Firebase createUserWithEmailAndPassword is called
6. Verify POST /api/authentication/signup is called
7. Verify evaluatePostAuth() is called
8. Follow dashboard routing from Scenario 1
```

#### Scenario 8: Token Expiry & Refresh
```
1. Sign in successfully
2. Wait for token to approach expiration (or mock short expiry)
3. Verify backgroundRefreshToken() fires before expiry
4. Verify Firebase getIdToken() is called
5. Verify POST /api/authentication/signin is called with RefreshTokenType.None
6. Verify new token is stored
```

#### Scenario 9: Theme Toggle
```
1. Navigate to /auth/signin
2. Click theme toggle button
3. Verify body class changes (theme-dark ↔ theme-light)
4. Verify <link id="app-theme"> href changes
5. Verify logo changes (light ↔ dark variant)
6. Verify localStorage["app-theme"] is updated
```

#### Scenario 10: Protected Route Access (AuthGuard)
```
1. Clear localStorage (no token)
2. Navigate to /{appId}/overview
3. Verify redirect to /auth/signin
4. Verify query params are preserved
```

#### Scenario 11: Invalid AppId Rejection
```
1. Try to set localStorage["default-app"] = "forbidden"
2. Verify StorageService patches block the write
3. Try to navigate to /forbidden/overview
4. Verify appIdMatcher returns null (reserved keyword)
5. Verify router falls through to /forbidden route
```

### 18.3 API Endpoint Coverage

Verify each API endpoint is called correctly:

| Endpoint | Method | Test Scenario |
|---|---|---|
| `GET /api/settings` | SettingsClient.get() | Scenarios 1-9 (settings load on auth page) |
| `POST /api/authentication/signin` | AuthenticationClient.signIn() | Scenarios 1-5, 8 |
| `POST /api/authentication/signup` | AuthenticationClient.signUp() | Scenarios 5-7 |
| `GET /api/team/users/current/licenses` | TeamClient.getLicenses() | Scenarios 1-2, 7 |
| `GET /api/licenses/best-license` | LicensesClient.getBestLicense() | Scenarios 1-3, 7 |
| `POST /api/licenses?licenseId=X&licenseName=Y` | LicensesClient.createLicense() | Scenarios 1-3, 7 |
| `GET /api/authentication/current` | AuthenticationClient.getCurrentUser() | (Optional — for profile display) |

### 18.4 No-Ionic Verification

Search the entire codebase for any remaining Ionic references:

```bash
# Should return ZERO results:
grep -r "ion-" src/ --include="*.ts" --include="*.html" --include="*.scss"
grep -r "@ionic" src/ package.json
grep -r "LoadingController\|ToastController\|AlertController\|ModalController" src/
grep -r "ion-app\|ion-content\|ion-card\|ion-button\|ion-icon\|ion-router-outlet" src/
grep -r "capacitor" src/ package.json
```

### 18.5 No-RxJS-Subject Verification

Verify no RxJS Subjects are used for application state:

```bash
# Should return ZERO results (except in proxy files and logger):
grep -rn "new Subject\|new BehaviorSubject\|new ReplaySubject" src/ --include="*.ts" | grep -v "proxies/" | grep -v "logger.service.ts"
```

> **Note:** RxJS `Observable`, `firstValueFrom`, `takeUntil`, and `filter` are still used for Firebase auth event handling and NSwag proxy calls. Only `Subject`/`BehaviorSubject` for state management must be eliminated.

### 18.6 Signal Usage Verification

Verify Signals are used for all state:

```bash
# Should find signals in stores and components:
grep -rn "signal\|computed\|effect\|\.set(\|\.update(" src/ --include="*.ts" | grep -v "proxies/" | grep -v "node_modules/"
```

### 18.7 Proxy Integrity Verification

Verify the proxy files are unmodified:

```bash
# Compare line counts (should match source):
wc -l src/app/core/proxies/payment-app-proxy.ts   # Should be 14,282
wc -l src/app/core/proxies/payment-proxy.ts        # Should be 5,185
wc -l src/app/core/proxies/api-exception.ts        # Should be 74

# Verify no modifications:
diff src/app/core/proxies/payment-app-proxy.ts /home/salman/Projects/ezpin/payment-admin/src/app/proxy/payment-app-proxy.ts
diff src/app/core/proxies/payment-proxy.ts /home/salman/Projects/ezpin/payment-admin/src/app/proxy/payment-proxy.ts
diff src/app/core/proxies/api-exception.ts /home/salman/Projects/ezpin/payment-admin/src/app/proxy/api-exception.ts
```

### 18.8 Performance Considerations

| Metric | Target |
|---|---|
| Initial bundle size | < 500KB (gzipped) |
| Proxy file size | ~800KB (uncompressed, lazy-friendly) |
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3s |
| Firebase SDK overhead | ~200KB (acceptable for auth) |

### 18.9 Security Checklist

- [x] JWT tokens never logged to console (Logger is no-op in production)
- [x] Tokens stored in localStorage (same as source — acceptable for this use case)
- [x] Background token refresh clears interval on signout
- [x] 401 responses clear auth state and redirect to signin
- [x] Invalid appId values are blocked from localStorage
- [x] Reserved route keywords prevent path traversal via appId matcher
- [x] Firebase config is environment-specific (stage vs prod)
- [x] Google client ID is configured in index.html meta tag

---

## Appendix A: Source File to Fork File Mapping

| Source File (payment-admin) | Fork File (payment-console) | Action |
|---|---|---|
| `src/app/proxy/payment-app-proxy.ts` | `src/app/core/proxies/payment-app-proxy.ts` | Verbatim copy |
| `src/app/proxy/payment-proxy.ts` | `src/app/core/proxies/payment-proxy.ts` | Verbatim copy |
| `src/app/proxy/api-exception.ts` | `src/app/core/proxies/api-exception.ts` | Verbatim copy |
| `src/environments/environment*.ts` | `src/environments/environment*.ts` | Copy (paths unchanged) |
| `src/assets/css/*.css` | `src/assets/css/*.css` | Verbatim copy |
| `src/app/core/services/logger.service.ts` | `src/app/core/services/logger.service.ts` | Verbatim copy |
| `src/app/core/services/storage.service.ts` | `src/app/core/services/storage.service.ts` | Adapted (minor) |
| `src/app/auth/service/firebase-auth.service.ts` | `src/app/core/services/firebase-auth.service.ts` | Rewritten (Signals) |
| `src/app/auth/service/license-flow.service.ts` | `src/app/core/services/license-flow.service.ts` | Rewritten (Signals) |
| `src/app/auth/service/auth-flow-orchestrator.service.ts` | `src/app/core/services/auth-flow-orchestrator.service.ts` | Rewritten (Signals) |
| `src/app/auth/guard/auth.guard.ts` | `src/app/core/guards/auth.guard.ts` | Rewritten (functional) |
| `src/app/core/interceptors/interceptor.ts` | `src/app/core/interceptors/auth.interceptor.ts` | Rewritten (functional) |
| `src/app/core/interceptors/errorInterceptor.ts` | `src/app/core/interceptors/error.interceptor.ts` | Rewritten (functional) |
| `src/app/auth/layout/auth/auth.component.*` | `src/app/features/auth/auth-layout/auth-layout.component.*` | Rewritten (HTML5) |
| `src/app/auth/view/signin/signin.component.*` | `src/app/features/auth/signin/signin.component.*` | Rewritten (HTML5) |
| `src/app/auth/view/agreement/agreement.component.*` | `src/app/features/auth/agreement/agreement.component.*` | Rewritten (HTML5) |
| `src/app/auth/view/grant-access/grant-access.component.*` | `src/app/features/auth/grant-access/grant-access.component.*` | Rewritten (HTML5) |
| `src/app/app-routing.module.ts` | `src/app/app.routes.ts` | Rewritten (provideRouter) |
| `src/app/app.module.ts` | `src/app/app.config.ts` | Rewritten (bootstrapApplication) |
| `src/main.ts` | `src/main.ts` | Rewritten (bootstrapApplication) |
| `src/index.html` | `src/index.html` | Adapted (Ionic meta tags removed) |
| `src/global.scss` + `src/theme/variables.scss` | `src/styles.scss` | Consolidated (Ionic-free) |
| `src/dictionary/dictionary.ts` | `src/dictionary/dictionary.ts` | Trimmed (auth-only) |
| N/A (new) | `src/app/core/stores/*.ts` | New (Signal stores) |
| N/A (new) | `src/app/core/utils/*.ts` | New (JWT + URL utils) |
| N/A (new) | `src/app/shared/components/loading-overlay/` | New |
| N/A (new) | `src/app/shared/components/toast-container/` | New |
| N/A (new) | `src/app/features/errors/` | New |
| N/A (new) | `src/app/features/dashboard/` | New (stub) |
| All feature modules (customer, fraud, gateway, etc.) | DELETED | Not part of auth flow |
| All `*.module.ts` files | DELETED | Standonly components |

---

## Appendix B: Strict Licensing Code Path Elimination

The following conditional branches existed in the source and are **eliminated** in the fork (always take the `true` path):

| Source Location | Original Condition | Fork Behavior |
|---|---|---|
| `AuthFlowOrchestrator.evaluatePostSignIn()` | `if (isLicenseActive && returnUrl)` | `isLicenseActive` always `true` — condition simplifies to `if (returnUrl)` |
| `AuthFlowOrchestrator.proceedToDashboard()` | `if (settings.isSupportLicenseManagement)` | Always `true` — license evaluation always runs |
| `AuthFlowOrchestrator.navigateToDashboard()` | `if (isLicenseActive) { ... } else { getApps() }` | `else` branch deleted — always uses `getLicenses()` |
| `SigninComponent` template | `*ngIf="settingsLoaded && isSupportLicenseManagement"` | Always `true` — form always visible |
| `AgreementComponent` template | `*ngIf="settingsLoaded && isSupportLicenseManagement"` | Always `true` — form always visible |
| `ApplicationComponent.initializeWithSettings()` | `if (isLicenseManagementSupported) { loadLicenses() } else { loadApps() }` | `else` branch deleted |
| `ApplicationComponent.initMenu()` | `if (isLicenseManagementSupported && isMobileSize)` | License menu item always shown (on mobile) |
| `AuthChooseAppComponent.loadData()` | `if (isSupportLicenseManagement) { loadLicenses() } else { loadApps() }` | `else` branch deleted |

---

*End of Implementation Plan*
```

---

## Part 13.6: ForgetPasswordComponent (Password Reset Request)

> **Addendum (re-port).** The source project (`payment-admin`) ships a password-reset
> request screen (`auth/view/forget-password`). The earlier draft of this plan listed it
> as "removed", but `SigninComponent` still links to `/auth/forget-password`
> (`routerLink="/auth/forget-password"`), which left a dead link. This component restores
> the flow, ported to pure Angular 19 standalone + signal stores.

**Location:** `src/app/features/auth/forget-password/forget-password.component.ts`
**Route:** `{ path: 'forget-password', component: ForgetPasswordComponent }` under the `auth` shell.

### Behavior parity with source

| Source (`payment-admin`, Ionic) | Fork (`payment-console`, Angular 19) |
|---|---|
| `ThemeService.theme$` + `SettingsClient.get()` subscriptions for branding | `SettingsStore` signals (`activeLogoUri()`, `brand()`) — no manual subscriptions |
| `firebaseAuthService.changeSigninWithGoogleLoading(true/false)` | `authStore.isGoogleLoading.set(true/false)` |
| `firebaseAuthService.sendPasswordResetEmail(email)` | `firebaseAuth.sendPasswordResetEmail(email)` (unchanged Firebase call) |
| On success → `router.navigate(['/auth/confirm'])` | `/auth/confirm` does **not** exist in the fork → show a privacy-preserving success toast and `router.navigate(['/auth/signin'])`, preserving query params |
| `notificationService.showErrorNotification(...)` | `notificationService.showError(...)` |

### Form
```typescript
email: string                  // required, validated against the RFC email pattern
async onForgetPass(): Promise<void>
private getFirebaseErrorMessage(error: any): string
```

### Firebase error codes handled
`auth/invalid-email`, `auth/user-not-found`, `auth/missing-email`, `auth/too-many-requests`.

> **Security note:** the success message ("If an account exists for that email, a password
> reset link is on its way.") is intentionally non-committal so the screen does not reveal
> whether an email is registered (account-enumeration hardening).

---

## Part 18.3: Unit Test Suite (Jasmine + Karma)

The fork previously had **no test harness**. This section documents the Angular-default
Jasmine/Karma setup added alongside the auth port, and the three auth specs carried over
from `payment-admin` (`auth.guard.spec.ts`, `auth-flow-orchestrator.service.spec.ts`,
`firebase-auth.service.spec.ts`).

### Infrastructure added
| File | Purpose |
|---|---|
| `package.json` → `devDependencies` | `jasmine-core`, `@types/jasmine`, `karma`, `karma-chrome-launcher`, `karma-coverage`, `karma-jasmine`, `karma-jasmine-html-reporter` |
| `package.json` → `scripts` | `"test": "ng test"`, `"test:ci": "ng test --watch=false --browsers=ChromeHeadless"` |
| `tsconfig.spec.json` | TS config for specs (`types: ["jasmine"]`, includes `**/*.spec.ts`) |
| `karma.conf.js` | Standard Angular Karma config (+ `ChromeHeadlessCI` launcher for sandboxed CI) |
| `angular.json` → `architect.test` | `@angular-devkit/build-angular:karma` target (polyfills `zone.js` + `zone.js/testing`) |

### Why the specs were *adapted*, not copied verbatim

The source specs are written against `payment-admin`'s Ionic architecture, which differs
fundamentally from the fork. A literal copy would not compile. The behavioral intent is
preserved; the wiring is re-pointed:

| Source spec assumption | Fork reality | Adaptation |
|---|---|---|
| `new FirebaseAuthService(7 args)` incl. `AlertController`, `TagManagerService` | 5-dep service using `inject(Auth)`; no alert/tag-manager | Built via `TestBed` with mocked providers + `{ provide: Auth, useValue: {} }` |
| `service.parseJwt(...)`, `storage.set('token', ...)` | `parseJwt` moved to `jwt.util`; session writes go through `AuthStore.setSession` | Assert `authStore.setSession(token, userId)`; token/expiry covered via `hasExpired` |
| Google Ads `tagManager.trackConversion('sign_in'/'sign_up')` | Not present in the fork | Conversion assertions dropped |
| `evaluatePostSignIn`, `firebaseAuth.signupAlreadyRegistered.next(true)` | `evaluatePostAuth`, `authStore.signupAlreadyRegistered.set(true)` | Renamed; signal `.set` spies |
| signin 403 → "Please sign up first" notification, no auto-signup | Fork **auto-creates** the account on 403 unregistered, then routes to `/auth/signup` | Test asserts `callSignUp` is called + navigation to `/auth/signup` |
| class `AuthGuard` with `canActivate(route)` | functional `authGuard: CanActivateFn` | Invoked via `TestBed.runInInjectionContext(...)` |

### Coverage
- **`firebase-auth.service.spec.ts`** — `isUserAuthenticated`, `hasExpired` (valid / expired / missing token), `callSignIn` & `callSignUp` persist the session.
- **`auth-flow-orchestrator.service.spec.ts`** — signin→`evaluatePostAuth`, signup→`evaluatePostAuth`, signin 403 auto-signup, signup 403 already-registered warning, `evaluatePostAuth` routing (grant-access vs dashboard).
- **`auth.guard.spec.ts`** — allow valid token, block+redirect on missing token, block+redirect on expired token.

### Run
```bash
npm install        # pulls the new karma/jasmine devDependencies
npm run test:ci    # headless single run
npm test           # watch mode (local dev)
```

---


## API Call Convention (Standard)

**Every API call MUST follow this exact structure** — the same pattern used by
`PaymentsComponent.loadPayments()` (which calls `getPaymentsSummary`). This keeps
data loading uniform across the app: an `appId` guard, a `loading` signal, a
`try/firstValueFrom/catch/finally` block, and `extractError()` for the message.

```ts
async loadX(): Promise<void> {
  const appId = this.workspaceStore.currentAppId();
  if (!appId) return;

  this.loading.set(true);
  try {
    const result = await firstValueFrom(this.someClient.getX(appId /*, ...args */));
    this.data.set(result ?? /* sensible default, e.g. [] or null */);
  } catch (err: any) {
    this.notify.showError(this.extractError(err, 'Failed to load X.'));
    this.data.set(/* default */);
  } finally {
    this.loading.set(false);
  }
}

// Shared error-message extractor used by every call's catch block:
protected extractError(err: any, fallback: string): string {
  return (
    err?.response?.message ||
    err?.message ||
    err?.exceptionMessage ||
    fallback
  );
}
```

**Rules:**
1. Resolve the workspace id with `this.workspaceStore.currentAppId()` and **guard** (`if (!appId) return;`) before calling.
2. Use **`firstValueFrom(...)`** on the proxy `Observable` (no `.subscribe`, no `.then().catch()`).
3. Wrap in **`try / catch / finally`**; toggle the `loading` (or `busy`) signal in `try`/`finally`.
4. On error, show **`this.extractError(err, '<fallback>')`** via `NotificationService` and reset the signal to a safe default.
5. **Mutating actions** (capture/cancel/refund/etc.) follow the same shape with a `busy` signal and reload the entity on success.
6. **Optional/supplementary** loads (e.g. last webhook) may swallow the error silently (`catch { this.x.set(null); }`) but still use `firstValueFrom` + `try/catch`.

**Reference implementations:** `PaymentsComponent.loadPayments()` and
`PaymentDetailComponent` (`loadPayment` / `loadStateLogs` / `loadWebhook` + action handlers).

---

## Modal Loading Pattern (Standard)

Any modal that loads data asynchronously (e.g. payment detail's Raw info / Link
info / Log details) must present the **whole modal in a loading state** — not a
partly-built shell with a usable Close/Done button. The user must clearly see the
modal is still loading.

**Rules:**
1. **Open the modal immediately** with `loading: true`; do not wait for the API.
2. **Body** shows a **skeleton** (pulsing rows / blocks) while loading.
3. **Hide ALL action affordances while loading** — the footer buttons (Close/Done)
   **and** the header close (✕). Nothing actionable renders until data arrives.
4. **Dismiss policy depends on modal type** (see *Modal Dismissal & Validation*):
   read-only/info modals may dismiss via overlay click; **create/form modals must
   NOT close on overlay click** (avoid losing typed input) — close button only.
5. When the API resolves, set `loading: false` and render the real content +
   footer (+ header ✕). On error, close the modal and show the toast.

```html
<div class="overlay" (click)="close()">
  <div class="modal" (click)="$event.stopPropagation()">
    <div class="mh">
      <h3>{{ m.title }}</h3>
      <div class="spacer"></div>
      @if (!m.loading) { <button class="icon-btn" (click)="close()">✕</button> }
    </div>
    <div class="mb">
      @if (m.loading) { <div class="modal-skeleton">…skeleton rows…</div> }
      @else { …real content… }
    </div>
    @if (!m.loading) {
      <div class="mf"><button class="btn btn-primary" (click)="close()">Done</button></div>
    }
  </div>
</div>
```

**Reference implementation:** `PaymentDetailComponent` info modal (Raw info / Link
info / Log details). Apply the same shape to every async modal in the project.

---

## Grid Batch Pagination (Standard)

Lists fetch in **chunks of 100** from the server and paginate **in memory** (10
per page), calling the API again only when the user crosses a chunk boundary
(e.g. page 11 needs records 101–200). This minimises API calls vs. per-page
server pagination.

**Base grid (`DataGridComponent`) support:**
- `[hasMore]` input — true while more server records may exist.
- `(loadMore)` output — emitted when the user reaches the **last loaded page** (or
  clicks Next past it) and `hasMore` is true. The Next button stays enabled while
  `hasMore`; the row-range shows `… of 100+`. Jump-to-last is disabled (true last
  page is unknown).

**Host component pattern (see `PaymentsComponent`):**
```ts
private batchSize = 100; private nextPageNumber = 1; private isFetching = false;
readonly hasMore = signal(true);

async loadX(): Promise<void> {           // initial / refresh
  this.nextPageNumber = 1; this.hasMore.set(true); this.data.set([]);
  await this.loadBatch();
}
async loadBatch(): Promise<void> {        // (loadMore) handler
  if (this.isFetching || !this.hasMore()) return;
  const appId = this.workspaceStore.currentAppId(); if (!appId) return;
  this.isFetching = true; this.loading.set(true);
  try {
    const rows = await firstValueFrom(this.client.getX(appId, …, this.nextPageNumber, this.batchSize));
    const batch = rows ?? [];
    this.data.update(cur => [...cur, ...batch]);   // append in memory
    this.hasMore.set(batch.length === this.batchSize);
    this.nextPageNumber++;
  } catch (err) { this.notify.showError(this.extractError(err, '…')); this.hasMore.set(false); }
  finally { this.loading.set(false); this.isFetching = false; }
}
```
Bind `[data]` `[hasMore]="hasMore()"` `(loadMore)="loadBatch()"` `(refreshRequested)="loadX()"`.

---

## Grid Layout Stability (Standard)

All `DataGridComponent` instances must not shift layout when transitioning
between skeleton loading and real data. Three rules apply in `data-grid.component.scss`:

### 1. Sticky column headers
```scss
thead {
  position: sticky;
  top: 0;
  z-index: 1;
}
```
This keeps column headers in place when the table overflows and the user scrolls,
and prevents them from shifting during data load.

### 2. Scrollbar gutter reservation
```scss
.dc-tablewrap {   /* fill-mode only */
  scrollbar-gutter: stable;
}
```
`overflow-y: auto` causes a ~17 px layout jump when the scrollbar appears after data
loads. `scrollbar-gutter: stable` reserves that space permanently — the table width
never changes.

### 3. Row height parity (skeleton ↔ data)
```scss
tbody td {
  padding: 7px 18px;
  height: 44px;           /* 30px avatar + 7+7 padding */
  box-sizing: border-box;
}
```
Skeleton rows and data rows must be the same height. Locking `height: 44px` with
`box-sizing: border-box` (so padding is included) ensures the table does not
change size when data replaces skeletons.

---

## Provider Icon (Logo) Resolution (Standard)

Provider logos (`PaymentProvider.iconUri1` = light, `iconUri2` = dark) render via
the reusable **`ProviderLogoComponent`** (`<app-provider-logo [provider]="…" [showName]="…" />`),
backed by **`PaymentIconService`** (`@core/services/payment-icon.service.ts`).

### Resolution strategy (`PaymentIconService`)

- **`.svg` URIs** — fetched as text via `HttpClient`, inlined as
  `data:image/svg+xml;base64,…`. Blob storage returns SVGs with a non-image
  content-type; browsers never content-sniff SVG in `<img>`, so a bare URL fails.
  Inlining forces the correct MIME type.
- **Non-SVG URIs (PNG/JPG/…)** — raw URL passed directly (`of(uri)`). Do **not**
  fetch these as Blob/FileReader data URLs — an `application/octet-stream` data URI
  is rejected by browsers.
- Results are **`shareReplay(1)` cached per URI**, so each icon is fetched at most once.

### Reactive resolution in `ProviderLogoComponent`

**Pattern: `toObservable(rawIcon) → switchMap → toSignal`** (NOT `effect() + subscribe()`).

`effect() + subscribe()` was the original implementation and had two bugs:
1. **Dark mode race**: when `isDark()` changed, a new subscription was added without
   cancelling the old one — the stale light-mode result raced against the dark-mode
   result and could win, leaving the logo unchanged.
2. **Empty-string leak**: `??` null-coalescing lets empty strings through as "valid" URIs;
   `iconUri2 = ""` in dark mode would resolve to `""` and show no logo instead of
   falling back to `iconUri1`.

Current (correct) implementation:

```typescript
// Use || (not ??) so empty strings fall through to the other URI
private readonly rawIcon = computed<string | null>(() => {
  const p = this.provider();
  if (!p) return null;
  const light = p.iconUri1 || null;
  const dark  = p.iconUri2 || null;
  return this.settings.isDark() ? (dark || light) : (light || dark);
});

// tap() resets the stale `failed` signal before each new resolution so a
// previous img-load error never blocks the next URI.
// switchMap() automatically cancels the previous HTTP observable when rawIcon
// changes (theme switch, provider change) — no manual unsubscription needed.
readonly icon = toSignal(
  toObservable(this.rawIcon).pipe(
    tap(() => this.failed.set(false)),
    switchMap(uri => uri
      ? this.iconService.resolve(uri).pipe(map(s => s || null))
      : of(null)
    )
  ),
  { initialValue: null }
);
readonly failed = signal(false);  // set by (error) on the <img> element
```

This single component is the canonical way to render any provider logo everywhere in
the app: payments grid (`provider` column type via `DataGridComponent`), payment detail
page, and the advanced-filter gateway picker. No per-page batch-preload is needed.

### Presentation — wide wordmarks

Provider icons are full brand wordmarks (Stripe, PayPal, Amazon, PayTabs, …), exactly
as payment-admin renders them. Two modes:

- **Default (compact):** 26×26 px box with `object-fit: contain` and a subtle border —
  suitable for small grid cells.
- **`[wide]="true"`** (wordmark): `height: 26px; max-width: 104px; object-fit: contain;
  object-position: left center; no box/border/bg`. Used wherever the logo acts as the
  brand name itself. The text fallback shows the full provider **name** (not the initial).
- **Gateway picker (advanced filter):** uses compact mode (`[wide]="false"`, default).
  Shows the 26×26 icon next to the profile currency (`p.currency`). Provider name text
  is intentionally omitted — the logo + currency are sufficient.

---

## Advanced Filter + Shareable URL State (Payments)

The payments grid shows **only a search box and an "Advanced filter" button**
(`[hideBuiltInFilters]="true"` hides the grid's built-in column dropdowns/date).
The filter lives in **`PaymentsFilterModalComponent`** and emits a `PaymentsFilter`.

**State filter (single-select), ported from payment-admin `getPaymentStates`:** each
chip is a state code — `1` Created, `7` Captured, `8` Failed, `9` Disputed, `12`
Cancelling, `14` Refunded, `15` Refunding, plus two **sentinels**: `-1` In progress
(expands to `[3,4,5,6,10]`) and `-2` Hold (expands to `[11,13]`). `expandPaymentState()`
turns the code into the comma-separated `paymentStates` the API expects.

**Shareable URL** — applying a filter / search writes the active state to the route
(`router.navigate([], { queryParamsHandling:'merge', replaceUrl:true })`) using the
**exact payment-admin param names**, so a link opens the grid pre-filtered for
another operator:
```
payments?paymentStates=-2&startTime=2026-06-23&endTime=2026-06-24&customerId=…&paymentProfileId=160&fraudPolicyId=230&searchCriteria=…
```
On init the page reads these params back into the filter + search before loading.

---

## Server-Side Grid Search (Standard)

For batched grids, the search box must query the **server** (a match may live in a
not-yet-loaded chunk) — not filter only the loaded rows. The base grid supports:
- `[serverSearch]="true"` — keeps the debounced search box but **suppresses the
  client-side global filter**, and emits `(filterChanged)` with `globalSearch`.
- `[initialSearch]="…"` — seeds the box once (e.g. from a shared URL) without
  re-emitting a search.

The host takes `globalSearch`, stores it as `searchCriteria`, and **reloads from the
first batch** (`loadX()`), passing it to the summary API.

---

## Grid Fill Mode + Full-Bleed Page (Standard)

To fill the content block edge-to-edge (e.g. the payments list) with the table
scrolling internally:
- Grid: `[fill]="true"` → `:host.fill` makes the card `flex:1`, the `.dc-tablewrap`
  the internal scroll area (toolbar/filters/footer stay pinned), and squares off the
  card (no radius/shadow, crisp border) so corners line up with the page.
- Page host: `:host { display:flex; flex-direction:column; flex:1; min-height:0 }`
  and the same on `app-data-grid`.
- Layout: `DashboardLayoutComponent` adds `.content.flush` (padding:0, overflow
  hidden) for full-bleed routes (matched by URL, currently `/payments`); `.content`
  is a flex column so a single page child can stretch.

Grid rows are compact (`td { padding: 7px 18px }`) so ~10 rows show without scrolling.

---

## Topbar Breadcrumb (Store-Driven)

The topbar breadcrumb shows **only the page name** (no "PaymentHub" prefix). It is a
`trail` of crumbs: by default a single route-derived crumb; pages can override via
**`BreadcrumbStore`** (`@core/stores/breadcrumb.store.ts`, `set([{label, link?}])` /
`clear()`). Non-last crumbs with a `link` render as router links.

Example — `PaymentDetailComponent` sets (in an `effect`, cleared in `ngOnDestroy`):
`Payments → Detail 41811 - Marshall Carroll (b20bb89bdcbd)`.

---

## Create-Modal Form Validation + Dismissal (Standard)

Every **create/form modal** validates mandatory fields on submit by drawing a **red
border** on the offending control — **no inline text messages** (e.g. not "Enter a
valid amount"). Server/API failures still surface as a **toast** (`NotificationService`).

**Pattern:**
- A `tried` flag (set true on Create/Save). Per-field getters: `xInvalid = tried && <empty/invalid>`.
- `create()` sets `tried = true`, returns early if any field invalid (red borders show).
- Template binds `[class.invalid]="xInvalid"`; SCSS `.input.invalid { border-color: var(--bad) }`.
- **Do NOT close on overlay click** — the overlay has no `(click)="close()"`; the
  header ✕ / Cancel are the only ways out (prevents losing typed input).

**Reference implementations:** `CreatePaymentLinkModalComponent`,
`CustomerPickerModalComponent` (create mode), `PaymentsFilterModalComponent`
(overlay-dismiss disabled).

---

## Reusable Customer Picker (Standard)

`CustomerPickerModalComponent` (`@shared/components/customer-picker-modal`) is a
reusable picker: debounced search (payment-proxy `CustomersClient.list`, **page size
10**) + inline create (`CustomersClient.create`). Open with `open()`, consume the
chosen/created record via `(selected)`. Embedded in `PaymentsFilterModalComponent`;
reuse anywhere a customer must be chosen.

---

---

## Part 19: Permission Management System

### 19.1 Overview

This section documents the permission management implementation ported from `payment-admin` and adapted for the pure Angular Signal architecture.

**Core API endpoint used:**
- `GET /api/team/users/current/apps/{appId}/permissions` → `string[]`  
  Exposed via `TeamClient.getAppPermissions(appId)` in `payment-app-proxy.ts`.

**Permission scope strings** (matching backend contract):
| Scope | View protected |
|---|---|
| `DashboardRead` | `/overview` (redirect to `/payments` if absent) |
| `PaymentRead` | `/payments` — list & filters |
| `PaymentWrite` | `/payments` — create payment link, export |
| `CustomerRead` | `/customers` — list |
| `CustomerWrite` | `/customers` — edit, add |
| `GatewayListRead` | `/gateways` — list |
| `PaymentProfileWrite` | `/gateways` — create/edit gateway |
| `FraudPolicyRead` | `/policies` — list |
| `FraudPolicyWrite` | `/policies` — edit rules |
| `RoleRead` | `/team` — visible in sidebar |
| `RoleWrite` | `/team` — add/remove members |

---

### 19.2 Architecture

```
[ licenseGuard ] ──on workspace entry──►  [ PermissionStore.loadPermissions(appId) ]
                                                │
                                                ▼
                                    signal<string[]> permissions
                                                │
                          ┌─────────────────────┼─────────────────────┐
                          ▼                     ▼                     ▼
               [ nav-config.ts ]    [ appPermission directive ]  [ page components ]
               Permission-aware       Structural: show/hide       canRead/canWrite
               nav group filter       DOM elements                computed signals
```

---

### 19.3 Files Created / Modified

#### [NEW] `src/app/core/stores/permission.store.ts`
Signal store that:
- Holds `permissions = signal<string[]>([])`
- Exposes `loadPermissions(appId)` — calls `TeamClient.getAppPermissions`
- Exposes `hasPermission(scope)` — returns `boolean`
- Exposes `canRead(scope)` / `canWrite(scope)` computed helpers

#### [NEW] `src/app/shared/directives/permission.directive.ts`
Standalone structural directive `[appPermission]`:
- Input: `appPermission: string` (the permission scope string)
- Uses `ViewContainerRef` + `TemplateRef` to conditionally render
- Reacts to `PermissionStore.permissions` signal changes
- Removes element when permission is absent, adds when present

#### [MODIFY] `src/app/core/guards/license.guard.ts`
After successful app access validation, calls `PermissionStore.loadPermissions(appId)` so permissions are loaded before any child route renders.

#### [MODIFY] `src/app/features/dashboard/components/nav-config.ts`
Adds `permission` field to `NavItem`. Sidebar filters items via `PermissionStore`.

#### [MODIFY] `src/app/features/dashboard/components/sidebar/sidebar.component.ts`
Injects `PermissionStore`, filters `navGroups` computed signal by `hasPermission`.

#### [MODIFY] `src/app/features/dashboard/pages/overview/overview.component.ts`
Uses `PermissionStore` — if `DashboardRead` is absent, redirects to `/payments`.

#### [MODIFY] `src/app/features/dashboard/pages/team/team.component.html`
Wraps "New member" and action buttons with `*appPermission="'RoleWrite'"`.

#### [MODIFY] `src/app/features/dashboard/pages/gateways/gateways.component.ts`
Hides "Add Gateway" wizard button when `PaymentProfileWrite` is absent.

---

### 19.4 Verification

- Build: `npm run build` — AOT validates all templates.
- Manually: navigate as a read-only user — sidebar only shows permitted routes.
- Manually: create-gateway button hidden without `PaymentProfileWrite`.
- Manually: add-member button hidden without `RoleWrite`.
