// jest.config.js — curation toolkit test harness.
// Plain-Node tests for parseArgs / parseAllowlist / resolveTranslation /
// computePatch / commitInChunks. firebase-admin is mocked via jest.mock().

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  // SWC, not ts-jest: TypeScript 7 dropped the JS API ts-jest needs. SWC only
  // strips types; __tests__/typecheck.test.ts runs `tsc --noEmit`.
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        module: { type: "commonjs" },
      },
    ],
  },
};
