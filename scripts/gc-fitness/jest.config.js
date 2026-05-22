// jest.config.js — curation toolkit test harness.
// Plain-Node tests for parseArgs / parseAllowlist / resolveTranslation /
// computePatch / commitInChunks. firebase-admin is mocked via jest.mock().

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
};
