import type { RequestedStudyTestKey } from "@/lib/two-pq-requested-test";

const STUDY_SUMMARIES: Record<RequestedStudyTestKey, { label: string; className: string }> = {
  pgtAUltraFast: { label: "Ultra-fast PGT", className: "border-red-300 bg-red-100 text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-100" },
  pgtAFast: { label: "Fast PGT", className: "border-yellow-300 bg-yellow-100 text-yellow-950 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-100" },
  pgtAStandard: { label: "Standard PGT", className: "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100" },
  pgtSr: { label: "SR PGT", className: "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100" },
};

export function getTwoPQStudySummary(source: {
  requestedTest?: Record<string, unknown>;
  requestedStudyTest?: RequestedStudyTestKey;
  requestedTestName?: string;
  caseType?: string;
}) {
  const requested = source.requestedTest ?? {};
  const selected = (Object.keys(STUDY_SUMMARIES) as RequestedStudyTestKey[]).find((key) =>
    requested[key] === true || /^(si|sí|yes|true)$/i.test(String(requested[key] ?? "")),
  );
  const name = String(source.requestedTestName ?? requested.testName ?? source.caseType ?? "").toLowerCase();
  const key = source.requestedStudyTest ?? selected ?? (name.includes("ultra") ? "pgtAUltraFast" : name.includes("fast") ? "pgtAFast" : /\bsr\b/.test(name) ? "pgtSr" : name.includes("standard") ? "pgtAStandard" : null);
  return key ? { key, ...STUDY_SUMMARIES[key] } : null;
}

export function formatTwoPQCivilDate(value: string, language: "en" | "es") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}
