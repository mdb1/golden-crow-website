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
      field: typeof field === "string" ? field : (field.__fieldPath ?? "__name__"),
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
      color_hex: "#4f46e5",
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

function documentSnapshotFor(doc: MockDoc, exists: boolean): MockDocumentSnapshot {
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
    mockFeedDocs.splice(0, mockFeedDocs.length, ...initialFeedDocs.map(cloneDoc));
    mockOrganizationDocs.splice(
      0,
      mockOrganizationDocs.length,
      ...initialOrganizationDocs.map(cloneDoc),
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
    projectAccess: ["mydnamap" as const],
  };

  it("falls back when the publisher-scoped updatedAt query needs a missing index", async () => {
    const { listDiscoverFeedItems } = await import("../repositories/discover.repository");
    const result = await listDiscoverFeedItems({
      email: "publisher@example.com",
      uid: "uid-1",
      role: "organization_publisher",
      organizationId: "org-1",
      isBootstrap: false,
      canAccessBackoffice: true,
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

  it("returns Discover organization accent colors with the app-facing key", async () => {
    const { listDiscoverOrganizations } = await import("../repositories/discover.repository");

    const result = await listDiscoverOrganizations(fullAdminContext);

    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0]?.color_hex).toBe("#4F46E5");
  });

  it("creates upcoming events with the virtual meeting link the app reads", async () => {
    const { createDiscoverFeedItem } = await import("../repositories/discover.repository");

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
      upcoming_event: {
        date: "2026-09-04T18:00:00.000Z",
        location: "Online",
        max_attendance: 250,
        virtual_meeting_link: "https://meet.example.org/rare-disease-webinar",
      },
    });

    const stored = mockFeedDocs.find((doc) => doc.id === feedItem.id)?.data;
    const payload = stored?.upcoming_event as Record<string, unknown>;

    expect(feedItem.upcoming_event?.virtual_meeting_link).toBe(
      "https://meet.example.org/rare-disease-webinar",
    );
    expect(payload.virtual_meeting_link).toBe(
      "https://meet.example.org/rare-disease-webinar",
    );
    expect(payload.date).toBeDefined();
    expect(payload.location).toBe("Online");
    expect(payload.max_attendance).toBe(250);
    expect(payload.source_url).toBeUndefined();
    expect(stored?.source_url).toBe("https://example.org/events/register");
    expect(stored?.sourceUrl).toBe("https://example.org/events/register");
  });
});
