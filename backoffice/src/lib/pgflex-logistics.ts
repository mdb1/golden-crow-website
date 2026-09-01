import type { AdminContextRecord } from "@/lib/admin-areas";

export type PGFlexLogisticsStatus =
  "awaiting_pick_up" | "in_transit" | "arrived" | "lost";

export type PGFlexLogisticsShipmentType = "2pq" | "other";

export type PGFlexLogisticsListScope = "active" | "finished";

export interface PGFlexLogisticsRecord {
  id: string;
  identifier: string;
  shipmentType: PGFlexLogisticsShipmentType;
  description?: string;
  linked_codes?: string;
  dispatcherId?: string;
  dispatcherFirebaseId?: string;
  dispatcherEmail?: string;
  origin: string;
  destination: string;
  timeRequested: string;
  pickupTime?: string;
  status: PGFlexLogisticsStatus;
  item_was_picked_date_at?: string;
  item_was_delivered_at?: string;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string;
  updatedByEmail?: string;
  dispatcherNotificationEmailSentAt?: string;
  dispatcherNotificationEmailFailedAt?: string;
  dispatcherNotificationEmailLastError?: string;
}

export interface PGFlexLogisticsListItem extends PGFlexLogisticsRecord {
  canUpdate: boolean;
  canDelete: boolean;
}

export interface PGFlexLogisticsPage {
  items: PGFlexLogisticsListItem[];
  nextCursor: string | null;
  scope: PGFlexLogisticsListScope;
}

export interface PGFlexLogisticsInput {
  identifier: string;
  shipmentType: PGFlexLogisticsShipmentType;
  description?: string;
  linked_codes?: string;
  dispatcherId?: string;
  dispatcherFirebaseId?: string;
  dispatcherEmail?: string;
  origin: string;
  destination: string;
  pickupTime?: string;
  status?: PGFlexLogisticsStatus;
}

export interface PGFlexTransportDispatcherOption {
  email: string;
  firebaseUid: string;
  displayName: string;
}

export const PGFLEX_LOGISTICS_PAGE_SIZE = 20;

export const PGFLEX_2PQ_DESTINATION = "Humboldt 2433";

export const PGFLEX_LOGISTICS_SHIPMENT_TYPE_OPTIONS: Array<{
  value: PGFlexLogisticsShipmentType;
  label: string;
}> = [
  { value: "2pq", label: "2pq" },
  { value: "other", label: "Other" },
];

export const PGFLEX_LOGISTICS_SCOPE_OPTIONS: Array<{
  value: PGFlexLogisticsListScope;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "finished", label: "Finished" },
];

export const PGFLEX_LOGISTICS_STATUS_OPTIONS: Array<{
  value: PGFlexLogisticsStatus;
  label: string;
}> = [
  { value: "awaiting_pick_up", label: "Awaiting pick up" },
  { value: "in_transit", label: "In transit" },
  { value: "arrived", label: "Arrived" },
  { value: "lost", label: "Lost" },
];

export function canAccessPGFlexLogistics(context: AdminContextRecord) {
  return (
    context.role === "full_admin" || context.role === "transport_dispatcher"
  );
}

export function canCreatePGFlexLogistics(context: AdminContextRecord) {
  return context.role === "full_admin";
}

export function getPGFlexStatusLabel(status: PGFlexLogisticsStatus) {
  return (
    PGFLEX_LOGISTICS_STATUS_OPTIONS.find((option) => option.value === status)
      ?.label ?? "Awaiting pick up"
  );
}

export function getPGFlexStatusBadgeVariant(status: PGFlexLogisticsStatus) {
  if (status === "arrived") {
    return "success" as const;
  }

  if (status === "lost") {
    return "destructive" as const;
  }

  if (status === "in_transit") {
    return "brand" as const;
  }

  return "warning" as const;
}

export function getPGFlexRouteSummary(record: PGFlexLogisticsRecord) {
  return [record.origin, record.destination].filter(Boolean).join(" -> ");
}
