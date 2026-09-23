import { readFileSync } from "node:fs";
import path from "node:path";

type StoredData = Record<string, unknown>;

const collections = new Map<string, Map<string, StoredData>>();

function collectionStore(name: string) {
  let store = collections.get(name);
  if (!store) {
    store = new Map<string, StoredData>();
    collections.set(name, store);
  }
  return store;
}

function snapshot(collectionName: string, id: string) {
  const value = collectionStore(collectionName).get(id);
  return {
    id,
    exists: Boolean(value),
    data: () => (value ? { ...value } : undefined),
  };
}

function documentReference(collectionName: string, id: string) {
  return {
    kind: "document" as const,
    collectionName,
    id,
    get: async () => snapshot(collectionName, id),
    set: async (data: StoredData, options?: { merge?: boolean }) => {
      const previous = collectionStore(collectionName).get(id) ?? {};
      collectionStore(collectionName).set(
        id,
        options?.merge ? { ...previous, ...data } : { ...data },
      );
    },
    delete: async () => {
      collectionStore(collectionName).delete(id);
    },
  };
}

function queryReference(
  collectionName: string,
  field: string,
  value: unknown,
) {
  return {
    kind: "query" as const,
    collectionName,
    field,
    value,
    limit: () => queryReference(collectionName, field, value),
    get: async () => {
      const docs = [...collectionStore(collectionName).entries()]
        .filter(([, data]) => data[field] === value)
        .slice(0, 1)
        .map(([id]) => snapshot(collectionName, id));
      return { docs, empty: docs.length === 0 };
    },
  };
}

function orderedCollectionReference(
  collectionName: string,
  cursor?: string,
  pageLimit?: number,
) {
  return {
    orderBy: () => orderedCollectionReference(collectionName, cursor, pageLimit),
    startAfter: (nextCursor: string) =>
      orderedCollectionReference(collectionName, nextCursor, pageLimit),
    limit: (nextLimit: number) =>
      orderedCollectionReference(collectionName, cursor, nextLimit),
    get: async () => {
      const ids = [...collectionStore(collectionName).keys()].sort((left, right) =>
        right.localeCompare(left),
      );
      const cursorIndex = cursor ? ids.indexOf(cursor) : -1;
      const visibleIds = cursorIndex >= 0 ? ids.slice(cursorIndex + 1) : ids;
      return {
        docs: visibleIds
          .slice(0, pageLimit ?? visibleIds.length)
          .map((id) => snapshot(collectionName, id)),
      };
    },
  };
}

function collectionReference(name: string) {
  return {
    doc: (id = `${name}-generated`) => documentReference(name, id),
    where: (field: string, _operator: string, value: unknown) =>
      queryReference(name, field, value),
    orderBy: () => orderedCollectionReference(name),
    get: async () => ({
      docs: [...collectionStore(name).keys()].map((id) => snapshot(name, id)),
    }),
  };
}

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: (name: string) => collectionReference(name),
    runTransaction: async (
      handler: (transaction: {
        get: (reference: ReturnType<typeof documentReference> | ReturnType<typeof queryReference>) => Promise<unknown>;
        set: (
          reference: ReturnType<typeof documentReference>,
          data: StoredData,
          options?: { merge?: boolean },
        ) => Promise<void>;
        delete: (reference: ReturnType<typeof documentReference>) => Promise<void>;
      }) => Promise<unknown>,
    ) =>
      handler({
        get: (reference) => reference.get(),
        set: (reference, data, options) => reference.set(data, options),
        delete: (reference) => reference.delete(),
      }),
  })),
}));

describe("file storage object-link integrity", () => {
  beforeEach(() => {
    collections.clear();
  });

  it("blocks updates and deletion when the file has a direct object link", async () => {
    collectionStore("file_storage").set("file-1", {
      file_name: "report.pgo.json",
      file_type: "pgo_pdf_report",
      file_content: "{}",
      linked_object_code: "123456789",
    });
    const {
      deleteStoredFileDocument,
      updateStoredFileDocument,
    } = await import("../repositories/file-storage.repository.js");

    await expect(
      updateStoredFileDocument("file-1", { file_name: "changed.json" }),
    ).rejects.toThrow("linked to object code 123456789");
    await expect(deleteStoredFileDocument("file-1")).rejects.toThrow(
      "linked to object code 123456789",
    );
    expect(collectionStore("file_storage").get("file-1")?.file_name).toBe(
      "report.pgo.json",
    );
  });

  it("blocks updates and deletion when an uploaded object has the back-reference", async () => {
    collectionStore("file_storage").set("file-1", {
      file_name: "report.pgo.json",
      file_type: "pgo_pdf_report",
      file_content: "{}",
    });
    collectionStore("uploaded_objects").set("object-1", {
      object_code: "123456789",
      linked_file_id: "file-1",
    });
    const {
      deleteStoredFileDocument,
      updateStoredFileDocument,
    } = await import("../repositories/file-storage.repository.js");

    await expect(
      updateStoredFileDocument("file-1", { file_name: "changed.json" }),
    ).rejects.toThrow("referenced by an uploaded object");
    await expect(deleteStoredFileDocument("file-1")).rejects.toThrow(
      "referenced by an uploaded object",
    );
    expect(collectionStore("file_storage").has("file-1")).toBe(true);
  });

  it("updates and deletes an unlinked file transactionally", async () => {
    collectionStore("file_storage").set("file-1", {
      file_name: "report.pgo.json",
      file_type: "pgo_pdf_report",
      file_content: JSON.stringify({
        title: "Final report",
        download_url: "https://example.com/report.pdf",
      }),
    });
    const {
      deleteStoredFileDocument,
      updateStoredFileDocument,
    } = await import("../repositories/file-storage.repository.js");

    const updated = await updateStoredFileDocument("file-1", {
      file_name: "changed.json",
    });
    expect(updated.document?.data.file_name).toBe("changed.json");
    await expect(deleteStoredFileDocument("file-1")).resolves.toBe(true);
    expect(collectionStore("file_storage").has("file-1")).toBe(false);
  });

  it("allows metadata-only correction of a legacy unsupported file type", async () => {
    collectionStore("file_storage").set("legacy-pdf", {
      file_name: "legacy.pdf.json",
      creator_email: "old@example.com",
      file_type: "pdf",
      file_content: '{"legacy":true}',
    });
    const { updateStoredFileDocument } = await import(
      "../repositories/file-storage.repository.js"
    );

    const updated = await updateStoredFileDocument("legacy-pdf", {
      file_name: "corrected.pdf.json",
      creator_email: "new@example.com",
    });
    expect(updated.document?.data).toMatchObject({
      file_name: "corrected.pdf.json",
      creator_email: "new@example.com",
      file_type: "pdf",
      file_content: '{"legacy":true}',
    });

    await expect(
      updateStoredFileDocument("legacy-pdf", {
        file_content: '{"legacy":false}',
      }),
    ).rejects.toThrow("is not a supported JSON file type");
  });

  it("preserves unchanged legacy extra keys but rejects new wrong-case update keys", async () => {
    collectionStore("file_storage").set("legacy-extra", {
      file_name: "report.pgo.json",
      creator_email: "old@example.com",
      file_type: "pgo_pdf_report",
      file_content: JSON.stringify({
        title: "Final report",
        download_url: "https://example.com/report.pdf",
      }),
      legacyCamelKey: "preserved",
    });
    const { updateStoredFileDocument } = await import(
      "../repositories/file-storage.repository.js"
    );

    await expect(
      updateStoredFileDocument("legacy-extra", {
        file_name: "corrected.pgo.json",
        legacyCamelKey: "preserved",
      }),
    ).resolves.toMatchObject({ document: { id: "legacy-extra" } });
    await expect(
      updateStoredFileDocument("legacy-extra", { newCamelKey: "blocked" }),
    ).rejects.toThrow("file_storage uses snake_case keys; newCamelKey");
    await expect(
      updateStoredFileDocument("legacy-extra", {
        legacyCamelKey: "changed",
      }),
    ).rejects.toThrow("file_storage uses snake_case keys; legacyCamelKey");
  });
});

describe("file storage JSON contracts", () => {
  const validPdfPgo = {
    title: "Final report",
    download_url: "https://example.com/report.pdf",
  };
  const validMdm = JSON.parse(
    readFileSync(
      path.resolve(
        __dirname,
        "../../../Pocket-Genes-Catalog-Wiki/payloads/demo-mdm.pgi1.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;

  beforeEach(() => {
    collections.clear();
  });

  it("creates a canonical snake-case file after exact PGO validation", async () => {
    const { createStoredFileDocument } = await import(
      "../repositories/file-storage.repository.js"
    );

    const result = await createStoredFileDocument({
      creator_email: "GOD@EXAMPLE.COM",
      file_type: "PGO_PDF_REPORT",
      file_content: JSON.stringify(validPdfPgo, null, 2),
    });

    expect(result.document.id).toBe("file_storage-generated");
    expect(result.document.data).toMatchObject({
      file_name: "Final report",
      creator_email: "god@example.com",
      file_type: "pgo_pdf_report",
      file_content: JSON.stringify(validPdfPgo),
      linked_object_code: null,
      linked_report_code: null,
    });
    expect(result.document.data).not.toHaveProperty("fileType");
    expect(result.document.data).not.toHaveProperty("linked_report_id");
  });

  it("rejects mismatched and spurious PGO JSON before writing", async () => {
    const { createStoredFileDocument } = await import(
      "../repositories/file-storage.repository.js"
    );

    await expect(
      createStoredFileDocument({
        creator_email: "god@example.com",
        file_type: "pgo_image_bundle",
        file_content: JSON.stringify(validPdfPgo),
      }),
    ).rejects.toThrow("does not match the pgo_image_bundle schema");
    await expect(
      createStoredFileDocument({
        creator_email: "god@example.com",
        file_type: "pgo_unregistered_result",
        file_content: "{}",
      }),
    ).rejects.toThrow("No runtime PGO schema is registered");
    expect(collectionStore("file_storage").size).toBe(0);
  });

  it("requires native report JSON to identify as the declared model", async () => {
    const { validateStoredFileJsonContent } = await import(
      "../repositories/file-storage.repository.js"
    );

    expect(
      validateStoredFileJsonContent({
        fileType: "mdm",
        fileContent: JSON.stringify(validMdm, null, 2),
      }),
    ).toEqual({
      fileType: "mdm",
      fileContent: JSON.stringify(validMdm),
    });
    expect(() =>
      validateStoredFileJsonContent({
        fileType: "ag",
        fileContent: JSON.stringify(validMdm),
      }),
    ).toThrow("matches mdm, not declared file_type ag");
    expect(() =>
      validateStoredFileJsonContent({
        fileType: "2pq",
        fileContent: '{"made_up":true}',
      }),
    ).toThrow("does not match any supported native model");
  });

  it("accepts the safe Firestore content boundary and rejects one byte over", async () => {
    const {
      MAX_STORED_FILE_CONTENT_BYTES,
      validateStoredFileJsonContent,
    } = await import("../repositories/file-storage.repository.js");
    const contentWithNotes = (noteLength: number) =>
      JSON.stringify({
        ...validPdfPgo,
        notes: "x".repeat(noteLength),
      });
    const emptyNotesBytes = Buffer.byteLength(contentWithNotes(0), "utf8");
    const exactLimitContent = contentWithNotes(
      MAX_STORED_FILE_CONTENT_BYTES - emptyNotesBytes,
    );
    const overLimitContent = contentWithNotes(
      MAX_STORED_FILE_CONTENT_BYTES - emptyNotesBytes + 1,
    );

    expect(Buffer.byteLength(exactLimitContent, "utf8")).toBe(
      MAX_STORED_FILE_CONTENT_BYTES,
    );
    expect(
      validateStoredFileJsonContent({
        fileType: "pgo_pdf_report",
        fileContent: exactLimitContent,
      }).fileContent,
    ).toBe(exactLimitContent);
    expect(() =>
      validateStoredFileJsonContent({
        fileType: "pgo_pdf_report",
        fileContent: overLimitContent,
      }),
    ).toThrow(
      `exceeds the ${MAX_STORED_FILE_CONTENT_BYTES}-byte inline Firestore limit`,
    );
  });

  it("rejects invalid metadata, unsupported JSON types, and camel-case keys", async () => {
    const { createStoredFileDocument } = await import(
      "../repositories/file-storage.repository.js"
    );

    await expect(
      createStoredFileDocument({
        creator_email: "not-an-email",
        file_type: "pgo_pdf_report",
        file_content: JSON.stringify(validPdfPgo),
      }),
    ).rejects.toThrow("creator_email must be a valid email address");
    await expect(
      createStoredFileDocument({
        creator_email: "god@example.com",
        file_type: "pdf",
        file_content: JSON.stringify(validPdfPgo),
      }),
    ).rejects.toThrow("is not a supported JSON file type");
    await expect(
      createStoredFileDocument({
        creator_email: "god@example.com",
        fileType: "pgo_pdf_report",
        file_content: JSON.stringify(validPdfPgo),
      }),
    ).rejects.toThrow("Unsupported file_storage create key fileType");
    await expect(
      createStoredFileDocument({
        creator_email: "god@example.com",
        file_type: "pgo_pdf_report",
        file_content: JSON.stringify(validPdfPgo),
        creation_date: "2026-09-22T00:00:00.000Z",
      }),
    ).rejects.toThrow("links and timestamps are server-owned");
    await expect(
      createStoredFileDocument({
        creator_email: "god@example.com",
        file_type: "pgo_pdf_report",
        file_content: JSON.stringify(validPdfPgo),
        linked_object_code: "123456789",
      }),
    ).rejects.toThrow("links and timestamps are server-owned");
  });

  it("paginates by document ID without dropping records missing dates", async () => {
    for (const id of ["file-a", "file-b", "file-c"]) {
      collectionStore("file_storage").set(id, {
        file_name: `${id}.json`,
        file_type: "pgo_pdf_report",
        file_content: JSON.stringify(validPdfPgo),
      });
    }
    const { listStoredFileDocuments } = await import(
      "../repositories/file-storage.repository.js"
    );

    const first = await listStoredFileDocuments({ limit: 2 });
    expect(first.documents.map((document) => document.id)).toEqual([
      "file-c",
      "file-b",
    ]);
    expect(first.nextCursor).toBe("file-b");

    const second = await listStoredFileDocuments({
      cursor: first.nextCursor ?? undefined,
      limit: 2,
    });
    expect(second.documents.map((document) => document.id)).toEqual(["file-a"]);
    expect(second.nextCursor).toBeNull();
  });
});
