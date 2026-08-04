type QueryOperation =
  | { type: "where"; field: string; operator: string; value: unknown }
  | { type: "orderBy"; field: string; direction?: string }
  | { type: "limit"; value: number }
  | { type: "startAfter"; value: unknown };

type FeedDocData = Record<string, unknown>;

class QueryStub {
  operations: QueryOperation[] = [];

  constructor(
    private readonly docs: Array<{ id: string; data: FeedDocData }>,
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
      docs: this.docs.map((doc) => ({
        id: doc.id,
        data: () => doc.data,
      })),
    };
  }
}

const mockQueryStubs: QueryStub[] = [];
const mockFeedDocs = [
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

jest.mock("firebase-admin/firestore", () => ({
  FieldPath: {
    documentId: () => ({ __fieldPath: "__name__" }),
  },
  FieldValue: class FieldValueStub {},
  Timestamp: class TimestampStub {
    constructor(private readonly date: Date) {}

    static fromMillis(value: number) {
      return new TimestampStub(new Date(value));
    }

    toDate() {
      return this.date;
    }
  },
}));

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: jest.fn((name: string) => {
      if (name !== "feed_items") {
        throw new Error(`Unexpected collection ${name}`);
      }

      const query = new QueryStub(mockFeedDocs, mockQueryStubs.length === 0);
      mockQueryStubs.push(query);
      return {
        where: query.where.bind(query),
        orderBy: query.orderBy.bind(query),
        limit: query.limit.bind(query),
        doc: jest.fn((id: string) => ({
          get: jest.fn(async () => ({
            exists: true,
            id,
            data: () => mockFeedDocs.find((doc) => doc.id === id)?.data ?? {},
          })),
        })),
      };
    }),
  })),
}));

describe("discover repository", () => {
  beforeEach(() => {
    jest.resetModules();
    mockQueryStubs.length = 0;
  });

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
});
