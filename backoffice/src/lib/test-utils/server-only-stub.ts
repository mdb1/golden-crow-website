// server-only-stub.ts
//
// Jest-only no-op replacement for the `server-only` import side-effect.
//
// The real `server-only` package (shipped by Next.js) throws at module-load
// time if a client bundle accidentally imports it — the build error is the
// guarantee that a `firebase-admin` private key never leaks to the browser.
// Under Jest we are explicitly running server-side modules in a test
// runtime; we just want the import to be a no-op so SUT files can be
// required directly.
//
// Wired via `moduleNameMapper` in `jest.config.js` — never imported by
// hand. Living under `src/lib/test-utils/` keeps it inside the tsconfig
// `include` glob without polluting the runtime app surface.

export {};
