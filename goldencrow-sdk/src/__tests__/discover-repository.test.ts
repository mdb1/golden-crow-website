type QueryOperation =
  | { type: "where"; field: string; operator: string; value: unknown }
  | { type: "orderBy"; field: string; direction?: string }
  | { type: "limit"; value: number }
  | { type: "startAfter"; value: unknown };

type MockDocData = Record<string, unknown>;
type MockDoc = { id: string; data: MockDocData };
type MockDocumentRef = {
  id: string;
  get: () => Promise<MockDocumentSnapshot>;
  set: (data: MockDocData) => Promise<void>;
  update: (data: MockDocData) => Promise<void>;
  delete: () => Promise<void>;
};
type MockDocumentSnapshot = {
  exists: boolean;
  id: string;
  data: () => MockDocData;
  ref: MockDocumentRef;
};

class QueryStub {
  operations: QueryOperation[] = [];

  constructor(
    private readonly collectionName: string,
    private readonly docs: MockDoc[],
    private readonly failOnGet = false,
  ) {}

  where(field: string, operator: string, value: unknown) {
    this.operations.push({ type: "where", field, operator, value });
    return this;
  }

  orderBy(field: { __fieldPath?: string } | string, direction?: string) {
    this.operations.push({
      type: "orderBy",
      field:
        typeof field === "string" ? field : (field.__fieldPath ?? "__name__"),
      direction,
    });
    return this;
  }

  limit(value: number) {
    this.operations.push({ type: "limit", value });
    return this;
  }

  startAfter(value: unknown) {
    this.operations.push({ type: "startAfter", value });
    return this;
  }

  async get() {
    if (this.failOnGet) {
      const error = new Error("The query requires an index.");
      (error as Error & { code?: string }).code = "failed-precondition";
      throw error;
    }

    let docs = this.docs;
    for (const operation of this.operations) {
      if (operation.type === "where" && operation.operator === "==") {
        docs = docs.filter(
          (doc) => doc.data[operation.field] === operation.value,
        );
      }
    }

    const limit = [...this.operations]
      .reverse()
      .find(
        (operation): operation is Extract<QueryOperation, { type: "limit" }> =>
          operation.type === "limit",
      )?.value;

    return {
      docs: docs
        .slice(0, limit)
        .map((doc) => documentSnapshotFor(doc, true, this.collectionName)),
    };
  }
}

const mockQueryStubs: QueryStub[] = [];
const mockFeedDocs: MockDoc[] = [];
const mockOrganizationDocs: MockDoc[] = [];
const mockIndividualDocs: MockDoc[] = [];
const mockProvisionPublisherPortalRoleForContext = jest.fn();
let mockGeneratedId = 0;
let failNextFeedItemsQuery = true;

const initialFeedDocs: MockDoc[] = [
  {
    id: "feed-a",
    data: {
      publisherOrganizationId: "org-1",
      publisherSnapshot: { name: "Publisher One", imageUrl: null },
      type: "news",
      status: "draft",
      title: "Draft item",
      subtitle: "Summary",
      body: "Body",
      language: "en",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    },
  },
];

const initialOrganizationDocs: MockDoc[] = [
  {
    id: "org-1",
    data: {
      name: "Publisher One",
      imageUrl: "https://example.org/publisher.png",
      status: "active",
      description: "Descripción pública",
      descriptionEn: "Public description",
      social: {
        facebook: "https://facebook.com/publisher-one",
        github: "https://github.com/publisher-one",
        email: "mailto:hello@example.org",
      },
      organizationType:
        "org_patient_advocacy_organizations,org_genetics_research_institutes",
      colorHex: "#4f46e5",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    },
  },
];

const initialIndividualDocs: MockDoc[] = [
  {
    id: "person-1",
    data: {
      name: "Dr. Publisher One",
      imageUrl: "https://example.org/individual.png",
      status: "active",
      description: "Descripción individual",
      descriptionEn: "Individual description",
      individualType: "researcher",
      colorHex: "#14b8a6",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    },
  },
];

function cloneDoc(doc: MockDoc): MockDoc {
  return {
    id: doc.id,
    data: structuredClone(doc.data),
  };
}

function collectionDocs(name: string) {
  if (name === "feed_items") {
    return mockFeedDocs;
  }
  if (name === "feed_organizations") {
    return mockOrganizationDocs;
  }
  if (name === "feed_individuals") {
    return mockIndividualDocs;
  }

  throw new Error(`Unexpected collection ${name}`);
}

function documentRefFor(collectionName: string, id: string): MockDocumentRef {
  const docs = collectionDocs(collectionName);

  return {
    id,
    get: jest.fn(async () => {
      const doc = docs.find((entry) => entry.id === id);
      return documentSnapshotFor(
        doc ?? { id, data: {} },
        Boolean(doc),
        collectionName,
      );
    }),
    set: jest.fn(async (data: MockDocData) => {
      const index = docs.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        docs[index] = { id, data };
      } else {
        docs.push({ id, data });
      }
    }),
    update: jest.fn(async (data: MockDocData) => {
      const index = docs.findIndex((entry) => entry.id === id);
      if (index < 0) {
        throw new Error(`Missing document ${collectionName}/${id}`);
      }
      docs[index] = {
        id,
        data: {
          ...docs[index]!.data,
          ...data,
        },
      };
    }),
    delete: jest.fn(async () => {
      const index = docs.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        docs.splice(index, 1);
      }
    }),
  };
}

function documentSnapshotFor(
  doc: MockDoc,
  exists: boolean,
  collectionName: string,
): MockDocumentSnapshot {
  return {
    exists,
    id: doc.id,
    data: () => doc.data,
    ref: documentRefFor(collectionName, doc.id),
  };
}

jest.mock("firebase-admin/firestore", () => ({
  FieldPath: {
    documentId: () => ({ __fieldPath: "__name__" }),
  },
  FieldValue: class FieldValueStub {
    static serverTimestamp() {
      return new Date("2026-08-05T12:00:00.000Z");
    }
  },
  Timestamp: class TimestampStub {
    constructor(private readonly date: Date) {}

    static fromMillis(value: number) {
      return new TimestampStub(new Date(value));
    }

    static fromDate(value: Date) {
      return new TimestampStub(value);
    }

    toDate() {
      return this.date;
    }
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: jest.fn((name: string) => {
      const docs = collectionDocs(name);
      const query = new QueryStub(
        name,
        docs,
        name === "feed_items" && failNextFeedItemsQuery,
      );
      if (name === "feed_items" && failNextFeedItemsQuery) {
        failNextFeedItemsQuery = false;
      }
      mockQueryStubs.push(query);
      return {
        where: query.where.bind(query),
        orderBy: query.orderBy.bind(query),
        limit: query.limit.bind(query),
        doc: jest.fn((id?: string) => {
          const documentId = id ?? `${name}-generated-${++mockGeneratedId}`;
          return documentRefFor(name, documentId);
        }),
      };
    }),
    batch: jest.fn(() => {
      const deletes: MockDocumentRef[] = [];
      return {
        delete: jest.fn((ref: MockDocumentRef) => {
          deletes.push(ref);
        }),
        commit: jest.fn(async () => {
          await Promise.all(deletes.map((ref) => ref.delete()));
        }),
      };
    }),
  })),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  provisionPublisherPortalRoleForContext:
    mockProvisionPublisherPortalRoleForContext,
}));

describe("discover repository", () => {
  beforeEach(() => {
    jest.resetModules();
    mockFeedDocs.splice(
      0,
      mockFeedDocs.length,
      ...initialFeedDocs.map(cloneDoc),
    );
    mockOrganizationDocs.splice(
      0,
      mockOrganizationDocs.length,
      ...initialOrganizationDocs.map(cloneDoc),
    );
    mockIndividualDocs.splice(
      0,
      mockIndividualDocs.length,
      ...initialIndividualDocs.map(cloneDoc),
    );
    mockQueryStubs.length = 0;
    mockProvisionPublisherPortalRoleForContext.mockReset();
    mockProvisionPublisherPortalRoleForContext.mockResolvedValue({
      email: "publisher@example.org",
      role: "organization_publisher",
      isActive: true,
      canAccessPatientPortal: false,
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
    });
    mockGeneratedId = 0;
    failNextFeedItemsQuery = true;
  });

  const fullAdminContext = {
    email: "admin@example.com",
    uid: "admin-1",
    role: "full_admin" as const,
    isBootstrap: false,
    canAccessBackoffice: true,
    canAccessPatientPortal: false,
    canAccessPGFlex: false,
    canAccessPublisherPortal: false,
    projectAccess: ["mydnamap" as const],
  };
  const godModeContext = {
    ...fullAdminContext,
    email: "god@example.com",
    uid: "god-1",
    isBootstrap: true,
  };

  it("falls back when the publisher-scoped updatedAt query needs a missing index", async () => {
    const { listDiscoverFeedItems } =
      await import("../repositories/discover.repository");
    const result = await listDiscoverFeedItems({
      email: "publisher@example.com",
      uid: "uid-1",
      role: "organization_publisher",
      organizationId: "org-1",
      isBootstrap: false,
      canAccessBackoffice: true,
      canAccessPatientPortal: false,
      canAccessPGFlex: false,
      canAccessPublisherPortal: false,
      projectAccess: ["mydnamap"],
    });

    expect(result.feedItems).toHaveLength(1);
    expect(result.feedItems[0]?.id).toBe("feed-a");
    expect(mockQueryStubs).toHaveLength(2);
    expect(mockQueryStubs[0]?.operations).toEqual([
      {
        type: "where",
        field: "publisherOrganizationId",
        operator: "==",
        value: "org-1",
      },
      { type: "orderBy", field: "updatedAt", direction: "desc" },
      { type: "orderBy", field: "__name__", direction: "desc" },
      { type: "limit", value: 21 },
    ]);
    expect(mockQueryStubs[1]?.operations).toEqual([
      {
        type: "where",
        field: "publisherOrganizationId",
        operator: "==",
        value: "org-1",
      },
      { type: "limit", value: 21 },
    ]);
  });

  it("returns Discover organization accent colors and localized descriptions", async () => {
    const { listDiscoverOrganizations } =
      await import("../repositories/discover.repository");

    const result = await listDiscoverOrganizations(fullAdminContext);

    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0]?.colorHex).toBe("#4F46E5");
    expect(result.organizations[0]?.organizationType).toBe(
      "org_patient_advocacy_organizations,org_genetics_research_institutes",
    );
    expect(result.organizations[0]?.isGeneticReportProvider).toBe(false);
    expect(result.organizations[0]?.geneticReportCategory).toBeNull();
    expect(result.organizations[0]?.social).toEqual({
      facebook: "https://facebook.com/publisher-one",
      github: "https://github.com/publisher-one",
      email: "mailto:hello@example.org",
    });
    expect(result.organizations[0]?.description).toBe("Descripción pública");
    expect(result.organizations[0]?.descriptionEn).toBe("Public description");
  });

  it("returns Discover individual publishers", async () => {
    const { listDiscoverIndividuals } =
      await import("../repositories/discover.repository");

    const result = await listDiscoverIndividuals(fullAdminContext);

    expect(result.individuals).toHaveLength(1);
    expect(result.individuals[0]?.colorHex).toBe("#14B8A6");
    expect(result.individuals[0]?.individualType).toBe(
      "pro_research_scientists",
    );
    expect(result.individuals[0]?.description).toBe("Descripción individual");
    expect(result.individuals[0]?.descriptionEn).toBe("Individual description");
  });

  it("requires god mode to hard delete Discover publishers", async () => {
    const { deleteDiscoverOrganization, deleteDiscoverIndividual } =
      await import("../repositories/discover.repository");

    await expect(
      deleteDiscoverOrganization(fullAdminContext, "org-1"),
    ).rejects.toThrow("God mode is required to delete Discover publishers.");
    await expect(
      deleteDiscoverIndividual(fullAdminContext, "person-1"),
    ).rejects.toThrow("God mode is required to delete Discover publishers.");
    expect(mockOrganizationDocs.some((doc) => doc.id === "org-1")).toBe(true);
    expect(mockIndividualDocs.some((doc) => doc.id === "person-1")).toBe(true);
  });

  it("hard deletes an organization and its linked Discover feed entries", async () => {
    failNextFeedItemsQuery = false;
    mockFeedDocs.push(
      {
        id: "feed-org-linked",
        data: {
          publisherOrganizationId: "org-1",
          publisherSnapshot: { name: "Publisher One", imageUrl: null },
          type: "news",
          status: "draft",
          title: "Second org item",
          subtitle: "Summary",
          body: "Body",
          language: "en",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-02T00:00:00.000Z",
        },
      },
      {
        id: "feed-individual-linked",
        data: {
          publisherIndividualId: "person-1",
          publisherSnapshot: { name: "Dr. Publisher One", imageUrl: null },
          type: "news",
          status: "draft",
          title: "Individual item",
          subtitle: "Summary",
          body: "Body",
          language: "en",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-02T00:00:00.000Z",
        },
      },
    );
    const { deleteDiscoverOrganization } =
      await import("../repositories/discover.repository");

    const result = await deleteDiscoverOrganization(godModeContext, "org-1");

    expect(result).toEqual({
      deleted: true,
      organizationId: "org-1",
      deletedFeedItemCount: 2,
    });
    expect(mockOrganizationDocs.some((doc) => doc.id === "org-1")).toBe(false);
    expect(mockIndividualDocs.some((doc) => doc.id === "person-1")).toBe(true);
    expect(mockFeedDocs.map((doc) => doc.id)).toEqual([
      "feed-individual-linked",
    ]);
  });

  it("hard deletes an individual publisher and its linked Discover feed entries", async () => {
    failNextFeedItemsQuery = false;
    mockFeedDocs.push({
      id: "feed-person-linked",
      data: {
        publisherIndividualId: "person-1",
        publisherSnapshot: { name: "Dr. Publisher One", imageUrl: null },
        type: "news",
        status: "draft",
        title: "Individual item",
        subtitle: "Summary",
        body: "Body",
        language: "en",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    });
    const { deleteDiscoverIndividual } =
      await import("../repositories/discover.repository");

    const result = await deleteDiscoverIndividual(godModeContext, "person-1");

    expect(result).toEqual({
      deleted: true,
      individualId: "person-1",
      deletedFeedItemCount: 1,
    });
    expect(mockIndividualDocs.some((doc) => doc.id === "person-1")).toBe(false);
    expect(mockOrganizationDocs.some((doc) => doc.id === "org-1")).toBe(true);
    expect(mockFeedDocs.map((doc) => doc.id)).toEqual(["feed-a"]);
  });

  it("approves an organization submission by activating it and provisioning portal access", async () => {
    const { evaluateDiscoverOrganizationSubmission } =
      await import("../repositories/discover.repository");
    const stored = mockOrganizationDocs.find((doc) => doc.id === "org-1");
    stored!.data.status = "pending_approval";
    stored!.data.contactEmail = "approval@example.org";

    const result = await evaluateDiscoverOrganizationSubmission(
      fullAdminContext,
      "org-1",
      "approve",
    );

    expect(mockProvisionPublisherPortalRoleForContext).toHaveBeenCalledWith(
      fullAdminContext,
      {
        kind: "organization",
        publisherId: "org-1",
        displayName: "Publisher One",
        contactEmail: "approval@example.org",
      },
    );
    const nextStored = mockOrganizationDocs.find((doc) => doc.id === "org-1");
    expect(result.organization.status).toBe("active");
    expect(nextStored?.data.status).toBe("active");
    expect(nextStored?.data.updatedByUserId).toBe("admin-1");
  });

  it("rejects an individual submission by archiving it without provisioning portal access", async () => {
    const { evaluateDiscoverIndividualSubmission } =
      await import("../repositories/discover.repository");
    const stored = mockIndividualDocs.find((doc) => doc.id === "person-1");
    stored!.data.status = "pending_approval";
    stored!.data.contactEmail = "individual@example.org";

    const result = await evaluateDiscoverIndividualSubmission(
      fullAdminContext,
      "person-1",
      "reject",
    );

    expect(mockProvisionPublisherPortalRoleForContext).not.toHaveBeenCalled();
    const nextStored = mockIndividualDocs.find((doc) => doc.id === "person-1");
    expect(result.individual.status).toBe("archived");
    expect(nextStored?.data.status).toBe("archived");
    expect(nextStored?.data.updatedByUserId).toBe("admin-1");
  });

  it("generates organization slugs from names instead of manual input", async () => {
    const { createDiscoverOrganization } =
      await import("../repositories/discover.repository");
    const social = {
      twitter: "https://x.com/fundacion",
      instagram: "https://instagram.com/fundacion",
      tiktok: "https://tiktok.com/@fundacion",
      youtube: "https://youtube.com/@fundacion",
      linkedin: "https://linkedin.com/in/fundacion",
      github: "https://github.com/fundacion",
      gitlab: "https://gitlab.com/fundacion",
      stack_overflow: "https://stackoverflow.com/users/123/fundacion",
      hugging_face: "https://huggingface.co/fundacion",
      kaggle: "https://kaggle.com/fundacion",
      researchgate: "https://researchgate.net/profile/fundacion",
      orcid: "https://orcid.org/0000-0001-2345-6789",
      google_scholar: "https://scholar.google.com/citations?user=fundacion",
      pubmed: "https://pubmed.ncbi.nlm.nih.gov/?term=fundacion",
      scopus: "https://scopus.com/authid/detail.uri?authorId=123",
      web_of_science: "https://webofscience.com/wos/author/record/123",
      biostars: "https://biostars.org/u/fundacion",
      protocols_io: "https://protocols.io/researchers/fundacion",
      osf: "https://osf.io/fundacion",
      zenodo: "https://zenodo.org/communities/fundacion",
      whatsapp: "https://wa.me/5491112345678",
      telegram: "https://t.me/fundacion",
      threads: "https://threads.net/@fundacion",
      pinterest: "https://pinterest.com/fundacion",
      snapchat: "https://snapchat.com/add/fundacion",
      reddit: "https://reddit.com/u/fundacion",
      discord: "https://discord.gg/fundacion",
      twitch: "https://twitch.tv/fundacion",
      bluesky: "https://bsky.app/profile/fundacion.bsky.social",
      mastodon: "https://mastodon.social/@fundacion",
      email: "info@example.org",
      other: "https://example.org/social",
    };
    const expectedSocial = {
      ...social,
      email: "mailto:info@example.org",
    };

    const organization = await createDiscoverOrganization(fullAdminContext, {
      name: "Fundación Médica Ñandú",
      imageUrl: "https://example.org/publisher.png",
      websiteUrl: "http://example.org",
      description: "Descripción en español",
      descriptionEn: "English description",
      social,
      countryCode: "ar, us, ar",
      organizationType:
        "org_patient_advocacy_organizations,org_genetics_research_institutes",
      status: "pending_approval",
      isGeneticReportProvider: true,
      geneticReportCategory: "grc_reproductive,grc_full_genome",
      slug: "manual-slug",
    } as Record<string, unknown>);
    const stored = mockOrganizationDocs.find(
      (doc) => doc.id === organization.id,
    );

    expect(organization.slug).toBe("fundacion-medica-nandu");
    expect(organization.description).toBe("Descripción en español");
    expect(organization.descriptionEn).toBe("English description");
    expect(organization.websiteUrl).toBe("http://example.org/");
    expect(organization.social).toEqual(expectedSocial);
    expect(organization.countryCode).toBe("AR,US");
    expect(organization.organizationType).toBe(
      "org_patient_advocacy_organizations,org_genetics_research_institutes",
    );
    expect(organization.status).toBe("pending_approval");
    expect(organization.isGeneticReportProvider).toBe(true);
    expect(organization.geneticReportCategory).toBe(
      "grc_reproductive,grc_full_genome",
    );
    expect(stored?.data.slug).toBe("fundacion-medica-nandu");
    expect(stored?.data.description).toBe("Descripción en español");
    expect(stored?.data.descriptionEn).toBe("English description");
    expect(stored?.data.websiteUrl).toBe("http://example.org/");
    expect(stored?.data.social).toEqual(expectedSocial);
    expect(stored?.data.countryCode).toBe("AR,US");
    expect(stored?.data.organizationType).toBe(
      "org_patient_advocacy_organizations,org_genetics_research_institutes",
    );
    expect(stored?.data.status).toBe("pending_approval");
    expect(stored?.data.isGeneticReportProvider).toBe(true);
    expect(stored?.data.geneticReportCategory).toBe(
      "grc_reproductive,grc_full_genome",
    );
  });

  it("requires image URLs when creating publishers", async () => {
    const { createDiscoverOrganization, createDiscoverIndividual } =
      await import("../repositories/discover.repository");

    await expect(
      createDiscoverOrganization(fullAdminContext, {
        name: "Missing image",
      } as Record<string, unknown>),
    ).rejects.toThrow("Organization image URL is required.");

    await expect(
      createDiscoverIndividual(fullAdminContext, {
        name: "Missing image",
      } as Record<string, unknown>),
    ).rejects.toThrow("Individual publisher image URL is required.");
  });

  it("preserves uploaded organization logos when updating without an image URL", async () => {
    const { updateDiscoverOrganization } =
      await import("../repositories/discover.repository");
    mockOrganizationDocs.push({
      id: "uploaded-org",
      data: {
        name: "Uploaded Logo Lab",
        imageUrl: null,
        imageUploadDataUrl: "data:image/png;base64,iVBORw0KGgo=",
        imageUploadName: "wizard-logo.png",
        imageUploadMimeType: "image/png",
        status: "pending_approval",
        countryCode: "AR",
        organizationType: "org_genetic_testing_laboratories",
        verified: false,
        isGeneticReportProvider: true,
        geneticReportCategory: "grc_full_genome",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    });

    const result = await updateDiscoverOrganization(
      fullAdminContext,
      "uploaded-org",
      {
        name: "Uploaded Logo Lab Updated",
        imageUrl: null,
        status: "pending_approval",
        countryCode: "AR",
        organizationType: "org_genetic_testing_laboratories",
        verified: false,
        isGeneticReportProvider: true,
        geneticReportCategory: "grc_full_genome",
      } as Record<string, unknown>,
    );
    const stored = mockOrganizationDocs.find(
      (doc) => doc.id === "uploaded-org",
    );

    expect(result.imageUrl).toBeNull();
    expect(result.imageUploadDataUrl).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(result.imageUploadName).toBe("wizard-logo.png");
    expect(result.imageUploadMimeType).toBe("image/png");
    expect(stored?.data.imageUploadDataUrl).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
  });

  it("creates public organization approval requests with pending defaults", async () => {
    const { createDiscoverPublisherApprovalRequest } =
      await import("../repositories/discover.repository");

    const result = await createDiscoverPublisherApprovalRequest({
      kind: "organization",
      name: "Wizard Genetics Lab",
      descriptionEn: "Genetic report support for families.",
      contactEmail: "JOIN@EXAMPLE.ORG",
      websiteUrl: "https://example.org",
      imageUploadDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      imageUploadName: "wizard-logo.png",
      imageUploadMimeType: "image/png",
      countryCode: "ar, us",
      organizationType: "org_genetic_testing_laboratories",
      colorHex: "#6f3cc3",
      social: {
        linkedin: "https://linkedin.com/company/wizard-genetics",
      },
      isGeneticReportProvider: true,
      geneticReportCategory: "grc_full_genome,grc_rare_diseases",
    });
    const stored = mockOrganizationDocs.find(
      (doc) => doc.id === result.publisher.id,
    );

    expect(result.kind).toBe("organization");
    expect(result.publisher.status).toBe("pending_approval");
    expect(result.publisher.imageUrl).toBeNull();
    expect(result.publisher.imageUploadDataUrl).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(result.publisher.imageUploadName).toBe("wizard-logo.png");
    expect(result.publisher.imageUploadMimeType).toBe("image/png");
    expect(result.publisher.verified).toBe(false);
    expect(result.publisher.contactEmail).toBe("join@example.org");
    expect(stored?.data.status).toBe("pending_approval");
    expect(stored?.data.verified).toBe(false);
    expect(stored?.data.isGeneticReportProvider).toBe(true);
    expect(stored?.data.geneticReportCategory).toBe(
      "grc_full_genome,grc_rare_diseases",
    );
    expect(stored?.data.isRequestedThroughWebWizard).toBe(true);
    expect(stored?.data).toHaveProperty("approvalRequestDate");
    expect(stored?.data.createdByUserId).toBe("public-web-wizard");
    expect(stored?.data.updatedByUserId).toBe("public-web-wizard");
    expect(stored?.data.countryCode).toBe("AR,US");
    expect(stored?.data.organizationType).toBe(
      "org_genetic_testing_laboratories",
    );
    expect(stored?.data.contactEmail).toBe("join@example.org");
    expect(stored?.data.colorHex).toBe("#6F3CC3");
    expect(stored?.data.imageUploadDataUrl).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(stored?.data.imageUploadName).toBe("wizard-logo.png");
    expect(stored?.data.imageUploadMimeType).toBe("image/png");
  });

  it("creates public individual approval requests without organization-only report fields", async () => {
    const { createDiscoverPublisherApprovalRequest } =
      await import("../repositories/discover.repository");

    const result = await createDiscoverPublisherApprovalRequest({
      kind: "individual",
      name: "Dr. Wizard",
      description: "Acompañamiento en genética clínica.",
      descriptionEn: "Clinical genetics support.",
      contactEmail: "dr@example.org",
      countryCode: "global",
      individualType: "pro_clinical_geneticists,pro_genetic_counselors",
      imageUrl: "https://example.org/dr-wizard.png",
      colorHex: "14b8a6",
      isGeneticReportProvider: true,
      geneticReportCategory: "grc_other",
    });
    const stored = mockIndividualDocs.find(
      (doc) => doc.id === result.publisher.id,
    );

    expect(result.kind).toBe("individual");
    expect(result.publisher.status).toBe("pending_approval");
    expect(result.publisher.imageUrl).toBe("https://example.org/dr-wizard.png");
    expect(result.publisher.verified).toBe(false);
    expect(stored?.data.isRequestedThroughWebWizard).toBe(true);
    expect(stored?.data.countryCode).toBe("GLOBAL");
    expect(stored?.data.individualType).toBe(
      "pro_clinical_geneticists,pro_genetic_counselors",
    );
    expect(stored?.data.isGeneticReportProvider).toBeUndefined();
    expect(stored?.data.geneticReportCategory).toBeUndefined();
  });

  it("accepts the expanded fixed professional category keys for individuals", async () => {
    const { createDiscoverIndividual } =
      await import("../repositories/discover.repository");
    const expandedCategories = [
      "pro_project_managers",
      "pro_startup_founders",
      "pro_app_developers",
      "pro_entrepreneurs",
      "pro_software_engineers",
    ].join(",");

    const individual = await createDiscoverIndividual(fullAdminContext, {
      name: "Expanded category professional",
      imageUrl: "https://example.org/expanded-professional.png",
      individualType: expandedCategories,
    } as Record<string, unknown>);
    const stored = mockIndividualDocs.find((doc) => doc.id === individual.id);

    expect(individual.individualType).toBe(expandedCategories);
    expect(stored?.data.individualType).toBe(expandedCategories);
  });

  it("rejects publisher category keys outside the fixed provider lists", async () => {
    const { createDiscoverOrganization, createDiscoverIndividual } =
      await import("../repositories/discover.repository");

    await expect(
      createDiscoverOrganization(fullAdminContext, {
        name: "Invalid organization",
        imageUrl: "https://example.org/invalid-organization.png",
        organizationType: "org_patient_advocacy_organizations,pro_physicians",
      } as Record<string, unknown>),
    ).rejects.toThrow(
      "Organization category contains invalid keys: pro_physicians",
    );

    await expect(
      createDiscoverIndividual(fullAdminContext, {
        name: "Invalid individual",
        imageUrl: "https://example.org/invalid-individual.png",
        individualType: "pro_physicians,org_universities",
      } as Record<string, unknown>),
    ).rejects.toThrow(
      "Individual publisher category contains invalid keys: org_universities",
    );
  });

  it("rejects organization genetic report categories outside the fixed list", async () => {
    const { createDiscoverOrganization } =
      await import("../repositories/discover.repository");

    await expect(
      createDiscoverOrganization(fullAdminContext, {
        name: "Invalid report provider",
        imageUrl: "https://example.org/invalid-provider.png",
        geneticReportCategory: "raw_vcf",
      } as Record<string, unknown>),
    ).rejects.toThrow("Use valid genetic report categories.");
  });

  it("creates upcoming events with the compact event payload", async () => {
    const { createDiscoverFeedItem } =
      await import("../repositories/discover.repository");

    const feedItem = await createDiscoverFeedItem(fullAdminContext, {
      publisherOrganizationId: "org-1",
      type: "upcoming_event",
      status: "published",
      publishedAt: "2026-08-05T10:00:00.000Z",
      language: "en",
      title: "Rare disease genomics webinar",
      subtitle: "A practical session for families and clinicians.",
      body: "Plain text event details.",
      sourceUrl: "https://example.org/events/register",
      sourceButtonText: "Register now",
      upcoming_event: {
        date: "2026-09-04T18:00:00.000Z",
        maxAttendance: 250,
      },
    });

    const stored = mockFeedDocs.find((doc) => doc.id === feedItem.id)?.data;
    const payload = stored?.upcoming_event as Record<string, unknown>;

    expect(payload.date).toBeDefined();
    expect(payload.startsAt).toBeDefined();
    expect(payload.location).toBeNull();
    expect(payload.maxAttendance).toBe(250);
    expect(payload.sourceUrl).toBeUndefined();
    expect(payload.sourceButtonText).toBeUndefined();
    expect(feedItem.sourceButtonText).toBe("Register now");
    expect(stored?.sourceUrl).toBe("https://example.org/events/register");
    expect(stored?.sourceUrl).toBe("https://example.org/events/register");
    expect(stored?.sourceButtonText).toBe("Register now");
    expect(stored?.sourceButtonText).toBe("Register now");
  });

  it("creates feed entries for every supported Discover type", async () => {
    const { createDiscoverFeedItem } =
      await import("../repositories/discover.repository");

    const feedItem = await createDiscoverFeedItem(fullAdminContext, {
      publisherOrganizationId: "org-1",
      type: "clinical_trial",
      status: "published",
      publishedAt: "2026-08-05T10:00:00.000Z",
      language: "en",
      title: "Clinical trial recruiting for a rare condition",
      subtitle: "Families can review eligibility on the sponsor site.",
      body: "Plain text details for the trial.",
      sourceUrl: "https://example.org/trials/abc",
      clinical_trial: {
        trialIdentifier: "NCT00000000",
        phase: "Phase 2",
        recruitmentStatus: "Recruiting",
        conditions: ["Pompe disease", "Glycogen storage disease"],
        countries: ["US", "AR"],
        sponsor: "Genome Research Institute",
      },
    });

    const stored = mockFeedDocs.find((doc) => doc.id === feedItem.id)?.data;
    const payload = stored?.clinical_trial as Record<string, unknown>;

    expect(feedItem.type).toBe("clinical_trial");
    expect(payload.trialIdentifier).toBe("NCT00000000");
    expect(payload.conditions).toEqual([
      "Pompe disease",
      "Glycogen storage disease",
    ]);
    expect(payload.countries).toEqual(["US", "AR"]);
    expect(stored?.news).toBeUndefined();
    expect(stored?.opportunity).toBeUndefined();
  });

  it("creates feed entries for individual publishers", async () => {
    const { createDiscoverFeedItem } =
      await import("../repositories/discover.repository");

    const feedItem = await createDiscoverFeedItem(fullAdminContext, {
      publisherIndividualId: "person-1",
      type: "news",
      status: "published",
      publishedAt: "2026-08-05T10:00:00.000Z",
      language: "en",
      title: "Individual publisher update",
      subtitle: "A concise update.",
      body: "Plain text details.",
      news: {
        category: "Research",
        region: "ARG",
      },
    });

    const stored = mockFeedDocs.find((doc) => doc.id === feedItem.id)?.data;

    expect(feedItem.publisherOrganizationId).toBeNull();
    expect(feedItem.publisherIndividualId).toBe("person-1");
    expect(feedItem.publisherSnapshot.name).toBe("Dr. Publisher One");
    expect(stored?.publisherOrganizationId).toBeNull();
    expect(stored?.publisherIndividualId).toBe("person-1");
  });
});
