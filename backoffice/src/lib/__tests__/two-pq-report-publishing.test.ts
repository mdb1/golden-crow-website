import {
  TWO_PQ_REPORT_OWNER_EMAIL,
  TWO_PQ_REPORT_OWNER_ID,
  resolveReportCodePublishingPreflight,
} from "@/lib/two-pq-report-publishing";

describe("2PQ report-code publishing preflight", () => {
  it("uses the fixed 2PQ publisher for a new report", () => {
    const result = resolveReportCodePublishingPreflight({
      expectedReportCode: "CANXXX",
      storedFileId: "file-1",
    });

    expect(result).toMatchObject({
      blockingConflictMessage: null,
      ownerWarningMessage: null,
      ownerId: TWO_PQ_REPORT_OWNER_ID,
      ownerEmail: TWO_PQ_REPORT_OWNER_EMAIL,
      preservesExistingOwner: false,
    });
  });

  it("keeps publishing available while preserving a historical owner", () => {
    const result = resolveReportCodePublishingPreflight({
      expectedReportCode: "CANXXX",
      storedFileId: "file-1",
      storedFileLinkedReportCode: "CANXXX",
      reportCodeLinkedFileId: "file-1",
      existingOwnerId: "legacy-owner",
      existingOwnerEmail: "legacy@example.com",
      existingOwnerName: "Legacy owner",
    });

    expect(result.blockingConflictMessage).toBeNull();
    expect(result.ownerWarningMessage).toContain(
      "Publishing will preserve that owner",
    );
    expect(result).toMatchObject({
      ownerId: "legacy-owner",
      ownerEmail: "legacy@example.com",
      ownerName: "Legacy owner",
      preservesExistingOwner: true,
    });
  });

  it("shows the canonical 2PQ identity instead of stale admin metadata", () => {
    const result = resolveReportCodePublishingPreflight({
      expectedReportCode: "CANXXX",
      storedFileId: "file-1",
      existingOwnerId: TWO_PQ_REPORT_OWNER_ID,
      existingOwnerEmail: "old-admin@example.com",
      existingOwnerName: "Old admin",
    });

    expect(result.ownerEmail).toBe(TWO_PQ_REPORT_OWNER_EMAIL);
    expect(result.ownerName).toBe("2pq");
    expect(result.ownerWarningMessage).toBeNull();
  });

  it("still blocks a report code that points to a different stored file", () => {
    const result = resolveReportCodePublishingPreflight({
      expectedReportCode: "CANXXX",
      storedFileId: "file-1",
      reportCodeLinkedFileId: "file-2",
      existingOwnerId: "legacy-owner",
    });

    expect(result.blockingConflictMessage).toContain("file-2");
    expect(result.blockingConflictResolution).toContain(
      "will not repoint an existing code automatically",
    );
  });
});
