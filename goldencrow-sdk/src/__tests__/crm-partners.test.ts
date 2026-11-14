import { makeAdminContext } from "./support/route-harness.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";

type Data = Record<string, unknown>;
const mockStore = new Map<string, Map<string, Data>>();
const mockReads: Array<{ collection: string; id?: string; limit?: number }> = [];
const mockWrites: string[] = [];
const mockGetOrganization = jest.fn();
const mockGetProfessional = jest.fn();
let mockCommitError = false;
let mockTail = Promise.resolve();

function docs(collection: string) {
  if (!mockStore.has(collection)) mockStore.set(collection, new Map());
  return mockStore.get(collection)!;
}
function ref(collection: string, id: string) {
  return {
    id, collection,
    get: async () => {
      mockReads.push({ collection, id });
      return { id, exists: docs(collection).has(id), data: () => docs(collection).get(id) };
    },
  };
}
function query(collection: string, email?: string, limit?: number) {
  return {
    doc: (id: string) => ref(collection, id),
    where: (field: string, op: string, value: string) => {
      if (field !== "email" || op !== "==") throw new Error("Unexpected query");
      return query(collection, value, limit);
    },
    limit: (count: number) => query(collection, email, count),
    get: async () => {
      if (limit !== 1) throw new Error("Partner lookups must be bounded");
      mockReads.push({ collection, limit });
      return {
        docs: [...docs(collection)].filter(([, value]) => value.email === email).slice(0, limit)
          .map(([id, value]) => ({ id, data: () => value })),
      };
    },
  };
}
jest.mock("../config/firebase.js", () => ({
  adminDbFor: () => ({
    collection: (name: string) => query(name),
    runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      const before = mockTail;
      let release = () => {};
      mockTail = new Promise<void>((resolve) => { release = resolve; });
      await before;
      try {
        const pending: Array<{ reference: ReturnType<typeof ref>; data: Data }> = [];
        const result = await callback({
          get: (target: { get: () => Promise<unknown> }) => target.get(),
          create: (reference: ReturnType<typeof ref>, data: Data) => pending.push({ reference, data }),
        });
        if (mockCommitError) throw new Error("Commit unavailable");
        for (const { reference, data } of pending) {
          if (docs(reference.collection).has(reference.id)) throw new Error("Duplicate create");
          docs(reference.collection).set(reference.id, data);
          mockWrites.push(reference.id);
        }
        return result;
      } finally { release(); }
    },
  }),
}));
jest.mock("../repositories/partnership-crm.repository.js", () => ({
  getPartnershipCrmOrganization: (...args: unknown[]) => mockGetOrganization(...args),
  getPartnershipCrmProfessional: (...args: unknown[]) => mockGetProfessional(...args),
}));

import { addCrmTargetAsPartner } from "../repositories/crm-partners.repository.js";

const context = makeAdminContext({ isBootstrap: true });
const organization = {
  id: "crm-org", name: "MedicGen — Instituto de genética", contactName: "Dra. Ana Pérez Luque",
  contactEmail: " ANA@MEDICGEN.EXAMPLE ", contactLinkedIn: "https://linkedin.example/ana",
  website: "https://medicgen.example", country: "Argentina", notes: "Conversamos sobre una demo.",
  lastContactAt: "2026-11-10T12:00:00.000Z",
};
const professional = {
  id: "crm-pro", name: "Dra. María Rivera", email: "maria@example.com", linkedIn: "https://linkedin.example/maria",
  title: "Genetista clínica", primaryAffiliation: "MedicGen", website: "", country: "Argentina",
  notes: "Interesada en colaborar.", lastContactAt: null, potentialPocketGenesEditorFit: "Investigación y educación",
  researchBasis: "Publicaciones de genética", emailRoute: "Contacto institucional", linkedInRoute: "Perfil profesional",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear(); mockReads.length = 0; mockWrites.length = 0; mockCommitError = false; mockTail = Promise.resolve();
  mockGetOrganization.mockResolvedValue({ ...organization });
  mockGetProfessional.mockResolvedValue({ ...professional });
});

it("copies live organization contact data without treating a CRM ID as a publisher or inventing a meeting date", async () => {
  const result = await addCrmTargetAsPartner(context, "organizations", "crm-org");
  expect(result.created).toBe(true);
  expect(mockGetOrganization).toHaveBeenCalledWith(context, "crm-org");
  expect(result.partner).toMatchObject({
    companyName: organization.name, firstName: "Ana", lastName: "Pérez Luque", email: "ana@medicgen.example",
    phoneNumber: "", meetingDate: null, linkedOrganizationId: null, linkedIndividualPublisherId: null, linkedAppId: null,
    linkedOrganizationSnapshot: null, linkedIndividualPublisherSnapshot: null, linkedAppSnapshot: null,
  });
  expect(result.partner.notes).toContain(organization.notes);
  expect(result.partner.notes).toContain(organization.website);
  expect(result.partner.notes).toContain(organization.contactLinkedIn);
  expect(mockWrites).toHaveLength(1);
  expect(mockReads.every((read) => read.collection === "connected-partners")).toBe(true);
});

it("copies professional identity and affiliation while leaving unknown contact fields optional", async () => {
  const { partner } = await addCrmTargetAsPartner(context, "professionals", "crm-pro");
  expect(partner).toMatchObject({ companyName: professional.name, firstName: "María", lastName: "Rivera", email: professional.email, linkedIndividualPublisherId: null });
  expect(partner.notes).toContain(professional.primaryAffiliation);
  expect(partner.notes).toContain(professional.researchBasis);
  mockGetOrganization.mockResolvedValue({ ...organization, contactName: "" });
  const result = await addCrmTargetAsPartner(context, "organizations", "crm-org");
  expect(result.partner).toMatchObject({ firstName: "", lastName: "", phoneNumber: "" });
});

it("reuses the partner on retries and concurrent conversions of the same normalized email", async () => {
  mockGetProfessional.mockResolvedValue({ ...professional, email: "ana@medicgen.example" });
  const results = await Promise.all([
    addCrmTargetAsPartner(context, "organizations", "crm-org"),
    addCrmTargetAsPartner(context, "professionals", "crm-pro"),
  ]);
  expect(new Set(results.map((result) => result.partner.id)).size).toBe(1);
  expect(results.map((result) => result.created).sort()).toEqual([false, true]);
  mockGetOrganization.mockResolvedValue({ ...organization, notes: "Different later CRM notes" });
  const replay = await addCrmTargetAsPartner(context, "organizations", "crm-org");
  expect(replay.created).toBe(false);
  expect(replay.partner.notes).toContain(organization.notes);
  expect(mockWrites).toHaveLength(1);
});

it("reuses an existing partner with the same email without overwriting its information", async () => {
  const original = (await addCrmTargetAsPartner(context, "organizations", "crm-org")).partner;
  const { id, linkedOrganization, linkedIndividualPublisher, linkedApp, ...stored } = original;
  docs("connected-partners").clear();
  docs("connected-partners").set("existing-manual-partner", { ...stored, notes: "Keep these partner notes" });
  mockWrites.length = 0;
  const result = await addCrmTargetAsPartner(context, "organizations", "crm-org");
  expect(result.created).toBe(false);
  expect(result.partner.id).toBe("existing-manual-partner");
  expect(result.partner.notes).toBe("Keep these partner notes");
  expect(mockWrites).toHaveLength(0);
  expect(mockReads.filter((read) => read.limit !== undefined).every((read) => read.limit === 1)).toBe(true);
});

it.each(["", "not an email"])("rejects an invalid source email (%s) without creating a partial partner", async (email) => {
  mockGetOrganization.mockResolvedValue({ ...organization, contactEmail: email });
  await expect(addCrmTargetAsPartner(context, "organizations", "crm-org")).rejects.toMatchObject({ statusCode: 400 });
  expect(mockWrites).toHaveLength(0);
});

it("enforces GOD MODE and rejects invalid or missing CRM records before creating a partner", async () => {
  await expect(addCrmTargetAsPartner(makeAdminContext(), "organizations", "crm-org")).rejects.toMatchObject({ statusCode: 403 });
  await expect(addCrmTargetAsPartner(context, "organizations", "bad/id")).rejects.toMatchObject({ statusCode: 400 });
  expect(mockGetOrganization).not.toHaveBeenCalled();
  mockGetOrganization.mockRejectedValue(new AdminRepositoryError("CRM organization not found.", 404));
  await expect(addCrmTargetAsPartner(context, "organizations", "missing")).rejects.toMatchObject({ statusCode: 404 });
  expect(mockWrites).toHaveLength(0);
});

it("does not persist a partial partner when validation or the transaction fails", async () => {
  mockGetOrganization.mockResolvedValueOnce({ ...organization, notes: "a".repeat(10001) });
  await expect(addCrmTargetAsPartner(context, "organizations", "crm-org")).rejects.toMatchObject({ statusCode: 400 });
  mockCommitError = true;
  await expect(addCrmTargetAsPartner(context, "organizations", "crm-org")).rejects.toThrow("Commit unavailable");
  expect(docs("connected-partners").size).toBe(0);
  mockCommitError = false;
  expect((await addCrmTargetAsPartner(context, "organizations", "crm-org")).created).toBe(true);
});
