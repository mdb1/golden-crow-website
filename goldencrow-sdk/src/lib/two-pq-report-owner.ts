import type { AdminContext } from "../types/sdk.types.js";

export const TWO_PQ_REPORT_OWNER_ID = "c3x313CE2oZwIXVRxDHBQR31RlR2";
export const TWO_PQ_REPORT_OWNER_EMAIL = "info@2pq.life";
export const TWO_PQ_REPORT_OWNER_NAME = "2pq";

export function canViewReportOwnerDocument(
  context: Pick<AdminContext, "role">,
  documentId: string,
) {
  return context.role === "full_admin" || documentId === TWO_PQ_REPORT_OWNER_ID;
}
