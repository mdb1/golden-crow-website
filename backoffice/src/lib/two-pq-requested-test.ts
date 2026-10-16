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
