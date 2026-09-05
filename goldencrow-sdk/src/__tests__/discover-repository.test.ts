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

    return {
      docs: this.docs.map((doc) => documentSnapshotFor(doc, true)),
    };
  }
}

const mockQueryStubs: QueryStub[] = [];
const mockFeedDocs: MockDoc[] = [];
const mockOrganizationDocs: MockDoc[] = [];
const mockIndividualDocs: MockDoc[] = [];
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
      description_en: "Public description",
      social: {
        facebook: "https://facebook.com/publisher-one",
        github: "https://github.com/publisher-one",
        email: "mailto:hello@example.org",
      },
      organizationType:
        "org_patient_advocacy_organizations,org_genetics_research_institutes",
      color_hex: "#4f46e5",
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
      description_en: "Individual description",
      individualType: "researcher",
      color_hex: "#14b8a6",
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
      return documentSnapshotFor(doc ?? { id, data: {} }, Boolean(doc));
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
): MockDocumentSnapshot {
  return {
    exists,
    id: doc.id,
    data: () => doc.data,
    ref: documentRefFor("feed_items", doc.id),
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
  })),
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
    projectAccess: ["mydnamap" as const],
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
    expect(result.organizations[0]?.color_hex).toBe("#4F46E5");
    expect(result.organizations[0]?.organizationType).toBe(
      "org_patient_advocacy_organizations,org_genetics_research_institutes",
    );
    expect(result.organizations[0]?.is_genetic_report_provider).toBe(false);
    expect(result.organizations[0]?.genetic_report_category).toBeNull();
    expect(result.organizations[0]?.social).toEqual({
      facebook: "https://facebook.com/publisher-one",
      github: "https://github.com/publisher-one",
      email: "mailto:hello@example.org",
    });
    expect(result.organizations[0]?.description).toBe("Descripción pública");
    expect(result.organizations[0]?.description_en).toBe("Public description");
  });

  it("returns Discover individual publishers", async () => {
    const { listDiscoverIndividuals } =
      await import("../repositories/discover.repository");

    const result = await listDiscoverIndividuals(fullAdminContext);

    expect(result.individuals).toHaveLength(1);
    expect(result.individuals[0]?.color_hex).toBe("#14B8A6");
    expect(result.individuals[0]?.individualType).toBe(
      "pro_research_scientists",
    );
    expect(result.individuals[0]?.description).toBe("Descripción individual");
    expect(result.individuals[0]?.description_en).toBe(
      "Individual description",
    );
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
      description_en: "English description",
      social,
      countryCode: "ar, us, ar",
      organizationType:
        "org_patient_advocacy_organizations,org_genetics_research_institutes",
      status: "pending_approval",
      is_genetic_report_provider: true,
      genetic_report_category: "reproductive",
      slug: "manual-slug",
    } as Record<string, unknown>);
    const stored = mockOrganizationDocs.find(
      (doc) => doc.id === organization.id,
    );

    expect(organization.slug).toBe("fundacion-medica-nandu");
    expect(organization.description).toBe("Descripción en español");
    expect(organization.description_en).toBe("English description");
    expect(organization.websiteUrl).toBe("http://example.org/");
    expect(organization.social).toEqual(expectedSocial);
    expect(organization.countryCode).toBe("AR,US");
    expect(organization.organizationType).toBe(
      "org_patient_advocacy_organizations,org_genetics_research_institutes",
    );
    expect(organization.status).toBe("pending_approval");
    expect(organization.is_genetic_report_provider).toBe(true);
    expect(organization.genetic_report_category).toBe("reproductive");
    expect(stored?.data.slug).toBe("fundacion-medica-nandu");
    expect(stored?.data.description).toBe("Descripción en español");
    expect(stored?.data.description_en).toBe("English description");
    expect(stored?.data.websiteUrl).toBe("http://example.org/");
    expect(stored?.data.social).toEqual(expectedSocial);
    expect(stored?.data.countryCode).toBe("AR,US");
    expect(stored?.data.organizationType).toBe(
      "org_patient_advocacy_organizations,org_genetics_research_institutes",
    );
    expect(stored?.data.status).toBe("pending_approval");
    expect(stored?.data.is_genetic_report_provider).toBe(true);
    expect(stored?.data.genetic_report_category).toBe("reproductive");
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

  it("creates public organization approval requests with pending defaults", async () => {
    const { createDiscoverPublisherApprovalRequest } =
      await import("../repositories/discover.repository");

    const result = await createDiscoverPublisherApprovalRequest({
      kind: "organization",
      name: "Wizard Genetics Lab",
      description_en: "Genetic report support for families.",
      contactEmail: "JOIN@EXAMPLE.ORG",
      websiteUrl: "https://example.org",
      countryCode: "ar, us",
      organizationType: "org_genetic_testing_laboratories",
      color_hex: "#6f3cc3",
      social: {
        linkedin: "https://linkedin.com/company/wizard-genetics",
      },
      is_genetic_report_provider: true,
      genetic_report_category: "full_genome",
    });
    const stored = mockOrganizationDocs.find(
      (doc) => doc.id === result.publisher.id,
    );

    expect(result.kind).toBe("organization");
    expect(result.publisher.status).toBe("pending_approval");
    expect(result.publisher.imageUrl).toBeNull();
    expect(result.publisher.verified).toBe(false);
    expect(result.publisher.contactEmail).toBe("join@example.org");
    expect(stored?.data.status).toBe("pending_approval");
    expect(stored?.data.verified).toBe(false);
    expect(stored?.data.is_genetic_report_provider).toBe(true);
    expect(stored?.data.genetic_report_category).toBe("full_genome");
    expect(stored?.data.is_requested_through_web_wizard).toBe(true);
    expect(stored?.data).toHaveProperty("approval_request_date");
    expect(stored?.data.createdByUserId).toBe("public-web-wizard");
    expect(stored?.data.updatedByUserId).toBe("public-web-wizard");
    expect(stored?.data.countryCode).toBe("AR,US");
    expect(stored?.data.organizationType).toBe(
      "org_genetic_testing_laboratories",
    );
    expect(stored?.data.contactEmail).toBe("join@example.org");
    expect(stored?.data.color_hex).toBe("#6F3CC3");
  });

  it("creates public individual approval requests without organization-only report fields", async () => {
    const { createDiscoverPublisherApprovalRequest } =
      await import("../repositories/discover.repository");

    const result = await createDiscoverPublisherApprovalRequest({
      kind: "individual",
      name: "Dr. Wizard",
      description: "Acompañamiento en genética clínica.",
      description_en: "Clinical genetics support.",
      contactEmail: "dr@example.org",
      countryCode: "global",
      individualType: "pro_clinical_geneticists,pro_genetic_counselors",
      imageUrl: "https://example.org/dr-wizard.png",
      colorHex: "14b8a6",
      is_genetic_report_provider: true,
      genetic_report_category: "raw_vcf",
    });
    const stored = mockIndividualDocs.find((doc) => doc.id === result.publisher.id);

    expect(result.kind).toBe("individual");
    expect(result.publisher.status).toBe("pending_approval");
    expect(result.publisher.imageUrl).toBe("https://example.org/dr-wizard.png");
    expect(result.publisher.verified).toBe(false);
    expect(stored?.data.is_requested_through_web_wizard).toBe(true);
    expect(stored?.data.countryCode).toBe("GLOBAL");
    expect(stored?.data.individualType).toBe(
      "pro_clinical_geneticists,pro_genetic_counselors",
    );
    expect(stored?.data.is_genetic_report_provider).toBeUndefined();
    expect(stored?.data.genetic_report_category).toBeUndefined();
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
        genetic_report_category: "fertility",
      } as Record<string, unknown>),
    ).rejects.toThrow("Use a valid genetic report category.");
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
      source_url: "https://example.org/events/register",
      source_button_text: "Register now",
      upcoming_event: {
        date: "2026-09-04T18:00:00.000Z",
        max_attendance: 250,
      },
    });

    const stored = mockFeedDocs.find((doc) => doc.id === feedItem.id)?.data;
    const payload = stored?.upcoming_event as Record<string, unknown>;

    expect(payload.date).toBeDefined();
    expect(payload.startsAt).toBeDefined();
    expect(payload.location).toBeNull();
    expect(payload.max_attendance).toBe(250);
    expect(payload.source_url).toBeUndefined();
    expect(payload.source_button_text).toBeUndefined();
    expect(feedItem.source_button_text).toBe("Register now");
    expect(stored?.source_url).toBe("https://example.org/events/register");
    expect(stored?.sourceUrl).toBe("https://example.org/events/register");
    expect(stored?.source_button_text).toBe("Register now");
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
      source_url: "https://example.org/trials/abc",
      clinical_trial: {
        trial_identifier: "NCT00000000",
        phase: "Phase 2",
        recruitment_status: "Recruiting",
        conditions: ["Pompe disease", "Glycogen storage disease"],
        countries: ["US", "AR"],
        sponsor: "Genome Research Institute",
      },
    });

    const stored = mockFeedDocs.find((doc) => doc.id === feedItem.id)?.data;
    const payload = stored?.clinical_trial as Record<string, unknown>;

    expect(feedItem.type).toBe("clinical_trial");
    expect(payload.trial_identifier).toBe("NCT00000000");
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
