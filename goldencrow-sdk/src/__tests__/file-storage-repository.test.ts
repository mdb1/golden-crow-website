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

function collectionReference(name: string) {
  return {
    doc: (id = `${name}-generated`) => documentReference(name, id),
    where: (field: string, _operator: string, value: unknown) =>
      queryReference(name, field, value),
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
      file_content: "{}",
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
});
