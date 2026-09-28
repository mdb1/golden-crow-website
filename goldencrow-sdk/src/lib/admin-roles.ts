import type { AdminRole } from "../types/sdk.types.js";

export function isGlobalAdminRole(role: AdminRole) {
  return role === "full_admin" || role === "2pq_admin";
}
