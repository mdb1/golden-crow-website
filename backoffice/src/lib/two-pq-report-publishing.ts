export const TWO_PQ_REPORT_OWNER_ID = "c3x313CE2oZwIXVRxDHBQR31RlR2";
export const TWO_PQ_REPORT_OWNER_EMAIL = "info@2pq.life";
export const TWO_PQ_REPORT_OWNER_NAME = "2pq";

export type ReportCodePublishingPreflight = {
  blockingConflictMessage: string | null;
  blockingConflictResolution: string | null;
  ownerWarningMessage: string | null;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  preservesExistingOwner: boolean;
};

export function resolveReportCodePublishingPreflight(input: {
  expectedReportCode: string;
  storedFileId: string;
  storedFileLinkedReportCode?: string | null;
  reportCodeLinkedFileId?: string | null;
  existingOwnerId?: string | null;
  existingOwnerEmail?: string | null;
  existingOwnerName?: string | null;
}): ReportCodePublishingPreflight {
  const storedFileLinkedReportCode =
    input.storedFileLinkedReportCode?.trim() ?? "";
  const reportCodeLinkedFileId = input.reportCodeLinkedFileId?.trim() ?? "";
  const existingOwnerId = input.existingOwnerId?.trim() ?? "";
  const preservesExistingOwner = Boolean(existingOwnerId);
  const ownerId = existingOwnerId || TWO_PQ_REPORT_OWNER_ID;
  const ownerEmail =
    ownerId === TWO_PQ_REPORT_OWNER_ID
      ? TWO_PQ_REPORT_OWNER_EMAIL
      : input.existingOwnerEmail?.trim() || "";
  const ownerName =
    ownerId === TWO_PQ_REPORT_OWNER_ID
      ? TWO_PQ_REPORT_OWNER_NAME
      : input.existingOwnerName?.trim() || ownerEmail || ownerId;

  const blockingConflictMessage =
    storedFileLinkedReportCode &&
    storedFileLinkedReportCode !== input.expectedReportCode
      ? `This stored file is already linked to report code ${storedFileLinkedReportCode}.`
      : reportCodeLinkedFileId && reportCodeLinkedFileId !== input.storedFileId
        ? `Report code ${input.expectedReportCode} already points to stored file ${reportCodeLinkedFileId}.`
        : null;
  const blockingConflictResolution =
    storedFileLinkedReportCode &&
    storedFileLinkedReportCode !== input.expectedReportCode
      ? `Inspect report code ${storedFileLinkedReportCode} and correct the stored-file linkage before publishing a different code.`
      : reportCodeLinkedFileId && reportCodeLinkedFileId !== input.storedFileId
        ? `Inspect report code ${input.expectedReportCode} and stored file ${reportCodeLinkedFileId}; this screen will not repoint an existing code automatically.`
        : null;
  const ownerWarningMessage =
    existingOwnerId && existingOwnerId !== TWO_PQ_REPORT_OWNER_ID
      ? `This report code already belongs to ${ownerName} (${existingOwnerId}). Publishing will preserve that owner and update only the existing report content and linkage metadata.`
      : null;

  return {
    blockingConflictMessage,
    blockingConflictResolution,
    ownerWarningMessage,
    ownerId,
    ownerEmail,
    ownerName,
    preservesExistingOwner,
  };
}
