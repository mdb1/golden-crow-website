import type { PublisherAppStatus } from "../types/sdk.types.js";

export const PUBLISHER_APP_STATUSES = [
  "pending_revision",
  "active_for_testing",
  "active",
  "approved",
  "changes_requested",
  "rejected",
] as const satisfies readonly PublisherAppStatus[];

export function isPublisherAppRuntimeEnabled(
  status: PublisherAppStatus,
): status is "active" | "active_for_testing" {
  return status === "active" || status === "active_for_testing";
}
