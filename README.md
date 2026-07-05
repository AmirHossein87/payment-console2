# Payment Console

Pure Angular 19 SPA for license-managed authentication flows. Forked from `payment-admin` (Angular 16 + Ionic 8 + Capacitor) with all Ionic/Capacitor/UI-library dependencies removed. Uses Angular Signals for state management and standalone components throughout.

## Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- A modern browser (Chrome, Firefox, Edge, Safari)

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (runs on http://localhost:8083)
npm start
```

The app defaults to the **staging** API endpoints and **staging** Firebase project (see `src/environments/environment.ts`).

## NPM Scripts

| Script                | Description                                   |
| --------------------- | --------------------------------------------- |
| `npm start`           | Dev server on port 8083 with hot reload       |
| `npm run build`       | Development build                             |
| `npm run build-stage` | Staging build (uses `environment.stage.ts`)   |
| `npm run build-prod`  | Production build (uses `environment.prod.ts`) |
| `npm run watch`       | Watch mode — rebuilds on file changes         |
| `npm run lint`        | Run Angular ESLint with auto-fix              |
| `npm run format`      | Prettier format all files                     |

## Environment Configuration

Three environment files live in `src/environments/`:

| File                   | Used By                       | API Base                                       | Firebase                        |
| ---------------------- | ----------------------------- | ---------------------------------------------- | ------------------------------- |
| `environment.ts`       | `npm start` / `npm run build` | `payment-app-service-stage.arthurcraftlab.com` | Stage project                   |
| `environment.stage.ts` | `npm run build-stage`         | `payment-app-service-stage.arthurcraftlab.com` | Stage project                   |
| `environment.prod.ts`  | `npm run build-prod`          | `payment-app-service.arthurcraftlab.com`       | Stage project (update for prod) |

Build configurations swap environment files via `fileReplacements` in `angular.json`.

### Key Environment Keys

| Key              | Purpose                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| `appBaseUrl`     | Base URL for all `payment-app-proxy.ts` API calls (auth, settings, team, licenses) |
| `base_Url`       | Base URL for `payment-proxy.ts` (unused in this fork)                              |
| `firebaseConfig` | Firebase project credentials (auth, popup sign-in)                                 |
| `Client_id`      | Google OAuth client ID                                                             |
| `Scopes`         | OAuth scopes requested during Google sign-in popup                                 |
| `enableLogging`  | Toggles rich console output via `Logger` service                                   |

## Project Structure

```
src/
├── app/
│   ├── core/
│   │   ├── proxies/              # NSwag-generated API clients (DO NOT MODIFY)
│   │   │   ├── payment-app-proxy.ts   # Auth, settings, team, licenses clients
│   │   │   ├── payment-proxy.ts       # Payment-service clients (mostly unused)
│   │   │   └── api-exception.ts       # ApiException error class
│   │   ├── stores/               # Signal-based state stores
│   │   │   ├── auth.store.ts          # Token, userId, auth loading state
│   │   │   ├── settings.store.ts      # Branding, theme, settings (license=true hardcoded)
│   │   │   ├── license.store.ts       # Licenses, best-license, create-license
│   │   │   └── workspace.store.ts     # Active appId, app metadata, localStorage guard
│   │   ├── services/
│   │   │   ├── firebase-auth.service.ts          # Firebase auth (popup + email/password)
│   │   │   ├── auth-flow-orchestrator.service.ts # Main auth brain (signin → license → route)
│   │   │   ├── license-flow.service.ts           # Thin wrapper over LicenseStore
│   │   │   ├── storage.service.ts                # localStorage with default-app guard
│   │   │   ├── notification.service.ts           # Signal-based toast queue
│   │   │   └── logger.service.ts                 # Environment-aware rich console logger
│   │   ├── guards/
│   │   │   ├── auth.guard.ts           # CanActivateFn — token validity check
│   │   │   └── license.guard.ts        # CanActivateFn — license/appId validity check
│   │   ├── interceptors/
│   │   │   ├── auth.interceptor.ts     # Bearer token + workspace header injection
│   │   │   └── error.interceptor.ts    # 401/403 handling, error normalization
│   │   └── utils/
│   │       ├── jwt.util.ts             # parseJwt, isTokenExpired
│   │       └── url.util.ts             # extractBaseDomain, appendTokenParams
│   ├── features/
│   │   ├── auth/
│   │   │   ├── auth-layout/            # Shell for /auth/* routes
│   │   │   ├── signin/                 # Sign-in page (Google + email/password)
│   │   │   ├── agreement/              # Sign-up page (email/password + terms)
│   │   │   └── grant-access/           # OAuth-style consent screen
│   │   ├── errors/
│   │   │   ├── forbidden/              # 403 page
│   │   │   └── not-found/              # 404 page
│   │   └── dashboard/
│   │       ├── dashboard-layout/       # Stub layout (header + outlet)
│   │       └── overview/               # Stub overview page
│   ├── shared/
│   │   └── components/
│   │       ├── loading-overlay/        # Full-screen spinner overlay
│   │       └── toast-container/        # Toast notification queue
│   ├── app.component.ts                # Root component
│   ├── app.config.ts                   # Providers (router, http, firebase, clients)
│   └── app.routes.ts                   # Route definitions + custom UrlMatcher
├── assets/
│   ├── css/                            # Material Design theme CSS (light/dark)
│   ├── img/                            # Logo images
│   └── icon/                           # Favicon
├── environments/                       # Environment files (dev/stage/prod)
├── dictionary/                         # UI string dictionary
├── styles.scss                         # Global styles + design tokens (light/dark)
├── index.html                          # HTML shell (fonts, theme link, meta)
└── main.ts                             # bootstrapApplication entry point
```

## Architecture Overview

### State Management

All application state uses Angular Signals (`signal`, `computed`, `effect`). No RxJS `Subject`/`BehaviorSubject` is used for state. RxJS Observables are only consumed from NSwag proxy client methods, converted to Promises via `firstValueFrom()`.

Four centralized stores:
- **AuthStore** — JWT token, userId, loading flags, authentication status (computed)
- **SettingsStore** — Branding data from `GET /api/settings`, theme (dark/light), `isSupportLicenseManagement` hardcoded to `true`
- **LicenseStore** — User licenses, best-license lookup, license creation
- **WorkspaceStore** — Active app ID with reserved-keyword validation and localStorage persistence

### Auth Flow

```
User signs in (Google popup or email/password)
  → Firebase Auth returns idToken
  → AuthFlowOrchestrator.initiateFirebaseSession(idToken)
    → POST /api/authentication/signin (or /signup)
    → AuthStore.setSession(token, userId)
    → evaluatePostAuth()
      ├── returnUrl present? → /auth/grant-access
      └── no returnUrl? → proceedToDashboard()
           → GET /api/licenses/best-license
           → (create license if none)
           → GET /api/team/users/current/licenses
           → navigate to /{appId}/overview
```

### Routing

A custom `tenantWorkspaceIdMatcher` matches the first URL segment as a dynamic `appId` parameter, unless it matches a reserved keyword (`auth`, `forbidden`, `notfound`, `overview`, etc.). This allows `/{appId}/overview` while preventing `forbidden` from being captured as an appId.

| Route                | Component                                    | Guard                    |
| -------------------- | -------------------------------------------- | ------------------------ |
| `/auth/signin`       | SigninComponent                              | —                        |
| `/auth/signup`       | AgreementComponent                           | —                        |
| `/auth/grant-access` | GrantAccessComponent                         | authGuard                |
| `/forbidden`         | ForbiddenComponent                           | authGuard                |
| `/notfound`          | NotFoundComponent                            | —                        |
| `/{appId}/overview`  | DashboardLayoutComponent → OverviewComponent | authGuard + licenseGuard |

### Theme System

- Light/dark mode toggled via `SettingsStore.toggleTheme()`
- Theme preference persisted in `localStorage["app-theme"]`
- Body gets `theme-dark` / `theme-light` class + `data-theme` attribute
- `<link id="app-theme">` href switches between `theme-md-light-indigo.css` and `md-dark-indigo.css`
- Falls back to OS preference when no explicit choice is stored

## TypeScript Path Aliases

Defined in `tsconfig.json`:

| Alias             | Resolves To              |
| ----------------- | ------------------------ |
| `@core/*`         | `src/app/core/*`         |
| `@proxy/*`        | `src/app/core/proxies/*` |
| `@shared/*`       | `src/app/shared/*`       |
| `@features/*`     | `src/app/features/*`     |
| `@environments/*` | `src/environments/*`     |

## NSwag Proxy Files

The three files in `src/app/core/proxies/` are **auto-generated** and must not be modified:

- `payment-app-proxy.ts` (~14k lines) — All API clients + DTOs used by this app
- `payment-proxy.ts` (~5k lines) — Payment-service clients (retained for type completeness)
- `api-exception.ts` — `ApiException` class for HTTP error handling

These files are excluded from ESLint. Do **not** run `npm run lint` or Prettier on them.

## Development Notes

### Changing API Endpoints

Edit the `appBaseUrl` field in the relevant environment file:
- `src/environments/environment.ts` for local dev
- `src/environments/environment.stage.ts` for staging builds
- `src/environments/environment.prod.ts` for production builds

### Switching Firebase Projects

Update `firebaseConfig` in the environment files. Also update the `google-signin-client_id` meta tag in `src/index.html` if the Google OAuth client ID changes.

### LocalStorage Keys

| Key           | Purpose                             | Guarded                                   |
| ------------- | ----------------------------------- | ----------------------------------------- |
| `token`       | JWT platform token                  | No                                        |
| `user`        | User ID                             | No                                        |
| `default-app` | Active workspace app ID             | Yes — validated against reserved keywords |
| `app-theme`   | Theme preference (`dark` / `light`) | Preserved on `storage.clear()`            |

### Reserved App ID Keywords

The following strings cannot be used as workspace `appId` values (blocked by `StorageService` and `tenantWorkspaceIdMatcher`):

```
forbidden, undefined, null, app, login, register, auth, dashboard,
licenses, notfound, apps, billing, overview, payments, gateways,
app-setting, policies, fraud-activities, customers, team,
personalization, rules, fraud
```

## Build Output

Builds output to `dist/payment-console/browser/`. The Angular 19 `application` builder (esbuild-based) is used.

```bash
# Verify a production build locally
npm run build-prod
npx http-server dist/payment-console/browser -p 8084
```

## Source Project Reference

This project was forked from `/home/salman/Projects/ezpin/payment-admin` (Angular 16 + Ionic 8 + Capacitor). The full migration specification is in `IMPLEMENTATION-PLAN.md`.


