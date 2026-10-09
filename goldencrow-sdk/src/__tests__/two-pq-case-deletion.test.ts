export {};

import type { AdminContext } from "../types/sdk.types.js";

type MockData = Record<string, unknown>;

const collections = new Map<string, Map<string, MockData>>();
const mockDeleteTwoPQRecordForContext = jest.fn();
const mockDeleteServiceTransaction = jest.fn();

function store(name: string) {
  let collection = collections.get(name);
  if (!collection) {
    collection = new Map<string, MockData>();
    collections.set(name, collection);
  }
  return collection;
}

function documentReference(collectionName: string, id: string) {
  const reference = {
    id,
    path: `${collectionName}/${id}`,
    get: async () => documentSnapshot(collectionName, id),
    delete: async () => {
      store(collectionName).delete(id);
    },
  };
  return reference;
}

function documentSnapshot(collectionName: string, id: string) {
  const data = store(collectionName).get(id);
  return {
    id,
    exists: Boolean(data),
    data: () => data,
    ref: documentReference(collectionName, id),
  };
}

function queryReference(
  collectionName: string,
  field: string,
  operator: string,
  value: unknown,
  limit = Number.POSITIVE_INFINITY,
) {
  return {
    limit: (nextLimit: number) =>
      queryReference(collectionName, field, operator, value, nextLimit),
    get: async () => {
      const matching = [...store(collectionName).entries()]
        .filter(([, data]) =>
          operator === "array-contains"
            ? Array.isArray(data[field]) && data[field].includes(value)
            : data[field] === value,
        )
        .slice(0, limit)
        .map(([id]) => documentSnapshot(collectionName, id));
      return { docs: matching, empty: matching.length === 0 };
    },
  };
}

function collectionReference(name: string) {
  return {
    doc: (id: string) => documentReference(name, id),
    where: (field: string, operator: string, value: unknown) =>
      queryReference(name, field, operator, value),
  };
}

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: (name: string) => collectionReference(name),
    batch: () => {
      const operations: Array<() => void> = [];
      return {
        delete: (reference: { path: string }) => {
          operations.push(() => {
            const [collectionName, id] = reference.path.split("/");
            store(collectionName!).delete(id!);
          });
        },
        set: (
          reference: { path: string },
          data: MockData,
          options?: { merge?: boolean },
        ) => {
          operations.push(() => {
            const [collectionName, id] = reference.path.split("/");
            const existing = store(collectionName!).get(id!) ?? {};
            store(collectionName!).set(
              id!,
              options?.merge ? { ...existing, ...data } : data,
            );
          });
        },
        commit: async () => {
          operations.forEach((operation) => operation());
        },
      };
    },
  })),
}));

jest.mock("../repositories/support-services.repository.js", () => ({
  deleteTwoPQCaseServiceTransactionForCleanup: mockDeleteServiceTransaction,
}));

jest.mock("../repositories/two-pq.repository.js", () => ({
  deleteTwoPQRecordForContext: mockDeleteTwoPQRecordForContext,
}));

const fullAdmin: AdminContext = {
  email: "admin@example.com",
  uid: "admin-1",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap"],
};

describe("staged 2PQ case deletion", () => {
  beforeEach(() => {
    collections.clear();
    jest.clearAllMocks();
    store("2pq_case").set("CASE-00022", {
      institutionId: "INST-1",
      doctorId: "DOC-1",
      children_sampling: ["SAM-1"],
    });
    mockDeleteTwoPQRecordForContext.mockResolvedValue({
      success: true,
      recordId: "CASE-00022",
      unlinkedSamplingIds: ["SAM-1"],
    });
    mockDeleteServiceTransaction.mockResolvedValue({
      status: "not_found",
      transactionId: "pgr_2pq_case_00022",
      cleanupWarnings: [],
    });
  });

  it("preserves linked records when deleting only the case", async () => {
    const { deleteTwoPQCaseStepForContext } = await import(
      "../repositories/two-pq-case-deletion.repository.js"
    );
    const result = await deleteTwoPQCaseStepForContext(
      fullAdmin,
      "CASE-00022",
      "case",
      "case",
    );

    expect(mockDeleteTwoPQRecordForContext).toHaveBeenCalledWith(
      fullAdmin,
      "cases",
      "CASE-00022",
      { deleteLinkedSamplings: false },
    );
    expect(result.message).toContain("preserved and unlinked");
  });

  it("deletes only samplings whose live parent still matches the case", async () => {
    store("2pq_sampling").set("SAM-1", {
      parent_case: "CASE-00022",
      sampleId: "sample-1",
    });
    const { deleteTwoPQCaseStepForContext } = await import(
      "../repositories/two-pq-case-deletion.repository.js"
    );
    const result = await deleteTwoPQCaseStepForContext(
      fullAdmin,
      "CASE-00022",
      "related",
      "samplings",
    );

    expect(result).toMatchObject({
      step: "samplings",
      status: "deleted",
      deletedCount: 1,
    });
    expect(store("2pq_sampling").has("SAM-1")).toBe(false);
  });

  it("stops when a sampling was reassigned before cleanup", async () => {
    store("2pq_sampling").set("SAM-1", {
      parent_case: "CASE-OTHER",
      sampleId: "sample-1",
    });
    const { deleteTwoPQCaseStepForContext } = await import(
      "../repositories/two-pq-case-deletion.repository.js"
    );

    await expect(
      deleteTwoPQCaseStepForContext(
        fullAdmin,
        "CASE-00022",
        "related",
        "samplings",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(store("2pq_sampling").has("SAM-1")).toBe(true);
  });

  it("clears the study request 2pq_case property during form-link cleanup", async () => {
    store("2pq_forms").set("FORM-00047", {
      formType: "study_request",
      "2pq_case": "CASE-00022",
      linkedBiopsyForm: "FORM-00048",
    });
    const { deleteTwoPQCaseStepForContext } = await import(
      "../repositories/two-pq-case-deletion.repository.js"
    );

    const result = await deleteTwoPQCaseStepForContext(
      fullAdmin,
      "CASE-00022",
      "related",
      "form_links",
    );

    expect(result).toMatchObject({
      step: "form_links",
      status: "deleted",
      deletedCount: 1,
    });
    expect(store("2pq_forms").get("FORM-00047")).toMatchObject({
      "2pq_case": null,
      linkedBiopsyForm: "FORM-00048",
    });
  });

  it("allows the staged cleanup only for full admins and 2PQ admins", async () => {
    const { deleteTwoPQCaseStepForContext } = await import(
      "../repositories/two-pq-case-deletion.repository.js"
    );
    await expect(
      deleteTwoPQCaseStepForContext(
        { ...fullAdmin, role: "institution_admin" },
        "CASE-00022",
        "case",
        "case",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockDeleteTwoPQRecordForContext).not.toHaveBeenCalled();
  });
});
