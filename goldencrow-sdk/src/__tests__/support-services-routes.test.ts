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
  serviceCategory: "Final report production",
  providerKind: "organization",
  providerId: "feed-org-1",
  providerName: "Pocket Genes Report Studio",
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
      role: "form",
      objectType: "pgo_form",
      acceptedTypes: ["pgo_form"],
      required: true,
      cardinality: { min: 1, max: 1 },
    },
    {
      role: "test_order",
      objectType: "pgo_test_order",
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
    pricingModel: "calculated_after_submission",
    turnaround: "1d",
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
        providerKind: "organization",
        providerId: "feed-org-1",
        stages: ["bioinformatics"],
      }),
    );
  });

  it("creates a service offer without form shape or commercial terms", async () => {
    const fastify = await buildTestServer();
    const payload = {
      ...validOfferPayload,
      serviceId: "pgs_no_form_service",
      formShape: undefined,
      inputSlots: validOfferPayload.inputSlots.filter(
        (slot) => slot.objectType !== "pgo_form",
      ),
      commercialTerms: undefined,
    };

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({
        serviceId: "pgs_no_form_service",
      }),
    );
    const [, offerBody] = mockCreateSupportServiceOffer.mock.calls.at(-1) ?? [];
    expect(offerBody).not.toHaveProperty("formShape");
    expect(offerBody).not.toHaveProperty("commercialTerms");
  });

  it("creates a service offer without acceptance and scope rules", async () => {
    const fastify = await buildTestServer();
    const payload: Record<string, unknown> = { ...validOfferPayload };
    delete payload.acceptedConditions;
    delete payload.scopeRules;

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload,
    });

    expect(response.statusCode).toBe(201);
    const [, offerBody] = mockCreateSupportServiceOffer.mock.calls.at(-1) ?? [];
    expect(offerBody).not.toHaveProperty("acceptedConditions");
    expect(offerBody).not.toHaveProperty("scopeRules");
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

  it("rejects request forms as service offer outputs", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        outputSlots: [
          {
            role: "form",
            objectType: "pgo_form",
            mutationMode: "new_object",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateSupportServiceOffer).not.toHaveBeenCalled();
  });

  it("rejects free-text service offer turnaround values", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        commercialTerms: {
          pricingModel: "calculated_after_submission",
          turnaround: "1 business day",
        },
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

  it("creates a service transaction with input object bindings", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions",
      payload: {
        requestId: "pgr_demo_final_report",
        serviceId: "pgs_final_report",
        serviceVersion: "1.0.0",
        status: "submitted",
        inputs: [
          {
            role: "form",
            objectRef: {
              objectId: "obj_demo_form_final_report",
              revision: 1,
            },
          },
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
        inputs: expect.arrayContaining([
          expect.objectContaining({
            role: "form",
          }),
        ]),
      }),
    );
    const [, transactionBody] =
      mockCreateSupportServiceTransaction.mock.calls.at(-1) ?? [];
    expect(transactionBody).not.toHaveProperty("formRef");
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
