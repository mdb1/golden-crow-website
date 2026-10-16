// Route-level tests for /pgflex/logistics*: the plugin's onRequest hook admits
// only global admins (full_admin / 2pq_admin) and transport dispatchers. What a
// dispatcher may do inside (e.g. delete) is decided by the repository.
import type { FastifyInstance } from "fastify";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import type { AdminContext, AdminRole } from "../types/sdk.types.js";
import { buildRouteServer, makeAdminContext } from "./support/route-harness.js";

const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockGet = jest.fn();
const mockList = jest.fn();
const mockReplace = jest.fn();
const mockUpdate = jest.fn();

jest.mock("../repositories/pgflex-logistics.repository.js", () => ({
  PGFLEX_LOGISTICS_LIST_SCOPES: ["active", "finished"],
  PGFLEX_LOGISTICS_SHIPMENT_TYPES: ["2pq", "other"],
  PGFLEX_LOGISTICS_STATUSES: ["awaiting_pick_up", "in_transit", "arrived", "lost"],
  createPGFlexLogisticsItemForContext: mockCreate,
  deletePGFlexLogisticsItemForContext: mockDelete,
  getPGFlexLogisticsItemForContext: mockGet,
  listPGFlexLogisticsForContext: mockList,
  replacePGFlexLogisticsItemForContext: mockReplace,
  updatePGFlexLogisticsItemForContext: mockUpdate,
}));

const repositoryMocks = [mockCreate, mockDelete, mockGet, mockList, mockReplace, mockUpdate];

function validItem() {
  return {
    identifier: "SHIP-001",
    shipmentType: "2pq",
    origin: "Lab Central",
    destination: "Hospital Norte",
    dispatcherEmail: "driver@example.com",
    status: "awaiting_pick_up",
  };
}

const endpoints = [
  { method: "GET" as const, url: "/pgflex/logistics" },
  { method: "POST" as const, url: "/pgflex/logistics", payload: validItem() },
  { method: "GET" as const, url: "/pgflex/logistics/item-1" },
  { method: "PUT" as const, url: "/pgflex/logistics/item-1", payload: validItem() },
  { method: "PATCH" as const, url: "/pgflex/logistics/item-1", payload: { status: "in_transit" } },
  { method: "DELETE" as const, url: "/pgflex/logistics/item-1" },
];

const DENIED_ROLES: AdminRole[] = [
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
  "patient",
  "organization_publisher",
  "individual_publisher",
];

const DISPATCHER = makeAdminContext({
  uid: "dispatcher-uid",
  email: "driver@example.com",
  role: "transport_dispatcher",
  canAccessBackoffice: false,
  canAccessPGFlex: true,
});

let currentContext: AdminContext | undefined;
let fastify: FastifyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  currentContext = makeAdminContext({ role: "full_admin" });
  const { pgflexLogisticsRoutes } = await import(
    "../routes/pgflex-logistics.routes.js"
  );
  fastify = await buildRouteServer(pgflexLogisticsRoutes, () => currentContext);
});

afterEach(async () => {
  await fastify.close();
});

describe("PGFlex logistics gate", () => {
  it("returns 401 on every endpoint without an admin context", async () => {
    currentContext = undefined;

    for (const { method, url, payload } of endpoints) {
      const response = await fastify.inject({ method, url, payload });
      expect(response.statusCode).toBe(401);
    }
    for (const mock of repositoryMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it.each(DENIED_ROLES)(
    "refuses role %s with 403 on every endpoint, even with PGFlex surface flags",
    async (role) => {
      currentContext = makeAdminContext({ role, canAccessPGFlex: true });

      for (const { method, url, payload } of endpoints) {
        const response = await fastify.inject({ method, url, payload });
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({
          error: "PGFlex logistics access required",
        });
      }
      for (const mock of repositoryMocks) {
        expect(mock).not.toHaveBeenCalled();
      }
    },
  );

  it("refuses a non-global role even when the bootstrap flag is set", async () => {
    currentContext = makeAdminContext({ role: "institution_admin", isBootstrap: true });

    const response = await fastify.inject({ method: "GET", url: "/pgflex/logistics" });

    expect(response.statusCode).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it.each([
    ["full_admin", makeAdminContext({ role: "full_admin" })],
    ["2pq_admin", makeAdminContext({ role: "2pq_admin" })],
    ["transport_dispatcher", DISPATCHER],
  ])("admits %s and scopes the listing to its context", async (_, context) => {
    currentContext = context;
    mockList.mockResolvedValue({ items: [], nextCursor: null });

    const response = await fastify.inject({
      method: "GET",
      url: "/pgflex/logistics?scope=active&limit=20",
    });

    expect(response.statusCode).toBe(200);
    expect(mockList).toHaveBeenCalledWith(context, { scope: "active", limit: 20 });
  });

  it("passes a dispatcher's delete to the repository, which may refuse it", async () => {
    currentContext = DISPATCHER;
    mockDelete.mockRejectedValue(
      new AdminRepositoryError("Only admins can delete PGFlex logistics.", 403),
    );

    const response = await fastify.inject({
      method: "DELETE",
      url: "/pgflex/logistics/item-1",
    });

    expect(response.statusCode).toBe(403);
    expect(mockDelete).toHaveBeenCalledWith(DISPATCHER, "item-1");
  });

  it("maps a dispatcher reading someone else's item to the repository's 404", async () => {
    currentContext = DISPATCHER;
    mockGet.mockRejectedValue(new AdminRepositoryError("Item not found.", 404));

    const response = await fastify.inject({
      method: "GET",
      url: "/pgflex/logistics/item-of-another-dispatcher",
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("PGFlex logistics validation", () => {
  it.each([
    ["a missing identifier", { ...validItem(), identifier: undefined }],
    ["a missing origin", { ...validItem(), origin: "   " }],
    ["an invalid dispatcher email", { ...validItem(), dispatcherEmail: "nope" }],
    ["an unknown status", { ...validItem(), status: "delivered" }],
    ["an unknown shipment type", { ...validItem(), shipmentType: "drone" }],
    ["an over-long description", { ...validItem(), description: "x".repeat(2001) }],
  ])("rejects a create with %s (400)", async (_, payload) => {
    const response = await fastify.inject({
      method: "POST",
      url: "/pgflex/logistics",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty PATCH body", async () => {
    const response = await fastify.inject({
      method: "PATCH",
      url: "/pgflex/logistics/item-1",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each(["limit=51", "limit=0", "scope=all"])(
    "rejects list query %s (400)",
    async (query) => {
      const response = await fastify.inject({
        method: "GET",
        url: `/pgflex/logistics?${query}`,
      });

      expect(response.statusCode).toBe(400);
      expect(mockList).not.toHaveBeenCalled();
    },
  );

  it("creates an item with the trimmed body and answers 201", async () => {
    mockCreate.mockResolvedValue({ id: "item-1" });

    const response = await fastify.inject({
      method: "POST",
      url: "/pgflex/logistics",
      payload: { ...validItem(), identifier: "  SHIP-001  " },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(currentContext, validItem());
    expect(response.json()).toEqual({ item: { id: "item-1" } });
  });

  it("patches only the provided fields", async () => {
    mockUpdate.mockResolvedValue({ id: "item-1", status: "arrived" });

    const response = await fastify.inject({
      method: "PATCH",
      url: "/pgflex/logistics/item-1",
      payload: { status: "arrived" },
    });

    expect(response.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(currentContext, "item-1", {
      status: "arrived",
    });
  });
});
