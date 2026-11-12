import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { adminDbFor } from "../config/firebase.js";
import { PUBLISHER_APP_STATUSES } from "../lib/publisher-app-status.js";
import {
  listDiscoverIndividuals,
  listDiscoverOrganizations,
} from "../repositories/discover.repository.js";
import { listDiscoverPartnerExport } from "../repositories/discover-partner-export.repository.js";
import { discoverRoutes } from "../routes/discover.routes.js";
import type { AdminContext } from "../types/sdk.types.js";

jest.mock("../config/firebase.js", () => ({ adminDbFor: jest.fn() }));
jest.mock("../repositories/discover.repository.js", () => ({
  listDiscoverOrganizations: jest.fn(),
  listDiscoverIndividuals: jest.fn(),
}));
jest.mock("../repositories/roles.repository.js", () => ({
  canAccessDiscover: jest.fn(() => true),
}));
jest.mock("../lib/discover-publisher-request-notification-email.js", () => ({
  sendDiscoverPublisherRequestNotificationEmail: jest.fn(),
}));

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
const organization = {
  id: "org-1",
  name: "Genome Lab",
  imageUrl: null,
  status: "active" as const,
  verified: true,
  isGeneticReportProvider: false,
  geneticReportCategory: null,
  isGrcHighlighted: false,
  linkedIndividualProfessionals: [],
  createdAt: "2026-11-11T12:00:00.000Z",
  updatedAt: "2026-11-11T12:00:00.000Z",
  contactEmail: "lab@example.org",
  internalNotes: "Follow up",
  portalAccessKey: "must-stay-private",
};
const individual = {
  ...organization,
  id: "person-1",
  name: "Ana Rivera",
  linkedParentOrganizationId: "org-1",
  linkedParentOrganizationSnapshot: null,
};
const appDocs = new Map<string, Record<string, unknown>>();
const getAll = jest.fn();
const collection = jest.fn((name: string) => {
  if (name !== "app_configs") throw new Error(`Unexpected collection: ${name}`);
  return { doc: (id: string) => ({ id, path: `${name}/${id}` }) };
});

beforeEach(() => {
  jest.clearAllMocks();
  appDocs.clear();
  jest
    .mocked(adminDbFor)
    .mockReturnValue({ collection, getAll } as unknown as ReturnType<
      typeof adminDbFor
    >);
  jest
    .mocked(listDiscoverOrganizations)
    .mockResolvedValue({ organizations: [organization], nextCursor: null });
  jest
    .mocked(listDiscoverIndividuals)
    .mockResolvedValue({ individuals: [individual], nextCursor: null });
  getAll.mockImplementation(async (...args: unknown[]) => {
    const { fieldMask } = args.pop() as { fieldMask: string[] };
    return (args as Array<{ id: string }>)
      .map(({ id }) => {
        const data = appDocs.get(id);
        return {
          id,
          exists: Boolean(data),
          data: () =>
            data &&
            Object.fromEntries(
              fieldMask
                .filter((field) => field in data)
                .map((field) => [field, data[field]]),
            ),
        };
      })
      .reverse();
  });
});

it.each(PUBLISHER_APP_STATUSES)(
  "exports an existing organization app in %s status, without requiring a public app identifier",
  async (status) => {
    appDocs.set("organization_org-1", {
      publisherKind: "organization",
      publisherId: "org-1",
      status,
      secretConfig: "must-stay-private",
    });
    const result = await listDiscoverPartnerExport(context, {
      kind: "organization",
    });
    expect(result).toEqual({
      items: [
        {
          id: "org-1",
          name: "Genome Lab",
          contactEmail: "lab@example.org",
          internalNotes: "Follow up",
          linkedAppId: "organization_org-1",
        },
      ],
      nextCursor: null,
    });
    expect(getAll).toHaveBeenCalledWith(
      { id: "organization_org-1", path: "app_configs/organization_org-1" },
      { fieldMask: ["publisherKind", "publisherId"] },
    );
    expect(JSON.stringify(result)).not.toContain("must-stay-private");
  },
);

it("exports the individual's own app and preserves its organization link", async () => {
  appDocs.set("individual_person-1", {
    publisherKind: "individual",
    publisherId: "person-1",
  });
  appDocs.set("organization_org-1", {
    publisherKind: "organization",
    publisherId: "org-1",
  });
  const result = await listDiscoverPartnerExport(context, {
    kind: "individual",
  });
  expect(result.items[0]).toMatchObject({
    id: "person-1",
    linkedParentOrganizationId: "org-1",
    linkedAppId: "individual_person-1",
  });
  expect(collection.mock.calls).toEqual([["app_configs"]]);
  expect(getAll.mock.calls[0]).toHaveLength(2);
});

it("does not inherit a parent organization's app when the individual has no app", async () => {
  appDocs.set("organization_org-1", {
    publisherKind: "organization",
    publisherId: "org-1",
  });
  expect(
    (await listDiscoverPartnerExport(context, { kind: "individual" })).items[0]
      ?.linkedAppId,
  ).toBeNull();
});

it.each([
  undefined,
  { publisherKind: "individual", publisherId: "org-1" },
  { publisherKind: "organization", publisherId: "another-org" },
  { publisher_kind: "organization", publisher_id: "org-1" },
])(
  "leaves app ID blank when no matching canonical app exists: %j",
  async (app) => {
    if (app) appDocs.set("organization_org-1", app);
    expect(
      (await listDiscoverPartnerExport(context, { kind: "organization" }))
        .items[0]?.linkedAppId,
    ).toBeNull();
  },
);

it("reads only each requested publisher page and matches apps by ID rather than result order", async () => {
  const publishers = Array.from({ length: 20 }, (_, index) => ({
    ...organization,
    id: `org-${index}`,
  }));
  jest.mocked(listDiscoverOrganizations).mockResolvedValueOnce({
    organizations: publishers,
    nextCursor: "opaque-next",
  });
  appDocs.set("organization_org-5", {
    publisherKind: "organization",
    publisherId: "org-5",
  });
  const first = await listDiscoverPartnerExport(context, {
    kind: "organization",
  });
  expect(first.items).toHaveLength(20);
  expect(first.items[5]?.linkedAppId).toBe("organization_org-5");
  expect(first.items.filter((item) => item.linkedAppId)).toHaveLength(1);
  expect(first.nextCursor).toBe("opaque-next");
  expect(getAll.mock.calls[0]).toHaveLength(21);
  expect(listDiscoverOrganizations).toHaveBeenCalledWith(context, {
    limit: 20,
  });
  expect(listDiscoverIndividuals).not.toHaveBeenCalled();

  await listDiscoverPartnerExport(context, {
    kind: "organization",
    limit: 20,
    cursor: first.nextCursor!,
  });
  expect(listDiscoverOrganizations).toHaveBeenLastCalledWith(context, {
    limit: 20,
    cursor: "opaque-next",
  });
});

it("does not read apps for an empty page", async () => {
  jest
    .mocked(listDiscoverOrganizations)
    .mockResolvedValue({ organizations: [], nextCursor: null });
  expect(
    await listDiscoverPartnerExport(context, { kind: "organization" }),
  ).toEqual({ items: [], nextCursor: null });
  expect(adminDbFor).not.toHaveBeenCalled();
});

it("does not offer a partial export when the app lookup fails", async () => {
  getAll.mockRejectedValueOnce(new Error("Firestore unavailable"));
  await expect(
    listDiscoverPartnerExport(context, { kind: "organization" }),
  ).rejects.toThrow("Firestore unavailable");
});

it("requires GOD MODE before reading publishers or apps", async () => {
  await expect(
    listDiscoverPartnerExport(
      { ...context, isBootstrap: false },
      { kind: "organization" },
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(listDiscoverOrganizations).not.toHaveBeenCalled();
  expect(listDiscoverIndividuals).not.toHaveBeenCalled();
  expect(adminDbFor).not.toHaveBeenCalled();
});

async function server(adminContext: AdminContext | null = context) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook("onRequest", async (request) => {
    request.adminContext = adminContext ?? undefined;
  });
  await app.register(discoverRoutes);
  return app;
}

it("exposes a private GOD MODE export endpoint and validates bounded page queries", async () => {
  const app = await server();
  const response = await app.inject({
    method: "GET",
    url: "/discover/partner-csv-export?kind=individual&limit=20&cursor=opaque-next",
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.json().items[0].id).toBe("person-1");
  expect(listDiscoverIndividuals).toHaveBeenCalledWith(context, {
    limit: 20,
    cursor: "opaque-next",
  });
  jest.clearAllMocks();
  for (const query of [
    "kind=other",
    "kind=organization&limit=21",
    "kind=organization&limit=0",
    "kind=organization&unknown=true",
    "kind=organization&cursor=",
  ]) {
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/discover/partner-csv-export?${query}`,
        })
      ).statusCode,
    ).toBe(400);
  }
  expect(listDiscoverOrganizations).not.toHaveBeenCalled();
  expect(listDiscoverIndividuals).not.toHaveBeenCalled();
  await app.close();
});

it.each([null, { ...context, isBootstrap: false }])(
  "rejects unauthorized export requests without reads",
  async (adminContext) => {
    const app = await server(adminContext);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/discover/partner-csv-export?kind=organization",
        })
      ).statusCode,
    ).toBe(403);
    expect(listDiscoverOrganizations).not.toHaveBeenCalled();
    expect(adminDbFor).not.toHaveBeenCalled();
    await app.close();
  },
);
