function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedEmail(value: unknown) {
  return normalizedString(value).toLowerCase();
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJsonValue(entry)]),
    );
  }

  return value;
}

function semanticallyEqualJson(left: unknown, right: string) {
  if (typeof left !== "string") {
    return false;
  }

  try {
    return (
      JSON.stringify(canonicalJsonValue(JSON.parse(left))) ===
      JSON.stringify(canonicalJsonValue(JSON.parse(right)))
    );
  } catch {
    return false;
  }
}

export function hasFileStoragePublicationChanges(input: {
  existingData: Record<string, unknown>;
  nextFileName: string;
  nextCreatorEmail: string;
  nextFileType: string;
  nextFileContent: string;
}) {
  return (
    normalizedString(input.existingData.file_name) !==
      input.nextFileName.trim() ||
    normalizedEmail(input.existingData.creator_email) !==
      input.nextCreatorEmail.trim().toLowerCase() ||
    normalizedString(input.existingData.file_type).toLowerCase() !==
      input.nextFileType.trim().toLowerCase() ||
    !semanticallyEqualJson(
      input.existingData.file_content,
      input.nextFileContent,
    )
  );
}

export function hasReportCodePublicationChanges(input: {
  reportExists: boolean;
  expectedReportCode: string;
  storedFileId: string;
  storedFileName?: string | null;
  storedFileLinkedReportCode?: string | null;
  reportCodeLinkedFileId?: string | null;
  uploadedReportId?: string | null;
  reportFileName?: string | null;
  providerFormat?: string | null;
  providerName?: string | null;
  trackingStatus?: string | null;
  ownerId: string;
  ownerEmail?: string | null;
  ownerName?: string | null;
  ownerCommunityUserId?: string | null;
  ownerPublicProfileId?: string | null;
  canonicalOwnerId: string;
  canonicalOwnerEmail: string;
  canonicalOwnerName: string;
}) {
  if (!input.reportExists) {
    return true;
  }

  if (
    normalizedString(input.storedFileLinkedReportCode) !==
      input.expectedReportCode ||
    normalizedString(input.reportCodeLinkedFileId) !== input.storedFileId ||
    !normalizedString(input.uploadedReportId) ||
    normalizedString(input.reportFileName) !==
      normalizedString(input.storedFileName) ||
    normalizedString(input.providerFormat).toLowerCase() !== "2pq" ||
    !normalizedString(input.trackingStatus)
  ) {
    return true;
  }

  if (input.ownerId !== input.canonicalOwnerId) {
    return !normalizedString(input.providerName);
  }

  return (
    normalizedString(input.providerName).toLowerCase() !==
      input.canonicalOwnerName.toLowerCase() ||
    normalizedEmail(input.ownerEmail) !==
      input.canonicalOwnerEmail.toLowerCase() ||
    normalizedString(input.ownerName).toLowerCase() !==
      input.canonicalOwnerName.toLowerCase() ||
    normalizedString(input.ownerCommunityUserId) !== input.canonicalOwnerId ||
    normalizedString(input.ownerPublicProfileId) !== input.canonicalOwnerId
  );
}
