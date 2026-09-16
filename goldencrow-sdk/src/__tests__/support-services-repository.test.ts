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

function docRef(collectionName: string, id: string) {
  return {
    id,
    async get() {
      const data = collectionStore(collectionName).get(id);
      return {
        exists: Boolean(data),
        id,
        data: () => clone(data ?? {}),
        ref: docRef(collectionName, id),
      };
    },
    async set(data: MockData) {
      collectionStore(collectionName).set(id, clone(data));
    },
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
    collection: jest.fn((name: string) => ({
      doc: jest.fn((id = `${name}-generated`) => docRef(name, id)),
    })),
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
  availability: "backoffice",
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
