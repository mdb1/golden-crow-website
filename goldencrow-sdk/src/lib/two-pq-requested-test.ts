export type RequestedStudyTestKey =
  | "pgtAUltraFast"
  | "pgtAFast"
  | "pgtAStandard"
  | "pgtSr";

const MAX_RESULT_DELIVERY_HOURS: Record<RequestedStudyTestKey, number> = {
  pgtAUltraFast: 8,
  pgtAFast: 72,
  pgtAStandard: 16 * 24,
  pgtSr: 16 * 24,
};

export function maximumResultDeliveryAt(
  testKey: RequestedStudyTestKey,
  requestedAt: Date,
) {
  return new Date(
    requestedAt.getTime() + MAX_RESULT_DELIVERY_HOURS[testKey] * 60 * 60 * 1000,
  );
}
