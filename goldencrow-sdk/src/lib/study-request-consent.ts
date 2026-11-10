export const INFORMED_CONSENTS_COLLECTION = "2pq-informed-consent";

export type StudyRequestConsentStatus = "pending" | "needs_review" | "ready";

export type StudyRequestConsentScope = {
  patientId: string;
  institutionId: string;
  doctorId: string;
};

export function getStudyRequestConsentStatus(
  data: Record<string, unknown> | undefined,
  studyRequestFormId: string,
  scope: StudyRequestConsentScope,
): StudyRequestConsentStatus {
  if (
    !data ||
    data.studyRequestFormId !== studyRequestFormId ||
    data.patientId !== scope.patientId ||
    data.institutionId !== scope.institutionId ||
    data.doctorId !== scope.doctorId ||
    typeof data.file !== "object" ||
    !data.file ||
    Array.isArray(data.file)
  ) {
    return "pending";
  }

  const file = data.file as Record<string, unknown>;
  if (
    typeof file.name !== "string" || !file.name.trim() ||
    typeof file.type !== "string" || !file.type.trim() ||
    typeof file.size !== "number" || !Number.isSafeInteger(file.size) || file.size < 1
  ) {
    return "pending";
  }

  return data.reviewStatus === "ready" &&
    typeof data.reviewedByEmail === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.reviewedByEmail) &&
    typeof data.reviewedAt === "string" &&
    Number.isFinite(Date.parse(data.reviewedAt))
    ? "ready"
    : "needs_review";
}
