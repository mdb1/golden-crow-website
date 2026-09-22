import type { AdminContext } from "../types/sdk.types.js";

type MockData = Record<string, unknown>;

const mockLookup = jest.fn();
const mockRandomInt = jest.fn();

jest.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => mockLookup(...args),
}));

jest.mock("node:crypto", () => ({
  ...jest.requireActual("node:crypto"),
  randomInt: (...args: unknown[]) => mockRandomInt(...args),
}));

const collections = new Map<string, Map<string, MockData>>();
let beforeNextTransaction: (() => void) | undefined;

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

type MockFilter = {
  field: string;
  operation: "==" | "<=" | ">=";
  value: unknown;
};

type MockQueryReference = {
  where(
    field: string,
    operation: MockFilter["operation"],
    value: unknown,
  ): MockQueryReference;
  orderBy(field: string, direction?: "asc" | "desc"): MockQueryReference;
  startAfter(...values: unknown[]): MockQueryReference;
  limit(limit: number): MockQueryReference;
  count(): {
    get(): Promise<{ data(): { count: number } }>;
  };
  get(): Promise<{
    docs: ReturnType<typeof snapshotFor>[];
    empty: boolean;
  }>;
};

function comparable(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return Date.parse(value);
  }
  return value;
}

function queryRef(
  name: string,
  filters: MockFilter[] = [],
  orderings: { field: string; direction: "asc" | "desc" }[] = [],
  maximum?: number,
  afterValues?: unknown[],
): MockQueryReference {
  const matchingEntries = () => {
    let entries = [...collectionStore(name).entries()].filter(([, data]) =>
      filters.every(({ field, operation, value }) => {
        const left = comparable(data[field]);
        const right = comparable(value);
        if (operation === "==") {
          return left === right;
        }
        if (operation === "<=") {
          return Number(left) <= Number(right);
        }
        return Number(left) >= Number(right);
      }),
    );
    if (orderings.length) {
      entries = entries.sort(([leftId, left], [rightId, right]) => {
        for (const ordering of orderings) {
          const leftValue = comparable(
            ordering.field === "__name__" ? leftId : left[ordering.field],
          );
          const rightValue = comparable(
            ordering.field === "__name__" ? rightId : right[ordering.field],
          );
          const comparison =
            typeof leftValue === "number" && typeof rightValue === "number"
              ? leftValue - rightValue
              : String(leftValue).localeCompare(String(rightValue));
          if (comparison !== 0) {
            return ordering.direction === "desc" ? -comparison : comparison;
          }
        }
        return 0;
      });
    }
    if (afterValues?.length) {
      const cursorIndex = entries.findIndex(([id, data]) =>
        orderings.every(
          (ordering, index) =>
            comparable(
              ordering.field === "__name__" ? id : data[ordering.field],
            ) === comparable(afterValues[index]),
        ),
      );
      entries = cursorIndex >= 0 ? entries.slice(cursorIndex + 1) : [];
    }
    return maximum === undefined ? entries : entries.slice(0, maximum);
  };

  return {
    where: jest.fn(
      (field: string, operation: MockFilter["operation"], value: unknown) =>
        queryRef(
          name,
          [...filters, { field, operation, value }],
          orderings,
          maximum,
          afterValues,
        ),
    ),
    orderBy: jest.fn((field: string, direction: "asc" | "desc" = "asc") =>
      queryRef(
        name,
        filters,
        [...orderings, { field, direction }],
        maximum,
        afterValues,
      ),
    ),
    startAfter: jest.fn((...values: unknown[]) =>
      queryRef(name, filters, orderings, maximum, values),
    ),
    limit: jest.fn((limit: number) =>
      queryRef(name, filters, orderings, limit, afterValues),
    ),
    count: jest.fn(() => ({
      async get() {
        return { data: () => ({ count: matchingEntries().length }) };
      },
    })),
    async get() {
      const docs = matchingEntries().map(([id, data]) =>
        snapshotFor(name, id, data),
      );
      return { docs, empty: docs.length === 0 };
    },
  };
}

function collectionRef(name: string) {
  return {
    doc: jest.fn((id = `${name}-generated`) => docRef(name, id)),
    ...queryRef(name),
  };
}

jest.mock("firebase-admin/firestore", () => ({
  FieldPath: class FieldPathStub {
    static documentId() {
      return "__name__";
    }
  },
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

    static fromDate(date: Date) {
      return new this(date);
    }
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: jest.fn((name: string) => collectionRef(name)),
    runTransaction: jest.fn(async (handler) => {
      const beforeTransaction = beforeNextTransaction;
      beforeNextTransaction = undefined;
      beforeTransaction?.();
      return handler({
        get: (ref: ReturnType<typeof docRef>) => ref.get(),
        set: (
          ref: ReturnType<typeof docRef>,
          data: MockData,
          options?: { merge?: boolean },
        ) => ref.set(data, options),
        delete: (ref: ReturnType<typeof docRef>) => ref.delete(),
      });
    }),
  })),
}));

afterEach(() => {
  beforeNextTransaction = undefined;
  jest.restoreAllMocks();
});

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

function serializedPgoWrapper(snapshot: Record<string, unknown>) {
  const inputRefs = Array.isArray(snapshot.inputRefs)
    ? snapshot.inputRefs.map((value) => {
        const reference = value as Record<string, unknown>;
        return {
          object_id: reference.objectId,
          revision: reference.revision,
          ...(reference.objectType
            ? { object_type: reference.objectType }
            : {}),
          ...(reference.role ? { role: reference.role } : {}),
        };
      })
    : [];
  const files = Array.isArray(snapshot.files)
    ? snapshot.files.map((value) => {
        const file = value as Record<string, unknown>;
        return {
          ...(file.role ? { role: file.role } : {}),
          ...(file.path ? { path: file.path } : {}),
          ...(file.url ? { url: file.url } : {}),
          ...(file.fileStorageId
            ? { file_storage_id: file.fileStorageId }
            : {}),
          ...(file.mediaType ? { media_type: file.mediaType } : {}),
          ...(file.sizeBytes !== undefined
            ? { size_bytes: file.sizeBytes }
            : {}),
          ...(file.sha256 ? { sha256: file.sha256 } : {}),
        };
      })
    : [];
  return {
    object_id: snapshot.objectId,
    object_type: snapshot.objectType,
    schema_version: snapshot.schemaVersion,
    revision: snapshot.revision,
    created_at: snapshot.createdAt,
    created_by: snapshot.createdBy,
    input_refs: inputRefs,
    data: snapshot.data,
    files,
  };
}

const baseOffer = {
  schemaVersion: 1,
  serviceId: "pgs_pocket_genes_1",
  serviceVersion: 3,
  name: "Report service",
  serviceCategory: "Reports",
  providerKind: "organization" as const,
  providerId: "feed-org-1",
  providerName: "Pocket Genes",
  stages: ["bioinformatics"],
  status: "active" as const,
  isHiddenFromSearch: false,
  description: "Create a report.",
  shortContract: "form:form -> report:pdf_report",
  providerWork: "Review and issue a report.",
  formShape: {
    id: "pgfs_pocket_genes_1",
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
  normalizedName: "report service pgs pocket genes 1",
  createdAt: "2026-09-15T12:00:00.000Z",
  createdByEmail: "god@example.com",
};

describe("support service repository versions", () => {
  beforeEach(() => {
    jest.resetModules();
    collections.clear();
    seedDoc("feed_organizations", "feed-org-1", {
      name: "Pocket Genes",
      status: "active",
    });
    seedDoc("object_owners", "feed-org-1", {
      owner_name: "Pocket Genes",
      owner_contact_email: "services@pocketgenes.example",
    });
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

  it("persists visibility without treating it as a contract version change", async () => {
    const { updateSupportServiceOffer } = await import(
      "../repositories/support-services.repository.js"
    );

    const offer = await updateSupportServiceOffer(context, "offer-1", {
      ...baseOffer,
      providerName: "Untrusted client label",
      isHiddenFromSearch: true,
    });

    expect(offer.serviceVersion).toBe(3);
    expect(offer.isHiddenFromSearch).toBe(true);
    expect(offer.providerName).toBe("Pocket Genes");
    expect(collectionStore("service_offers").get("offer-1")).toEqual(
      expect.objectContaining({
        isHiddenFromSearch: true,
        providerName: "Pocket Genes",
      }),
    );
  });

  it("rejects missing and snake-case service visibility keys", async () => {
    const { updateSupportServiceOffer } = await import(
      "../repositories/support-services.repository.js"
    );
    const { isHiddenFromSearch: _, ...missingVisibility } = baseOffer;

    await expect(
      updateSupportServiceOffer(context, "offer-1", missingVisibility),
    ).rejects.toThrow("isHiddenFromSearch must be a boolean.");
    await expect(
      updateSupportServiceOffer(context, "offer-1", {
        ...baseOffer,
        is_hidden_from_search: false,
      } as typeof baseOffer),
    ).rejects.toThrow("Service offer uses forbidden snake-case field: is_hidden_from_search.");
  });

  it("preserves calculated-after-submission price summaries", async () => {
    const { updateSupportServiceOffer } = await import(
      "../repositories/support-services.repository.js"
    );

    const offer = await updateSupportServiceOffer(context, "offer-1", {
      ...baseOffer,
      commercialTerms: {
        pricingModel: "calculated_after_submission",
        price: { summary: "Quoted after review" },
      },
    });

    expect(offer.commercialTerms).toEqual({
      pricingModel: "calculated_after_submission",
      price: { summary: "Quoted after review" },
    });
  });

  it("enforces exact base form fields and unique output roles", async () => {
    const { updateSupportServiceOffer } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      updateSupportServiceOffer(context, "offer-1", {
        ...baseOffer,
        formShape: {
          ...baseOffer.formShape,
          fields: [
            { ...baseOffer.formShape.fields[0], type: "text" },
            baseOffer.formShape.fields[1],
          ],
        },
      }),
    ).rejects.toThrow("requested_at must be a required datetime");

    await expect(
      updateSupportServiceOffer(context, "offer-1", {
        ...baseOffer,
        outputSlots: [
          ...baseOffer.outputSlots,
          {
            role: "report",
            objectType: "pgo_annotated_vcf",
            mutationMode: "new_object",
          },
        ],
      }),
    ).rejects.toThrow("Duplicate output slot role: report");
  });
});

describe("support service pagination", () => {
  beforeEach(() => {
    jest.resetModules();
    collections.clear();
    for (let index = 0; index < 21; index += 1) {
      seedDoc("service_offers", `offer-page-${String(index).padStart(2, "0")}`, {
        ...baseOffer,
        updatedAt: "2026-09-16T12:00:00.000Z",
      });
    }
  });

  it("uses the document ID as a cursor tie-breaker for equal timestamps", async () => {
    const { listSupportServiceOffers } = await import(
      "../repositories/support-services.repository.js"
    );

    const first = await listSupportServiceOffers(context, {
      status: "active",
      limit: 20,
    });
    expect(first.offers).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    expect(first.nextCursor).not.toBe("2026-09-16T12:00:00.000Z");

    const second = await listSupportServiceOffers(context, {
      status: "active",
      limit: 20,
      cursor: first.nextCursor,
    });
    const ids = [...first.offers, ...second.offers].map((offer) => offer.id);
    expect(second.offers).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
    expect(new Set(ids).size).toBe(21);
  });
});

describe("support service delivered transactions", () => {
  const transaction = {
    schemaVersion: 1,
    requestId: "pgr_report_1",
    offerId: "offer-1",
    serviceId: "pgs_pocket_genes_1",
    serviceVersion: 3,
    providerId: "feed-org-1",
    providerKind: "organization" as const,
    status: "running",
    requestedByUserId: "user-1",
    requestedByUserEmail: "patient@example.com",
    requestedAt: "2026-09-16T12:00:00.000Z",
    requestedAtClient: "2026-09-16T12:00:00.000Z",
    requestRevision: 1,
    idempotencyKey: "pgr_report_1:backoffice",
    inputs: [
      {
        role: "form",
        objectRef: { objectId: "obj_report_form", revision: 1 },
        objectType: "pgo_form" as const,
        objectCode: "987654321",
        uploadedObjectId: "uploaded-form-1",
        fileStorageId: "stored-form-1",
        objectOwnerId: "feed-org-1",
        objectSnapshot: {
          objectId: "obj_report_form",
          objectType: "pgo_form",
          schemaVersion: "1.0.0",
          revision: 1,
          createdAt: "2026-09-16T12:00:00.000Z",
          createdBy: "user-1",
          inputRefs: [],
          data: {
            form_shape_id: "pgfs_pocket_genes_1",
            form_shape_version: 2,
            form_shape: {
              id: "pgfs_pocket_genes_1",
              version: 2,
              allow_unknown_fields: false,
              fields: [
                {
                  key: "requested_at",
                  label: "Requested at",
                  type: "datetime",
                  required: true,
                  options: [],
                },
                {
                  key: "requested_by",
                  label: "Requested by",
                  type: "text",
                  required: true,
                  options: [],
                },
              ],
            },
            fields: [
              { key: "requested_at", value: "2026-09-16T12:00:00.000Z" },
              {
                key: "requested_by",
                value: "Patient (patient@example.com)",
              },
            ],
          },
          files: [],
        },
      },
    ],
    outputObjects: [],
    outputReports: [],
    missingRequiredInputRoles: [],
    issues: [],
    offerSnapshot: {
      ...baseOffer,
      offerId: "offer-1",
    },
    providerSnapshot: {
      id: "feed-org-1",
      kind: "organization" as const,
      name: "Pocket Genes",
    },
    contractSource: "service_offer",
    attachmentsPending: false,
    normalizedName: "pgr report 1 pgs report patient example com",
  };

  const deliveredInput = {
    ...transaction,
    status: "delivered" as const,
    outputObjects: [
      {
        role: "report",
        objectType: "pgo_pdf_report" as const,
        objectCode: "123456789",
      },
    ],
    outputReports: [{ reportCode: "ABC123" }],
  };

  const directOutputEnvelope = {
    objectId: "obj_output_report_1",
    objectType: "pgo_pdf_report",
    schemaVersion: "1.0.0",
    revision: 1,
    createdAt: "2026-09-16T12:00:00.000Z",
    createdBy: "pgp_report_studio",
    inputRefs: [],
    data: {
      title: "Final report",
      report_kind: "administrative",
      language: "en",
      subject_id: "subject_test_1",
      created_by_provider_id: "pgp_report_studio",
      generated_at: "2026-09-16T12:00:00.000Z",
      page_count: 1,
      status: "final",
      template_id: "report_template_v1",
    },
    files: [
      {
        role: "primary",
        path: "payloads/final-report.pdf",
        mediaType: "application/pdf",
        sha256: "a".repeat(64),
        sizeBytes: 1024,
      },
    ],
  };

  const imageOutputEnvelope = {
    objectId: "obj_output_images_1",
    objectType: "pgo_image_bundle",
    schemaVersion: "1.0.0",
    revision: 1,
    createdAt: "2026-09-16T12:00:00.000Z",
    createdBy: "pgp_image_studio",
    inputRefs: [],
    data: {
      subject_id: "subject_test_1",
      image_kind: "other",
      source_object_ref: { object_id: "obj_source_1", revision: 1 },
      acquired_at: "2026-09-16T12:00:00.000Z",
      acquired_by: "pgp_image_studio",
      images: [
        {
          image_id: "image_1",
          file_role: "image_1",
          format: "png",
          width_px: 640,
          height_px: 480,
          caption: "Validated output image",
        },
      ],
      acquisition_profile: "image_profile_v1",
    },
    files: [
      {
        role: "image_1",
        path: "payloads/image-1.png",
        mediaType: "image/png",
        sha256: "b".repeat(64),
        sizeBytes: 2048,
      },
    ],
  };

  function mockPgoDownload(
    envelope: Record<string, unknown> = directOutputEnvelope,
  ) {
    const body = JSON.stringify(serializedPgoWrapper(envelope));
    jest.mocked(fetch).mockImplementation(async () =>
      new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
        },
      }),
    );
  }

  beforeEach(() => {
    jest.resetModules();
    collections.clear();
    mockLookup.mockReset();
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mockRandomInt.mockReset();
    let nextObjectCode = 200_000_000;
    mockRandomInt.mockImplementation(() => nextObjectCode++);
    global.fetch = jest.fn();
    seedDoc("feed_organizations", "feed-org-1", {
      name: "Pocket Genes",
      status: "active",
    });
    seedDoc("object_owners", "feed-org-1", {
      owner_name: "Pocket Genes",
      owner_contact_email: "services@pocketgenes.example",
    });
    seedDoc("service_offers", "offer-1", baseOffer);
    seedDoc("object_codes", "987654321", {
      uploaded_object_id: "uploaded-form-1",
      owner_id: "feed-org-1",
    });
    seedDoc("uploaded_objects", "uploaded-form-1", {
      objectCode: "987654321",
      objectType: "pgo_form",
      linked_file_id: "stored-form-1",
      object_owner_id: "feed-org-1",
      owner_community_user_id: "feed-org-1",
      owner_public_profile_id: "feed-org-1",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
    });
    seedDoc("file_storage", "stored-form-1", {
      linked_object_code: "987654321",
      file_type: "pgo_form",
      owner_community_user_id: "feed-org-1",
      provider_id: "feed-org-1",
      file_content: JSON.stringify(
        serializedPgoWrapper(transaction.inputs[0]!.objectSnapshot),
      ),
    });
    seedDoc("service_transactions", "transaction-1", {
      ...transaction,
      outputObjects: deliveredInput.outputObjects,
      outputReports: deliveredInput.outputReports,
    });
    seedDoc("community_users", "user-1", {
      requestedServiceTransactions: [
        {
          serviceTransactionId: transaction.requestId,
          status: transaction.status,
        },
      ],
    });
    seedDoc("community_users", "feed-org-1", {
      owned_objects: ["uploaded-form-1", "uploaded-object-1"],
    });
  });

  it("attaches a validated URL-only output atomically and delivers after revalidation", async () => {
    seedDoc("service_transactions", "transaction-1", transaction);
    seedDoc("community_users", "feed-org-1", {
      owned_objects: ["uploaded-form-1"],
    });
    mockPgoDownload();
    const {
      attachSupportServiceTransactionOutputObject,
      deliverSupportServiceTransaction,
    } = await import("../repositories/support-services.repository.js");

    const attached = await attachSupportServiceTransactionOutputObject(
      context,
      "transaction-1",
      {
        role: "report",
        fileName: "report.pgo.json",
        downloadUrl: "https://objects.example/report.pgo.json",
      },
    );

    expect(attached.object).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^pgo_output_\d{9}$/),
        role: "report",
        objectCode: expect.stringMatching(/^\d{9}$/),
        objectType: "pgo_pdf_report",
        status: "ready",
      }),
    );
    expect(attached.transaction).toEqual(
      expect.objectContaining({
        requestRevision: 2,
        status: "running",
        outputObjects: [
          expect.objectContaining({
            role: "report",
            objectCode: attached.object.objectCode,
          }),
        ],
      }),
    );
    expect(collectionStore("object_codes").get(attached.object.objectCode)).toEqual(
      {
        uploaded_object_id: attached.object.id,
        owner_id: "feed-org-1",
      },
    );
    const storedObject = collectionStore("uploaded_objects").get(
      attached.object.id,
    );
    expect(storedObject).toEqual(
      expect.objectContaining({
        objectCode: attached.object.objectCode,
        objectType: "pgo_pdf_report",
        objectId: directOutputEnvelope.objectId,
        objectRevision: 1,
        file_name: "report.pgo.json",
        download_url: "https://objects.example/report.pgo.json",
        linked_file_id: null,
        upload_version_count: 1,
        tracking_progress_status: "document_ready",
        object_owner_id: "feed-org-1",
        owner_community_user_id: "feed-org-1",
        owner_public_profile_id: "feed-org-1",
        owner_name: "Pocket Genes",
        owner_email: "services@pocketgenes.example",
      }),
    );
    expect(storedObject).not.toHaveProperty("objectSnapshot");
    expect(Object.keys(storedObject ?? {})).not.toEqual(
      expect.arrayContaining([
        "object_type",
        "object_code",
        "downloadUrl",
        "fileName",
      ]),
    );
    expect(collectionStore("community_users").get("feed-org-1")).toEqual(
      expect.objectContaining({ owned_objects: ["uploaded-form-1", attached.object.id] }),
    );
    await expect(
      attachSupportServiceTransactionOutputObject(context, "transaction-1", {
        role: "report",
        fileName: "replacement.pgo.json",
        downloadUrl: "https://objects.example/replacement.pgo.json",
      }),
    ).rejects.toThrow("already has an attached object");
    expect(collectionStore("object_codes").size).toBe(2);
    expect(collectionStore("uploaded_objects").size).toBe(2);

    const delivered = await deliverSupportServiceTransaction(
      context,
      "transaction-1",
    );

    expect(delivered.status).toBe("delivered");
    expect(delivered.requestRevision).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(collectionStore("community_users").get("user-1")).toEqual(
      expect.objectContaining({
        requestedServiceTransactions: [
          expect.objectContaining({ status: "delivered" }),
        ],
      }),
    );
    expect(collectionStore("feed_organizations").get("feed-org-1")).toEqual(
      expect.objectContaining({
        requestedServiceTransactions: [
          expect.objectContaining({ status: "delivered" }),
        ],
      }),
    );
  });

  it("skips a colliding 9-digit object code without overwriting or orphaning records", async () => {
    const candidates = [
      987_654_321,
      123_456_789,
      123_456_790,
      123_456_791,
      123_456_792,
      123_456_793,
      123_456_794,
      123_456_795,
      123_456_796,
      123_456_797,
      123_456_798,
      123_456_799,
    ];
    mockRandomInt.mockImplementation(() => candidates.shift());
    seedDoc("service_transactions", "transaction-1", transaction);
    seedDoc("community_users", "feed-org-1", {
      owned_objects: ["uploaded-form-1"],
    });
    mockPgoDownload();
    const { attachSupportServiceTransactionOutputObject } = await import(
      "../repositories/support-services.repository.js"
    );

    const attached = await attachSupportServiceTransactionOutputObject(
      context,
      "transaction-1",
      {
        role: "report",
        fileName: "report.pgo.json",
        downloadUrl: "https://objects.example/report.pgo.json",
      },
    );

    expect(mockRandomInt).toHaveBeenCalledTimes(12);
    expect(attached.object.objectCode).toBe("123456789");
    expect(collectionStore("object_codes").get("987654321")).toEqual({
      uploaded_object_id: "uploaded-form-1",
      owner_id: "feed-org-1",
    });
    expect(collectionStore("uploaded_objects").has("pgo_output_987654321")).toBe(
      false,
    );
    expect(collectionStore("object_codes").get("123456789")).toEqual({
      uploaded_object_id: "pgo_output_123456789",
      owner_id: "feed-org-1",
    });
    expect(collectionStore("object_codes").size).toBe(2);
    expect(collectionStore("uploaded_objects").size).toBe(2);
    expect(collectionStore("community_users").get("feed-org-1")).toEqual(
      expect.objectContaining({
        owned_objects: ["uploaded-form-1", "pgo_output_123456789"],
      }),
    );
  });

  it.each([
    {
      name: "malformed JSON",
      response: () => new Response("not-json", { status: 200 }),
      expected: "valid serialized PGO JSON wrapper",
    },
    {
      name: "wrong object type",
      response: () =>
        new Response(
          JSON.stringify(serializedPgoWrapper(imageOutputEnvelope)),
          { status: 200 },
        ),
      expected: "requires pgo_pdf_report",
    },
    {
      name: "correct object type with invalid typed data",
      response: () =>
        new Response(
          JSON.stringify(
            serializedPgoWrapper({
              ...directOutputEnvelope,
              data: { title: "Incomplete report" },
            }),
          ),
          { status: 200 },
        ),
      expected: "does not match the pgo_pdf_report schema",
    },
    {
      name: "correct object type with invalid typed files",
      response: () =>
        new Response(
          JSON.stringify(
            serializedPgoWrapper({ ...directOutputEnvelope, files: [] }),
          ),
          { status: 200 },
        ),
      expected: "does not match the pgo_pdf_report schema",
    },
    {
      name: "oversized content",
      response: () =>
        new Response("{}", {
          status: 200,
          headers: { "content-length": String(6 * 1024 * 1024) },
        }),
      expected: "too large",
    },
    {
      name: "private redirect",
      response: () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/output.json" },
        }),
      expected: "URL destination is not allowed",
    },
  ])("rejects a $name output without creating records", async ({ response, expected }) => {
    seedDoc("service_transactions", "transaction-1", transaction);
    jest.mocked(fetch).mockResolvedValueOnce(response());
    const { attachSupportServiceTransactionOutputObject } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      attachSupportServiceTransactionOutputObject(context, "transaction-1", {
        role: "report",
        fileName: "report.pgo.json",
        downloadUrl: "https://objects.example/report.pgo.json",
      }),
    ).rejects.toThrow(expected);
    expect(collectionStore("object_codes").size).toBe(1);
    expect(collectionStore("uploaded_objects").size).toBe(1);
    expect(
      (collectionStore("service_transactions").get("transaction-1")?.outputObjects as unknown[]),
    ).toHaveLength(0);
  });

  it("enforces the output and delivery command boundaries", async () => {
    seedDoc("service_transactions", "transaction-1", transaction);
    const {
      deliverSupportServiceTransaction,
      updateSupportServiceTransaction,
    } = await import("../repositories/support-services.repository.js");

    await expect(
      updateSupportServiceTransaction(context, "transaction-1", {
        status: "delivered",
      }),
    ).rejects.toThrow("dedicated deliver command");
    await expect(
      updateSupportServiceTransaction(context, "transaction-1", {
        outputObjects: deliveredInput.outputObjects,
      }),
    ).rejects.toThrow("dedicated output-object command");
    seedDoc("service_transactions", "transaction-1", {
      ...transaction,
      status: "validating",
    });
    await expect(
      deliverSupportServiceTransaction(context, "transaction-1"),
    ).rejects.toThrow("Only running service transactions");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts unchanged output objects in frozen-slot order without reordering storage", async () => {
    const reportOutput = {
      role: "report",
      objectType: "pgo_pdf_report" as const,
      objectCode: "123456789",
    };
    const imagesOutput = {
      role: "images",
      objectType: "pgo_image_bundle" as const,
      objectCode: "234567890",
    };
    const twoOutputOffer = {
      ...baseOffer,
      outputSlots: [
        baseOffer.outputSlots[0],
        {
          role: "images",
          objectType: "pgo_image_bundle",
          mutationMode: "new_object",
        },
      ],
      shortContract: "form:form -> report:pdf_report + images:image_bundle",
    };
    seedDoc("service_transactions", "transaction-1", {
      ...transaction,
      outputObjects: [imagesOutput, reportOutput],
      offerSnapshot: { ...twoOutputOffer, offerId: "offer-1" },
    });
    const { updateSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    const updated = await updateSupportServiceTransaction(
      context,
      "transaction-1",
      { outputObjects: [reportOutput, imagesOutput] },
    );

    expect(updated.outputObjects).toEqual([imagesOutput, reportOutput]);
    expect(updated.requestRevision).toBe(2);
  });

  it("attaches and delivers a URL-only sequential new_revision output", async () => {
    const sourceSnapshot = {
      objectId: "obj_sequence_data_1",
      objectType: "pgo_sequence_data",
      schemaVersion: "1.0.0",
      revision: 2,
      createdAt: "2026-09-16T10:00:00.000Z",
      createdBy: "user-1",
      inputRefs: [],
      data: {
        subject_id: "subject_test_1",
        reference_id: "GRCh38",
        profile_id: "sequence_profile_v1",
        analysis_support: {
          status: "unassessed",
          evaluated_genes: [],
          supported_variant_classes: [],
          evidence: [],
          limitations: [],
        },
        sequence_role: "reference",
        sequence_count: 1,
        alphabet: "DNA",
      },
      files: [
        {
          role: "primary",
          path: "payloads/sequence.fasta",
          mediaType: "text/plain",
          sha256: "c".repeat(64),
          sizeBytes: 4096,
        },
      ],
    };
    const revisionOffer = {
      ...baseOffer,
      inputSlots: [
        ...baseOffer.inputSlots,
        {
          role: "sequence_data",
          objectType: "pgo_sequence_data",
          acceptedTypes: ["pgo_sequence_data"],
          required: true,
          cardinality: { min: 1, max: 1 },
        },
      ],
      outputSlots: [
        {
          role: "revised_sequence",
          objectType: "same_as:sequence_data",
          mutationMode: "new_revision",
          sameIdentityAsInput: "sequence_data",
        },
      ],
      shortContract:
        "form:form + sequence_data:sequence_data -> revised_sequence:same_as:sequence_data",
    };
    seedDoc("service_transactions", "transaction-1", {
      ...transaction,
      inputs: [
        ...transaction.inputs,
        {
          role: "sequence_data",
          objectRef: { objectId: sourceSnapshot.objectId, revision: 2 },
          objectType: "pgo_sequence_data",
          objectSnapshot: sourceSnapshot,
        },
      ],
      offerSnapshot: { ...revisionOffer, offerId: "offer-1" },
    });
    mockPgoDownload({
      ...sourceSnapshot,
      revision: 3,
      createdAt: "2026-09-16T12:00:00.000Z",
      createdBy: "pgp_sequence_provider",
    });
    const {
      attachSupportServiceTransactionOutputObject,
      deliverSupportServiceTransaction,
    } = await import("../repositories/support-services.repository.js");

    const attached = await attachSupportServiceTransactionOutputObject(
      context,
      "transaction-1",
      {
        role: "revised_sequence",
        fileName: "sequence-data.pgo.json",
        downloadUrl: "https://objects.example/sequence-data.pgo.json",
      },
    );
    expect(attached.object.objectType).toBe("pgo_sequence_data");
    await expect(
      deliverSupportServiceTransaction(context, "transaction-1"),
    ).resolves.toEqual(expect.objectContaining({ status: "delivered" }));
  });

  it("marks a transaction delivered only when every promised object is ready", async () => {
    seedDoc("object_codes", "123456789", {
      uploaded_object_id: "uploaded-object-1",
      owner_id: "feed-org-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      objectCode: "123456789",
      objectType: "pgo_pdf_report",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
      linked_file_id: "output-file-1",
      object_owner_id: "feed-org-1",
      owner_community_user_id: "feed-org-1",
      owner_public_profile_id: "feed-org-1",
      owner_name: "Pocket Genes",
      owner_email: "services@pocketgenes.example",
    });
    seedDoc("file_storage", "output-file-1", {
      linked_object_code: "123456789",
      file_type: "pgo_pdf_report",
      owner_community_user_id: "feed-org-1",
      file_content: JSON.stringify(
        serializedPgoWrapper({
          objectId: "obj_output_report",
          objectType: "pgo_pdf_report",
          schemaVersion: "1.0.0",
          revision: 1,
          createdAt: "2026-09-16T12:00:00.000Z",
          createdBy: "pgp_report_studio",
          inputRefs: [],
          data: {},
          files: [],
        }),
      ),
    });
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    const result = await deliverSupportServiceTransaction(context, "transaction-1");

    expect(result.status).toBe("delivered");
    expect(result.outputObjects).toEqual(deliveredInput.outputObjects);
    expect(result.outputReports).toEqual(deliveredInput.outputReports);
  });

  it("rejects delivered when output ownership provenance is incomplete", async () => {
    seedDoc("object_codes", "123456789", {
      uploaded_object_id: "uploaded-object-1",
      owner_id: "feed-org-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      objectCode: "123456789",
      objectType: "pgo_pdf_report",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
      linked_file_id: "output-file-1",
    });
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      deliverSupportServiceTransaction(context, "transaction-1"),
    ).rejects.toThrow("invalid owner relationship or provenance snapshot");
  });

  it("rejects obsolete snake-case uploaded-object identity fields", async () => {
    seedDoc("object_codes", "123456789", {
      uploaded_object_id: "uploaded-object-1",
      owner_id: "feed-org-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      object_code: "123456789",
      object_type: "pgo_pdf_report",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
      linked_file_id: "output-file-1",
      object_owner_id: "feed-org-1",
      owner_community_user_id: "feed-org-1",
      owner_public_profile_id: "feed-org-1",
      owner_name: "Pocket Genes",
      owner_email: "services@pocketgenes.example",
    });
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      deliverSupportServiceTransaction(context, "transaction-1"),
    ).rejects.toThrow(
      "Uploaded object 123456789 uses forbidden snake-case fields: object_type, object_code.",
    );
  });

  it("rejects delivered when an output code is not available", async () => {
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      deliverSupportServiceTransaction(context, "transaction-1"),
    ).rejects.toThrow("Output object code 123456789 has no uploaded object.");
  });

  it("rejects delivered when a linked output file does not exist", async () => {
    seedDoc("object_codes", "123456789", {
      uploaded_object_id: "uploaded-object-1",
      owner_id: "feed-org-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      objectCode: "123456789",
      objectType: "pgo_pdf_report",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
      linked_file_id: "missing-output-file",
      object_owner_id: "feed-org-1",
      owner_community_user_id: "feed-org-1",
      owner_public_profile_id: "feed-org-1",
      owner_name: "Pocket Genes",
      owner_email: "services@pocketgenes.example",
    });
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      deliverSupportServiceTransaction(context, "transaction-1"),
    ).rejects.toThrow("Output object 123456789 has an invalid linked file.");
  });

  it.each([
    {
      name: "malformed",
      fileContent: "not-json",
      expected:
        "Output object report stored file must contain a valid serialized PGO wrapper.",
    },
    {
      name: "wrong-type",
      fileContent: JSON.stringify(
        serializedPgoWrapper({
          objectId: "obj_output_1",
          objectType: "pgo_image_bundle",
          schemaVersion: "1.0.0",
          revision: 1,
          createdAt: "2026-09-16T12:00:00.000Z",
          createdBy: "feed-org-1",
          inputRefs: [],
          data: {},
          files: [],
        }),
      ),
      expected:
        "Output object report stored PGO wrapper must be pgo_pdf_report.",
    },
  ])("rejects a $name linked new_object PGO payload", async ({
    fileContent,
    expected,
  }) => {
    seedDoc("object_codes", "123456789", {
      uploaded_object_id: "uploaded-object-1",
      owner_id: "feed-org-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      objectCode: "123456789",
      objectType: "pgo_pdf_report",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
      linked_file_id: "output-file-1",
      object_owner_id: "feed-org-1",
      owner_community_user_id: "feed-org-1",
      owner_public_profile_id: "feed-org-1",
      owner_name: "Pocket Genes",
      owner_email: "services@pocketgenes.example",
    });
    seedDoc("file_storage", "output-file-1", {
      linked_object_code: "123456789",
      file_type: "pgo_pdf_report",
      owner_community_user_id: "feed-org-1",
      file_content: fileContent,
    });
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      deliverSupportServiceTransaction(context, "transaction-1"),
    ).rejects.toThrow(expected);
  });

  it("rejects delivered when an uploaded object has no positive version", async () => {
    seedDoc("object_codes", "123456789", {
      uploaded_object_id: "uploaded-object-1",
      owner_id: "feed-org-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      objectCode: "123456789",
      objectType: "pgo_pdf_report",
      upload_version_count: 0,
      tracking_progress_status: "document_ready",
      linked_file_id: "output-file-1",
      object_owner_id: "feed-org-1",
      owner_community_user_id: "feed-org-1",
      owner_public_profile_id: "feed-org-1",
      owner_name: "Pocket Genes",
      owner_email: "services@pocketgenes.example",
    });
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      deliverSupportServiceTransaction(context, "transaction-1"),
    ).rejects.toThrow(
      "Output object 123456789 requires a positive upload_version_count.",
    );
  });

  it("rejects delivered when an output type does not match the offer", async () => {
    seedDoc("service_transactions", "transaction-1", {
      ...transaction,
      outputObjects: [
        {
          role: "report",
          objectType: "pgo_annotated_vcf",
          objectCode: "123456789",
        },
      ],
    });
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      deliverSupportServiceTransaction(context, "transaction-1"),
    ).rejects.toThrow(
      "Output object report must be pgo_pdf_report, not pgo_annotated_vcf.",
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
        outputObjects: [{ role: "report" } as never],
      }),
    ).rejects.toThrow(
      "Output objects can only be attached through the dedicated output-object command.",
    );
  });

  it("rejects obsolete snake-case transaction result keys", async () => {
    const { updateSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      updateSupportServiceTransaction(context, "transaction-1", {
        outputObjects: [
          {
            role: "report",
            object_type: "pgo_pdf_report",
            object_code: "123456789",
          },
        ],
      } as never),
    ).rejects.toThrow(
      "Output objects can only be attached through the dedicated output-object command.",
    );
  });

  it("rejects obsolete snake-case reportCode snapshots", async () => {
    const { updateSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      updateSupportServiceTransaction(context, "transaction-1", {
        outputReports: [{ report_code: "ABC123" }],
      } as never),
    ).rejects.toThrow(
      "Output report snapshot 1 uses forbidden snake-case field: report_code.",
    );
  });

  it("delivers a form-less offer through the authoritative provider owner", async () => {
    const formLessOffer = {
      ...baseOffer,
      formShape: undefined,
      inputSlots: [],
      shortContract: "none -> report:pdf_report",
    };
    seedDoc("service_offers", "offer-1", formLessOffer);
    seedDoc("feed_organizations", "feed-org-1", {
      name: "Pocket Genes",
      status: "inactive",
      ownerCommunityUserId: "provider-owner-1",
    });
    seedDoc("object_owners", "provider-owner-1", {
      owner_name: "Pocket Genes",
      owner_contact_email: "services@pocketgenes.example",
    });
    seedDoc("community_users", "provider-owner-1", {
      owned_objects: ["uploaded-object-1"],
    });
    seedDoc("service_transactions", "transaction-1", {
      ...transaction,
      inputs: [],
      outputObjects: deliveredInput.outputObjects,
      outputReports: deliveredInput.outputReports,
      offerSnapshot: { ...formLessOffer, offerId: "offer-1" },
    });
    seedDoc("object_codes", "123456789", {
      uploaded_object_id: "uploaded-object-1",
      owner_id: "provider-owner-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      objectCode: "123456789",
      objectType: "pgo_pdf_report",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
      linked_file_id: "output-file-1",
      object_owner_id: "provider-owner-1",
      owner_community_user_id: "provider-owner-1",
      owner_public_profile_id: "provider-owner-1",
      owner_name: "Pocket Genes",
      owner_email: "services@pocketgenes.example",
    });
    seedDoc("file_storage", "output-file-1", {
      linked_object_code: "123456789",
      file_type: "pgo_pdf_report",
      owner_community_user_id: "provider-owner-1",
      file_content: JSON.stringify(
        serializedPgoWrapper({
          objectId: "obj_output_report",
          objectType: "pgo_pdf_report",
          schemaVersion: "1.0.0",
          revision: 1,
          createdAt: "2026-09-16T12:00:00.000Z",
          createdBy: "pgp_report_studio",
          inputRefs: [],
          data: {},
          files: [],
        }),
      ),
    });
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    const result = await deliverSupportServiceTransaction(context, "transaction-1");

    expect(result.status).toBe("delivered");
  });

  it.each([
    {
      name: "accepts a report-linked new_revision source with independent storage metadata",
      outputObjectId: "obj_sequence_data_1",
      rejects: false,
    },
    {
      name: "rejects a new_revision output whose stored PGO identity changed",
      outputObjectId: "obj_different_identity",
      rejects: true,
    },
  ])("$name", async ({ outputObjectId, rejects }) => {
    const sourceSnapshot = {
      objectId: "obj_sequence_data_1",
      objectType: "pgo_sequence_data",
      schemaVersion: "1.0.0",
      revision: 2,
      createdAt: "2026-09-16T10:00:00.000Z",
      createdBy: "user-1",
      inputRefs: [],
      data: { source: "sequencer" },
      files: [],
    };
    const revisionOffer = {
      ...baseOffer,
      inputSlots: [
        ...baseOffer.inputSlots,
        {
          role: "sequence_data",
          objectType: "pgo_sequence_data",
          acceptedTypes: ["pgo_sequence_data"],
          required: true,
          cardinality: { min: 1, max: 1 },
        },
      ],
      outputSlots: [
        {
          role: "revised_sequence",
          objectType: "same_as:sequence_data",
          mutationMode: "new_revision",
          sameIdentityAsInput: "sequence_data",
        },
      ],
      shortContract:
        "form:form + sequence_data:sequence_data -> revised_sequence:same_as:sequence_data",
    };
    seedDoc("service_transactions", "transaction-1", {
      ...transaction,
      inputs: [
        ...transaction.inputs,
        {
          role: "sequence_data",
          objectRef: { objectId: sourceSnapshot.objectId, revision: 2 },
          objectType: "pgo_sequence_data",
          objectCode: "111111111",
          uploadedObjectId: "source-report-upload",
          fileStorageId: "source-sequence-file",
          objectOwnerId: "feed-org-1",
          objectSnapshot: sourceSnapshot,
        },
      ],
      outputObjects: [
        {
          role: "revised_sequence",
          objectType: "pgo_sequence_data",
          objectCode: "222222222",
        },
      ],
      offerSnapshot: { ...revisionOffer, offerId: "offer-1" },
    });
    seedDoc("file_storage", "source-sequence-file", {
      linked_report_code: "REPORT-ABC123",
      file_type: "pgo_sequence_data",
      owner_community_user_id: "feed-org-1",
      file_content: JSON.stringify(serializedPgoWrapper(sourceSnapshot)),
    });
    seedDoc("object_codes", "222222222", {
      uploaded_object_id: "uploaded-object-1",
      owner_id: "feed-org-1",
    });
    seedDoc("uploaded_objects", "uploaded-object-1", {
      objectCode: "222222222",
      objectType: "pgo_sequence_data",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
      linked_file_id: "output-sequence-file",
      object_owner_id: "feed-org-1",
      owner_community_user_id: "feed-org-1",
      owner_public_profile_id: "feed-org-1",
      owner_name: "Pocket Genes",
      owner_email: "services@pocketgenes.example",
    });
    seedDoc("file_storage", "output-sequence-file", {
      linked_object_code: "222222222",
      file_type: "pgo_sequence_data",
      owner_community_user_id: "feed-org-1",
      file_content: JSON.stringify(
        serializedPgoWrapper({
          ...sourceSnapshot,
          objectId: outputObjectId,
          revision: 3,
          createdAt: "2026-09-16T12:00:00.000Z",
        }),
      ),
    });
    const { deliverSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    const update = deliverSupportServiceTransaction(context, "transaction-1");

    if (rejects) {
      await expect(update).rejects.toThrow(
        "must be the sequential next PGO revision of sequence_data with the same object identity",
      );
    } else {
      await expect(update).resolves.toEqual(
        expect.objectContaining({ status: "delivered" }),
      );
    }
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
      status: "active",
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
    expect(
      [...collectionStore("service_transaction_idempotency").values()],
    ).toEqual([
      expect.objectContaining({
        idempotencyKey: transaction.idempotencyKey,
        requestId: transaction.requestId,
      }),
    ]);
  });

  it("removes the recipient reference from an individual provider", async () => {
    const individualProvider = {
      providerKind: "individual",
      providerId: "feed-individual-1",
      providerName: "Dr. Example",
    } as const;
    seedDoc("service_offers", "offer-1", {
      ...baseOffer,
      ...individualProvider,
    });
    seedDoc("service_transactions", "transaction-1", {
      ...transaction,
      ...individualProvider,
      offerSnapshot: {
        ...transaction.offerSnapshot,
        ...individualProvider,
      },
      providerSnapshot: {
        id: "feed-individual-1",
        kind: "individual",
        name: "Dr. Example",
      },
    });
    seedDoc("feed_individuals", "feed-individual-1", {
      name: "Dr. Example",
      status: "active",
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

describe("support service canonical transaction creation", () => {
  function creationInput(requestId = "pgr_new_report_1") {
    return {
      requestId,
      offerId: "offer-1",
      serviceId: baseOffer.serviceId,
      serviceVersion: baseOffer.serviceVersion,
      providerId: baseOffer.providerId,
      providerKind: baseOffer.providerKind,
      status: "received" as const,
      requestedByUserId: "new-user",
      requestedByUserEmail: "new-user@example.com",
      requestedAtClient: "2026-09-16T12:00:00.000Z",
      requestRevision: 1,
      idempotencyKey: `${requestId}:backoffice`,
      inputs: [
        {
          role: "form",
          objectRef: { objectId: "obj_new_report_form", revision: 1 },
          objectType: "pgo_form" as const,
          objectCode: "987654321",
          uploadedObjectId: "uploaded-form-new",
          fileStorageId: "stored-form-new",
          objectOwnerId: "feed-org-1",
          objectSnapshot: {
            objectId: "obj_new_report_form",
            objectType: "pgo_form",
            schemaVersion: "1.0.0",
            revision: 1,
            createdAt: "2026-09-16T12:00:00.000Z",
            createdBy: "new-user",
            inputRefs: [],
            data: {
              form_shape_id: "pgfs_pocket_genes_1",
              form_shape_version: 2,
              form_shape: {
                id: "pgfs_pocket_genes_1",
                version: 2,
                allow_unknown_fields: false,
                fields: [
                  {
                    key: "requested_at",
                    label: "Requested at",
                    type: "datetime",
                    required: true,
                    options: [],
                  },
                  {
                    key: "requested_by",
                    label: "Requested by",
                    type: "text",
                    required: true,
                    options: [],
                  },
                ],
              },
              fields: [
                {
                  key: "requested_at",
                  value: "2026-09-16T12:00:00.000Z",
                },
                {
                  key: "requested_by",
                  value: "New User (new-user@example.com)",
                },
              ],
            },
            files: [],
          },
        },
      ],
      outputObjects: [],
      outputReports: [],
      issues: [],
      missingRequiredInputRoles: [],
      offerSnapshot: {},
      providerSnapshot: {},
      contractSource: "service_offer",
      attachmentsPending: false,
    };
  }

  beforeEach(() => {
    jest.resetModules();
    collections.clear();
    seedDoc("feed_organizations", "feed-org-1", {
      name: "Pocket Genes",
      status: "active",
      imageUrl: "https://example.com/provider.png",
      ownerCommunityUserId: "feed-org-1",
      ownerPublicProfileId: "profile-feed-org-1",
    });
    seedDoc("object_owners", "feed-org-1", {
      owner_name: "Pocket Genes",
      owner_contact_email: "services@pocketgenes.example",
    });
    seedDoc("object_codes", "987654321", {
      uploaded_object_id: "uploaded-form-new",
      owner_id: "feed-org-1",
    });
    seedDoc("uploaded_objects", "uploaded-form-new", {
      objectCode: "987654321",
      objectType: "pgo_form",
      linked_file_id: "stored-form-new",
      object_owner_id: "feed-org-1",
      owner_community_user_id: "feed-org-1",
      owner_public_profile_id: "feed-org-1",
      upload_version_count: 1,
      tracking_progress_status: "document_ready",
    });
    seedDoc("file_storage", "stored-form-new", {
      linked_object_code: "987654321",
      file_type: "pgo_form",
      owner_community_user_id: "feed-org-1",
      provider_id: "feed-org-1",
      file_content: JSON.stringify(
        serializedPgoWrapper(creationInput().inputs[0]!.objectSnapshot),
      ),
    });
    seedDoc("service_offers", "offer-1", baseOffer);
    seedDoc("community_users", "new-user", {
      token_status: {
        total_transaction_limit: 20,
        daily_transaction_limit: 5,
        cooldown_seconds: 0,
      },
      requestedServiceTransactions: [],
    });
    seedDoc("community_users", "feed-org-1", {
      owned_objects: ["uploaded-form-new", "uploaded-object-1"],
    });
  });

  it("atomically writes the canonical root and requester/provider summaries", async () => {
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    const created = await createSupportServiceTransaction(
      context,
      creationInput(),
    );

    expect(created.id).toBe("pgr_new_report_1");
    expect(created.offerSnapshot).toMatchObject({
      offerId: "offer-1",
      serviceId: baseOffer.serviceId,
      serviceVersion: baseOffer.serviceVersion,
    });
    expect(created.providerSnapshot).toEqual(
      expect.objectContaining({
        id: "feed-org-1",
        kind: "organization",
        name: "Pocket Genes",
      }),
    );
    expect(created.inputs[0]).toEqual(
      expect.objectContaining({
        objectType: "pgo_form",
        objectCode: "987654321",
        uploadedObjectId: "uploaded-form-new",
      }),
    );
    const stored = collectionStore("service_transactions").get(
      "pgr_new_report_1",
    );
    expect(stored).not.toHaveProperty("output_objects");
    expect(stored).not.toHaveProperty("output_reports");
    expect(collectionStore("community_users").get("new-user")).toMatchObject({
      requestedServiceTransactions: [
        expect.objectContaining({
          serviceTransactionId: "pgr_new_report_1",
          offerId: "offer-1",
          status: "received",
        }),
      ],
    });
    expect(collectionStore("feed_organizations").get("feed-org-1")).toMatchObject({
      requestedServiceTransactions: [
        expect.objectContaining({
          serviceTransactionId: "pgr_new_report_1",
          status: "received",
        }),
      ],
    });
  });

  it("accepts a native form created before the later transaction approval time", async () => {
    const input = creationInput();
    const formSnapshot = input.inputs[0]!.objectSnapshot;
    formSnapshot.createdAt = "2026-09-16T11:59:00.000Z";
    const formData = formSnapshot.data as {
      fields: Array<{ key: string; value: unknown }>;
    };
    formData.fields[0]!.value = "2026-09-16T11:59:00.000Z";
    seedDoc("file_storage", "stored-form-new", {
      linked_object_code: "987654321",
      file_type: "pgo_form",
      owner_community_user_id: "feed-org-1",
      provider_id: "feed-org-1",
      file_content: JSON.stringify(serializedPgoWrapper(formSnapshot)),
    });
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    const created = await createSupportServiceTransaction(context, input);

    expect(created.inputs[0]!.objectSnapshot.createdAt).toBe(
      "2026-09-16T11:59:00.000Z",
    );
  });

  it("rejects a camel-case PGO envelope at the serialized file boundary", async () => {
    seedDoc("file_storage", "stored-form-new", {
      linked_object_code: "987654321",
      file_type: "pgo_form",
      owner_community_user_id: "feed-org-1",
      provider_id: "feed-org-1",
      file_content: JSON.stringify(
        creationInput().inputs[0]!.objectSnapshot,
      ),
    });
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow(
      "Request form stored file stored-form-new does not match its object linkage.",
    );
  });

  it("returns the original transaction for an idempotent retry without duplicate summaries", async () => {
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );
    const input = creationInput();

    const first = await createSupportServiceTransaction(context, input);
    seedDoc("community_users", "new-user", {
      ...collectionStore("community_users").get("new-user"),
      token_status: {
        total_transaction_limit: 1,
        daily_transaction_limit: 1,
        cooldown_seconds: 300,
      },
    });
    const second = await createSupportServiceTransaction(context, input);

    expect(second.id).toBe(first.id);
    expect(
      (collectionStore("community_users").get("new-user")
        ?.requestedServiceTransactions as unknown[]).length,
    ).toBe(1);
    expect(
      (collectionStore("feed_organizations").get("feed-org-1")
        ?.requestedServiceTransactions as unknown[]).length,
    ).toBe(1);
  });

  it("returns an idempotent retry after the live offer is deleted", async () => {
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );
    const input = creationInput();
    const first = await createSupportServiceTransaction(context, input);
    collectionStore("service_offers").delete("offer-1");

    const second = await createSupportServiceTransaction(context, input);

    expect(second.id).toBe(first.id);
    expect(second.offerSnapshot).toEqual(first.offerSnapshot);
  });

  it("rejects reusing an idempotency key for a different request", async () => {
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );
    const original = creationInput();
    await createSupportServiceTransaction(context, original);

    await expect(
      createSupportServiceTransaction(context, {
        ...creationInput("pgr_new_report_2"),
        idempotencyKey: original.idempotencyKey,
      }),
    ).rejects.toThrow(
      "Idempotency key is already bound to a different service transaction request.",
    );
    expect(
      collectionStore("service_transactions").has("pgr_new_report_2"),
    ).toBe(false);
  });

  it("rejects changing the payload of an idempotent retry", async () => {
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );
    const original = creationInput();
    await createSupportServiceTransaction(context, original);

    await expect(
      createSupportServiceTransaction(context, {
        ...original,
        requestedByUserEmail: "different@example.com",
      }),
    ).rejects.toThrow(
      "Idempotency key is already bound to a different service transaction request.",
    );
  });

  it("keeps a tombstone so a deleted transaction cannot be recreated by retry", async () => {
    const { createSupportServiceTransaction, deleteSupportServiceTransaction } =
      await import("../repositories/support-services.repository.js");
    const input = creationInput();
    await createSupportServiceTransaction(context, input);
    await deleteSupportServiceTransaction(context, input.requestId);

    await expect(
      createSupportServiceTransaction(context, input),
    ).rejects.toThrow(
      "Idempotency key was already consumed by a deleted service transaction.",
    );
  });

  it("rejects malformed native form values", async () => {
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );
    const input = creationInput();
    const formInput = input.inputs[0]!;
    const objectSnapshot = formInput.objectSnapshot;
    const data = objectSnapshot.data as {
      fields: Array<{ key: string; value: unknown }>;
    };
    data.fields[0] = { key: "requested_at", value: "not-a-datetime" };

    await expect(
      createSupportServiceTransaction(context, input),
    ).rejects.toThrow("must be unique, declared, and match its frozen field type");
  });

  it("rejects a form whose provisioned storage chain is incomplete", async () => {
    collectionStore("file_storage").delete("stored-form-new");
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow(
      "Request form object code 987654321 has incomplete provisioned records.",
    );
  });

  it("rejects a form whose stored PGO differs from the frozen snapshot", async () => {
    seedDoc("file_storage", "stored-form-new", {
      linked_object_code: "987654321",
      file_type: "pgo_form",
      owner_community_user_id: "feed-org-1",
      provider_id: "feed-org-1",
      file_content: "{}",
    });
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow(
      "Request form stored file stored-form-new does not match its object linkage.",
    );
  });

  it("rejects a provisioned form missing from the provider owned object index", async () => {
    seedDoc("community_users", "feed-org-1", { owned_objects: [] });
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow(
      "Provider owner feed-org-1 does not index request form uploaded-form-new.",
    );
  });

  it("rejects a transaction for an inactive Discover provider", async () => {
    seedDoc("feed_organizations", "feed-org-1", {
      name: "Pocket Genes",
      status: "inactive",
      ownerCommunityUserId: "feed-org-1",
    });
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow("Selected Discover provider must be active.");
  });

  it("rejects an offer that becomes inactive inside admission", async () => {
    beforeNextTransaction = () => {
      seedDoc("service_offers", "offer-1", {
        ...baseOffer,
        status: "inactive",
      });
    };
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow(
      "Service offer changed or became inactive while the request was being admitted.",
    );
    expect(collectionStore("service_transactions").size).toBe(0);
  });

  it("rejects a provider that becomes inactive inside admission", async () => {
    beforeNextTransaction = () => {
      seedDoc("feed_organizations", "feed-org-1", {
        name: "Pocket Genes",
        status: "inactive",
        ownerCommunityUserId: "feed-org-1",
      });
    };
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow("Selected Discover provider must be active.");
    expect(collectionStore("service_transactions").size).toBe(0);
  });

  it("rejects a provider owner removed inside admission", async () => {
    beforeNextTransaction = () => {
      collectionStore("object_owners").delete("feed-org-1");
    };
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow(
      "Selected service provider has no authoritative object owner account.",
    );
    expect(collectionStore("service_transactions").size).toBe(0);
  });

  it("rejects a duplicate request ID stored under a legacy document ID", async () => {
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );
    const input = creationInput();
    await createSupportServiceTransaction(context, input);
    const stored = collectionStore("service_transactions").get(input.requestId)!;
    collectionStore("service_transactions").delete(input.requestId);
    seedDoc("service_transactions", "legacy-document-id", {
      ...stored,
      idempotencyKey: "legacy-idempotency-key",
    });
    collectionStore("service_transaction_idempotency").clear();

    await expect(
      createSupportServiceTransaction(context, {
        ...input,
        idempotencyKey: "new-idempotency-key",
      }),
    ).rejects.toThrow(
      "Request ID is already bound to another service transaction document.",
    );
  });

  it("rejects admission before writing when the requester total limit is exhausted", async () => {
    seedDoc("community_users", "new-user", {
      token_status: {
        total_transaction_limit: 0,
        daily_transaction_limit: 5,
        cooldown_seconds: 0,
      },
      requestedServiceTransactions: [],
    });
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow("token_balance_exhausted");
    expect(
      collectionStore("service_transactions").has("pgr_new_report_1"),
    ).toBe(false);
  });

  it("enforces the requester UTC daily transaction limit", async () => {
    const now = new Date();
    seedDoc("community_users", "new-user", {
      token_status: {
        total_transaction_limit: 20,
        daily_transaction_limit: 1,
        cooldown_seconds: 0,
      },
      requestedServiceTransactions: [],
    });
    seedDoc("service_transactions", "pgr_existing_daily_1", {
      requestedByUserId: "new-user",
      requestedAt: now.toISOString(),
      idempotencyKey: "different-daily-key",
    });
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow("token_daily_limit_reached");
    expect(
      collectionStore("service_transactions").has("pgr_new_report_1"),
    ).toBe(false);
  });

  it("enforces the requester cooldown from the latest root transaction", async () => {
    const now = new Date();
    seedDoc("community_users", "new-user", {
      token_status: {
        total_transaction_limit: 20,
        daily_transaction_limit: 5,
        cooldown_seconds: 300,
      },
      requestedServiceTransactions: [],
    });
    seedDoc("service_transactions", "pgr_existing_cooldown_1", {
      requestedByUserId: "new-user",
      requestedAt: now.toISOString(),
      idempotencyKey: "different-cooldown-key",
    });
    const { createSupportServiceTransaction } = await import(
      "../repositories/support-services.repository.js"
    );

    await expect(
      createSupportServiceTransaction(context, creationInput()),
    ).rejects.toThrow("token_cooldown_active");
    expect(
      collectionStore("service_transactions").has("pgr_new_report_1"),
    ).toBe(false);
  });

  it("allows an unresolved input to attach once and then keeps it immutable", async () => {
    seedDoc("service_offers", "offer-1", {
      ...baseOffer,
      inputSlots: [
        ...baseOffer.inputSlots,
        {
          role: "sequence_data",
          objectType: "pgo_sequence_data",
          acceptedTypes: ["pgo_sequence_data"],
          required: true,
          cardinality: { min: 1, max: 1 },
        },
      ],
      shortContract:
        "form:form + sequence_data:sequence_data -> report:pdf_report",
    });
    const { createSupportServiceTransaction, updateSupportServiceTransaction } =
      await import("../repositories/support-services.repository.js");
    const created = await createSupportServiceTransaction(
      context,
      creationInput(),
    );
    expect(created.missingRequiredInputRoles).toEqual(["sequence_data"]);

    const sequenceInput = {
      role: "sequence_data",
      objectRef: { objectId: "obj_sequence_data_1", revision: 1 },
      objectType: "pgo_sequence_data" as const,
      objectSnapshot: {
        objectId: "obj_sequence_data_1",
        objectType: "pgo_sequence_data",
        schemaVersion: "1.0.0",
        revision: 1,
        createdAt: "2026-09-16T11:58:00.000Z",
        createdBy: "new-user",
        inputRefs: [],
        data: { source: "requester_upload" },
        files: [],
      },
    };
    const attached = await updateSupportServiceTransaction(
      context,
      created.id,
      { inputs: [...created.inputs, sequenceInput] },
    );
    expect(attached.missingRequiredInputRoles).toEqual([]);
    expect(attached.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "sequence_data" }),
      ]),
    );

    await expect(
      updateSupportServiceTransaction(context, created.id, {
        inputs: attached.inputs.map((input) =>
          input.role === "sequence_data"
            ? {
                ...input,
                objectSnapshot: {
                  ...input.objectSnapshot,
                  data: { source: "changed_after_binding" },
                },
              }
            : input,
        ),
      }),
    ).rejects.toThrow(
      "Bound transaction input sequence_data is immutable after transaction creation.",
    );
  });

  it("updates from the frozen offer after the live offer is deleted", async () => {
    const { createSupportServiceTransaction, updateSupportServiceTransaction } =
      await import("../repositories/support-services.repository.js");
    await createSupportServiceTransaction(context, creationInput());
    collectionStore("service_offers").delete("offer-1");
    collectionStore("object_codes").delete("987654321");
    collectionStore("uploaded_objects").delete("uploaded-form-new");
    collectionStore("file_storage").delete("stored-form-new");

    const updated = await updateSupportServiceTransaction(
      context,
      "pgr_new_report_1",
      { status: "validating" },
    );

    expect(updated.status).toBe("validating");
    expect(updated.requestRevision).toBe(2);
    expect(updated.inputs[0]).toEqual(
      expect.objectContaining({
        objectCode: "987654321",
        objectSnapshot: expect.objectContaining({
          objectId: "obj_new_report_form",
        }),
      }),
    );
    expect(collectionStore("feed_organizations").get("feed-org-1")).toMatchObject({
      requestedServiceTransactions: [
        expect.objectContaining({ status: "validating" }),
      ],
    });
  });

  it("requires reasons for exception states and never reopens terminal states", async () => {
    const { createSupportServiceTransaction, updateSupportServiceTransaction } =
      await import("../repositories/support-services.repository.js");
    await createSupportServiceTransaction(context, creationInput());

    await expect(
      updateSupportServiceTransaction(context, "pgr_new_report_1", {
        status: "failed",
        issues: [],
      }),
    ).rejects.toThrow("requires at least one nonempty issue or reason");

    const cancelled = await updateSupportServiceTransaction(
      context,
      "pgr_new_report_1",
      { status: "cancelled", issues: [{ reason: "Requester withdrew" }] },
    );
    expect(cancelled.status).toBe("cancelled");

    await expect(
      updateSupportServiceTransaction(context, "pgr_new_report_1", {
        status: "cancelled",
      }),
    ).rejects.toThrow("Terminal service transactions cannot be edited");
    await expect(
      updateSupportServiceTransaction(context, "pgr_new_report_1", {
        status: "running",
      }),
    ).rejects.toThrow("Terminal service transactions cannot be edited");
  });
});
