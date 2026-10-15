// jest.config.cjs — Jest harness for the goldencrow-sdk Phase 11 refactor.
//
// Why .cjs (not .js or .ts):
//   - package.json has `"type": "module"`, so a plain `jest.config.js` is
//     loaded as ESM, which Jest 30's loader cannot evaluate.
//   - .cjs forces Node to load this file as CommonJS, which Jest reads
//     synchronously at startup.
//
// The TS source under `src/` is transpiled to CommonJS by SWC for Jest, so the
// app code keeps using NodeNext ESM at build time.

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  // SWC, not ts-jest: TypeScript 7 (the native compiler) no longer ships the
  // JS API ts-jest needs. SWC only strips types; the type check of the tests
  // lives in src/__tests__/typecheck-tests.test.ts (tsc -p tsconfig.jest.json).
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        module: { type: "commonjs" },
      },
    ],
  },
  // Allow `import { ... } from "../config/firebase.js"` in source code
  // to resolve to the .ts file under CommonJS. This strips
  // the trailing `.js` extension off relative imports.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
