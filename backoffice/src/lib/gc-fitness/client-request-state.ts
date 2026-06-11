// 7 days — matches the weekly progress-photo check-in window (#160) so the
// request cooldown and the client's check-in gate use the same cadence.
export const CLIENT_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ClientRequestKind = "progressPhotos" | "weight";

export interface ClientRequestStatus {
  requestedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
}

function requestLabel(kind: ClientRequestKind): string {
  return kind === "progressPhotos" ? "fotos de progreso" : "peso";
}

export function getClientRequestStatus(
  requestedAt: unknown,
  now: Date,
): ClientRequestStatus {
  const requestedDate = toDate(requestedAt);
  if (!requestedDate) {
    return { requestedAt: null, expiresAt: null, isActive: false };
  }
  const expiresAt = new Date(requestedDate.getTime() + CLIENT_REQUEST_TTL_MS);
  return {
    requestedAt: requestedDate,
    expiresAt,
    isActive: expiresAt.getTime() > now.getTime(),
  };
}

export function formatClientRequestLabel(kind: ClientRequestKind): string {
  return requestLabel(kind);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
