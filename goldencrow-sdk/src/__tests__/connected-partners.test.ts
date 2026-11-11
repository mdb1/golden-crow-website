import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import {
  PartnerInputSchema,
  type PartnerInput,
} from "../contracts/connected-partners.js";
import type { AdminContext } from "../types/sdk.types.js";

type StoredData = Record<string, unknown>;
const mockDocs = new Map<string, StoredData>();
const mockLinkedDocs = new Map<string, Map<string, StoredData>>();
const mockReads: Array<{ collection: string; cursor?: string; limit: number; filters: Array<[string, unknown]> }> = [];
const mockDirectReads: string[] = [];
const mockCollections: string[] = [];
let mockNextId = 1;
let mockCommitError: Error | null = null;

function mockCollectionDocs(name: string) {
  if (name === "connected-partners") return mockDocs;
  if (!mockLinkedDocs.has(name)) mockLinkedDocs.set(name, new Map());
  return mockLinkedDocs.get(name)!;
}
function mockDoc(name: string, id = `partner${mockNextId++}`) {
  const docs = mockCollectionDocs(name);
  return {
    id,
    get: async () => {
      mockDirectReads.push(`${name}/${id}`);
      return ({
      id,
      exists: docs.has(id),
      data: () => docs.get(id),
    }); },
    create: async (data: StoredData) => {
      docs.set(id, data);
    },
    update: async (data: StoredData) => {
      if (!docs.has(id))
        throw Object.assign(new Error("Missing"), { code: 5 });
      docs.set(id, data);
    },
  };
}
function mockQuery(name: string, cursor?: string, limit = Infinity, filters: Array<[string, unknown]> = []) {
  return {
    doc: (id?: string) => mockDoc(name, id),
    orderBy: () => mockQuery(name, cursor, limit, filters),
    where: (key: string, _operator: string, value: unknown) => mockQuery(name, cursor, limit, [...filters, [key, value]]),
    startAfter: (value: string) => mockQuery(name, value, limit, filters),
    limit: (value: number) => mockQuery(name, cursor, value, filters),
    get: async () => {
      mockReads.push({ collection: name, cursor, limit, filters });
      return {
        docs: [...mockCollectionDocs(name).entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .filter(([id]) => !cursor || id > cursor)
          .filter(([, data]) => filters.every(([key, value]) => data[key] === value))
          .slice(0, limit)
          .map(([id, data]) => ({ id, data: () => data })),
      };
    },
  };
}
jest.mock("../config/firebase.js", () => ({
  adminDbFor: (project: string) => {
    if (project !== "mydnamap") throw new Error("Wrong project");
    return {
      collection: (name: string) => {
        mockCollections.push(name);
        return mockQuery(name);
      },
      batch: () => {
        const ids: string[] = [];
        return {
          delete: (ref: { id: string }) => ids.push(ref.id),
          commit: async () => {
            if (mockCommitError) throw mockCommitError;
            ids.forEach((id) => mockDocs.delete(id));
          },
        };
      },
    };
  },
}));

import {
  createPartner,
  deletePartners,
  getPartner,
  listPartners,
  listPartnerLinkOptions,
  updatePartner,
} from "../repositories/connected-partners.repository.js";
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
const input: PartnerInput = {
  companyName: "Acme",
  firstName: "Ana",
  lastName: "Smith",
  phoneNumber: "+54 11 1234",
  email: "ana@example.com",
  meetingDate: null,
  notes: null,
  linkedOrganizationId: null,
  linkedIndividualPublisherId: null,
  linkedAppId: null,
};
const emptySnapshots = { linkedOrganizationSnapshot: null, linkedIndividualPublisherSnapshot: null, linkedAppSnapshot: null };
const emptyLiveLinks = { linkedOrganization: null, linkedIndividualPublisher: null, linkedApp: null };

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
  mockDocs.clear();
  mockLinkedDocs.clear();
  mockDirectReads.length = 0;
  mockReads.length = 0;
  mockCollections.length = 0;
  mockNextId = 1;
  mockCommitError = null;
});

it("stores contact fields with null optional links and clears optional values on edit", async () => {
  const created = await createPartner(context, {
    ...input,
    companyName: " Acme ",
    email: " ANA@example.com ",
    notes: "  Hello  ",
    meetingDate: "2026-11-10",
  });
  expect(mockDocs.get(created.id)).toEqual({
    ...input,
    ...emptySnapshots,
    notes: "Hello",
    meetingDate: "2026-11-10",
  });
  await updatePartner(context, created.id, { ...input, notes: "  " });
  expect(await getPartner(context, created.id)).toEqual({
    ...input,
    ...emptySnapshots,
    ...emptyLiveLinks,
    id: created.id,
  });
  expect(mockCollections.every((name) => name === "connected-partners")).toBe(
    true,
  );
  await expect(updatePartner(context, "missing", input)).rejects.toMatchObject({
    statusCode: 404,
  });
});

it("bounds every list read and pages after the last returned ID even if it was deleted", async () => {
  for (let index = 0; index < 42; index++)
    mockDocs.set(`p${String(index).padStart(3, "0")}`, input);
  const first = await listPartners(context);
  expect(first.items).toHaveLength(20);
  expect(first.nextCursor).toBe("p019");
  mockDocs.delete("p019");
  const second = await listPartners(context, first.nextCursor!);
  expect(second.items).toHaveLength(20);
  expect(second.items[0]?.id).toBe("p020");
  const third = await listPartners(context, second.nextCursor!);
  expect(third.items).toHaveLength(2);
  expect(third.nextCursor).toBeNull();
  expect(mockReads.every((read) => read.limit === 21)).toBe(true);
});

it("deletes only selected contacts atomically and leaves unselected contacts intact", async () => {
  ["one", "two", "three"].forEach((id) => mockDocs.set(id, input));
  mockCommitError = new Error("Write failed");
  await expect(deletePartners(context, ["one", "two"])).rejects.toThrow(
    "Write failed",
  );
  expect(mockDocs.size).toBe(3);
  mockCommitError = null;
  expect(await deletePartners(context, ["one", "two", "one"])).toEqual({
    deletedIds: ["one", "two"],
  });
  expect([...mockDocs.keys()]).toEqual(["three"]);
  await expect(deletePartners(context, ["../outside"])).rejects.toMatchObject({
    statusCode: 400,
  });
});

it("rejects unauthorized repository access before touching Firestore", async () => {
  const regular = { ...context, isBootstrap: false };
  for (const operation of [
    () => listPartners(regular),
    () => getPartner(regular, "one"),
    () => createPartner(regular, input),
    () => updatePartner(regular, "one", input),
    () => deletePartners(regular, ["one"]),
    () => listPartnerLinkOptions(regular, { kind: "organization" }),
  ])
    await expect(operation()).rejects.toMatchObject({ statusCode: 403 });
  expect(mockCollections).toEqual([]);
});

it("normalizes omitted nullable fields and rejects aliases, unrelated fields, bad dates and invalid email", () => {
  const { notes: _notes, meetingDate: _date, ...required } = input;
  expect(PartnerInputSchema.parse(required)).toEqual(input);
  for (const extra of [
    { company_name: "Wrong" },
    { crmId: "linked" },
    { publisherId: "linked" },
    { meetingDate: "2026-02-30" },
    { email: "invalid" },
    { firstName: " " },
    { linked_organization_id: "org" },
    { linked_app_id: "app" },
    { linked_individual_publisher_id: "person" },
    { linkedIndividualPublisherSnapshot: { id: "person", name: "Spoofed" } },
    { linkedIndividualPublisher: null },
    { linkedIndividualPublisherId: "bad/id" },
    { phoneNumber: null },
    { phoneNumber: 1234 },
    { phoneNumber: "x".repeat(51) },
    { linkedOrganizationSnapshot: { id: "org", name: "Spoofed" } },
    { linkedAppSnapshot: { id: "app", status: "active" } },
    { linkedOrganization: null },
    { linkedApp: null },
    { linkedOrganizationId: "bad/id" },
    { linkedAppId: "bad/id" },
    { linkedOrganizationId: "." },
    { linkedOrganizationId: ".." },
    { linkedAppId: "__reserved__" },
    { linkedAppId: "é".repeat(751) },
  ])
    expect(PartnerInputSchema.safeParse({ ...input, ...extra }).success).toBe(
      false,
    );
});

it("exposes create, read, edit, pagination and bulk deletion through the protected API", async () => {
  const app = await server();
  try {
    const create = await app.inject({
      method: "POST",
      url: "/admin/connected-partners",
      payload: input,
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().partner.id as string;
    expect(
      (await app.inject(`/admin/connected-partners/${id}`)).json().partner,
    ).toEqual({ ...input, ...emptySnapshots, ...emptyLiveLinks, id });
    const edit = await app.inject({
      method: "PUT",
      url: `/admin/connected-partners/${id}`,
      payload: { ...input, notes: "Updated", meetingDate: "2026-11-11" },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().partner.notes).toBe("Updated");
    const list = await app.inject("/admin/connected-partners");
    expect(list.json().items).toHaveLength(1);
    expect(list.json().nextCursor).toBeNull();
    const remove = await app.inject({
      method: "POST",
      url: "/admin/connected-partners/delete",
      payload: { ids: [id] },
    });
    expect(remove.statusCode).toBe(200);
    expect(
      (await app.inject(`/admin/connected-partners/${id}`)).statusCode,
    ).toBe(404);
    expect(
      (await app.inject("/admin/connected-partners?cursor=bad%2Fid"))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/admin/connected-partners",
          payload: { ...input, publisherId: "other" },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await app.close();
  }
});

it.each([401, 403])("gates every endpoint for status %s", async (status) => {
  const app = await server(
    status === 401 ? null : { ...context, isBootstrap: false },
  );
  try {
    for (const request of [
      { method: "GET" as const, url: "/admin/connected-partners" },
      { method: "GET" as const, url: "/admin/connected-partners/one" },
      { method: "GET" as const, url: "/admin/connected-partners/link-options?kind=organization" },
      {
        method: "POST" as const,
        url: "/admin/connected-partners",
        payload: input,
      },
      {
        method: "PUT" as const,
        url: "/admin/connected-partners/one",
        payload: input,
      },
      {
        method: "POST" as const,
        url: "/admin/connected-partners/delete",
        payload: { ids: ["one"] },
      },
    ])
      expect((await app.inject(request)).statusCode).toBe(status);
    expect(mockCollections).toEqual([]);
  } finally {
    await app.close();
  }
});

function seedOrganization(id = "org", name = "Acme Organization") {
  mockCollectionDocs("feed_organizations").set(id, { name });
  return { id, name };
}

function seedApp(overrides: StoredData = {}) {
  const data = {
    publisherKind: "organization", publisherId: "org",
    publisherName: "Acme Organization", status: "active_for_testing", ...overrides,
  };
  mockCollectionDocs("app_configs").set("organization_org", data);
  return {
    id: "organization_org", publisherKind: data.publisherKind, publisherId: data.publisherId,
    publisherName: data.publisherName, status: data.status,
  };
}

it("derives an app's organization and freezes authoritative snapshots without changing linked records", async () => {
  const organization = seedOrganization();
  const app = seedApp();
  const created = await createPartner(context, { ...input, linkedAppId: app.id });
  expect(created).toMatchObject({
    linkedOrganizationId: organization.id, linkedAppId: app.id,
    linkedOrganizationSnapshot: organization, linkedAppSnapshot: app,
    linkedOrganization: organization, linkedApp: app,
  });
  const stored = mockDocs.get(created.id)!;
  expect(stored).not.toHaveProperty("linkedOrganization");
  expect(stored).not.toHaveProperty("linkedApp");
  expect(mockCollectionDocs("feed_organizations").get("org")).toEqual({ name: organization.name });
  expect(mockCollectionDocs("app_configs").get(app.id)).toMatchObject({ status: "active_for_testing" });
  const cleared = await updatePartner(context, created.id, input);
  expect(cleared).toMatchObject({ ...emptySnapshots, ...emptyLiveLinks, linkedOrganizationId: null, linkedAppId: null });
});

it("uses live linked identity and status on each read while preserving historical snapshots and deleted references", async () => {
  const originalOrganization = seedOrganization();
  const originalApp = seedApp();
  const created = await createPartner(context, { ...input, linkedOrganizationId: "org", linkedAppId: originalApp.id });
  mockCollectionDocs("feed_organizations").set("org", { name: "Renamed Organization" });
  mockCollectionDocs("app_configs").get(originalApp.id)!.status = "active_waiting_for_payment";
  const detail = await getPartner(context, created.id);
  expect(detail.linkedOrganizationSnapshot).toEqual(originalOrganization);
  expect(detail.linkedOrganization?.name).toBe("Renamed Organization");
  expect(detail.linkedAppSnapshot).toEqual(originalApp);
  expect(detail.linkedApp?.status).toBe("active_waiting_for_payment");
  expect((await listPartners(context)).items[0]?.linkedApp?.status).toBe("active_waiting_for_payment");
  mockCollectionDocs("app_configs").delete(originalApp.id);
  mockCollectionDocs("feed_organizations").delete("org");
  expect(await getPartner(context, created.id)).toMatchObject({
    linkedOrganizationId: "org", linkedAppId: originalApp.id,
    linkedOrganizationSnapshot: originalOrganization, linkedAppSnapshot: originalApp,
    ...emptyLiveLinks,
  });
});

it("does not expose moved or individual apps as the linked organization's current app", async () => {
  seedOrganization();
  const app = seedApp();
  const created = await createPartner(context, { ...input, linkedAppId: app.id });
  mockCollectionDocs("app_configs").get(app.id)!.publisherId = "other";
  expect((await getPartner(context, created.id)).linkedApp).toBeNull();
  expect((await listPartnerLinkOptions(context, { kind: "app", organizationId: "org" })).items).toEqual([]);
  mockCollectionDocs("app_configs").get(app.id)!.publisherId = "org";
  mockCollectionDocs("app_configs").get(app.id)!.publisherKind = "individual";
  expect((await getPartner(context, created.id)).linkedApp).toBeNull();
});

it("rejects missing or mismatched linked identities before creating a partner", async () => {
  seedOrganization();
  seedOrganization("other", "Other Organization");
  const app = seedApp();
  for (const links of [
    { linkedOrganizationId: "missing", linkedAppId: null },
    { linkedOrganizationId: null, linkedAppId: "missing" },
    { linkedOrganizationId: "other", linkedAppId: app.id },
  ]) await expect(createPartner(context, { ...input, ...links })).rejects.toMatchObject({ statusCode: 400 });
  mockCollectionDocs("app_configs").get(app.id)!.publisherKind = "individual";
  await expect(createPartner(context, { ...input, linkedAppId: app.id })).rejects.toMatchObject({ statusCode: 400 });
  mockCollectionDocs("app_configs").get(app.id)!.publisherKind = "organization";
  mockCollectionDocs("feed_organizations").delete("org");
  await expect(createPartner(context, { ...input, linkedAppId: app.id })).rejects.toMatchObject({ statusCode: 400 });
  expect(mockDocs.size).toBe(0);
});

it("reads legacy contacts with empty links and deduplicates bounded direct reads for a page", async () => {
  const { linkedAppId: _app, linkedOrganizationId: _org, linkedIndividualPublisherId: _individual, ...legacy } = input;
  mockDocs.set("legacy", legacy);
  expect(await getPartner(context, "legacy")).toEqual({
    ...input, ...emptySnapshots, ...emptyLiveLinks, id: "legacy",
  });
  mockDocs.clear();
  const organization = seedOrganization();
  const app = seedApp();
  for (let index = 0; index < 20; index++) mockDocs.set(`p${index}`, {
    ...input, linkedOrganizationId: organization.id, linkedAppId: app.id,
    linkedOrganizationSnapshot: organization, linkedAppSnapshot: app,
  });
  mockDirectReads.length = 0;
  expect((await listPartners(context)).items).toHaveLength(20);
  expect(mockDirectReads.sort()).toEqual(["app_configs/organization_org", "feed_organizations/org"]);
  expect(mockReads).toEqual([{ collection: "connected-partners", cursor: undefined, limit: 21, filters: [] }]);
});

it("paginates organization and app choices and scopes an organization's app by direct document read", async () => {
  for (let index = 0; index < 42; index++) {
    const id = `org${String(index).padStart(3, "0")}`;
    seedOrganization(id, `Organization ${index}`);
    mockCollectionDocs("app_configs").set(`organization_${id}`, {
      publisherKind: "organization", publisherId: id, publisherName: `Organization ${index}`, status: "active",
    });
  }
  mockCollectionDocs("app_configs").set("individual_other", {
    publisherKind: "individual", publisherId: "other", publisherName: "Individual", status: "active",
  });
  for (const kind of ["organization", "app"] as const) {
    const first = await listPartnerLinkOptions(context, { kind });
    expect(first.items).toHaveLength(20);
    const second = await listPartnerLinkOptions(context, { kind, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(20);
    const third = await listPartnerLinkOptions(context, { kind, cursor: second.nextCursor! });
    expect(third.items).toHaveLength(kind === "app" ? 3 : 2);
    expect(third.nextCursor).toBeNull();
  }
  expect(mockReads.every((read) => read.limit === 21)).toBe(true);
  expect(mockReads.every((read) => read.filters.length === 0)).toBe(true);
  const previousQueries = mockReads.length;
  expect(await listPartnerLinkOptions(context, { kind: "app", organizationId: "org000" })).toEqual({
    items: [{ id: "organization_org000", name: "Organization 0", publisherKind: "organization", publisherId: "org000", status: "active" }], nextCursor: null,
  });
  expect(mockReads.length).toBe(previousQueries);
});

it("exposes paginated link choices with fresh GET responses and rejects spoofed snapshots at the API", async () => {
  seedOrganization();
  seedApp();
  const app = await server();
  try {
    const options = await app.inject("/admin/connected-partners/link-options?kind=app&organizationId=org");
    expect(options.statusCode).toBe(200);
    expect(options.headers["cache-control"]).toBe("private, no-store");
    expect(options.json().items).toEqual([{
      id: "organization_org", name: "Acme Organization", publisherKind: "organization", publisherId: "org", status: "active_for_testing",
    }]);
    expect((await app.inject("/admin/connected-partners/link-options?kind=unknown")).statusCode).toBe(400);
    expect((await app.inject("/admin/connected-partners/link-options?kind=app&organizationId=bad%2Fid")).statusCode).toBe(400);
    for (const payload of [
      { ...input, linkedOrganizationSnapshot: { id: "org", name: "Spoofed" } },
      { ...input, linkedAppSnapshot: { id: "organization_org", status: "active" } },
    ]) expect((await app.inject({ method: "POST", url: "/admin/connected-partners", payload })).statusCode).toBe(400);
    const created = await app.inject({ method: "POST", url: "/admin/connected-partners", payload: { ...input, linkedAppId: "organization_org" } });
    expect(created.statusCode).toBe(201);
    expect(created.json().partner.linkedOrganizationId).toBe("org");
  } finally { await app.close(); }
});

function seedIndividual(id = "person", name = "Ana Publisher") {
  mockCollectionDocs("feed_individuals").set(id, { name });
  return { id, name };
}

function seedIndividualApp() {
  const data = {
    publisherKind: "individual", publisherId: "person", publisherName: "Ana Publisher",
    status: "active", appProviderIdentifier: "app_ind_ana_publisher_12345",
  };
  mockCollectionDocs("app_configs").set("individual_person", data);
  return { id: "individual_person", ...data };
}

it("accepts an omitted or blank phone and trims a supplied number without weakening other validation", async () => {
  const { phoneNumber: _phone, ...withoutPhone } = input;
  expect(PartnerInputSchema.parse(withoutPhone).phoneNumber).toBe("");
  expect(PartnerInputSchema.parse({ ...input, phoneNumber: "  " }).phoneNumber).toBe("");
  expect(PartnerInputSchema.parse({ ...input, phoneNumber: " +54 1234 " }).phoneNumber).toBe("+54 1234");
  const app = await server();
  try {
    for (const payload of [withoutPhone, { ...input, phoneNumber: "  " }]) {
      const response = await app.inject({ method: "POST", url: "/admin/connected-partners", payload });
      expect(response.statusCode).toBe(201);
      expect(response.json().partner.phoneNumber).toBe("");
    }
    for (const phoneNumber of [null, 1234, "x".repeat(51)]) {
      expect((await app.inject({ method: "POST", url: "/admin/connected-partners", payload: { ...input, phoneNumber } })).statusCode).toBe(400);
    }
  } finally { await app.close(); }
});

it("links either publisher independently, both together, and either kind of app while preserving the opposite publisher", async () => {
  const organization = seedOrganization();
  const individual = seedIndividual();
  const organizationApp = seedApp();
  const individualApp = seedIndividualApp();
  const personOnly = await createPartner(context, { ...input, linkedIndividualPublisherId: individual.id });
  expect(personOnly).toMatchObject({
    linkedOrganizationId: null, linkedIndividualPublisherId: individual.id,
    linkedIndividualPublisher: individual, linkedIndividualPublisherSnapshot: individual, linkedAppId: null,
  });
  const both = await updatePartner(context, personOnly.id, {
    ...input, linkedOrganizationId: organization.id, linkedIndividualPublisherId: individual.id,
  });
  expect(both).toMatchObject({ linkedOrganization: organization, linkedIndividualPublisher: individual });
  const withIndividualApp = await updatePartner(context, both.id, {
    ...input, linkedOrganizationId: organization.id, linkedAppId: individualApp.id,
  });
  expect(withIndividualApp).toMatchObject({
    linkedOrganizationId: organization.id, linkedIndividualPublisherId: individual.id,
    linkedAppSnapshot: individualApp, linkedApp: individualApp,
  });
  const withOrganizationApp = await updatePartner(context, both.id, {
    ...input, linkedIndividualPublisherId: individual.id, linkedAppId: organizationApp.id,
  });
  expect(withOrganizationApp).toMatchObject({
    linkedOrganizationId: organization.id, linkedIndividualPublisherId: individual.id,
    linkedAppSnapshot: organizationApp, linkedApp: organizationApp,
  });
  const cleared = await updatePartner(context, both.id, input);
  expect(cleared).toMatchObject({ ...emptySnapshots, ...emptyLiveLinks, linkedIndividualPublisherId: null });
  expect(mockCollectionDocs("feed_individuals").get(individual.id)).toEqual({ name: individual.name });
  expect(mockDocs.get(both.id)).not.toHaveProperty("linkedIndividualPublisher");
});

it("rejects missing individuals and individual-app owner mismatches before writing", async () => {
  seedOrganization();
  seedIndividual();
  seedIndividual("other", "Other Publisher");
  const app = seedIndividualApp();
  for (const links of [
    { linkedIndividualPublisherId: "missing" },
    { linkedIndividualPublisherId: "other", linkedAppId: app.id },
  ]) await expect(createPartner(context, { ...input, ...links })).rejects.toMatchObject({ statusCode: 400 });
  mockCollectionDocs("feed_individuals").delete("person");
  await expect(createPartner(context, { ...input, linkedAppId: app.id })).rejects.toMatchObject({ statusCode: 400 });
  expect(mockDocs.size).toBe(0);
});

it("resolves individual app status and identity live while preserving snapshots and safely exposing missing publishers", async () => {
  const individual = seedIndividual();
  const app = seedIndividualApp();
  const created = await createPartner(context, { ...input, linkedAppId: app.id });
  mockCollectionDocs("feed_individuals").set(individual.id, { name: "Renamed Person" });
  mockCollectionDocs("app_configs").get(app.id)!.status = "active_for_testing";
  const refreshed = await getPartner(context, created.id);
  expect(refreshed.linkedIndividualPublisher).toEqual({ ...individual, name: "Renamed Person" });
  expect(refreshed.linkedIndividualPublisherSnapshot).toEqual(individual);
  expect(refreshed.linkedApp?.status).toBe("active_for_testing");
  expect(refreshed.linkedAppSnapshot).toMatchObject({ status: "active" });
  mockCollectionDocs("feed_individuals").delete(individual.id);
  expect(await getPartner(context, created.id)).toMatchObject({
    linkedIndividualPublisherId: individual.id, linkedIndividualPublisher: null,
    linkedIndividualPublisherSnapshot: individual, linkedApp: null,
  });
});

it("reads organization-app snapshots written before publisherKind and individual-link fields existed", async () => {
  const organization = seedOrganization();
  const app = seedApp();
  const { linkedIndividualPublisherId: _individual, ...oldInput } = input;
  const { publisherKind: _kind, ...oldApp } = app;
  mockDocs.set("legacy-app", {
    ...oldInput, linkedOrganizationId: organization.id, linkedAppId: app.id,
    linkedOrganizationSnapshot: organization, linkedAppSnapshot: oldApp,
  });
  const legacy = await getPartner(context, "legacy-app");
  expect(legacy.linkedAppSnapshot?.publisherKind).toBe("organization");
  expect(legacy.linkedApp?.publisherKind).toBe("organization");
  expect(legacy.linkedIndividualPublisherId).toBeNull();
  expect(legacy.linkedIndividualPublisherSnapshot).toBeNull();
});

it("paginates individual publishers and scopes both selected publishers to at most two direct app reads", async () => {
  for (let index = 0; index < 23; index++) seedIndividual(`person${String(index).padStart(2, "0")}`, `Person ${index}`);
  const first = await listPartnerLinkOptions(context, { kind: "individual" });
  const second = await listPartnerLinkOptions(context, { kind: "individual", cursor: first.nextCursor! });
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(3);
  expect(second.nextCursor).toBeNull();
  seedOrganization();
  seedIndividual();
  seedApp();
  seedIndividualApp();
  mockReads.length = 0;
  mockDirectReads.length = 0;
  const scoped = await listPartnerLinkOptions(context, { kind: "app", organizationId: "org", individualPublisherId: "person" });
  expect(scoped.items.map((option) => option.id)).toEqual(["individual_person", "organization_org"]);
  expect(mockDirectReads.sort()).toEqual(["app_configs/individual_person", "app_configs/organization_org"]);
  expect(mockReads).toEqual([]);
});

it("finds publisher document IDs and both app document IDs and public app identifiers with bounded reads", async () => {
  const organization = seedOrganization();
  const individual = seedIndividual();
  const app = seedIndividualApp();
  expect((await listPartnerLinkOptions(context, { kind: "organization", id: organization.id })).items).toEqual([organization]);
  expect((await listPartnerLinkOptions(context, { kind: "individual", id: individual.id })).items).toEqual([individual]);
  const byDocument = await listPartnerLinkOptions(context, { kind: "app", id: app.id });
  expect(byDocument.items[0]).toMatchObject({ id: app.id, appProviderIdentifier: app.appProviderIdentifier, publisherKind: "individual" });
  const byIdentifier = await listPartnerLinkOptions(context, { kind: "app", id: app.appProviderIdentifier });
  expect(byIdentifier).toEqual(byDocument);
  expect(mockReads).toEqual([{
    collection: "app_configs", cursor: undefined, limit: 2,
    filters: [["appProviderIdentifier", app.appProviderIdentifier]],
  }]);
  expect(await listPartnerLinkOptions(context, { kind: "app", organizationId: "org", id: app.id })).toEqual(byDocument);
  mockCollectionDocs("app_configs").set("duplicate", { ...app, id: undefined });
  await expect(listPartnerLinkOptions(context, { kind: "app", id: app.appProviderIdentifier })).rejects.toMatchObject({ statusCode: 400 });
});

it("exposes individual link choices and optional phone through the protected API without accepting client snapshots", async () => {
  const individual = seedIndividual();
  const individualApp = seedIndividualApp();
  const app = await server();
  try {
    const choices = await app.inject("/admin/connected-partners/link-options?kind=individual");
    expect(choices.statusCode).toBe(200);
    expect(choices.json().items).toEqual([individual]);
    const lookup = await app.inject(`/admin/connected-partners/link-options?kind=app&id=${individualApp.appProviderIdentifier}`);
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().items[0]).toMatchObject({ id: individualApp.id, publisherKind: "individual" });
    for (const extra of [
      { linkedIndividualPublisherSnapshot: individual },
      { linkedIndividualPublisher: individual },
      { linked_individual_publisher_id: individual.id },
    ]) expect((await app.inject({ method: "POST", url: "/admin/connected-partners", payload: { ...input, ...extra } })).statusCode).toBe(400);
    const response = await app.inject({ method: "POST", url: "/admin/connected-partners", payload: { ...input, phoneNumber: "", linkedAppId: individualApp.id } });
    expect(response.statusCode).toBe(201);
    expect(response.json().partner).toMatchObject({ phoneNumber: "", linkedIndividualPublisherId: individual.id, linkedApp: { publisherKind: "individual" } });
  } finally { await app.close(); }
});
