// jest.config.js
// Jest harness for the GC Fitness backoffice surface — first installed by
// Plan 03-05 (the trainer-side Exercise CRUD Server Actions + Zod schema).
//
// Why .js, not .ts: Jest reads its config eagerly at startup and requires
// `ts-node` to parse a `.ts` config. Adding ts-node just for the config
// file is wasted weight — every Next.js project ships a CommonJS config
// (`next.config.js`, `postcss.config.js`) for the same reason. We keep the
// app + tests in TypeScript and the config in JS.
//
// Scope: backoffice unit tests for `src/lib/gc-fitness/*` modules (Zod
// schemas, Server Action ownership/allowlist guards, signed-URL minting).
// All current tests run in the `node` environment because they exercise
// server-only code paths (next/headers, firebase-admin, next-firebase-auth-edge).
//
// A future plan (03-06 — trainer Exercise UI) may add component tests that
// require `jest-environment-jsdom`; we ship the dep up front via the same
// install but leave the global env at `node`. Component tests can opt into
// jsdom per-file with the `/** @jest-environment jsdom */` docblock.
//
// `moduleNameMapper` mirrors the `@/*` path alias from `tsconfig.json` so
// import statements like `import { ... } from '@/lib/gc-fitness/...'` resolve
// the same way in test code as in app code.

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  // The jsdom-heavy workbench suites are timeout-sensitive under parallel
  // CPU pressure. Keep the required `npx jest` gate deterministic.
  maxWorkers: 1,
  // Component tests rely on jsdom + a handful of DOM APIs jsdom does not
  // ship (ResizeObserver, scrollIntoView, matchMedia, pointer-capture).
  // `setupFilesAfterEnv` runs AFTER the test framework is installed —
  // required because the polyfills must be on `globalThis` before any
  // component's mount-time code runs (cmdk's Command primitive newing up
  // ResizeObserver on mount, etc.). Under `testEnvironment: "node"`
  // (server-action tests) the DOM-conditional shims are silently inert.
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    // SWC, not ts-jest: TypeScript 7 (the native compiler) no longer ships the
    // JS compiler API ts-jest needs. SWC only strips types, so the TYPE check
    // of test files ts-jest used to do now lives in
    // `src/lib/__tests__/typecheck-tests.test.ts` (tsc -p tsconfig.jest.json).
    // `@swc/jest` hoists `jest.mock` calls above the imports like babel-jest.
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
          target: "es2022",
        },
        module: { type: "commonjs" },
      },
    ],
  },
  // ESM-only packages (no CommonJS build) must go through the transform too:
  // @tanstack/react-table 9 and jose (via next-firebase-auth-edge).
  transformIgnorePatterns: [
    "/node_modules/(?!(@tanstack/react-table|@tanstack/table-core|jose)/)",
  ],
  moduleNameMapper: {
    // Stylesheets (e.g. app/global-error.tsx imports globals.css).
    "\\.css$": "<rootDir>/src/lib/test-utils/style-stub.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
    // `server-only` is a Next.js build-time guard module that throws if it
    // ends up in a client bundle. It is not resolvable under plain Jest;
    // we substitute a no-op so server modules can be required directly
    // by unit tests.
    "^server-only$": "<rootDir>/src/lib/test-utils/server-only-stub.ts",
    // next-intl ships ESM-only at the public entrypoint. For Jest tests
    // that import `useTranslations` or `NextIntlClientProvider`, route the
    // bare specifier to a CJS stub that exposes a key-resolving identity
    // (returns the dotted key for any `t('foo.bar')` call). UI tests do
    // not need the full ICU pipeline — assertions key off the EN catalog
    // (`import enMessages from '@/../messages/en.json'`).
    "^next-intl$": "<rootDir>/src/lib/test-utils/next-intl-stub.tsx",
  },
};
