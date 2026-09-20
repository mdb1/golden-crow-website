import type { AdminContext } from "../types/sdk.types.js";

type MockData = Record<string, unknown>;

const collections = new Map<string, Map<string, MockData>>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function collectionStore(name: string) {
  let store = collections.get(name);
  if (!store) {
    store = new Map<string, MockData>();
    collections.set(name, store);
  }
  return store;
}

function seedDoc(collectionName: string, id: string, data: MockData) {
  collectionStore(collectionName).set(id, clone(data));
}

function snapshotFor(collectionName: string, id: string, data?: MockData) {
  return {
    exists: Boolean(data),
    id,
    data: () => clone(data ?? {}),
    ref: docRef(collectionName, id),
  };
}

function docRef(collectionName: string, id: string) {
  return {
    id,
    async get() {
      const data = collectionStore(collectionName).get(id);
      return snapshotFor(collectionName, id, data);
    },
    async set(data: MockData, options?: { merge?: boolean }) {
      const previous = collectionStore(collectionName).get(id) ?? {};
      collectionStore(collectionName).set(
        id,
        clone(options?.merge ? { ...previous, ...data } : data),
      );
    },
    async delete() {
      collectionStore(collectionName).delete(id);
    },
  };
}

function collectionRef(name: string) {
  return {
    doc: jest.fn((id = `${name}-generated`) => docRef(name, id)),
    where: jest.fn((field: string, operation: string, value: unknown) => ({
      limit: jest.fn(() => ({
        async get() {
          if (operation !== "==") {
            throw new Error(`Unsupported mock query operation: ${operation}`);
          }
          const docs = [...collectionStore(name).entries()]
            .filter(([, data]) => data[field] === value)
            .slice(0, 1)
            .map(([id, data]) => snapshotFor(name, id, data));
          return { docs, empty: docs.length === 0 };
        },
      })),
    })),
  };
}

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: class FieldValueStub {
    static serverTimestamp() {
      return new Date("2026-09-16T12:00:00.000Z");
    }
  },
  Timestamp: class TimestampStub {
    constructor(private readonly date: Date) {}

    toDate() {
      return this.date;
    }
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: jest.fn((name: string) => collectionRef(name)),
  })),
}));

const context: AdminContext = {
  email: "god@example.com",
  uid: "god-1",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap"],
};

const baseOffer = {
  schemaVersion: 1,
  serviceId: "pgs_report",
  serviceVersion: 3,
  name: "Report service",
  serviceCategory: "Reports",
  providerKind: "organization" as const,
  providerId: "feed-org-1",
  providerName: "Pocket Genes",
  stages: ["bioinformatics"],
  status: "active" as const,
  description: "Create a report.",
  shortContract: "form:form -> report:pdf_report",
  providerWork: "Review and issue a report.",
  formShape: {
    id: "pgfs_report",
    version: 2,
    allowUnknownFields: false,
    fields: [
      {
        key: "requested_at",
        label: "Requested at",
        type: "datetime",
        required: true,
      },
      {
        key: "requested_by",
        label: "Requested by",
        type: "text",
        required: true,
      },
    ],
  },
  inputSlots: [
    {
      role: "form",
      objectType: "pgo_form",
      acceptedTypes: ["pgo_form"],
      required: true,
      cardinality: { min: 1, max: 1 },
    },
  ],
  outputSlots: [
    {
      role: "report",
      objectType: "pgo_pdf_report",
      mutationMode: "new_object",
    },
  ],
  acceptedConditions: [],
  scopeRules: [],
  normalizedName: "report service pgs_report",
  createdAt: "2026-09-15T12:00:00.000Z",
  createdByEmail: "god@example.com",
};

describe("support service repository versions", () => {
  beforeEach(() => {
    jest.resetModules();
    collections.clear();
    seedDoc("feed_organizations", "feed-org-1", { name: "Pocket Genes" });
    seedDoc("service_offers", "offer-1", baseOffer);
  });

  it("increments service version when a published offer definition changes", async () => {
    const { updateSupportServiceOffer } = await import(
      "../repositories/support-services.repository.js"
    );

    const offer = await updateSupportServiceOffer(context, "offer-1", {
      ...baseOffer,
      description: "Create a reviewed report.",
      serviceVersion: 99,
      formShape: {
        ...baseOffer.formShape,
        version: 99,
      },
    });

    expect(offer.serviceVersion).toBe(4);
    expect(offer.formShape?.version).toBe(2);
    expect(collectionStore("service_offers").get("offer-1")).toEqual(
      expect.objectContaining({
        serviceVersion: 4,
        description: "Create a reviewed report.",
        formShape: expect.objectContaining({
          version: 2,
        }),
      }),
    );
  });

  it("increments form shape version when a published form shape changes", async () => {
    const { updateSupportServiceOffer } = await import(
      "../repositories/support-services.repository.js"
    );

    const offer = await updateSupportServiceOffer(context, "offer-1", {
      ...baseOffer,
      formShape: {
        ...baseOffer.formShape,
        fields: [
          ...baseOffer.formShape.fields,
          {
            key: "language",
            label: "Report language",
            type: "text",
            required: false,
          },
        ],
      },
    });

    expect(offer.serviceVersion).toBe(4);
    expect(offer.formShape?.version).toBe(3);
  });
});

describe("support service delivered transactions", () => {
  const transaction = {
    schemaVersion: 1,
    requestId: "pgr_report_1",
    serviceId: "pgs_report",
    serviceVersion: 3,
    status: "running",
    requesterEmail: "patient@example.com",
    subjectId: "subject-1",
    inputs: [
      {
        role: "form",
        objectRef: { objectId: "obj_report_form", revision: 1 },
      },
    ],
    output_objects: [],
    output_reports: [],
    missingRequiredInputRoles: [],
    notes: "",
    normalizedName: "pgr report 1 pgs report patient example com",
  };

  const deliveredInput = {
    ...transaction,
    status: "delivered" as const,
    outputObjects: [
      {
        role: "report",
        objectType: "pgo_pdf_report",
        objectCode: "123456789",
      },
    ],
    outputReports: [{ reportCode: "ABC123" }],
  };

  beforeEach(() => {
    jest.resetModules();
    collections.clear();
    seedDoc("feed_organizations", "feed-org-1", { name: "Pocket Genes" });
    seedDoc("service_offers", "offer-1", baseOffer);
    seedDoc("service_transactions", "transaction-1", transaction);
  });

  it("marks a transaction delivered only when every promised object is ready", async () => {
    seedDoc("object_codes", "123456789", {
      uploaded_object_id: "uploaded-object-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      object_code: "123456789",
      object_type: "pgo_pdf_report",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
      download_url: "https://example.com/result.json",
    });
    const { updateSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    const result = await updateSupportServiceTransaction(
      context,
      "transaction-1",
      deliveredInput,
    );

    expect(result.status).toBe("delivered");
    expect(result.outputObjects).toEqual(deliveredInput.outputObjects);
    expect(result.outputReports).toEqual(deliveredInput.outputReports);
  });

  it("rejects delivered when an output code is not available", async () => {
    const { updateSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      updateSupportServiceTransaction(context, "transaction-1", deliveredInput),
    ).rejects.toThrow("Output object code 123456789 does not exist.");
  });

  it("rejects delivered when an uploaded object has no positive version", async () => {
    seedDoc("object_codes", "123456789", {
      uploaded_object_id: "uploaded-object-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      object_code: "123456789",
      object_type: "pgo_pdf_report",
      upload_version_count: 0,
      tracking_progress_status: "document_ready",
      download_url: "https://example.com/result.json",
    });
    const { updateSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      updateSupportServiceTransaction(context, "transaction-1", deliveredInput),
    ).rejects.toThrow(
      "Output object 123456789 requires a positive upload_version_count.",
    );
  });

  it("rejects delivered when an output type does not match the offer", async () => {
    const { updateSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      updateSupportServiceTransaction(context, "transaction-1", {
        ...deliveredInput,
        outputObjects: [
          {
            role: "report",
            objectType: "pgo_variant_call_file",
            objectCode: "123456789",
          },
        ],
      }),
    ).rejects.toThrow(
      "Output object report must be pgo_pdf_report, not pgo_variant_call_file.",
    );
  });

  it("rejects legacy completed as a transaction status", async () => {
    const { updateSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      updateSupportServiceTransaction(context, "transaction-1", {
        ...deliveredInput,
        status: "completed" as never,
      }),
    ).rejects.toThrow("Unsupported service transaction status: completed.");
  });

  it("rejects a persisted legacy completed transaction instead of rewriting it", async () => {
    seedDoc("service_transactions", "legacy-transaction", {
      ...transaction,
      status: "completed",
    });
    const { getSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      getSupportServiceTransaction(context, "legacy-transaction"),
    ).rejects.toThrow("Unsupported service transaction status: completed.");
  });

  it("rejects malformed output snapshots instead of silently dropping them", async () => {
    const { updateSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      updateSupportServiceTransaction(context, "transaction-1", {
        ...deliveredInput,
        outputObjects: [{ role: "report" } as never],
      }),
    ).rejects.toThrow(
      "Output object snapshot 1 requires role, object type, and object code.",
    );
  });

  it("removes requester and organization references when deleting a transaction", async () => {
    seedDoc("service_transactions", "transaction-1", {
      ...transaction,
      requestedByUserId: "user-1",
    });
    const matchingSummary = {
      serviceTransactionId: transaction.requestId,
      status: transaction.status,
    };
    const retainedSummary = {
      serviceTransactionId: "pgr_other_1",
      status: "received",
    };
    seedDoc("community_users", "user-1", {
      requestedServiceTransactions: [matchingSummary, retainedSummary],
    });
    seedDoc("feed_organizations", "feed-org-1", {
      name: "Pocket Genes",
      requestedServiceTransactions: [matchingSummary, retainedSummary],
    });
    const { deleteSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await deleteSupportServiceTransaction(context, "transaction-1");

    expect(collectionStore("service_transactions").has("transaction-1")).toBe(
      false,
    );
    expect(collectionStore("community_users").get("user-1")).toMatchObject({
      requestedServiceTransactions: [retainedSummary],
    });
    expect(collectionStore("feed_organizations").get("feed-org-1")).toMatchObject(
      { requestedServiceTransactions: [retainedSummary] },
    );
  });

  it("removes the recipient reference from an individual provider", async () => {
    seedDoc("service_offers", "offer-1", {
      ...baseOffer,
      providerKind: "individual",
      providerId: "feed-individual-1",
      providerName: "Dr. Example",
    });
    seedDoc("feed_individuals", "feed-individual-1", {
      name: "Dr. Example",
      requestedServiceTransactions: [
        { serviceTransactionId: transaction.requestId },
      ],
    });
    const { deleteSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await deleteSupportServiceTransaction(context, transaction.requestId);

    expect(
      collectionStore("feed_individuals").get("feed-individual-1"),
    ).toMatchObject({ requestedServiceTransactions: [] });
  });
});
