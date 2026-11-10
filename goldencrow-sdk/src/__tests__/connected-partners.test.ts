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
const mockReads: Array<{ cursor?: string; limit: number }> = [];
const mockCollections: string[] = [];
let mockNextId = 1;
let mockCommitError: Error | null = null;

function mockDoc(id = `partner${mockNextId++}`) {
  return {
    id,
    get: async () => ({
      id,
      exists: mockDocs.has(id),
      data: () => mockDocs.get(id),
    }),
    create: async (data: StoredData) => {
      mockDocs.set(id, data);
    },
    update: async (data: StoredData) => {
      if (!mockDocs.has(id))
        throw Object.assign(new Error("Missing"), { code: 5 });
      mockDocs.set(id, data);
    },
  };
}
function mockQuery(cursor?: string, limit = Infinity) {
  return {
    doc: mockDoc,
    orderBy: () => mockQuery(cursor, limit),
    startAfter: (value: string) => mockQuery(value, limit),
    limit: (value: number) => mockQuery(cursor, value),
    get: async () => {
      mockReads.push({ cursor, limit });
      return {
        docs: [...mockDocs.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .filter(([id]) => !cursor || id > cursor)
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
        return mockQuery();
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
};

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
  mockReads.length = 0;
  mockCollections.length = 0;
  mockNextId = 1;
  mockCommitError = null;
});

it("stores only the seven independent contact fields and clears optional values on edit", async () => {
  const created = await createPartner(context, {
    ...input,
    companyName: " Acme ",
    email: " ANA@example.com ",
    notes: "  Hello  ",
    meetingDate: "2026-11-10",
  });
  expect(mockDocs.get(created.id)).toEqual({
    ...input,
    notes: "Hello",
    meetingDate: "2026-11-10",
  });
  await updatePartner(context, created.id, { ...input, notes: "  " });
  expect(await getPartner(context, created.id)).toEqual({
    ...input,
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
    ).toEqual({ ...input, id });
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
