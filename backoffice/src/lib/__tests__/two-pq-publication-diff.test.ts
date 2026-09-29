import {
  hasFileStoragePublicationChanges,
  hasReportCodePublicationChanges,
} from "@/lib/two-pq-publication-diff";

const canonicalOwner = {
  ownerId: "owner-2pq",
  ownerEmail: "info@2pq.life",
  ownerName: "2pq",
  ownerCommunityUserId: "owner-2pq",
  ownerPublicProfileId: "owner-2pq",
  canonicalOwnerId: "owner-2pq",
  canonicalOwnerEmail: "info@2pq.life",
  canonicalOwnerName: "2pq",
};

describe("2PQ publication difference checks", () => {
  it("treats differently formatted JSON as the same file-storage snapshot", () => {
    expect(
      hasFileStoragePublicationChanges({
        existingData: {
          file_name: "CANXXX",
          creator_email: "admin@example.com",
          file_type: "2pq",
          file_content:
            '{"entities":{"cases":[1]},"main_case":{"id":"CASE-1"}}',
        },
        nextFileName: "CANXXX",
        nextCreatorEmail: "ADMIN@example.com",
        nextFileType: "2pq",
        nextFileContent: JSON.stringify(
          { main_case: { id: "CASE-1" }, entities: { cases: [1] } },
          null,
          2,
        ),
      }),
    ).toBe(false);
  });

  it("detects a changed file-storage snapshot", () => {
    expect(
      hasFileStoragePublicationChanges({
        existingData: {
          file_name: "CANXXX",
          creator_email: "admin@example.com",
          file_type: "2pq",
          file_content: '{"main_case":{"id":"CASE-1"}}',
        },
        nextFileName: "CANXXX",
        nextCreatorEmail: "admin@example.com",
        nextFileType: "2pq",
        nextFileContent: '{"main_case":{"id":"CASE-2"}}',
      }),
    ).toBe(true);
  });

  it("recognizes a fully synchronized canonical report code", () => {
    expect(
      hasReportCodePublicationChanges({
        reportExists: true,
        expectedReportCode: "CANXXX",
        storedFileId: "file-1",
        storedFileName: "CANXXX",
        storedFileLinkedReportCode: "CANXXX",
        reportCodeLinkedFileId: "file-1",
        uploadedReportId: "uploaded-1",
        reportFileName: "CANXXX",
        providerFormat: "2pq",
        providerName: "2pq",
        trackingStatus: "document_ready",
        ...canonicalOwner,
      }),
    ).toBe(false);
  });

  it("preserves a complete historical owner without forcing an update", () => {
    expect(
      hasReportCodePublicationChanges({
        reportExists: true,
        expectedReportCode: "CANXXX",
        storedFileId: "file-1",
        storedFileName: "CANXXX",
        storedFileLinkedReportCode: "CANXXX",
        reportCodeLinkedFileId: "file-1",
        uploadedReportId: "uploaded-1",
        reportFileName: "CANXXX",
        providerFormat: "2pq",
        providerName: "Legacy provider",
        trackingStatus: "document_ready",
        ownerId: "legacy-owner",
        ownerEmail: "legacy@example.com",
        ownerName: "Legacy owner",
        ownerCommunityUserId: "legacy-community",
        ownerPublicProfileId: "legacy-profile",
        canonicalOwnerId: "owner-2pq",
        canonicalOwnerEmail: "info@2pq.life",
        canonicalOwnerName: "2pq",
      }),
    ).toBe(false);
  });

  it("detects report metadata that publication would repair", () => {
    expect(
      hasReportCodePublicationChanges({
        reportExists: true,
        expectedReportCode: "CANXXX",
        storedFileId: "file-1",
        storedFileName: "CANXXX",
        storedFileLinkedReportCode: "CANXXX",
        reportCodeLinkedFileId: "file-1",
        uploadedReportId: "uploaded-1",
        reportFileName: "OLDXXX",
        providerFormat: "2pq",
        providerName: "2pq",
        trackingStatus: "document_ready",
        ...canonicalOwner,
      }),
    ).toBe(true);
  });
});
