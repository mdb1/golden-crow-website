export {};

type MockDocData = Record<string, unknown>;
type MockStoredDoc = { id: string; data: MockDocData };
type MockWhereOperator = "==" | ">=" | ">" | "<=" | "<";
type MockQueryOperation =
  | {
      type: "where";
      fieldPath: string;
      operator: MockWhereOperator;
      value: unknown;
    }
  | { type: "orderBy"; fieldPath: string; direction: "asc" | "desc" }
  | { type: "startAfter"; values: unknown[] }
  | { type: "limit"; count: number }
  | { type: "select"; fields: string[] };
type MockQueryDocumentSnapshot = {
  exists: true;
  id: string;
  data: () => MockDocData;
  ref: {
    get: jest.Mock;
    set: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    collection: jest.Mock;
  };
};
type MockQuery = {
  doc: (id?: string) => {
    id: string;
    get: jest.Mock;
    set: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    collection: jest.Mock;
  };
  where: jest.Mock;
  orderBy: jest.Mock;
  startAfter: jest.Mock;
  limit: jest.Mock;
  select: jest.Mock;
  count: jest.Mock;
  get: jest.Mock;
};

const mockDocs = new Map<string, MockDocData>();
const mockCollection = jest.fn((collectionName: string) =>
  mockMakeQuery(collectionName),
);
const mockQueryReadLog: Array<{
  collectionName: string;
  operations: MockQueryOperation[];
}> = [];
const mockPointReadLog: Array<{ collectionName: string; id: string }> = [];
type MockTransactionDocumentRef = {
  get: jest.Mock;
  set: jest.Mock;
  update: jest.Mock;
};
type MockTransaction = {
  get: jest.Mock;
  set: jest.Mock;
  update: jest.Mock;
};
let mockTransactionCommitError: Error | null = null;
let mockTransactionRetryBeforeCommit: (() => void) | null = null;
const mockRunTransaction = jest.fn(
  async (
    callback: (transaction: MockTransaction) => Promise<unknown>,
  ): Promise<unknown> => {
    async function attempt(): Promise<unknown> {
      const stagedWrites: Array<() => Promise<unknown>> = [];
      const transaction: MockTransaction = {
        get: jest.fn(async (reference: MockTransactionDocumentRef) =>
          reference.get(),
        ),
        update: jest.fn(
          (reference: MockTransactionDocumentRef, data: MockDocData) => {
            stagedWrites.push(() => reference.update(data));
          },
        ),
        set: jest.fn(
          (reference: MockTransactionDocumentRef, data: MockDocData) => {
            stagedWrites.push(() => reference.set(data));
          },
        ),
      };

      const result = await callback(transaction);
      if (mockTransactionRetryBeforeCommit) {
        const retryBeforeCommit = mockTransactionRetryBeforeCommit;
        mockTransactionRetryBeforeCommit = null;
        retryBeforeCommit();
        return attempt();
      }

      if (mockTransactionCommitError) {
        const commitError = mockTransactionCommitError;
        mockTransactionCommitError = null;
        throw commitError;
      }

      for (const write of stagedWrites) {
        await write();
      }
      return result;
    }

    return attempt();
  },
);

function mockDocKey(collectionName: string, id: string) {
  return `${collectionName}/${id}`;
}

function mockDocsIn(collectionName: string) {
  return [...mockDocs.entries()]
    .filter(([key]) => key.startsWith(`${collectionName}/`))
    .map(([key, data]) => ({
      id: key.slice(collectionName.length + 1),
      data,
    }));
}

function mockFieldPathName(fieldPath: unknown) {
  return typeof fieldPath === "string" ? fieldPath : String(fieldPath);
}

function mockValueForField(doc: MockStoredDoc, fieldPath: string) {
  return fieldPath === "__name__" ? doc.id : doc.data[fieldPath];
}

function mockTimestampParts(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "seconds" in value &&
    typeof value.seconds === "number" &&
    "nanoseconds" in value &&
    typeof value.nanoseconds === "number"
  ) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }

  let date: Date | undefined;
  if (value instanceof Date) {
    date = value;
  } else if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    date = new Date(value);
  } else if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    date = value.toDate();
  }

  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }

  const milliseconds = date.getTime();
  const seconds = Math.floor(milliseconds / 1_000);
  return {
    seconds,
    nanoseconds: (milliseconds - seconds * 1_000) * 1_000_000,
  };
}

function mockComparableValue(value: unknown) {
  const timestamp = mockTimestampParts(value);
  if (timestamp) {
    return `timestamp:${timestamp.seconds}:${timestamp.nanoseconds}`;
  }

  return String(value ?? "");
}

function mockCompareValues(
  left: unknown,
  right: unknown,
  direction: "asc" | "desc",
) {
  const leftTimestamp = mockTimestampParts(left);
  const rightTimestamp = mockTimestampParts(right);
  const comparison =
    leftTimestamp && rightTimestamp
      ? leftTimestamp.seconds === rightTimestamp.seconds
        ? Math.sign(leftTimestamp.nanoseconds - rightTimestamp.nanoseconds)
        : Math.sign(leftTimestamp.seconds - rightTimestamp.seconds)
      : mockComparableValue(left).localeCompare(mockComparableValue(right));
  return direction === "desc" ? comparison * -1 : comparison;
}

function mockDocumentRef(
  collectionName: string,
  id: string,
): MockQueryDocumentSnapshot["ref"] {
  return {
    get: jest.fn(async () => {
      mockPointReadLog.push({ collectionName, id });
      const data = mockDocs.get(mockDocKey(collectionName, id));
      return {
        exists: Boolean(data),
        id,
        data: () => data,
        ref: mockDocumentRef(collectionName, id),
      };
    }),
    set: jest.fn(async (data: MockDocData) => {
      mockDocs.set(mockDocKey(collectionName, id), data);
    }),
    update: jest.fn(async (data: MockDocData) => {
      mockDocs.set(mockDocKey(collectionName, id), {
        ...(mockDocs.get(mockDocKey(collectionName, id)) ?? {}),
        ...data,
      });
    }),
    delete: jest.fn(async () => {
      mockDocs.delete(mockDocKey(collectionName, id));
    }),
    collection: jest.fn((subcollectionName: string) =>
      mockMakeQuery(`${collectionName}/${id}/${subcollectionName}`),
    ),
  };
}

function mockDocumentSnapshotFor(
  collectionName: string,
  doc: MockStoredDoc,
): MockQueryDocumentSnapshot {
  return {
    exists: true,
    id: doc.id,
    data: () => doc.data,
    ref: mockDocumentRef(collectionName, doc.id),
  };
}

function mockApplyQueryOperations(
  collectionName: string,
  operations: MockQueryOperation[],
) {
  let docs = mockDocsIn(collectionName);

  for (const operation of operations) {
    if (operation.type !== "where") {
      continue;
    }

    docs = docs.filter((doc) => {
      const value = mockValueForField(doc, operation.fieldPath);
      if (operation.operator === "==") {
        return value === operation.value;
      }

      const comparison = mockCompareValues(value, operation.value, "asc");
      if (operation.operator === ">=") {
        return comparison >= 0;
      }
      if (operation.operator === ">") {
        return comparison > 0;
      }
      if (operation.operator === "<=") {
        return comparison <= 0;
      }
      if (operation.operator === "<") {
        return comparison < 0;
      }

      throw new Error(`Unsupported mock where operator: ${operation.operator}`);
    });
  }

  const orderOperations = operations.filter(
    (
      operation,
    ): operation is Extract<MockQueryOperation, { type: "orderBy" }> =>
      operation.type === "orderBy",
  );

  if (orderOperations.length > 0) {
    docs = [...docs].sort((left, right) => {
      for (const operation of orderOperations) {
        const comparison = mockCompareValues(
          mockValueForField(left, operation.fieldPath),
          mockValueForField(right, operation.fieldPath),
          operation.direction,
        );

        if (comparison !== 0) {
          return comparison;
        }
      }

      return 0;
    });
  }

  const startAfter = operations.find(
    (
      operation,
    ): operation is Extract<MockQueryOperation, { type: "startAfter" }> =>
      operation.type === "startAfter",
  );

  if (startAfter) {
    const cursor = startAfter.values[0];
    const cursorIndex =
      cursor &&
      typeof cursor === "object" &&
      "id" in cursor &&
      typeof cursor.id === "string"
        ? docs.findIndex((doc) => doc.id === cursor.id)
        : docs.findIndex((doc) =>
            orderOperations.every((operation, index) => {
              const cursorValue = startAfter.values[index] ?? cursor;
              return (
                mockComparableValue(
                  mockValueForField(doc, operation.fieldPath),
                ) === mockComparableValue(cursorValue)
              );
            }),
          );

    if (cursorIndex >= 0) {
      docs = docs.slice(cursorIndex + 1);
    }
  }

  const limit = [...operations]
    .reverse()
    .find(
      (
        operation,
      ): operation is Extract<MockQueryOperation, { type: "limit" }> =>
        operation.type === "limit",
    );

  if (limit) {
    docs = docs.slice(0, limit.count);
  }

  const selection = [...operations]
    .reverse()
    .find(
      (
        operation,
      ): operation is Extract<MockQueryOperation, { type: "select" }> =>
        operation.type === "select",
    );

  return docs.map((doc) =>
    mockDocumentSnapshotFor(
      collectionName,
      selection
        ? {
            ...doc,
            data: Object.fromEntries(
              selection.fields
                .filter((field) => field in doc.data)
                .map((field) => [field, doc.data[field]]),
            ),
          }
        : doc,
    ),
  );
}

function mockMakeQuery(
  collectionName: string,
  operations: MockQueryOperation[] = [],
): MockQuery {
  return {
    doc: (id = `mock-doc-${mockDocs.size + 1}`) => ({
      id,
      ...mockDocumentRef(collectionName, id),
    }),
    where: jest.fn(
      (fieldPath: unknown, operator: MockWhereOperator, value: unknown) => {
        const operation: MockQueryOperation = {
          type: "where",
          fieldPath: mockFieldPathName(fieldPath),
          operator,
          value,
        };
        return mockMakeQuery(collectionName, [...operations, operation]);
      },
    ),
    orderBy: jest.fn(
      (fieldPath: unknown, direction: "asc" | "desc" = "asc") => {
        const operation: MockQueryOperation = {
          type: "orderBy",
          fieldPath: mockFieldPathName(fieldPath),
          direction,
        };
        return mockMakeQuery(collectionName, [...operations, operation]);
      },
    ),
    startAfter: jest.fn((...values: unknown[]) => {
      const operation: MockQueryOperation = { type: "startAfter", values };
      return mockMakeQuery(collectionName, [...operations, operation]);
    }),
    limit: jest.fn((count: number) => {
      const operation: MockQueryOperation = { type: "limit", count };
      return mockMakeQuery(collectionName, [...operations, operation]);
    }),
    select: jest.fn((...fields: string[]) => {
      const operation: MockQueryOperation = { type: "select", fields };
      return mockMakeQuery(collectionName, [...operations, operation]);
    }),
    count: jest.fn(() => ({
      get: jest.fn(async () => ({
        data: () => ({
          count: mockApplyQueryOperations(collectionName, operations).length,
        }),
      })),
    })),
    get: jest.fn(async () => {
      mockQueryReadLog.push({
        collectionName,
        operations: [...operations],
      });
      const docs = mockApplyQueryOperations(collectionName, operations);
      return {
        empty: docs.length === 0,
        docs,
      };
    }),
  };
}

jest.mock("firebase-admin/firestore", () => {
  class MockTimestamp {
    constructor(
      readonly seconds: number,
      readonly nanoseconds: number,
    ) {}

    static fromDate(date: Date) {
      const milliseconds = date.getTime();
      const seconds = Math.floor(milliseconds / 1_000);
      return new MockTimestamp(
        seconds,
        (milliseconds - seconds * 1_000) * 1_000_000,
      );
    }

    toDate() {
      return new Date(
        this.seconds * 1_000 + Math.floor(this.nanoseconds / 1_000_000),
      );
    }
  }

  return {
    FieldPath: {
      documentId: jest.fn(() => "__name__"),
    },
    FieldValue: {
      serverTimestamp: jest.fn(() =>
        MockTimestamp.fromDate(new Date("2026-09-10T12:00:00.000Z")),
      ),
    },
    Timestamp: MockTimestamp,
  };
});

jest.mock("../config/firebase.js", () => ({
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  })),
}));

jest.mock("../lib/partnership-crm-email.js", () => ({
  PARTNERSHIP_CRM_FROM_EMAIL: "partners@example.org",
  sendPartnershipCrmEmail: jest.fn(),
}));

const godModeContext = {
  email: "admin@example.org",
  uid: "admin-1",
  role: "full_admin" as const,
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap" as const],
};

beforeEach(() => {
  mockQueryReadLog.length = 0;
  mockPointReadLog.length = 0;
});

function mockIsoAt(index: number) {
  return new Date(
    Date.parse("2026-09-10T12:00:00.000Z") - index * 60_000,
  ).toISOString();
}

function seedOrganization(id: string, index: number, category: string) {
  mockDocs.set(mockDocKey("partnership_crm_organizations", id), {
    schemaVersion: 1,
    name: `Organization ${id}`,
    category,
    website: `https://${id}.example.org`,
    websiteDomain: `${id}.example.org`,
    country: "AR",
    status: "new",
    contactName: "",
    contactEmail: "",
    contactLinkedIn: "",
    lastContactAt: null,
    notes: "",
    is_favorite: false,
    normalizedName: `organization ${id}`,
    createdAt: mockIsoAt(index),
    updatedAt: mockIsoAt(index),
  });
}

function seedProfessional(id: string, index: number, category: string) {
  mockDocs.set(mockDocKey("partnership_crm_professionals", id), {
    schemaVersion: 1,
    name: `Professional ${id}`,
    category,
    title: "",
    primaryAffiliation: "",
    potentialPocketGenesEditorFit: "",
    emailRoute: "",
    linkedInRoute: "",
    researchBasis: "",
    website: `https://${id}.example.org`,
    websiteDomain: `${id}.example.org`,
    country: "AR",
    status: "new",
    email: "",
    linkedIn: "",
    lastContactAt: null,
    notes: "",
    is_favorite: false,
    normalizedName: `professional ${id}`,
    createdAt: mockIsoAt(index),
    updatedAt: mockIsoAt(index),
  });
}

describe("partnership CRM repository pagination", () => {
  beforeEach(() => {
    mockDocs.clear();
    mockCollection.mockClear();
  });

  it("returns organization matches beyond the first ten source documents in the first filtered page", async () => {
    const { listPartnershipCrmOrganizations } =
      await import("../repositories/partnership-crm.repository");

    for (let index = 0; index < 15; index += 1) {
      seedOrganization(`skip-${index}`, index, "org_fertility_clinics");
    }
    for (let index = 0; index < 12; index += 1) {
      seedOrganization(
        `match-${index}`,
        15 + index,
        "org_genomics_laboratories",
      );
    }

    const page = await listPartnershipCrmOrganizations(godModeContext, {
      category: "org_genomics_laboratories",
      limit: 20,
    });

    expect(page.organizations.map((record) => record.id)).toHaveLength(12);
    expect(page.organizations.every((record) => record.id.startsWith("match-"))).toBe(
      true,
    );
    expect(page.nextCursor).toBeUndefined();
    expect(page.statusCounts.new).toBe(12);
    expect(page.scanned).toBe(12);
    expect(page.partial).toBe(false);
    expect(mockQueryReadLog.at(-1)?.operations).toEqual(
      expect.arrayContaining([
        {
          type: "where",
          fieldPath: "category",
          operator: ">=",
          value: "org_genomics_laboratories",
        },
        {
          type: "where",
          fieldPath: "category",
          operator: "<",
          value: "org_genomics_laboratories\uf8ff",
        },
      ]),
    );
  });

  it("returns professional matches beyond the first ten source documents in the first filtered page", async () => {
    const { listPartnershipCrmProfessionals } =
      await import("../repositories/partnership-crm.repository");

    for (let index = 0; index < 15; index += 1) {
      seedProfessional(`skip-${index}`, index, "pro_other");
    }
    for (let index = 0; index < 12; index += 1) {
      seedProfessional(
        `match-${index}`,
        15 + index,
        "pro_clinical_geneticists",
      );
    }

    const page = await listPartnershipCrmProfessionals(godModeContext, {
      category: "pro_clinical_geneticists",
      limit: 20,
    });

    expect(page.professionals.map((record) => record.id)).toHaveLength(12);
    expect(page.professionals.every((record) => record.id.startsWith("match-"))).toBe(
      true,
    );
    expect(page.nextCursor).toBeUndefined();
    expect(page.statusCounts.new).toBe(12);
    expect(page.scanned).toBe(12);
    expect(page.partial).toBe(false);
    expect(mockQueryReadLog.at(-1)?.operations).toEqual(
      expect.arrayContaining([
        {
          type: "where",
          fieldPath: "category",
          operator: ">=",
          value: "pro_clinical_geneticists",
        },
        {
          type: "where",
          fieldPath: "category",
          operator: "<",
          value: "pro_clinical_geneticists\uf8ff",
        },
      ]),
    );
  });

  it("paginates a sparse filtered result without skipping matching professionals", async () => {
    const { listPartnershipCrmProfessionals } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 24; index += 1) {
      seedProfessional(
        `row-${index.toString().padStart(2, "0")}`,
        index,
        index % 2 === 0 ? "pro_clinical_geneticists" : "pro_other",
      );
    }

    const matchedIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listPartnershipCrmProfessionals(godModeContext, {
        category: "pro_clinical_geneticists",
        limit: 5,
        cursor,
      });
      matchedIds.push(...page.professionals.map((record) => record.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(matchedIds).toHaveLength(12);
    expect(new Set(matchedIds).size).toBe(12);
    expect(matchedIds.every((id) => Number(id.slice(-2)) % 2 === 0)).toBe(
      true,
    );
  });

  it("paginates residual filters without skipping the lookahead match", async () => {
    const { listPartnershipCrmProfessionals } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 45; index += 1) {
      const id = `combined-${index.toString().padStart(2, "0")}`;
      seedProfessional(id, index, "pro_clinical_geneticists");
      const key = mockDocKey("partnership_crm_professionals", id);
      mockDocs.set(key, {
        ...(mockDocs.get(key) ?? {}),
        status: index % 3 === 0 ? "contacted" : "new",
      });
    }
    for (let index = 0; index < 30; index += 1) {
      seedProfessional(`unrelated-${index}`, 45 + index, "pro_other");
    }

    const matchedIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listPartnershipCrmProfessionals(godModeContext, {
        category: "pro_clinical_geneticists",
        status: "contacted",
        limit: 5,
        cursor,
      });
      matchedIds.push(...page.professionals.map((record) => record.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(matchedIds).toHaveLength(15);
    expect(new Set(matchedIds).size).toBe(15);
    expect(
      matchedIds.every((id) => Number(id.slice(-2)) % 3 === 0),
    ).toBe(true);
    expect(
      mockQueryReadLog
        .filter(
          (entry) =>
            entry.collectionName === "partnership_crm_professionals",
        )
        .every((entry) =>
          entry.operations.some(
            (operation) =>
              operation.type === "where" &&
              operation.fieldPath === "category",
          ),
        ),
    ).toBe(true);
  });

  it("continues after the one-hundred-record residual scan cap without skipping matches", async () => {
    const { listPartnershipCrmProfessionals } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 120; index += 1) {
      const id = `capped-${index.toString().padStart(3, "0")}`;
      seedProfessional(id, index, "pro_clinical_geneticists");
      const key = mockDocKey("partnership_crm_professionals", id);
      mockDocs.set(key, {
        ...(mockDocs.get(key) ?? {}),
        status: index === 0 || index === 101 ? "contacted" : "new",
      });
    }

    const firstPage = await listPartnershipCrmProfessionals(godModeContext, {
      category: "pro_clinical_geneticists",
      status: "contacted",
    });

    expect(firstPage.professionals.map((record) => record.id)).toEqual([
      "capped-000",
    ]);
    expect(firstPage.scanned).toBe(100);
    expect(firstPage.partial).toBe(true);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = await listPartnershipCrmProfessionals(godModeContext, {
      category: "pro_clinical_geneticists",
      status: "contacted",
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.professionals.map((record) => record.id)).toEqual([
      "capped-101",
    ]);
    expect(secondPage.scanned).toBe(20);
    expect(secondPage.partial).toBe(false);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("applies the country anchor before reading a page", async () => {
    const { listPartnershipCrmOrganizations } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 20; index += 1) {
      seedOrganization(`argentina-${index}`, index, "org_other");
    }
    for (let index = 0; index < 5; index += 1) {
      const id = `usa-${index}`;
      seedOrganization(id, 20 + index, "org_other");
      const key = mockDocKey("partnership_crm_organizations", id);
      mockDocs.set(key, { ...(mockDocs.get(key) ?? {}), country: "US" });
    }

    const page = await listPartnershipCrmOrganizations(godModeContext, {
      country: "US",
    });

    expect(page.organizations.map((record) => record.id)).toEqual([
      "usa-0",
      "usa-1",
      "usa-2",
      "usa-3",
      "usa-4",
    ]);
    expect(page.scanned).toBe(5);
    expect(mockQueryReadLog.at(-1)?.operations).toEqual(
      expect.arrayContaining([
        {
          type: "where",
          fieldPath: "country",
          operator: ">=",
          value: "US",
        },
        {
          type: "where",
          fieldPath: "country",
          operator: "<",
          value: "US\uf8ff",
        },
      ]),
    );
  });

  it("pushes an exact status filter into Firestore before page sizing", async () => {
    const { listPartnershipCrmOrganizations } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 25; index += 1) {
      const id = `status-${index.toString().padStart(2, "0")}`;
      seedOrganization(id, index, "org_other");
      const key = mockDocKey("partnership_crm_organizations", id);
      mockDocs.set(key, {
        ...(mockDocs.get(key) ?? {}),
        status: index % 2 === 0 ? "contacted" : "new",
      });
    }

    const page = await listPartnershipCrmOrganizations(godModeContext, {
      status: "contacted",
    });

    expect(page.organizations).toHaveLength(13);
    expect(page.organizations.every((record) => record.status === "contacted")).toBe(
      true,
    );
    expect(mockQueryReadLog.at(-1)?.operations).toEqual(
      expect.arrayContaining([
        {
          type: "where",
          fieldPath: "status",
          operator: "==",
          value: "contacted",
        },
        { type: "orderBy", fieldPath: "__name__", direction: "asc" },
      ]),
    );
  });

  it("does not emit a next cursor for exactly twenty terminal anchor matches", async () => {
    const { listPartnershipCrmOrganizations } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 20; index += 1) {
      seedOrganization(
        `exact-${index.toString().padStart(2, "0")}`,
        index,
        "org_genomics_laboratories",
      );
    }

    const page = await listPartnershipCrmOrganizations(godModeContext, {
      category: "org_genomics_laboratories",
    });

    expect(page.organizations).toHaveLength(20);
    expect(page.nextCursor).toBeUndefined();
    expect(page.partial).toBe(false);
    expect(page.scanned).toBe(20);
    expect(
      mockQueryReadLog.filter(
        (entry) =>
          entry.collectionName === "partnership_crm_organizations",
      ),
    ).toHaveLength(1);
  });

  it("uses an explicitly blank LinkedIn anchor without reading unrelated records", async () => {
    const { listPartnershipCrmProfessionals } = await import(
      "../repositories/partnership-crm.repository"
    );
    seedProfessional("blank-link", 0, "pro_other");
    seedProfessional("has-link", 1, "pro_other");
    const linkedKey = mockDocKey(
      "partnership_crm_professionals",
      "has-link",
    );
    mockDocs.set(linkedKey, {
      ...(mockDocs.get(linkedKey) ?? {}),
      linkedIn: "https://linkedin.com/in/example",
    });

    const page = await listPartnershipCrmProfessionals(godModeContext, {
      linkedInState: "missing_linkedin",
    });

    expect(page.professionals.map((record) => record.id)).toEqual([
      "blank-link",
    ]);
    expect(page.scanned).toBe(1);
    expect(mockQueryReadLog.at(-1)?.operations).toEqual(
      expect.arrayContaining([
        {
          type: "where",
          fieldPath: "linkedIn",
          operator: "==",
          value: "",
        },
      ]),
    );
  });

  it("limits an unfiltered page to twenty records plus one lookahead", async () => {
    const { listPartnershipCrmOrganizations } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 30; index += 1) {
      seedOrganization(`org-${index}`, index, "org_genomics_laboratories");
    }

    const page = await listPartnershipCrmOrganizations(godModeContext);

    expect(page.organizations).toHaveLength(20);
    expect(page.scanned).toBe(21);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.partial).toBe(false);
  });

  it("does not scan unrelated documents for a missing name prefix", async () => {
    const { listPartnershipCrmProfessionals } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 160; index += 1) {
      seedProfessional(`deep-${index}`, index, "pro_other");
    }

    const page = await listPartnershipCrmProfessionals(godModeContext, {
      query: "not present",
      deep: true,
    });

    expect(page.professionals).toEqual([]);
    expect(page.scanned).toBe(0);
    expect(page.nextCursor).toBeUndefined();
    expect(page.partial).toBe(false);
    expect(mockQueryReadLog.at(-1)?.operations).toEqual(
      expect.arrayContaining([
        {
          type: "where",
          fieldPath: "normalizedName",
          operator: ">=",
          value: "not present",
        },
        {
          type: "where",
          fieldPath: "normalizedName",
          operator: "<",
          value: "not present\uf8ff",
        },
      ]),
    );
  });

  it("searches professionals by normalized name prefix before page sizing", async () => {
    const { listPartnershipCrmProfessionals } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 30; index += 1) {
      seedProfessional(`ordinary-${index}`, index, "pro_other");
    }
    for (let index = 0; index < 12; index += 1) {
      const id = `rare-${index}`;
      seedProfessional(id, 30 + index, "pro_other");
      const professionalKey = mockDocKey(
        "partnership_crm_professionals",
        id,
      );
      mockDocs.set(professionalKey, {
        ...(mockDocs.get(professionalKey) ?? {}),
        name: `Rare Marker ${index}`,
        normalizedName: `rare marker ${index}`,
      });
    }

    const page = await listPartnershipCrmProfessionals(godModeContext, {
      query: "rare marker",
    });

    expect(page.professionals).toHaveLength(12);
    expect(page.professionals.every((record) => record.name.startsWith("Rare Marker"))).toBe(
      true,
    );
    expect(page.scanned).toBe(12);
  });

  it("searches organizations by exact contact email without scanning unrelated documents", async () => {
    const { listPartnershipCrmOrganizations } = await import(
      "../repositories/partnership-crm.repository"
    );
    seedOrganization("email-match", 0, "org_other");
    const organizationKey = mockDocKey(
      "partnership_crm_organizations",
      "email-match",
    );
    mockDocs.set(organizationKey, {
      ...(mockDocs.get(organizationKey) ?? {}),
      contactEmail: "person@example.org",
    });
    seedOrganization("unrelated", 1, "org_other");

    const page = await listPartnershipCrmOrganizations(godModeContext, {
      query: "person@example.org",
    });

    expect(page.organizations).toEqual([
      expect.objectContaining({ id: "email-match", notes: "" }),
    ]);
    expect(page.scanned).toBe(1);
    expect(mockQueryReadLog.at(-1)?.operations).toEqual(
      expect.arrayContaining([
        {
          type: "where",
          fieldPath: "contactEmail",
          operator: "==",
          value: "person@example.org",
        },
      ]),
    );
  });

  it("matches template bodies before projecting the response summary", async () => {
    const { listPartnershipCrmTemplates } = await import(
      "../repositories/partnership-crm.repository"
    );
    mockDocs.set(mockDocKey("plantillas", "body-match"), {
      schemaVersion: 1,
      name: "Ordinary template",
      audience: "organizations",
      category: "org_other",
      subject: "Ordinary subject",
      body: "Only the full body contains the copper marker",
      status: "active",
      notes: "",
      is_favorite: false,
      normalizedName: "ordinary template",
      createdAt: mockIsoAt(0),
      updatedAt: mockIsoAt(0),
    });

    const page = await listPartnershipCrmTemplates(godModeContext, {
      query: "copper marker",
      deep: true,
    });

    expect(page.templates).toEqual([
      expect.objectContaining({ id: "body-match", body: "" }),
    ]);
    expect(page.scanned).toBe(1);
  });

  it("uses document id as a cursor tie-breaker for equal timestamps", async () => {
    const { listPartnershipCrmOrganizations } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 12; index += 1) {
      seedOrganization(`same-${index.toString().padStart(2, "0")}`, index, "");
      const key = mockDocKey(
        "partnership_crm_organizations",
        `same-${index.toString().padStart(2, "0")}`,
      );
      mockDocs.set(key, {
        ...(mockDocs.get(key) ?? {}),
        updatedAt: "2026-09-10T12:00:00.000Z",
      });
    }

    const first = await listPartnershipCrmOrganizations(godModeContext, {
      limit: 10,
    });
    const second = await listPartnershipCrmOrganizations(godModeContext, {
      cursor: first.nextCursor,
      limit: 10,
    });
    const ids = [
      ...first.organizations.map((record) => record.id),
      ...second.organizations.map((record) => record.id),
    ];

    expect(new Set(ids).size).toBe(12);
    expect(ids).toHaveLength(12);
  });

  it("preserves Firestore nanoseconds across cursor pages", async () => {
    const { Timestamp } = await import("firebase-admin/firestore");
    const { listPartnershipCrmOrganizations } = await import(
      "../repositories/partnership-crm.repository"
    );
    const seconds = Math.floor(
      Date.parse("2026-09-10T12:00:00.000Z") / 1_000,
    );
    for (let index = 0; index < 12; index += 1) {
      const id = `nano-${index.toString().padStart(2, "0")}`;
      seedOrganization(id, index, "");
      const key = mockDocKey("partnership_crm_organizations", id);
      mockDocs.set(key, {
        ...(mockDocs.get(key) ?? {}),
        updatedAt: new Timestamp(seconds, 100_000 + index),
      });
    }

    const first = await listPartnershipCrmOrganizations(godModeContext, {
      limit: 10,
    });
    expect(first.nextCursor).toEqual(expect.any(String));
    const decodedCursor = JSON.parse(
      Buffer.from(first.nextCursor ?? "", "base64url").toString("utf8"),
    ) as {
      v: number;
      value: { seconds: number; nanoseconds: number };
    };
    expect(decodedCursor).toMatchObject({
      v: 2,
      value: { seconds, nanoseconds: 100_002 },
    });

    const second = await listPartnershipCrmOrganizations(godModeContext, {
      cursor: first.nextCursor,
      limit: 10,
    });
    const ids = [
      ...first.organizations.map((record) => record.id),
      ...second.organizations.map((record) => record.id),
    ];

    expect(first.organizations).toHaveLength(10);
    expect(second.organizations).toHaveLength(2);
    expect(new Set(ids).size).toBe(12);
    expect(ids).toHaveLength(12);

    const legacyCursor = Buffer.from(
      JSON.stringify({ ...decodedCursor, v: 1 }),
      "utf8",
    ).toString("base64url");
    await expect(
      listPartnershipCrmOrganizations(godModeContext, {
        cursor: legacyCursor,
        limit: 10,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 400,
        message: "CRM cursor is invalid or does not match the current filters.",
      }),
    );
  });

  it("rejects a cursor when the raw lowercase search semantics change", async () => {
    const { listPartnershipCrmOrganizations } = await import(
      "../repositories/partnership-crm.repository"
    );
    for (let index = 0; index < 25; index += 1) {
      const id = `query-${index}`;
      seedOrganization(id, index, "org_other");
      const key = mockDocKey("partnership_crm_organizations", id);
      mockDocs.set(key, {
        ...(mockDocs.get(key) ?? {}),
        name: `Café ${index}`,
        normalizedName: `cafe ${index}`,
      });
    }

    const first = await listPartnershipCrmOrganizations(godModeContext, {
      query: "café",
    });
    expect(first.nextCursor).toEqual(expect.any(String));

    await expect(
      listPartnershipCrmOrganizations(godModeContext, {
        query: "cafe",
        cursor: first.nextCursor,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 400,
        message: "CRM cursor is invalid or does not match the current filters.",
      }),
    );
  });

  it("returns visual-filter metadata without reading a source collection", async () => {
    const { getPartnershipCrmVisualFilters } = await import(
      "../repositories/partnership-crm.repository"
    );

    const filters = await getPartnershipCrmVisualFilters(
      godModeContext,
      "professionals",
    );

    expect(filters.targetKind).toBe("professionals");
    expect(filters.facets.status.buckets).toEqual([]);
    expect(mockCollection).not.toHaveBeenCalled();
  });
});

describe("partnership CRM sent email log", () => {
  beforeEach(() => {
    mockDocs.clear();
    mockCollection.mockClear();
  });

  it("lists only summary fields and loads the full body by point id", async () => {
    const {
      getPartnershipCrmSentEmailLog,
      listPartnershipCrmSentEmailLog,
    } = await import("../repositories/partnership-crm.repository");
    mockDocs.set(mockDocKey("crm_sent_email_log", "email-1"), {
      targetKind: "organizations",
      targetId: "org-1",
      targetName: "Genome Lab",
      from: "partners@example.org",
      to: "ada@example.org",
      subject: "A bounded summary",
      body: "The long email body is only available from the detail endpoint.",
      sentAt: mockIsoAt(0),
      createdAt: mockIsoAt(0),
      createdByEmail: "admin@example.org",
      templateId: "template-1",
      templateName: "Outreach",
    });

    const page = await listPartnershipCrmSentEmailLog(godModeContext);

    expect(page.emails).toEqual([
      expect.objectContaining({
        id: "email-1",
        subject: "A bounded summary",
        body: "",
      }),
    ]);

    const detail = await getPartnershipCrmSentEmailLog(
      godModeContext,
      "email-1",
    );
    expect(detail.body).toBe(
      "The long email body is only available from the detail endpoint.",
    );
  });

  it("returns not found for an unknown sent email log id", async () => {
    const { getPartnershipCrmSentEmailLog } = await import(
      "../repositories/partnership-crm.repository"
    );

    await expect(
      getPartnershipCrmSentEmailLog(godModeContext, "missing-email"),
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 404,
        message: "CRM sent email log not found.",
      }),
    );
  });
});

describe("partnership CRM daily usage", () => {
  beforeEach(() => {
    mockDocs.clear();
    mockCollection.mockClear();
    mockRunTransaction.mockClear();
    mockTransactionCommitError = null;
    mockTransactionRetryBeforeCommit = null;
  });

  it("returns an authoritative zero without creating or incrementing usage", async () => {
    const { getPartnershipCrmDailyUsage } = await import(
      "../repositories/partnership-crm.repository"
    );

    const usage = await getPartnershipCrmDailyUsage(godModeContext, "crm");

    expect(usage).toEqual(
      expect.objectContaining({
        surface: "crm",
        used: 0,
        remaining: 100,
        percentage: 0,
        locked: false,
      }),
    );
    expect(mockPointReadLog).toEqual([
      expect.objectContaining({
        collectionName: "partnership_crm_daily_usage",
      }),
    ]);
    expect(mockDocsIn("partnership_crm_daily_usage")).toEqual([]);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("reads and validates the stored daily usage without mutating it", async () => {
    const { consumePartnershipCrmDailyUsage, getPartnershipCrmDailyUsage } =
      await import("../repositories/partnership-crm.repository");
    await consumePartnershipCrmDailyUsage(
      godModeContext,
      "plantillas",
      "existing-event",
      "list",
    );
    mockPointReadLog.length = 0;
    mockRunTransaction.mockClear();

    const usage = await getPartnershipCrmDailyUsage(
      godModeContext,
      "plantillas",
    );

    expect(usage).toEqual(
      expect.objectContaining({
        surface: "plantillas",
        used: 1,
        remaining: 99,
      }),
    );
    expect(mockPointReadLog).toHaveLength(1);
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockDocsIn("partnership_crm_daily_usage")[0]?.data.used).toBe(1);
  });

  it("fails closed when the stored usage counter is corrupt", async () => {
    const {
      consumePartnershipCrmDailyUsage,
      getPartnershipCrmDailyUsage,
      PartnershipCrmUsageError,
    } = await import("../repositories/partnership-crm.repository");
    await consumePartnershipCrmDailyUsage(
      godModeContext,
      "crm",
      "existing-event",
      "list",
    );
    const usageDoc = mockDocsIn("partnership_crm_daily_usage")[0]!;
    mockDocs.set(mockDocKey("partnership_crm_daily_usage", usageDoc.id), {
      ...usageDoc.data,
      used: 2,
    });

    await expect(
      getPartnershipCrmDailyUsage(godModeContext, "crm"),
    ).rejects.toEqual(
      expect.objectContaining<
        Partial<InstanceType<typeof PartnershipCrmUsageError>>
      >({
        statusCode: 503,
        code: "CRM_USAGE_UNAVAILABLE",
      }),
    );
  });

  it("atomically increments once and recognizes the same event id", async () => {
    const { consumePartnershipCrmDailyUsage } = await import(
      "../repositories/partnership-crm.repository"
    );

    const first = await consumePartnershipCrmDailyUsage(
      godModeContext,
      "crm",
      "event-1",
      "page_load",
    );
    const duplicate = await consumePartnershipCrmDailyUsage(
      godModeContext,
      "crm",
      "event-1",
      "page_load",
    );

    expect(first).toEqual({
      duplicate: false,
      usage: expect.objectContaining({ used: 1, remaining: 99 }),
    });
    expect(duplicate).toEqual({
      duplicate: true,
      usage: expect.objectContaining({ used: 1, remaining: 99 }),
    });
    expect(mockDocsIn("partnership_crm_daily_usage")).toHaveLength(1);
    expect(mockDocsIn("partnership_crm_daily_usage")[0]?.data).toEqual(
      expect.objectContaining({
        surface: "crm",
        used: 1,
        eventIds: ["event-1"],
        byKind: { page_load: 1 },
      }),
    );
  });

  it("keeps CRM and Plantillas in separate 100-unit pools", async () => {
    const { consumePartnershipCrmDailyUsage } = await import(
      "../repositories/partnership-crm.repository"
    );

    await consumePartnershipCrmDailyUsage(
      godModeContext,
      "crm",
      "crm-event",
      "list",
    );
    await consumePartnershipCrmDailyUsage(
      godModeContext,
      "plantillas",
      "template-event",
      "list",
    );

    expect(
      mockDocsIn("partnership_crm_daily_usage").map((doc) => ({
        surface: doc.data.surface,
        used: doc.data.used,
      })),
    ).toEqual(
      expect.arrayContaining([
        { surface: "crm", used: 1 },
        { surface: "plantillas", used: 1 },
      ]),
    );
  });

  it("rejects the next action after unit 100 without recording its event", async () => {
    const { consumePartnershipCrmDailyUsage, PartnershipCrmUsageError } =
      await import("../repositories/partnership-crm.repository");

    await consumePartnershipCrmDailyUsage(
      godModeContext,
      "crm",
      "seed-event",
      "page_load",
    );
    const usageDoc = mockDocsIn("partnership_crm_daily_usage")[0];
    expect(usageDoc).toBeDefined();
    const eventIds = [
      "seed-event",
      ...Array.from({ length: 99 }, (_, index) => `prior-event-${index + 1}`),
    ];
    mockDocs.set(
      mockDocKey("partnership_crm_daily_usage", usageDoc!.id),
      {
        ...usageDoc!.data,
        used: 100,
        eventIds,
      },
    );

    await expect(
      consumePartnershipCrmDailyUsage(
        godModeContext,
        "crm",
        "blocked-event",
        "list",
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<InstanceType<typeof PartnershipCrmUsageError>>>({
        statusCode: 429,
        code: "CRM_DAILY_LIMIT_REACHED",
        usage: expect.objectContaining({ used: 100, locked: true }),
      }),
    );
    expect(mockDocsIn("partnership_crm_daily_usage")[0]?.data.eventIds).toEqual(
      eventIds,
    );
  });

  it("allows unit 100 and reports the surface as locked afterward", async () => {
    const { consumePartnershipCrmDailyUsage } = await import(
      "../repositories/partnership-crm.repository"
    );
    await consumePartnershipCrmDailyUsage(
      godModeContext,
      "plantillas",
      "seed-event",
      "page_load",
    );
    const usageDoc = mockDocsIn("partnership_crm_daily_usage")[0]!;
    mockDocs.set(
      mockDocKey("partnership_crm_daily_usage", usageDoc.id),
      {
        ...usageDoc.data,
        used: 99,
        eventIds: [
          "seed-event",
          ...Array.from(
            { length: 98 },
            (_, index) => `prior-event-${index + 1}`,
          ),
        ],
      },
    );

    const result = await consumePartnershipCrmDailyUsage(
      godModeContext,
      "plantillas",
      "unit-100",
      "mutation",
    );

    expect(result).toEqual({
      duplicate: false,
      usage: expect.objectContaining({
        surface: "plantillas",
        used: 100,
        remaining: 0,
        locked: true,
      }),
    });
  });

  it.each([
    ["missing used", { used: undefined }],
    ["negative used", { used: -1 }],
    ["non-finite used", { used: Number.NaN }],
    ["fractional used", { used: 0.5 }],
    ["over-limit used", { used: 101 }],
    ["missing event ids", { eventIds: undefined }],
    ["non-array event ids", { eventIds: "event-1" }],
    ["invalid event id entries", { eventIds: [42] }],
    ["duplicate event ids", { eventIds: ["event-1", "event-1"] }],
    ["mismatched receipt count", { used: 2, eventIds: ["event-1"] }],
    ["wrong surface", { surface: "plantillas" }],
    ["wrong date", { date: "1900-01-01" }],
    ["wrong limit", { limit: 99 }],
  ])("fails closed for an existing quota document with %s", async (_label, patch) => {
    const { consumePartnershipCrmDailyUsage, PartnershipCrmUsageError } =
      await import("../repositories/partnership-crm.repository");
    await consumePartnershipCrmDailyUsage(
      godModeContext,
      "crm",
      "event-1",
      "page_load",
    );
    const usageDoc = mockDocsIn("partnership_crm_daily_usage")[0]!;
    mockDocs.set(mockDocKey("partnership_crm_daily_usage", usageDoc.id), {
      ...usageDoc.data,
      ...patch,
    });

    await expect(
      consumePartnershipCrmDailyUsage(
        godModeContext,
        "crm",
        "event-2",
        "list",
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<InstanceType<typeof PartnershipCrmUsageError>>>({
        statusCode: 503,
        code: "CRM_USAGE_UNAVAILABLE",
      }),
    );
  });
});

describe("partnership CRM status updates", () => {
  beforeEach(() => {
    mockDocs.clear();
    mockCollection.mockClear();
    mockRunTransaction.mockClear();
    mockTransactionCommitError = null;
    mockTransactionRetryBeforeCommit = null;
  });

  it("updates only organization status audit fields and preserves legacy data", async () => {
    const { updatePartnershipCrmOrganizationStatus } = await import(
      "../repositories/partnership-crm.repository"
    );
    seedOrganization("org-1", 1, "org_genomics_laboratories");
    const organizationKey = mockDocKey(
      "partnership_crm_organizations",
      "org-1",
    );
    const before = {
      ...(mockDocs.get(organizationKey) ?? {}),
      status: "contacted",
      notes: "x".repeat(2501),
      updatedByEmail: "previous@example.org",
      legacyContactPhone: "+54 11 5555 0101",
      legacyResearch: {
        source: "historic-import",
        score: 97,
      },
    };
    mockDocs.set(organizationKey, before);

    const organization = await updatePartnershipCrmOrganizationStatus(
      godModeContext,
      "org-1",
      "meeting",
    );

    const after = mockDocs.get(organizationKey);
    expect(after).toEqual({
      ...before,
      status: "meeting",
      updatedAt: expect.anything(),
      updatedByEmail: "admin@example.org",
    });
    expect(
      (
        after?.updatedAt as {
          toDate: () => Date;
        }
      ).toDate().toISOString(),
    ).toBe("2026-09-10T12:00:00.000Z");
    expect(organization.status).toBe("meeting");

    const activities = mockDocsIn(
      "partnership_crm_organizations/org-1/activities",
    );
    expect(activities).toHaveLength(1);
    expect(activities[0]?.data).toEqual(
      expect.objectContaining({
        type: "status",
        title: "Status changed to meeting",
        body: "Previous status: contacted",
        createdByEmail: "admin@example.org",
        metadata: {
          previousStatus: "contacted",
          nextStatus: "meeting",
        },
      }),
    );
  });

  it("updates only professional status audit fields and preserves legacy data", async () => {
    const { updatePartnershipCrmProfessionalStatus } = await import(
      "../repositories/partnership-crm.repository"
    );
    seedProfessional("pro-1", 1, "pro_clinical_geneticists");
    const professionalKey = mockDocKey(
      "partnership_crm_professionals",
      "pro-1",
    );
    const before = {
      ...(mockDocs.get(professionalKey) ?? {}),
      status: "replied",
      notes: "x".repeat(2501),
      updatedByEmail: "previous@example.org",
      legacyProfileUrl: "https://legacy.example.org/ada",
      legacyResearch: {
        source: "historic-import",
        topics: ["genomics", "rare disease"],
      },
    };
    mockDocs.set(professionalKey, before);

    const professional = await updatePartnershipCrmProfessionalStatus(
      godModeContext,
      "pro-1",
      "partner",
    );

    const after = mockDocs.get(professionalKey);
    expect(after).toEqual({
      ...before,
      status: "partner",
      updatedAt: expect.anything(),
      updatedByEmail: "admin@example.org",
    });
    expect(
      (
        after?.updatedAt as {
          toDate: () => Date;
        }
      ).toDate().toISOString(),
    ).toBe("2026-09-10T12:00:00.000Z");
    expect(professional.status).toBe("partner");

    const activities = mockDocsIn(
      "partnership_crm_professionals/pro-1/activities",
    );
    expect(activities).toHaveLength(1);
    expect(activities[0]?.data).toEqual(
      expect.objectContaining({
        type: "status",
        title: "Status changed to partner",
        body: "Previous status: replied",
        createdByEmail: "admin@example.org",
        metadata: {
          previousStatus: "replied",
          nextStatus: "partner",
        },
      }),
    );
  });

  it("leaves an organization untouched when its status is unchanged", async () => {
    const { updatePartnershipCrmOrganizationStatus } = await import(
      "../repositories/partnership-crm.repository"
    );
    seedOrganization("org-unchanged", 1, "org_genomics_laboratories");
    const organizationKey = mockDocKey(
      "partnership_crm_organizations",
      "org-unchanged",
    );
    const before = { ...(mockDocs.get(organizationKey) ?? {}) };

    const organization = await updatePartnershipCrmOrganizationStatus(
      godModeContext,
      "org-unchanged",
      "new",
    );

    expect(mockDocs.get(organizationKey)).toEqual(before);
    expect(organization.status).toBe("new");
    expect(
      mockDocsIn(
        "partnership_crm_organizations/org-unchanged/activities",
      ),
    ).toHaveLength(0);
  });

  it("does not commit the status when the atomic activity write fails", async () => {
    const { updatePartnershipCrmOrganizationStatus } = await import(
      "../repositories/partnership-crm.repository"
    );
    seedOrganization("org-failed", 1, "org_genomics_laboratories");
    const organizationKey = mockDocKey(
      "partnership_crm_organizations",
      "org-failed",
    );
    const before = { ...(mockDocs.get(organizationKey) ?? {}) };
    mockTransactionCommitError = new Error("Simulated transaction failure");

    await expect(
      updatePartnershipCrmOrganizationStatus(
        godModeContext,
        "org-failed",
        "meeting",
      ),
    ).rejects.toThrow("Simulated transaction failure");

    expect(mockDocs.get(organizationKey)).toEqual(before);
    expect(
      mockDocsIn("partnership_crm_organizations/org-failed/activities"),
    ).toHaveLength(0);
  });

  it("records the latest previous status after a transaction retry", async () => {
    const { updatePartnershipCrmOrganizationStatus } = await import(
      "../repositories/partnership-crm.repository"
    );
    seedOrganization("org-concurrent", 1, "org_genomics_laboratories");
    const organizationKey = mockDocKey(
      "partnership_crm_organizations",
      "org-concurrent",
    );
    mockDocs.set(organizationKey, {
      ...(mockDocs.get(organizationKey) ?? {}),
      status: "contacted",
    });
    mockTransactionRetryBeforeCommit = () => {
      mockDocs.set(organizationKey, {
        ...(mockDocs.get(organizationKey) ?? {}),
        status: "replied",
      });
    };

    await updatePartnershipCrmOrganizationStatus(
      godModeContext,
      "org-concurrent",
      "meeting",
    );

    expect(mockDocs.get(organizationKey)?.status).toBe("meeting");
    const activities = mockDocsIn(
      "partnership_crm_organizations/org-concurrent/activities",
    );
    expect(activities).toHaveLength(1);
    expect(activities[0]?.data.metadata).toEqual({
      previousStatus: "replied",
      nextStatus: "meeting",
    });
  });
});

describe("partnership CRM favorite updates", () => {
  beforeEach(() => {
    mockDocs.clear();
    mockCollection.mockClear();
    mockRunTransaction.mockClear();
    mockTransactionCommitError = null;
    mockTransactionRetryBeforeCommit = null;
  });

  it("changes only the organization favorite and audit fields", async () => {
    const { updatePartnershipCrmOrganizationFavorite } = await import(
      "../repositories/partnership-crm.repository"
    );
    seedOrganization("org-favorite", 1, "org_genomics_laboratories");
    const key = mockDocKey(
      "partnership_crm_organizations",
      "org-favorite",
    );
    const before = {
      ...(mockDocs.get(key) ?? {}),
      notes: "Long notes that must survive a summary-row favorite action.",
      legacyContactPhone: "+54 11 5555 0199",
    };
    mockDocs.set(key, before);

    const organization = await updatePartnershipCrmOrganizationFavorite(
      godModeContext,
      "org-favorite",
      true,
    );

    expect(mockDocs.get(key)).toEqual({
      ...before,
      is_favorite: true,
      updatedAt: expect.anything(),
      updatedByEmail: "admin@example.org",
    });
    expect(organization).toEqual(
      expect.objectContaining({
        id: "org-favorite",
        is_favorite: true,
        notes: before.notes,
      }),
    );
    expect(mockDocsIn("partnership_crm_organizations/org-favorite/activities"))
      .toHaveLength(1);
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });

  it("changes only the professional favorite and audit fields", async () => {
    const { updatePartnershipCrmProfessionalFavorite } = await import(
      "../repositories/partnership-crm.repository"
    );
    seedProfessional("pro-favorite", 1, "pro_clinical_geneticists");
    const key = mockDocKey(
      "partnership_crm_professionals",
      "pro-favorite",
    );
    const before = {
      ...(mockDocs.get(key) ?? {}),
      researchBasis: "Full research retained",
      notes: "Full notes retained",
      legacyProfileUrl: "https://legacy.example.org/favorite",
    };
    mockDocs.set(key, before);

    const professional = await updatePartnershipCrmProfessionalFavorite(
      godModeContext,
      "pro-favorite",
      true,
    );

    expect(mockDocs.get(key)).toEqual({
      ...before,
      is_favorite: true,
      updatedAt: expect.anything(),
      updatedByEmail: "admin@example.org",
    });
    expect(professional).toEqual(
      expect.objectContaining({
        id: "pro-favorite",
        is_favorite: true,
        researchBasis: before.researchBasis,
        notes: before.notes,
      }),
    );
    expect(mockDocsIn("partnership_crm_professionals/pro-favorite/activities"))
      .toHaveLength(1);
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });

  it("changes only the template favorite and audit fields", async () => {
    const { updatePartnershipCrmTemplateFavorite } = await import(
      "../repositories/partnership-crm.repository"
    );
    const key = mockDocKey("plantillas", "template-favorite");
    const before = {
      schemaVersion: 1,
      name: "Favorite template",
      audience: "organizations",
      category: "org_genomics_laboratories",
      subject: "Subject retained",
      body: "The complete template body must survive.",
      status: "active",
      notes: "Private template notes retained",
      is_favorite: false,
      normalizedName: "favorite template",
      createdAt: mockIsoAt(1),
      updatedAt: mockIsoAt(1),
      legacyImportSource: "historic-csv",
    };
    mockDocs.set(key, before);

    const template = await updatePartnershipCrmTemplateFavorite(
      godModeContext,
      "template-favorite",
      true,
    );

    expect(mockDocs.get(key)).toEqual({
      ...before,
      is_favorite: true,
      updatedAt: expect.anything(),
      updatedByEmail: "admin@example.org",
    });
    expect(template).toEqual(
      expect.objectContaining({
        id: "template-favorite",
        is_favorite: true,
        body: before.body,
        notes: before.notes,
      }),
    );
    expect(mockDocsIn("plantillas")).toHaveLength(1);
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("partnership CRM template imports", () => {
  beforeEach(() => {
    mockDocs.clear();
    mockCollection.mockClear();
    mockRunTransaction.mockClear();
  });

  it("creates after one normalized-name lookup bounded to five candidates", async () => {
    const { importPartnershipCrmTemplate } = await import(
      "../repositories/partnership-crm.repository"
    );

    const result = await importPartnershipCrmTemplate(godModeContext, {
      name: "First outreach",
      audience: "organizations",
      category: "org_genomics_laboratories",
      subject: "Hello",
      body: "Welcome to Pocket Genes",
      status: "active",
      notes: "Imported note",
      is_favorite: false,
    });

    expect(result).toEqual({
      action: "created",
      template: expect.objectContaining({
        id: "mock-doc-1",
        name: "First outreach",
        audience: "organizations",
        subject: "Hello",
        body: "Welcome to Pocket Genes",
      }),
    });
    expect(mockDocs.get(mockDocKey("plantillas", "mock-doc-1"))).toEqual(
      expect.objectContaining({
        normalizedName: "first outreach",
        notes: "Imported note",
      }),
    );
    expect(mockQueryReadLog).toEqual([
      {
        collectionName: "plantillas",
        operations: expect.arrayContaining([
          expect.objectContaining({
            type: "where",
            fieldPath: "normalizedName",
            operator: "==",
            value: "first outreach",
          }),
          { type: "limit", count: 5 },
        ]),
      },
    ]);
    expect(mockPointReadLog).toEqual([]);
  });

  it("transactionally merges a same-audience match while preserving identity fields", async () => {
    const { importPartnershipCrmTemplate } = await import(
      "../repositories/partnership-crm.repository"
    );
    const key = mockDocKey("plantillas", "existing-template");
    const before = {
      schemaVersion: 1,
      name: "Welcome Labs",
      audience: "organizations",
      category: "org_genomics_laboratories",
      subject: "Old subject",
      body: "Old body",
      status: "inactive",
      notes: "Keep this note",
      is_favorite: false,
      normalizedName: "welcome labs",
      createdAt: mockIsoAt(2),
      createdByEmail: "original@example.org",
      updatedAt: mockIsoAt(1),
      updatedByEmail: "original@example.org",
      legacyImportSource: "historic-csv",
    };
    mockDocs.set(key, before);

    const result = await importPartnershipCrmTemplate(godModeContext, {
      name: "WELCOME LABS",
      audience: "organizations",
      category: "org_other",
      subject: "New subject",
      body: "New body",
      status: "archived",
      notes: "New CSV note",
      is_favorite: true,
    });

    expect(result).toEqual({
      action: "updated",
      template: expect.objectContaining({
        id: "existing-template",
        name: "Welcome Labs",
        audience: "organizations",
        category: "org_genomics_laboratories",
        status: "inactive",
        subject: "New subject",
        body: "New body",
        notes: "Keep this note\n\n--- CSV import ---\nNew CSV note",
        is_favorite: true,
      }),
    });
    expect(mockDocs.get(key)).toEqual({
      ...before,
      subject: "New subject",
      body: "New body",
      notes: "Keep this note\n\n--- CSV import ---\nNew CSV note",
      is_favorite: true,
      updatedAt: expect.anything(),
      updatedByEmail: "admin@example.org",
    });
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockPointReadLog).toEqual([
      { collectionName: "plantillas", id: "existing-template" },
    ]);
    expect(mockQueryReadLog[0]).toEqual(
      expect.objectContaining({
        collectionName: "plantillas",
        operations: expect.arrayContaining([{ type: "limit", count: 5 }]),
      }),
    );
  });

  it("does not merge a normalized-name match from the other audience", async () => {
    const { importPartnershipCrmTemplate } = await import(
      "../repositories/partnership-crm.repository"
    );
    mockDocs.set(mockDocKey("plantillas", "professional-template"), {
      schemaVersion: 1,
      name: "Shared name",
      audience: "professionals",
      category: "pro_other",
      subject: "Professional subject",
      body: "Professional body",
      status: "active",
      notes: "",
      is_favorite: false,
      normalizedName: "shared name",
      createdAt: mockIsoAt(1),
      updatedAt: mockIsoAt(1),
    });

    const result = await importPartnershipCrmTemplate(godModeContext, {
      name: "Shared name",
      audience: "organizations",
      category: "org_other",
      subject: "Organization subject",
      body: "Organization body",
      status: "active",
      notes: "",
      is_favorite: false,
    });

    expect(result.action).toBe("created");
    expect(result.template.id).not.toBe("professional-template");
    expect(mockDocs.get(mockDocKey("plantillas", "professional-template"))).toEqual(
      expect.objectContaining({ subject: "Professional subject" }),
    );
    expect(mockDocsIn("plantillas")).toHaveLength(2);
    expect(mockQueryReadLog[0]?.operations).toEqual(
      expect.arrayContaining([{ type: "limit", count: 5 }]),
    );
  });
});

describe("partnership CRM email sending", () => {
  beforeEach(async () => {
    mockDocs.clear();
    mockCollection.mockClear();
    const { sendPartnershipCrmEmail } = await import(
      "../lib/partnership-crm-email.js"
    );
    jest.mocked(sendPartnershipCrmEmail).mockClear();
  });

  it("sends organization emails without requiring a fixed closing", async () => {
    const { sendPartnershipCrmOrganizationEmail } = await import(
      "../repositories/partnership-crm.repository"
    );
    const { sendPartnershipCrmEmail } = await import(
      "../lib/partnership-crm-email.js"
    );
    seedOrganization("org-1", 1, "org_genomics_laboratories");
    const text = "Hola Ada,\n\nTe escribo sobre Pocket Genes.";

    await expect(
      sendPartnershipCrmOrganizationEmail(godModeContext, "org-1", {
        to: "ada@example.org",
        subject: "Pocket Genes + Ada",
        text,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        activity: expect.objectContaining({
          body: text,
        }),
      }),
    );
    expect(sendPartnershipCrmEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text }),
    );
  });
});

describe("partnership CRM duplicate imports", () => {
  beforeEach(() => {
    mockDocs.clear();
    mockCollection.mockClear();
    mockRunTransaction.mockClear();
  });

  it("reuses one deterministic organization document after a lost response", async () => {
    const { importPartnershipCrmOrganizations } = await import(
      "../repositories/partnership-crm.repository"
    );
    const row = {
      rowId: "row-1",
      idempotencyKey: "upload-session-1:row-1",
      duplicateAction: "import" as const,
      name: "Idempotent Genome Lab",
      category: "org_genomics_laboratories",
      contactEmail: "hello@idempotent.example",
    };

    const first = await importPartnershipCrmOrganizations(godModeContext, [
      row,
    ]);
    const retry = await importPartnershipCrmOrganizations(godModeContext, [
      row,
    ]);
    const firstId = first.results[0]?.organizationId;

    expect(firstId).toMatch(/^crm_import_org_[a-f0-9]{64}$/);
    expect(retry.results[0]).toEqual(
      expect.objectContaining({
        action: "created",
        organizationId: firstId,
      }),
    );
    expect(
      [...mockDocs.keys()].filter(
        (key) =>
          key.startsWith("partnership_crm_organizations/") &&
          key.split("/").length === 2,
      ),
    ).toEqual([`partnership_crm_organizations/${firstId}`]);
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(
      mockQueryReadLog.filter(
        (entry) => entry.collectionName === "partnership_crm_organizations",
      ),
    ).toHaveLength(1);
  });

  it("reuses one deterministic professional document after a lost response", async () => {
    const { importPartnershipCrmProfessionals } = await import(
      "../repositories/partnership-crm.repository"
    );
    const row = {
      rowId: "row-1",
      idempotencyKey: "upload-session-2:row-1",
      duplicateAction: "import" as const,
      name: "Dr. Retry Safe",
      category: "pro_clinical_geneticists",
      email: "retry-safe@example.org",
    };

    const first = await importPartnershipCrmProfessionals(godModeContext, [
      row,
    ]);
    const retry = await importPartnershipCrmProfessionals(godModeContext, [
      row,
    ]);
    const firstId = first.results[0]?.professionalId;

    expect(firstId).toMatch(/^crm_import_pro_[a-f0-9]{64}$/);
    expect(retry.results[0]).toEqual(
      expect.objectContaining({
        action: "created",
        professionalId: firstId,
      }),
    );
    expect(
      [...mockDocs.keys()].filter(
        (key) =>
          key.startsWith("partnership_crm_professionals/") &&
          key.split("/").length === 2,
      ),
    ).toEqual([`partnership_crm_professionals/${firstId}`]);
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(
      mockQueryReadLog.filter(
        (entry) => entry.collectionName === "partnership_crm_professionals",
      ),
    ).toHaveLength(1);
  });

  it("strips editorial labels from professional editor fit import preview values", async () => {
    const { previewPartnershipCrmProfessionalImport } =
      await import("../repositories/partnership-crm.repository");

    const preview = await previewPartnershipCrmProfessionalImport(
      godModeContext,
      [
        {
          rowId: "row-1",
          name: "Dra. Ada Genome",
          potentialPocketGenesEditorFit:
            "Propuesta editorial: 'Rare disease handbook.,'",
        },
      ],
    );

    expect(preview.rows[0]?.professional.potentialPocketGenesEditorFit).toBe(
      "Rare disease handbook",
    );
  });

  it("does not flag professional duplicates by shared identity fields when names are unrelated", async () => {
    const { previewPartnershipCrmProfessionalImport } =
      await import("../repositories/partnership-crm.repository");
    seedProfessional("existing", 1, "pro_bioinformaticians");
    mockDocs.set(mockDocKey("partnership_crm_professionals", "existing"), {
      ...(mockDocs.get(
        mockDocKey("partnership_crm_professionals", "existing"),
      ) ?? {}),
      name: "Nicolás Palopoli",
      normalizedName: "nicolas palopoli",
      website: "https://bioinformatica.org/about/",
      websiteDomain: "bioinformatica.org",
      email: "contacto@bioinformatica.org",
      linkedIn: "https://linkedin.com/in/npalopoli",
    });

    const preview = await previewPartnershipCrmProfessionalImport(
      godModeContext,
      [
        {
          rowId: "row-1",
          name: "Adalí Pecci",
          website: "https://bioinformatica.org/team/",
          email: "contacto@bioinformatica.org",
          linkedIn: "https://linkedin.com/in/npalopoli",
        },
      ],
    );

    expect(preview.rows[0]?.duplicateCandidates).toEqual([]);
    expect(preview.summary.duplicates).toBe(0);
  });

  it("keeps professional duplicate candidates when the names are compatible", async () => {
    const { previewPartnershipCrmProfessionalImport } =
      await import("../repositories/partnership-crm.repository");
    seedProfessional("existing", 1, "pro_bioinformaticians");
    mockDocs.set(mockDocKey("partnership_crm_professionals", "existing"), {
      ...(mockDocs.get(
        mockDocKey("partnership_crm_professionals", "existing"),
      ) ?? {}),
      name: "Dra. Ada Genome",
      normalizedName: "dra ada genome",
      website: "https://genomelab.example/",
      websiteDomain: "genomelab.example",
    });

    const preview = await previewPartnershipCrmProfessionalImport(
      godModeContext,
      [
        {
          rowId: "row-1",
          name: "Ada Genome",
          website: "https://genomelab.example/team",
        },
      ],
    );

    expect(preview.rows[0]?.duplicateCandidates).toEqual([
      expect.objectContaining({ id: "existing", name: "Dra. Ada Genome" }),
    ]);
    expect(preview.summary.duplicates).toBe(1);
  });

  it("flags organization duplicates when one name is a prefix of the other", async () => {
    const { previewPartnershipCrmImport } =
      await import("../repositories/partnership-crm.repository");
    seedOrganization("genesia", 1, "org_genomics_laboratories");
    mockDocs.set(mockDocKey("partnership_crm_organizations", "genesia"), {
      ...(mockDocs.get(
        mockDocKey("partnership_crm_organizations", "genesia"),
      ) ?? {}),
      name: "Genesia - Medicina Personalizada",
      normalizedName: "genesia medicina personalizada",
      website: "",
      websiteDomain: "",
    });

    const preview = await previewPartnershipCrmImport(godModeContext, [
      {
        rowId: "row-1",
        name: "Genesia",
        website: "",
      },
    ]);

    expect(preview.rows[0]?.duplicateCandidates).toEqual([
      expect.objectContaining({
        id: "genesia",
        name: "Genesia - Medicina Personalizada",
      }),
    ]);
    expect(preview.summary.duplicates).toBe(1);
  });

  it("flags organization duplicates when the imported name extends an existing name", async () => {
    const { previewPartnershipCrmImport } =
      await import("../repositories/partnership-crm.repository");
    seedOrganization("genesia", 1, "org_genomics_laboratories");
    mockDocs.set(mockDocKey("partnership_crm_organizations", "genesia"), {
      ...(mockDocs.get(
        mockDocKey("partnership_crm_organizations", "genesia"),
      ) ?? {}),
      name: "Genesia",
      normalizedName: "genesia",
      website: "",
      websiteDomain: "",
    });

    const preview = await previewPartnershipCrmImport(godModeContext, [
      {
        rowId: "row-1",
        name: "Genesia - Medicina Personalizada",
        website: "",
      },
    ]);

    expect(preview.rows[0]?.duplicateCandidates).toEqual([
      expect.objectContaining({
        id: "genesia",
        name: "Genesia",
      }),
    ]);
    expect(preview.summary.duplicates).toBe(1);
  });

  it("does not match a multi-author professional row to one listed author", async () => {
    const { previewPartnershipCrmProfessionalImport } =
      await import("../repositories/partnership-crm.repository");
    seedProfessional("existing", 1, "pro_research_scientists");
    mockDocs.set(mockDocKey("partnership_crm_professionals", "existing"), {
      ...(mockDocs.get(
        mockDocKey("partnership_crm_professionals", "existing"),
      ) ?? {}),
      name: "Manuel de la Mata",
      normalizedName: "manuel de la mata",
      website: "https://bioinformatica.org/about/",
      websiteDomain: "bioinformatica.org",
    });

    const preview = await previewPartnershipCrmProfessionalImport(
      godModeContext,
      [
        {
          rowId: "row-1",
          name: "Federico Damián Ariel, Manuel de la Mata, Ezequiel Petrillo, Manuel Javier Muñoz, Santiago Andrés Rodríguez Seguí",
          website: "https://bioinformatica.org/about/",
        },
      ],
    );

    expect(preview.rows[0]?.duplicateCandidates).toEqual([]);
    expect(preview.summary.duplicates).toBe(0);
  });

  it("fills missing organization fields without replacing existing values", async () => {
    const { importPartnershipCrmOrganizations } =
      await import("../repositories/partnership-crm.repository");
    seedOrganization("existing", 1, "");
    const existingKey = mockDocKey("partnership_crm_organizations", "existing");
    mockDocs.set(existingKey, {
      ...(mockDocs.get(existingKey) ?? {}),
      name: "Existing Genome Lab",
      normalizedName: "existing genome lab",
      category: "",
      website: "",
      websiteDomain: "",
      country: "",
      status: "contacted",
      contactName: "",
      contactEmail: "old@example.org",
      notes: "Keep this note",
      is_favorite: false,
    });

    const result = await importPartnershipCrmOrganizations(godModeContext, [
      {
        rowId: "row-1",
        name: "Existing Genome Lab",
        category: "org_genomics_laboratories",
        website: "https://new.example.org/",
        country: "US",
        status: "partner",
        contactName: "New Contact",
        contactEmail: "new@example.org",
        notes: "Incoming note",
        is_favorite: true,
        duplicateAction: "fill_missing",
        duplicateOrganizationId: "existing",
      },
    ]);

    expect(result.summary).toEqual(
      expect.objectContaining({ total: 1, created: 0, updated: 1 }),
    );
    const updated = mockDocs.get(existingKey);
    expect(updated).toEqual(
      expect.objectContaining({
        name: "Existing Genome Lab",
        category: "org_genomics_laboratories",
        website: "https://new.example.org/",
        websiteDomain: "new.example.org",
        country: "US",
        status: "contacted",
        contactName: "New Contact",
        contactEmail: "old@example.org",
        notes: "Keep this note",
        is_favorite: false,
        createdAt: mockIsoAt(1),
        updatedByEmail: "admin@example.org",
      }),
    );
  });

  it("keeps structured JSON notes when automatic organization compatibility replaces variables", async () => {
    const { importPartnershipCrmOrganizations } =
      await import("../repositories/partnership-crm.repository");
    seedOrganization("existing", 1, "org_genomics_laboratories");
    const existingKey = mockDocKey("partnership_crm_organizations", "existing");
    mockDocs.set(existingKey, {
      ...(mockDocs.get(existingKey) ?? {}),
      name: "Existing Genome Lab",
      normalizedName: "existing genome lab",
      website: "https://old.example.org/",
      websiteDomain: "old.example.org",
      contactName: "Old Contact",
      notes: "Legacy plain note",
    });

    const incomingNotes = JSON.stringify({
      instagram: "https://www.instagram.com/adnsalta/",
      services: "NIPT listed as a purchasable service.",
    });

    const result = await importPartnershipCrmOrganizations(godModeContext, [
      {
        rowId: "row-1",
        name: "Existing Genome Lab",
        website: "https://new.example.org/",
        contactName: "New Contact",
        notes: incomingNotes,
        duplicateAction: "replace_variables",
        duplicateOrganizationId: "existing",
      },
    ]);

    expect(result.summary).toEqual(
      expect.objectContaining({ total: 1, created: 0, updated: 1 }),
    );
    const updated = mockDocs.get(existingKey);
    expect(updated).toEqual(
      expect.objectContaining({
        name: "Existing Genome Lab",
        website: "https://new.example.org/",
        websiteDomain: "new.example.org",
        contactName: "New Contact",
        notes: JSON.stringify({
          instagram: "https://www.instagram.com/adnsalta/",
          services: "NIPT listed as a purchasable service.",
          previous_notes: "Legacy plain note",
        }),
      }),
    );
  });

  it("converts colon-formatted legacy notes to JSON before automatic compatibility merge", async () => {
    const { importPartnershipCrmOrganizations } =
      await import("../repositories/partnership-crm.repository");
    seedOrganization("existing", 1, "org_genomics_laboratories");
    const existingKey = mockDocKey("partnership_crm_organizations", "existing");
    mockDocs.set(existingKey, {
      ...(mockDocs.get(existingKey) ?? {}),
      name: "Existing Genome Lab",
      normalizedName: "existing genome lab",
      notes: [
        "**Partnership fit: Mobile delivery for hereditary and prenatal genetic reports. Next step: Demo one of Genos' current reports in Pocket Genes and propose a small local pilot.**",
        "**Reviewed: 2026-09-12.**",
        "**Instagram: https://www.instagram.com/genosargentina/**",
      ].join("\n"),
    });

    const incomingNotes = JSON.stringify({
      instagram: "https://www.instagram.com/adnsalta/",
      services: "NIPT listed as a purchasable service.",
    });

    const result = await importPartnershipCrmOrganizations(godModeContext, [
      {
        rowId: "row-1",
        name: "Existing Genome Lab",
        notes: incomingNotes,
        duplicateAction: "replace_variables",
        duplicateOrganizationId: "existing",
      },
    ]);

    expect(result.summary).toEqual(
      expect.objectContaining({ total: 1, created: 0, updated: 1 }),
    );
    const updated = mockDocs.get(existingKey);
    expect(updated).toEqual(
      expect.objectContaining({
        notes: JSON.stringify({
          partnership_fit:
            "Mobile delivery for hereditary and prenatal genetic reports. Next step: Demo one of Genos' current reports in Pocket Genes and propose a small local pilot.",
          reviewed: "2026-09-12.",
          instagram: "https://www.instagram.com/adnsalta/",
          services: "NIPT listed as a purchasable service.",
        }),
      }),
    );
  });

  it("replaces professional variable fields while preserving existing non-variable values", async () => {
    const { importPartnershipCrmProfessionals } =
      await import("../repositories/partnership-crm.repository");
    seedProfessional("existing", 1, "pro_bioinformaticians");
    const existingKey = mockDocKey("partnership_crm_professionals", "existing");
    mockDocs.set(existingKey, {
      ...(mockDocs.get(existingKey) ?? {}),
      name: "Existing Researcher",
      normalizedName: "existing researcher",
      category: "pro_bioinformaticians",
      title: "Old title",
      primaryAffiliation: "Old Institute",
      potentialPocketGenesEditorFit: "old bioinformatics fit",
      emailRoute: "Old public route",
      linkedInRoute: "Old linkedIn route",
      researchBasis: "Old research basis",
      website: "https://old.example.org/",
      websiteDomain: "old.example.org",
      country: "AR",
      status: "contacted",
      email: "old@example.org",
      linkedIn: "https://linkedin.com/in/old-researcher",
      notes: "Keep this note",
      is_favorite: true,
    });

    const result = await importPartnershipCrmProfessionals(godModeContext, [
      {
        rowId: "row-1",
        name: "Existing Researcher",
        category: "pro_clinical_geneticists",
        title: "New title",
        primaryAffiliation: "New Institute",
        potentialPocketGenesEditorFit: "new genomics fit",
        emailRoute: "New public route",
        linkedInRoute: "New LinkedIn route",
        researchBasis: "New research basis",
        website: "https://new.example.org/profile",
        country: "US",
        status: "partner",
        email: "new@example.org",
        linkedIn: "https://linkedin.com/in/new-researcher",
        notes: "Incoming note",
        is_favorite: false,
        duplicateAction: "replace_variables",
        duplicateProfessionalId: "existing",
      },
    ]);

    expect(result.summary).toEqual(
      expect.objectContaining({ total: 1, created: 0, updated: 1 }),
    );
    const updated = mockDocs.get(existingKey);
    expect(updated).toEqual(
      expect.objectContaining({
        name: "Existing Researcher",
        category: "pro_bioinformaticians",
        title: "New title",
        primaryAffiliation: "New Institute",
        potentialPocketGenesEditorFit: "new genomics fit",
        emailRoute: "New public route",
        linkedInRoute: "New LinkedIn route",
        researchBasis: "New research basis",
        website: "https://new.example.org/profile",
        websiteDomain: "new.example.org",
        country: "AR",
        status: "contacted",
        email: "old@example.org",
        linkedIn: "https://linkedin.com/in/old-researcher",
        notes: "Keep this note",
        is_favorite: true,
        createdAt: mockIsoAt(1),
        updatedByEmail: "admin@example.org",
      }),
    );
  });
});
