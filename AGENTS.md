# Repo Instructions

- Every time you make a commit that will be pushed, bump the backoffice version by exactly `+1`.
- The version source of truth is `backoffice/src/lib/app-version.ts`.
- Treat the version bump as mandatory for every pushed commit. Do not wait for the user to remind you.
- If a commit was created without a version bump, fix the version before pushing.
- Keep the bumped version visible on the authentication screen.
- Before pushing, verify the committed version with `git show HEAD:backoffice/src/lib/app-version.ts`.

## Auth Surface Isolation

- There are two independent authentication circuits. They must coexist, but they must not share Firebase client apps, server cookies, login pages, redirects, or route handlers unless the user explicitly asks for a cross-surface auth migration.
- Legacy `/login` is the PocketGenes / Pocket Gyms authentication surface:
  - Browser page: `backoffice/src/app/(auth)/login/page.tsx`.
  - Firebase Web SDK app: `backoffice/src/lib/firebase.ts`.
  - Backoffice proxy route: `/api/sdk/auth/login`.
  - SDK route: `goldencrow-sdk/src/routes/auth.routes.ts` `/auth/login`.
  - Browser session handoff: `backoffice/src/lib/auth.ts` NextAuth credentials flow.
  - Cookie: `session`.
- GC Fitness authentication is the trainer surface and must stay isolated under `/gc-fitness/login` and `/api/gc-fitness/login`:
  - Firebase Web SDK app: named `gc-fitness` app in `backoffice/src/lib/firebase/gc-fitness-client.ts`.
  - Server auth/session library: `next-firebase-auth-edge`.
  - Cookie: `GcFitnessAuthToken`.
- The legacy Firebase Web SDK initializer at `backoffice/src/lib/firebase.ts` must only use the `[DEFAULT]` Firebase app. Never replace it with `getApps()[0]`, because a named GC Fitness app can be initialized first in the same browser session and break `/login` by minting tokens for the wrong Firebase project.
- Do not add GC Fitness project cards, redirects, imports, cookie handling, `GcFitnessAuthToken`, `next-firebase-auth-edge`, or `/gc-fitness/*` branching to `backoffice/src/app/(auth)/login/page.tsx`, `backoffice/src/lib/auth.ts`, `backoffice/src/app/api/sdk/[...sdkPath]/route.ts`, or the SDK `/auth/login` path.
- Do not make `/api/sdk/[...sdkPath]` aware of GC Fitness auth. It is the legacy SDK proxy and must keep forwarding legacy SDK requests to `golden-crow-sdk`; `/api/gc-fitness/*` is the only GC Fitness API auth surface.
- Do not make `backoffice/src/proxy.ts` treat `/login`, `/api/auth/*`, or `/api/sdk/*` as GC Fitness routes. GC Fitness path handling belongs only to `/gc-fitness/*` and `/api/gc-fitness/*`.
- Any change under `/gc-fitness/*` must preserve `/login` behavior. Before pushing such a change, verify that `/login` still renders the legacy sign-in page and that `backoffice/src/app/(auth)/login/page.tsx` contains no `gc-fitness`, `/gc-fitness`, `GcFitnessAuthToken`, or `next-firebase-auth-edge` references.

## SDK Auth Startup Isolation

- The SDK must be able to boot `/health` and `/auth/login` using only the legacy MyDNAMap credentials required for legacy auth. Missing Pocket Gyms or GC Fitness project credentials must never crash the whole SDK at module import time.
- `goldencrow-sdk/src/config/firebase.ts` owns the Firebase Admin named-app registry. Keep `adminAppFor(project)` explicit by project key, and keep `adminAuthFor`, `adminDbFor`, and `adminStorageFor` lazy so importing route/repository modules does not initialize unrelated Firebase projects.
- Do not add top-level Firebase Admin app initialization, top-level service-account validation, or top-level Firestore/Auth/Storage calls for optional projects in SDK modules imported by `registerRoutes`. Validate project-specific env only when that project is actually used.
- `goldencrow-sdk/src/config/env.ts` must not call `requireEnv(...)` for Firebase Admin credentials at module load. Project-specific Firebase env validation belongs in `goldencrow-sdk/src/config/firebase.ts` through the named-app accessor for that project.
- Route modules may keep module-scope handles returned by `adminAuthFor(...)` or `adminDbFor(...)` only because those handles are lazy. If that laziness is removed, those route modules must be changed first or `/auth/login` can be broken by unrelated project env.
- A production response with `x-vercel-error: FUNCTION_INVOCATION_FAILED` from `https://golden-crow-sdk.vercel.app/health` or `/api/sdk/auth/login` means the SDK function crashed before returning an application response. Treat that as an SDK boot/startup regression, not as a bad login credential.

## Auth Verification Before Push

- For any auth-related change, run `git diff --check`.
- If SDK files under `goldencrow-sdk/src/config`, `goldencrow-sdk/src/routes`, `goldencrow-sdk/src/repositories`, or `goldencrow-sdk/src/middleware` changed, run `npm run build` in `goldencrow-sdk`.
- If SDK startup or Firebase Admin initialization changed, verify the SDK can boot and `/health` returns a JSON response instead of throwing. A disconnected local Firebase check may return JSON `503`; that is acceptable. A thrown process error is not.
- Before pushing `/gc-fitness/*` auth changes, verify the legacy login page source stays isolated with: `rg -n "gc-fitness|/gc-fitness|GcFitnessAuthToken|next-firebase-auth-edge" 'backoffice/src/app/(auth)/login/page.tsx' backoffice/src/lib/auth.ts 'backoffice/src/app/api/sdk/[...sdkPath]/route.ts' goldencrow-sdk/src/routes/auth.routes.ts`. There should be no matches unless the user explicitly requested a cross-surface migration.
- Before pushing legacy `/login` auth changes, verify GC Fitness still owns only its own routes and cookie: `/gc-fitness/login`, `/api/gc-fitness/login`, and `GcFitnessAuthToken`.
- After deployment of an auth fix, verify production behavior with:
  - `curl -i https://golden-crow-sdk.vercel.app/health` should return JSON, normally `200 {"status":"ok","firebase":"connected"}` in production.
  - `curl -i -X POST https://golden-crow-backoffice.vercel.app/api/sdk/auth/login -H 'content-type: application/json' --data '{"idToken":"fake"}'` should return JSON `401 {"error":"Invalid ID token"}`, not Vercel `FUNCTION_INVOCATION_FAILED`.
