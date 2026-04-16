# Repo Instructions

- Every time you make a commit that will be pushed, bump the backoffice version by exactly `+1`.
- The version source of truth is `backoffice/src/lib/app-version.ts`.
- Treat the version bump as mandatory for every pushed commit. Do not wait for the user to remind you.
- If a commit was created without a version bump, fix the version before pushing.
- Keep the bumped version visible on the authentication screen.
- Before pushing, verify the committed version with `git show HEAD:backoffice/src/lib/app-version.ts`.
