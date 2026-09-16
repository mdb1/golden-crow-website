import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

const mockCreateSupportServiceOffer = jest.fn();
const mockDeleteSupportServiceOffer = jest.fn();
const mockListSupportServiceTransactions = jest.fn();
const mockCreateSupportServiceTransaction = jest.fn();

jest.mock("../repositories/support-services.repository.js", () => ({
  SUPPORT_SERVICE_STAGES: ["test_planning", "wet_lab", "bioinformatics"],
  SUPPORT_SERVICE_OFFER_STATUSES: ["draft", "active", "paused", "archived"],
  SUPPORT_SERVICE_TRANSACTION_STATUSES: [
    "draft",
    "submitted",
    "awaiting_input",
    "accepted",
    "in_progress",
    "completed",
    "failed",
    "cancelled",
  ],
  createSupportServiceOffer: mockCreateSupportServiceOffer,
  createSupportServiceTransaction: mockCreateSupportServiceTransaction,
  deleteSupportServiceOffer: mockDeleteSupportServiceOffer,
  deleteSupportServiceTransaction: jest.fn(),
  getSupportServiceOffer: jest.fn(),
  getSupportServiceTransaction: jest.fn(),
  listSupportServiceOffers: jest.fn(),
  listSupportServiceTransactions: mockListSupportServiceTransactions,
  updateSupportServiceOffer: jest.fn(),
  updateSupportServiceTransaction: jest.fn(),
}));

const bootstrapContext: AdminContext = {
  email: "god@example.com",
  uid: "god-1",
  role: "full_admin",
  isBootstrap: true,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  projectAccess: ["mydnamap"],
};

const validOfferPayload = {
  serviceId: "pgs_final_report",
  serviceVersion: "1.0.0",
  name: "Create the final self-contained report",
  providerId: "pgp_report_studio",
  stages: ["bioinformatics"],
  status: "active",
  availability: "backoffice",
  description:
    "Combine the complete test order with the interactive genomic result into a final PDF.",
  shortContract: "form + test_order + pgi1 -> final PDF",
  providerWork:
    "Verify the match and scope, perform report review, and issue a complete PDF.",
  formShape: {
    id: "pgfs_final_report",
    version: "1.0.0",
    allowUnknownFields: false,
    fields: [
      {
        key: "requested_at",
        label: "Requested at",
        type: "datetime",
        required: true,
      },
      {
        key: "requested_by",
        label: "Requested by",
        type: "text",
        required: true,
      },
      {
        key: "language",
        label: "Report language",
        type: "enum",
        required: true,
        options: [{ value: "en", label: "English" }],
      },
    ],
  },
  inputSlots: [
    {
      role: "test_order",
      acceptedTypes: ["pgo_test_order"],
      required: true,
      cardinality: { min: 1, max: 1 },
    },
  ],
  outputSlots: [
    {
      role: "report",
      objectType: "pgo_pdf_report",
      mutationMode: "new_object",
    },
  ],
  acceptedConditions: ["The order and result identify the same subject."],
  scopeRules: ["Respect the requested order scope."],
  commercialTerms: {
    price: {
      amount: 15000,
      currency: "ARS",
      basis: "per accepted request",
      isMock: true,
    },
    turnaround: "1 business day",
    turnaroundStartsAt: "accepted after required inputs are available",
    taxAndPaymentPolicy: "Not specified",
    failurePolicy: "Assess fulfillment and remaining usable outputs.",
  },
};

async function buildTestServer(
  context: AdminContext | null = bootstrapContext,
) {
  const { supportServicesRoutes } = await import(
    "../routes/support-services.routes.js"
  );
  const fastify = Fastify();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  fastify.addHook("onRequest", async (request) => {
    request.adminContext = context ?? undefined;
  });
  await fastify.register(supportServicesRoutes);
  return fastify;
}

describe("support service admin routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupportServiceOffer.mockResolvedValue({
      id: "offer-1",
      serviceId: "pgs_final_report",
      name: "Create the final self-contained report",
    });
    mockDeleteSupportServiceOffer.mockResolvedValue(undefined);
    mockListSupportServiceTransactions.mockResolvedValue({
      transactions: [],
      nextCursor: undefined,
    });
    mockCreateSupportServiceTransaction.mockResolvedValue({
      id: "txn-1",
      requestId: "pgr_demo_final_report",
      serviceId: "pgs_final_report",
    });
  });

  it("creates a service offer with the Pocket Genes service identifiers", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: validOfferPayload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      offer: expect.objectContaining({
        serviceId: "pgs_final_report",
      }),
    });
    expect(mockCreateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({
        providerId: "pgp_report_studio",
        stages: ["bioinformatics"],
      }),
    );
  });

  it("rejects service offers outside the pgs_* convention", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        serviceId: "final_report",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateSupportServiceOffer).not.toHaveBeenCalled();
  });

  it("lists service transactions with service and status filters", async () => {
    const fastify = await buildTestServer();
    mockListSupportServiceTransactions.mockResolvedValue({
      transactions: [
        {
          id: "txn-1",
          requestId: "pgr_demo_final_report",
          serviceId: "pgs_final_report",
          status: "submitted",
        },
      ],
      nextCursor: "2026-09-16T12:00:00.000Z",
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/transactions?serviceId=pgs_final_report&status=submitted&limit=20",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      transactions: [
        expect.objectContaining({
          requestId: "pgr_demo_final_report",
          status: "submitted",
        }),
      ],
      nextCursor: "2026-09-16T12:00:00.000Z",
    });
    expect(mockListSupportServiceTransactions).toHaveBeenCalledWith(
      bootstrapContext,
      {
        serviceId: "pgs_final_report",
        status: "submitted",
        limit: 20,
      },
    );
  });

  it("creates a service transaction with a required form reference", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions",
      payload: {
        requestId: "pgr_demo_final_report",
        serviceId: "pgs_final_report",
        serviceVersion: "1.0.0",
        status: "submitted",
        formRef: {
          objectId: "obj_demo_form_final_report",
          revision: 1,
        },
        inputs: [
          {
            role: "test_order",
            objectRef: {
              objectId: "obj_demo_order",
              revision: 1,
            },
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      transaction: expect.objectContaining({
        requestId: "pgr_demo_final_report",
      }),
    });
    expect(mockCreateSupportServiceTransaction).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({
        formRef: {
          objectId: "obj_demo_form_final_report",
          revision: 1,
        },
      }),
    );
  });

  it("returns a JSON success payload after deleting a service offer", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/support-services/offers/offer-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true,
      offerId: "offer-1",
    });
    expect(mockDeleteSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      "offer-1",
    );
  });
});
