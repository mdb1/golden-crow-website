import type { RequestedStudyTestKey } from "./two-pq-requested-test.js";

const REQUESTED_TEST_KEYS: RequestedStudyTestKey[] = [
  "pgtAUltraFast",
  "pgtAFast",
  "pgtAStandard",
  "pgtSr",
];

export function resolveTwoPQRequestedStudyTest(
  requestedTest: Record<string, unknown>,
  requestedTestName?: string,
): RequestedStudyTestKey | undefined {
  const selected = REQUESTED_TEST_KEYS.find((key) => {
    const value = requestedTest[key];
    return value === true || (typeof value === "string" && /^(si|sí|yes|true)$/i.test(value.trim()));
  });
  if (selected) return selected;

  const name = (requestedTestName ?? (typeof requestedTest.testName === "string" ? requestedTest.testName : "")).toLowerCase();
  if (name.includes("ultra")) return "pgtAUltraFast";
  if (name.includes("fast")) return "pgtAFast";
  if (/\bsr\b/.test(name)) return "pgtSr";
  if (name.includes("standard")) return "pgtAStandard";
}
