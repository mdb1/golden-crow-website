# Repo Instructions

- Every time you make a commit that will be pushed, bump the backoffice version by exactly `+1`.
- The version source of truth is `backoffice/src/lib/app-version.ts`.
- Treat the version bump as mandatory for every pushed commit. Do not wait for the user to remind you.
- If a commit was created without a version bump, fix the version before pushing.
- Keep the bumped version visible on the authentication screen.
- Before pushing, verify the committed version with `git show HEAD:backoffice/src/lib/app-version.ts`.

## Auth Surface Isolation

- `/login` is the legacy PocketGenes / Pocket Gyms authentication surface. Keep it on the existing NextAuth + SDK `/auth/login` flow and `session` cookie.
- GC Fitness authentication must stay isolated under `/gc-fitness/login` and `/api/gc-fitness/login`, using `next-firebase-auth-edge` and the `GcFitnessAuthToken` cookie.
- The legacy Firebase Web SDK initializer at `backoffice/src/lib/firebase.ts` must only use the `[DEFAULT]` Firebase app. Never replace it with `getApps()[0]`, because a named GC Fitness app can be initialized first in the same browser session and break `/login` by minting tokens for the wrong Firebase project.
- Do not add GC Fitness project cards, redirects, imports, cookie handling, or `/gc-fitness/*` branching to `backoffice/src/app/(auth)/login/page.tsx`, `backoffice/src/lib/auth.ts`, or the SDK `/auth/login` path unless the user explicitly asks for a cross-surface auth migration.
- Any change under `/gc-fitness/*` must preserve `/login` behavior. Before pushing such a change, verify that `/login` still renders the legacy sign-in page and that `backoffice/src/app/(auth)/login/page.tsx` contains no `gc-fitness` or `/gc-fitness` references.
