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
  transform: {
    // Use a Jest-specific tsconfig that overrides `moduleResolution: bundler`
    // (Next.js default — incompatible with ts-jest) and sets a `rootDir` so
    // ts-jest doesn't infer it from the first test file it finds.
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.jest.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
