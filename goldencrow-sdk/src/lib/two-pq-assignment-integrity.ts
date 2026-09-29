import type {
  TwoPQMissingAssignedEntity,
  TwoPQRecord,
} from "../types/sdk.types.js";

export function resolveMissingTwoPQAssignedEntities(
  record: Pick<TwoPQRecord, "institutionId" | "doctorId" | "patientId">,
  resolved: {
    institutionExists: boolean;
    doctorExists: boolean;
    patientExists: boolean;
  },
): TwoPQMissingAssignedEntity[] {
  return [
    resolved.institutionExists
      ? null
      : { kind: "institution" as const, id: record.institutionId },
    resolved.doctorExists
      ? null
      : { kind: "doctor" as const, id: record.doctorId },
    record.patientId && !resolved.patientExists
      ? { kind: "patient" as const, id: record.patientId }
      : null,
  ].filter((entry): entry is TwoPQMissingAssignedEntity => entry !== null);
}
