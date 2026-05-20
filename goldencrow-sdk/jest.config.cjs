// jest.config.cjs — Jest harness for the goldencrow-sdk Phase 11 refactor.
//
// Why .cjs (not .js or .ts):
//   - package.json has `"type": "module"`, so a plain `jest.config.js` is
//     loaded as ESM, which Jest 30's loader cannot evaluate.
//   - .cjs forces Node to load this file as CommonJS, which Jest reads
//     synchronously at startup.
//
// Scope: this single file (added in Plan 11-01) tests the named-app
// Firebase registry under `src/__tests__/`. The TS source under `src/`
// is compiled by ts-jest using a CommonJS-mode tsconfig override
// (`tsconfig.jest.json`) so the existing app code can keep using
// NodeNext ESM at build time.

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  // ts-jest is configured to consume tsconfig.jest.json which overrides
  // module: commonjs (Jest cannot run NodeNext ESM out of the box).
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.jest.json",
        // Strip the trailing `.js` extension that the source code uses
        // on relative imports (NodeNext ESM convention) so CommonJS
        // resolution finds the compiled output.
        useESM: false,
      },
    ],
  },
  // Allow `import { ... } from "../config/firebase.js"` in source code
  // to resolve to the .ts file under CommonJS. ts-jest's path mapping
  // rewrites the trailing `.js` extension off relative imports.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
