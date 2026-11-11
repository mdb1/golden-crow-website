export type RequestedStudyTestKey =
  | "pgtAUltraFast"
  | "pgtAFast"
  | "pgtAStandard"
  | "pgtSr";

export const REQUESTED_STUDY_TEST_OPTIONS: Array<{
  value: RequestedStudyTestKey;
  label: string;
}> = [
  { value: "pgtAUltraFast", label: "Ultra-fast PGT (<8hs)" },
  { value: "pgtAFast", label: "Fast PGT (24-72hs)" },
  { value: "pgtAStandard", label: "Standard PGT (>15 days)" },
  { value: "pgtSr", label: "PGT SR (>15 days)" },
];

export function answerToFormValue(value: unknown) {
  if (value === true) return "si";
  if (value === false) return "no";
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (["si", "sí", "yes", "true", "1"].includes(normalized)) return "si";
  if (["no", "false", "0"].includes(normalized)) return "no";
  return "";
}

export function requestedTestKeyLabel(key: string) {
  return (
    REQUESTED_STUDY_TEST_OPTIONS.find((option) => option.value === key)?.label ?? ""
  );
}

export function requestedTestKeyFromRecord(
  record: Record<string, unknown> | undefined,
) {
  if (!record) return "";
  if (answerToFormValue(record.pgtAUltraFast) === "si") return "pgtAUltraFast";
  if (answerToFormValue(record.pgtSr) === "si") return "pgtSr";
  if (answerToFormValue(record.pgtAStandard) === "si") return "pgtAStandard";
  if (answerToFormValue(record.pgtAFast) === "si") return "pgtAFast";
  const testName =
    typeof record.testName === "string" ? record.testName.toUpperCase() : "";
  if (testName.includes("ULTRA")) return "pgtAUltraFast";
  if (testName.includes("PGT SR")) return "pgtSr";
  if (testName.includes("STANDARD")) return "pgtAStandard";
  if (testName.includes("FAST")) return "pgtAFast";
  return "";
}

const MAX_RESULT_DELIVERY_HOURS: Record<RequestedStudyTestKey, number> = {
  pgtAUltraFast: 8,
  pgtAFast: 72,
  pgtAStandard: 16 * 24,
  pgtSr: 16 * 24,
};

export function isRequestedStudyTestKey(
  value: string,
): value is RequestedStudyTestKey {
  return Object.prototype.hasOwnProperty.call(
    MAX_RESULT_DELIVERY_HOURS,
    value,
  );
}

export function maximumResultDeliveryAt(
  testKey: RequestedStudyTestKey,
  requestedAt: Date,
) {
  return new Date(
    requestedAt.getTime() + MAX_RESULT_DELIVERY_HOURS[testKey] * 60 * 60 * 1000,
  );
}

export function maximumResultDeliveryWindowLabel(
  testKey: RequestedStudyTestKey,
) {
  if (testKey === "pgtAUltraFast") return "8 hours";
  if (testKey === "pgtAFast") return "72 hours";
  return "16 calendar days";
}
