import {
  getStoredFileLinkedObjectCode,
  getStoredFileLinkedReportKey,
  isStoredFileOrphan,
  MAX_INLINE_STORED_FILE_BYTES,
  parseStoredFileRecord,
  storedFileContentByteLength,
} from "@/lib/file-storage";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";

function storedFile(
  id: string,
  data: Record<string, unknown>,
): ModerationDocumentRecord {
  return {
    id,
    path: `file_storage/${id}`,
    collection: "file_storage",
    data,
  };
}

describe("file storage links", () => {
  it("recognizes linked_object_code as a canonical object link", () => {
    const file = parseStoredFileRecord(
      storedFile("file-object", {
        file_name: "result.pgo.json",
        file_type: "mdm",
        file_content: "{}",
        linked_object_code: "123456789",
      }),
    );

    expect(getStoredFileLinkedObjectCode(file)).toBe("123456789");
    expect(getStoredFileLinkedReportKey(file)).toBe("");
    expect(isStoredFileOrphan(file)).toBe(false);
  });

  it("keeps report links and true orphan detection independent", () => {
    const reportFile = parseStoredFileRecord(
      storedFile("file-report", { linked_report_code: "ABC123" }),
    );
    const orphanFile = parseStoredFileRecord(storedFile("file-orphan", {}));

    expect(getStoredFileLinkedReportKey(reportFile)).toBe("ABC123");
    expect(isStoredFileOrphan(reportFile)).toBe(false);
    expect(isStoredFileOrphan(orphanFile)).toBe(true);
  });

  it("measures the 900 KiB inline Firestore safety limit in UTF-8 bytes", () => {
    expect(MAX_INLINE_STORED_FILE_BYTES).toBe(900 * 1024);
    expect(storedFileContentByteLength("é")).toBe(2);
    expect(storedFileContentByteLength('{\n  "value": "é"\n}')).toBe(
      storedFileContentByteLength('{"value":"é"}'),
    );
    expect(
      storedFileContentByteLength("x".repeat(MAX_INLINE_STORED_FILE_BYTES + 1)),
    ).toBeGreaterThan(MAX_INLINE_STORED_FILE_BYTES);
  });
});
