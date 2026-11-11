import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

type Data = Record<string, unknown>;
const mockStore = new Map<string, Map<string, Data>>();
const mockReads: Array<{ collection: string; limit?: number; id?: string }> =
  [];
const mockWrites: Array<{ collection: string; id: string }> = [];
let mockCommitError: Error | null = null;

function docs(collection: string) {
  if (!mockStore.has(collection)) mockStore.set(collection, new Map());
  return mockStore.get(collection)!;
}
function reference(collection: string, id: string) {
  return {
    collectionName: collection,
    id,
    get: async () => {
      mockReads.push({ collection, id });
      return {
        id,
        exists: docs(collection).has(id),
        data: () => docs(collection).get(id),
      };
    },
  };
}
function query(
  collection: string,
  filters: Array<[string, unknown]> = [],
  limit?: number,
) {
  return {
    doc: (id: string) => reference(collection, id),
    where: (key: string, _operator: string, value: unknown) =>
      query(collection, [...filters, [key, value]], limit),
    limit: (count: number) => query(collection, filters, count),
    get: async () => {
      mockReads.push({ collection, limit });
      return {
        docs: [...docs(collection)]
          .filter(([, value]) =>
            filters.every(([key, expected]) => value[key] === expected),
          )
          .slice(0, limit)
          .map(([id, value]) => ({ id, data: () => value })),
      };
    },
  };
}
jest.mock("../config/firebase.js", () => ({
  adminDbFor: () => ({
    collection: (name: string) => query(name),
    runTransaction: async (
      callback: (transaction: unknown) => Promise<unknown>,
    ) => {
      const pending: Array<{
        ref: ReturnType<typeof reference>;
        data: Data;
        create: boolean;
      }> = [];
      const result = await callback({
        get: (target: { get: () => unknown }) => target.get(),
        create: (ref: ReturnType<typeof reference>, data: Data) =>
          pending.push({ ref, data, create: true }),
        set: (ref: ReturnType<typeof reference>, data: Data) =>
          pending.push({ ref, data, create: false }),
      });
      if (mockCommitError) throw mockCommitError;
      for (const { ref, create } of pending)
        if (create && docs(ref.collectionName).has(ref.id))
          throw new Error("Already exists");
      for (const { ref, data } of pending) {
        docs(ref.collectionName).set(ref.id, data);
        mockWrites.push({ collection: ref.collectionName, id: ref.id });
      }
      return result;
    },
  }),
}));

import {
  importPartnerCsv,
  previewPartnerCsv,
} from "../repositories/partner-csv-import.repository.js";
import { connectedPartnersRoutes } from "../routes/connected-partners.routes.js";

const context: AdminContext = {
  uid: "god",
  email: "god@example.com",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap"],
};
const importId = "b6e38ab3-2651-4ad6-81e0-26c696b667d2";
const secondId = "4f7f9f95-6592-42eb-b51f-99419b2c180c";
const columns = [
  "companyName",
  "firstName",
  "lastName",
  "email",
  "phoneNumber",
  "meetingDate",
  "notes",
  "linkedOrganizationId",
  "linkedIndividualPublisherId",
  "linkedAppId",
];
function csv(...rows: Data[]) {
  return [
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((key) => {
          const value = String(
            {
              companyName: "Genome Studio",
              firstName: "Ada",
              lastName: "Rivera",
              email: "ada@example.com",
              ...row,
            }[key] ?? "",
          );
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");
}
function seedLinks() {
  docs("feed_organizations").set("org", { name: "Genome Studio" });
  docs("feed_individuals").set("person", { name: "Ada Rivera" });
  docs("app_configs").set("individual_person", {
    publisherKind: "individual",
    publisherId: "person",
    publisherName: "Ada Rivera",
    status: "active_for_testing",
    appProviderIdentifier: "app_ind_ada_12345",
  });
}
async function server(adminContext: AdminContext | null = context) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook("onRequest", async (request) => {
    request.adminContext = adminContext ?? undefined;
  });
  await app.register(connectedPartnersRoutes);
  return app;
}
beforeEach(() => {
  mockStore.clear();
  mockReads.length = 0;
  mockWrites.length = 0;
  mockCommitError = null;
});

it("previews normalized partners, duplicate emails and errors without writing any record", async () => {
  docs("connected-partners").set("existing", {
    email: "existing@example.com",
    companyName: "Original",
  });
  const preview = await previewPartnerCsv(
    context,
    csv(
      {},
      { email: " ADA@example.com " },
      { email: "existing@example.com" },
      { email: "invalid" },
    ),
  );
  expect(preview.summary).toEqual({
    total: 4,
    ready: 1,
    duplicates: 2,
    invalid: 1,
  });
  expect(preview.rows.map((row) => row.status)).toEqual([
    "ready",
    "duplicate",
    "duplicate",
    "invalid",
  ]);
  expect(preview.rows[0]?.input?.phoneNumber).toBe("");
  expect(mockWrites).toEqual([]);
  expect(
    mockReads.filter((read) => !read.id).every((read) => read.limit === 1),
  ).toBe(true);
});

it("resolves public app IDs and freezes current snapshots while deriving its owner and preserving the other publisher", async () => {
  seedLinks();
  const file = csv({
    linkedOrganizationId: "org",
    linkedAppId: "app_ind_ada_12345",
  });
  const preview = await previewPartnerCsv(context, file);
  expect(preview.rows[0]?.input).toMatchObject({
    linkedOrganizationId: "org",
    linkedIndividualPublisherId: "person",
    linkedAppId: "individual_person",
  });
  const result = await importPartnerCsv(context, file, importId);
  expect(result).toMatchObject({ importedCount: 1, skippedCount: 0 });
  expect(docs("connected-partners").get(result.partnerIds[0]!)).toMatchObject({
    phoneNumber: "",
    linkedOrganizationSnapshot: { id: "org", name: "Genome Studio" },
    linkedIndividualPublisherSnapshot: { id: "person", name: "Ada Rivera" },
    linkedAppSnapshot: {
      publisherKind: "individual",
      status: "active_for_testing",
    },
  });
  expect(
    mockWrites.every((write) =>
      [
        "connected-partners",
        "connected-partner-imports",
        "connected-partner-import-emails",
      ].includes(write.collection),
    ),
  ).toBe(true);
  expect(
    mockReads
      .filter((read) => !read.id)
      .every((read) => [1, 2].includes(read.limit!)),
  ).toBe(true);
});

it.each([
  { email: "other@example.com", linkedOrganizationId: "missing" },
  { email: "other@example.com", linkedIndividualPublisherId: "other", linkedAppId: "individual_person" },
  { linkedOrganizationId: "missing" },
])("imports valid rows while skipping invalid links or invalid duplicates: %j", async (invalid) => {
  seedLinks();
  docs("feed_individuals").set("other", { name: "Other" });
  const result = await importPartnerCsv(context, csv({}, invalid), importId);
  expect(result).toMatchObject({ importedCount: 1, skippedCount: 1, invalidRows: [{ rowNumber: 3, errors: [expect.any(String)] }] });
  expect(docs("connected-partners").size).toBe(1);
  expect(docs("connected-partner-imports").size).toBe(1);
  expect(docs("connected-partner-import-emails").size).toBe(1);
});

it("commits new rows atomically, skips existing and repeated emails and never overwrites them", async () => {
  docs("connected-partners").set("existing", {
    email: "existing@example.com",
    companyName: "Original",
  });
  const file = csv(
    {},
    { companyName: "Other new", email: "other@example.com" },
    { email: "ADA@example.com" },
    { email: "existing@example.com", companyName: "Replacement" },
  );
  mockCommitError = new Error("Commit failed");
  await expect(importPartnerCsv(context, file, importId)).rejects.toThrow(
    "Commit failed",
  );
  expect(docs("connected-partners").size).toBe(1);
  expect(docs("connected-partner-imports").size).toBe(0);
  mockCommitError = null;
  const result = await importPartnerCsv(context, file, importId);
  expect(result).toMatchObject({ importedCount: 2, skippedCount: 2 });
  expect(result.partnerIds).toHaveLength(2);
  expect(docs("connected-partners").get("existing")).toEqual({
    email: "existing@example.com",
    companyName: "Original",
  });
  const another = await importPartnerCsv(context, file, secondId);
  expect(another).toEqual({
    importedCount: 0,
    skippedCount: 4,
    partnerIds: [],
    invalidRows: [],
  });
  expect(docs("connected-partners").size).toBe(3);
});

it("skips malformed rows without reserving their emails, replays partial results, and imports corrections later", async () => {
  seedLinks();
  const file = csv(
    { email: "first@example.com", firstName: "", lastName: "", linkedOrganizationId: "org" },
    { email: "broken@example.com", linkedOrganizationId: "missing" },
    { email: "not-an-email" },
    { email: "person@example.com", firstName: "Prince", lastName: "", linkedIndividualPublisherId: "person" },
    { email: "first@example.com" },
  );
  const result = await importPartnerCsv(context, file, importId);
  expect(result).toMatchObject({ importedCount: 2, skippedCount: 3, invalidRows: [{ rowNumber: 3 }, { rowNumber: 4 }] });
  expect(docs("connected-partners").size).toBe(2);
  expect(docs("connected-partner-import-emails").size).toBe(2);
  expect([...docs("connected-partner-import-emails").values()].some(data => data.email === "broken@example.com")).toBe(false);
  const saved = [...docs("connected-partners").values()].find(data => data.email === "first@example.com");
  expect(saved).toMatchObject({ firstName: "", lastName: "", linkedOrganizationId: "org" });
  docs("feed_organizations").set("missing", { name: "Now available" });
  expect(await importPartnerCsv(context, file, importId)).toEqual(result);
  const corrected = csv(
    { email: "first@example.com", firstName: "", lastName: "", linkedOrganizationId: "org" },
    { email: "broken@example.com", linkedOrganizationId: "missing" },
    { email: "fixed@example.com" },
    { email: "person@example.com", lastName: "", linkedIndividualPublisherId: "person" },
  );
  expect(await importPartnerCsv(context, corrected, secondId)).toMatchObject({ importedCount: 2, skippedCount: 2, invalidRows: [] });
  expect(docs("connected-partners").size).toBe(4);
});

it("does not let an earlier invalid row block a later valid row with the same email", async () => {
  const result = await importPartnerCsv(context, csv({ linkedOrganizationId: "missing" }, { firstName: "", lastName: "" }), importId);
  expect(result).toMatchObject({ importedCount: 1, skippedCount: 1, invalidRows: [{ rowNumber: 2 }] });
  expect(docs("connected-partner-import-emails").size).toBe(1);
});

it("imports canonical organization and mononym professional export rows without supplying contact names", async () => {
  seedLinks();
  const file = 'companyName,firstName,lastName,email,phoneNumber,meetingDate,notes,linkedOrganizationId,linkedIndividualPublisherId,linkedAppId\r\n"Genome Studio","","","hello@example.com","","","","org","",""\r\n"Prince","Prince","","prince@example.com","","","","org","person",""\r\n';
  const result = await importPartnerCsv(context, file, importId);
  expect(result).toMatchObject({ importedCount: 2, skippedCount: 0, invalidRows: [] });
  const saved = [...docs("connected-partners").values()];
  expect(saved.find(data => data.email === "hello@example.com")).toMatchObject({ firstName: "", lastName: "", linkedOrganizationId: "org" });
  expect(saved.find(data => data.email === "prince@example.com")).toMatchObject({ firstName: "Prince", lastName: "", linkedOrganizationId: "org", linkedIndividualPublisherId: "person" });
});

it("replays a completed import without consulting changed or deleted linked records and rejects reused IDs for different files", async () => {
  seedLinks();
  const file = csv({ linkedAppId: "individual_person" });
  const result = await importPartnerCsv(context, file, importId);
  docs("app_configs").clear();
  docs("feed_individuals").clear();
  mockReads.length = 0;
  mockWrites.length = 0;
  expect(await importPartnerCsv(context, file, importId)).toEqual(result);
  expect(mockReads).toEqual([
    { collection: "connected-partner-imports", id: importId },
  ]);
  expect(mockWrites).toEqual([]);
  await expect(
    importPartnerCsv(
      context,
      csv({ email: "different@example.com" }),
      importId,
    ),
  ).rejects.toMatchObject({ statusCode: 409 });
});

it("replays manifests created before invalid-row results were recorded", async () => {
  seedLinks();
  const file = csv({ linkedAppId: "individual_person" });
  const result = await importPartnerCsv(context, file, importId);
  delete docs("connected-partner-imports").get(importId)!.invalidRows;
  docs("app_configs").clear();
  docs("feed_individuals").clear();
  mockReads.length = 0;
  mockWrites.length = 0;
  expect(await importPartnerCsv(context, file, importId)).toEqual({ ...result, invalidRows: [] });
  expect(mockReads).toEqual([{ collection: "connected-partner-imports", id: importId }]);
  expect(mockWrites).toEqual([]);
});

it("rejects noncanonical invalid-row manifest keys", async () => {
  const file = csv({});
  await importPartnerCsv(context, file, importId);
  const manifest = docs("connected-partner-imports").get(importId)!;
  manifest.invalid_rows = manifest.invalidRows;
  delete manifest.invalidRows;
  await expect(importPartnerCsv(context, file, importId)).rejects.toThrow();
});

it("repairs stale email indexes after manual email changes or deletion without changing the older partner", async () => {
  const first = await importPartnerCsv(context, csv({}), importId);
  const oldId = first.partnerIds[0]!;
  docs("connected-partners").get(oldId)!.email = "changed@example.com";
  const second = await importPartnerCsv(context, csv({}), secondId);
  expect(second.importedCount).toBe(1);
  expect(second.partnerIds[0]).not.toBe(oldId);
  expect(docs("connected-partners").get(oldId)?.email).toBe(
    "changed@example.com",
  );
  docs("connected-partners").delete(second.partnerIds[0]!);
  const third = await importPartnerCsv(
    context,
    csv({}),
    "2a7bf995-d61f-4ddc-8218-3bf58715197f",
  );
  expect(third.importedCount).toBe(1);
  expect(docs("connected-partners").get(oldId)?.email).toBe(
    "changed@example.com",
  );
});

it("rejects ambiguous public app IDs rather than linking an arbitrary app", async () => {
  seedLinks();
  docs("app_configs").set("another", {
    ...docs("app_configs").get("individual_person"),
    publisherId: "other",
  });
  const preview = await previewPartnerCsv(
    context,
    csv({ linkedAppId: "app_ind_ada_12345" }),
  );
  expect(preview.summary.invalid).toBe(1);
  expect(preview.rows[0]?.errors.join(" ")).toContain("more than one app");
});

it("returns protected preview/import API responses, validation details, file errors and body limits", async () => {
  const app = await server();
  try {
    const preview = await app.inject({
      method: "POST",
      url: "/admin/connected-partners/import/preview",
      payload: { csv: csv({}) },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().summary.ready).toBe(1);
    const invalid = await app.inject({
      method: "POST",
      url: "/admin/connected-partners/import",
      payload: { csv: csv({ email: "bad" }), importId },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().preview.summary.invalid).toBe(1);
    const success = await app.inject({
      method: "POST",
      url: "/admin/connected-partners/import",
      payload: { csv: csv({}), importId },
    });
    expect(success.statusCode).toBe(200);
    expect(success.json().importedCount).toBe(1);
    for (const payload of [
      { csv: "unknown\nvalue" },
      { csv: "x".repeat(256 * 1024 + 1) },
      { csv: csv({}), extra: true },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/admin/connected-partners/import/preview",
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
  } finally {
    await app.close();
  }
});

it.each([401, 403])(
  "requires GOD MODE for both CSV endpoints (%s)",
  async (status) => {
    const app = await server(
      status === 401 ? null : { ...context, isBootstrap: false },
    );
    try {
      for (const url of [
        "/admin/connected-partners/import/preview",
        "/admin/connected-partners/import",
      ]) {
        expect(
          (
            await app.inject({
              method: "POST",
              url,
              payload: {
                csv: csv({}),
                ...(url.endsWith("/import") ? { importId } : {}),
              },
            })
          ).statusCode,
        ).toBe(status);
      }
      await expect(
        previewPartnerCsv({ ...context, isBootstrap: false }, csv({})),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        importPartnerCsv({ ...context, isBootstrap: false }, csv({}), importId),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockReads).toEqual([]);
    } finally {
      await app.close();
    }
  },
);
