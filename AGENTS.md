# AGENTS.md — Payment Console

## Verification commands

- **Build (includes AOT template checks):** `npm run build`
- **TypeScript typecheck:** `npx tsc --noEmit -p tsconfig.app.json`
- **Dev server:** `npm start` (http://localhost:8083)

> `ng lint` is **not** configured (angular-eslint is not installed). Use
> `npm run build` as the primary correctness gate — it runs the Angular AOT
> compiler which validates templates and types.

## Key conventions

- NSwag proxy files in `src/app/core/proxies/` are auto-generated — **never modify**.
- PATCH endpoints use a `Patch<T>` envelope (`{ value }`). Build them with
  `patchOf(value)` from `@core/utils/patch.util`.
- State is Angular Signals only (no RxJS Subjects). Proxy Observables are
  converted via `firstValueFrom()`.
- The active workspace `appId` is read from `WorkspaceStore.currentAppId()`.
- The data-grid supports `editMode="modal"`: editable cells emit
  `fieldEditRequested`, which the host routes to the universal edit modal.
- The universal edit modal (`app-universal-edit-modal`) edits any scalar field
  via a host-supplied `save` callback that performs the PATCH request.
