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
  | { type: "limit"; count: number };
type MockQueryDocumentSnapshot = {
  exists: true;
  id: string;
  data: () => MockDocData;
  ref: {
    set: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    collection: jest.Mock;
  };
};
type MockQuery = {
  doc: (id?: string) => {
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

function mockComparableValue(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value ?? "");
}

function mockCompareValues(
  left: unknown,
  right: unknown,
  direction: "asc" | "desc",
) {
  const comparison = mockComparableValue(left).localeCompare(
    mockComparableValue(right),
  );
  return direction === "desc" ? comparison * -1 : comparison;
}

function mockDocumentRef(collectionName: string, id: string) {
  return {
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

  return docs.map((doc) => mockDocumentSnapshotFor(collectionName, doc));
}

function mockMakeQuery(
  collectionName: string,
  operations: MockQueryOperation[] = [],
): MockQuery {
  return {
    doc: (id = `mock-doc-${mockDocs.size + 1}`) => ({
      get: jest.fn(async () => {
        const data = mockDocs.get(mockDocKey(collectionName, id));
        return {
          exists: Boolean(data),
          id,
          data: () => data,
          ref: mockDocumentRef(collectionName, id),
        };
      }),
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
    select: jest.fn(() => mockMakeQuery(collectionName, operations)),
    count: jest.fn(() => ({
      get: jest.fn(async () => ({
        data: () => ({
          count: mockApplyQueryOperations(collectionName, operations).length,
        }),
      })),
    })),
    get: jest.fn(async () => {
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
    private constructor(private readonly date: Date) {}

    static fromDate(date: Date) {
      return new MockTimestamp(date);
    }

    toDate() {
      return this.date;
    }
  }

  return {
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
  })),
}));

jest.mock("../lib/partnership-crm-email.js", () => ({
  PARTNERSHIP_CRM_FROM_EMAIL: "partners@example.org",
  hasApprovedPartnershipCrmEmailClosing: jest.fn((value: string) =>
    value
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim()
      .endsWith(
        [
          "Te comparto nuestro link para que puedas conocer la propuesta y sumarte a la red:",
          "",
          "https://goldencrowvs.com/pocket-genes/join-us/",
          "",
          "Quedamos a la espera de tu respuesta.",
          "",
          "Saludos,",
          "Federico",
        ].join("\n"),
      ),
  ),
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
const approvedPartnershipCrmEmailClosing = [
  "Te comparto nuestro link para que puedas conocer la propuesta y sumarte a la red:",
  "",
  "https://goldencrowvs.com/pocket-genes/join-us/",
  "",
  "Quedamos a la espera de tu respuesta.",
  "",
  "Saludos,",
  "Federico",
].join("\n");

function withApprovedPartnershipCrmEmailClosing(body: string) {
  return `${body}\n\n${approvedPartnershipCrmEmailClosing}`;
}

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

  it("returns all filtered organizations on one page when fewer than the page limit match", async () => {
    const { listPartnershipCrmOrganizations } =
      await import("../repositories/partnership-crm.repository");

    for (let index = 0; index < 160; index += 1) {
      seedOrganization(`skip-${index}`, index, "org_fertility_clinics");
    }
    for (let index = 0; index < 12; index += 1) {
      seedOrganization(
        `match-${index}`,
        160 + index,
        "org_genomics_laboratories",
      );
    }

    const page = await listPartnershipCrmOrganizations(godModeContext, {
      category: "org_genomics_laboratories",
      limit: 50,
    });

    expect(page.organizations.map((organization) => organization.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `match-${index}`),
    );
    expect(page.nextCursor).toBeUndefined();
    expect(page.statusCounts.new).toBe(12);
  });

  it("returns all filtered professionals on one page when fewer than the page limit match", async () => {
    const { listPartnershipCrmProfessionals } =
      await import("../repositories/partnership-crm.repository");

    for (let index = 0; index < 160; index += 1) {
      seedProfessional(`skip-${index}`, index, "pro_other");
    }
    for (let index = 0; index < 12; index += 1) {
      seedProfessional(
        `match-${index}`,
        160 + index,
        "pro_clinical_geneticists",
      );
    }

    const page = await listPartnershipCrmProfessionals(godModeContext, {
      category: "pro_clinical_geneticists",
      limit: 50,
    });

    expect(page.professionals.map((professional) => professional.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `match-${index}`),
    );
    expect(page.nextCursor).toBeUndefined();
    expect(page.statusCounts.new).toBe(12);
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

  it("rejects organization emails that do not end with the approved closing", async () => {
    const { sendPartnershipCrmOrganizationEmail } = await import(
      "../repositories/partnership-crm.repository"
    );
    const { sendPartnershipCrmEmail } = await import(
      "../lib/partnership-crm-email.js"
    );
    seedOrganization("org-1", 1, "org_genomics_laboratories");

    await expect(
      sendPartnershipCrmOrganizationEmail(godModeContext, "org-1", {
        to: "ada@example.org",
        subject: "Pocket Genes + Ada",
        text: "Hola Ada,\n\nTe escribo sobre Pocket Genes.\n\nSaludos,\nFederico",
      }),
    ).rejects.toThrow(
      "CRM email must end with the approved closing and Federico signature.",
    );
    expect(sendPartnershipCrmEmail).not.toHaveBeenCalled();
  });

  it("sends organization emails when the approved closing is present", async () => {
    const { sendPartnershipCrmOrganizationEmail } = await import(
      "../repositories/partnership-crm.repository"
    );
    const { sendPartnershipCrmEmail } = await import(
      "../lib/partnership-crm-email.js"
    );
    seedOrganization("org-1", 1, "org_genomics_laboratories");
    const text = withApprovedPartnershipCrmEmailClosing(
      "Hola Ada,\n\nTe escribo sobre Pocket Genes.",
    );

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
