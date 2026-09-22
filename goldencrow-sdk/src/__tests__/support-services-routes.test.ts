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
const mockAttachSupportServiceTransactionOutputObject = jest.fn();
const mockDeliverSupportServiceTransaction = jest.fn();

jest.mock("../repositories/support-services.repository.js", () => ({
  SUPPORT_SERVICE_STAGES: ["test_planning", "wet_lab", "bioinformatics"],
  SUPPORT_SERVICE_OFFER_STATUSES: ["draft", "active", "inactive", "archived"],
  SUPPORT_SERVICE_OBJECT_TYPES: [
    "pgo_form",
    "pgo_bundle_of_symptoms",
    "pgo_bundle_of_candidate_genes",
    "pgo_informed_consent",
    "pgo_test_order",
    "pgo_collection_request",
    "pgo_blood_sample",
    "pgo_tissue_sample",
    "pgo_embryo_sample",
    "pgo_dna_sample",
    "pgo_sequence_reads",
    "pgo_sequence_data",
    "pgo_aligned_reads",
    "pgo_unannotated_vcf",
    "pgo_annotated_vcf",
    "pgo_interactive_report",
    "pgo_pdf_report",
    "pgo_image_bundle",
    "pgo_karyotype_result",
    "pgo_flow_cytometry_data",
  ],
  SUPPORT_SERVICE_TRANSACTION_STATUSES: [
    "received",
    "validating",
    "awaiting_input",
    "accepted",
    "queued",
    "running",
    "delivered",
    "rejected",
    "failed",
    "cancelled",
  ],
  attachSupportServiceTransactionOutputObject:
    mockAttachSupportServiceTransactionOutputObject,
  createSupportServiceOffer: mockCreateSupportServiceOffer,
  createSupportServiceTransaction: mockCreateSupportServiceTransaction,
  deleteSupportServiceOffer: mockDeleteSupportServiceOffer,
  deleteSupportServiceTransaction: jest.fn(),
  deliverSupportServiceTransaction: mockDeliverSupportServiceTransaction,
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
  serviceId: "pgs_pocket_genes_report_studio_1",
  serviceVersion: 1,
  name: "Create the final self-contained report",
  serviceCategory: "Final report production",
  providerKind: "organization",
  providerId: "feed-org-1",
  providerName: "Pocket Genes Report Studio",
  stages: ["bioinformatics"],
  status: "active",
  isHiddenFromSearch: false,
  description:
    "Combine the complete test order with the interactive genomic result into a final PDF.",
  shortContract: "form + test_order + pgi1 -> final PDF",
  providerWork:
    "Verify the match and scope, perform report review, and issue a complete PDF.",
  formShape: {
    id: "pgfs_pocket_genes_report_studio_1",
    version: 1,
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
      serviceId: "pgs_pocket_genes_report_studio_1",
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
      serviceId: "pgs_pocket_genes_report_studio_1",
    });
    mockAttachSupportServiceTransactionOutputObject.mockResolvedValue({
      transaction: {
        id: "txn-1",
        requestId: "pgr_demo_final_report",
        outputObjects: [
          {
            role: "report",
            objectType: "pgo_pdf_report",
            objectCode: "123456789",
          },
        ],
      },
      object: {
        id: "pgo_output_123456789",
        role: "report",
        objectCode: "123456789",
        objectType: "pgo_pdf_report",
        fileName: "report.pgo.json",
        downloadUrl: "https://objects.example/report.pgo.json",
        status: "ready",
      },
    });
    mockDeliverSupportServiceTransaction.mockResolvedValue({
      id: "txn-1",
      requestId: "pgr_demo_final_report",
      status: "delivered",
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
        serviceId: "pgs_pocket_genes_report_studio_1",
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
      serviceId: "pgs_pocket_genes_report_studio_2",
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
        serviceId: "pgs_pocket_genes_report_studio_2",
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

  it("requires canonical visibility and rejects the retired paused status", async () => {
    const fastify = await buildTestServer();
    const missingVisibility: Record<string, unknown> = {
      ...validOfferPayload,
    };
    delete missingVisibility.isHiddenFromSearch;

    const missingResponse = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: missingVisibility,
    });
    const snakeCaseResponse = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...missingVisibility,
        is_hidden_from_search: false,
      },
    });
    const pausedResponse = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: { ...validOfferPayload, status: "paused" },
    });

    expect(missingResponse.statusCode).toBe(400);
    expect(snakeCaseResponse.statusCode).toBe(400);
    expect(pausedResponse.statusCode).toBe(400);
    expect(mockCreateSupportServiceOffer).not.toHaveBeenCalled();
  });

  it("accepts price summaries and rejects object types outside the fixed registry", async () => {
    const fastify = await buildTestServer();

    const accepted = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        commercialTerms: {
          pricingModel: "calculated_after_submission",
          price: { summary: "Quoted after review" },
        },
      },
    });
    expect(accepted.statusCode).toBe(201);
    expect(mockCreateSupportServiceOffer).toHaveBeenLastCalledWith(
      bootstrapContext,
      expect.objectContaining({
        commercialTerms: expect.objectContaining({
          price: { summary: "Quoted after review" },
        }),
      }),
    );

    mockCreateSupportServiceOffer.mockClear();
    const rejected = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        outputSlots: [
          {
            role: "result",
            objectType: "pgo_unregistered_result",
            mutationMode: "new_object",
          },
        ],
      },
    });
    expect(rejected.statusCode).toBe(400);
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

  it("accepts sourced same-identity revision outputs", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        serviceId: "pgs_pocket_genes_report_studio_3",
        inputSlots: [
          {
            role: "blood_sample",
            objectType: "pgo_blood_sample",
            acceptedTypes: ["pgo_blood_sample"],
            required: true,
            cardinality: { min: 1, max: 1 },
          },
        ],
        formShape: undefined,
        outputSlots: [
          {
            role: "delivered_specimen",
            objectType: "same_as:blood_sample",
            mutationMode: "new_revision",
            sameIdentityAsInput: "blood_sample",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({
        outputSlots: [
          expect.objectContaining({
            objectType: "same_as:blood_sample",
            sameIdentityAsInput: "blood_sample",
          }),
        ],
      }),
    );
  });

  it("rejects support service form shapes that allow unknown fields", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        formShape: {
          ...validOfferPayload.formShape,
          allowUnknownFields: true,
        },
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
          status: "received",
        },
      ],
      nextCursor: "2026-09-16T12:00:00.000Z",
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/transactions?serviceId=pgs_final_report&status=received&limit=20",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      transactions: [
        expect.objectContaining({
          requestId: "pgr_demo_final_report",
          status: "received",
        }),
      ],
      nextCursor: "2026-09-16T12:00:00.000Z",
    });
    expect(mockListSupportServiceTransactions).toHaveBeenCalledWith(
      bootstrapContext,
      {
        serviceId: "pgs_final_report",
        status: "received",
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
        offerId: "offer-1",
        serviceId: "pgs_pocket_genes_report_studio_1",
        serviceVersion: 1,
        providerId: "feed-org-1",
        providerKind: "organization",
        requestedByUserId: "user-1",
        requestedByUserEmail: "patient@example.com",
        requestedAtClient: "2026-09-16T12:00:00.000Z",
        status: "received",
        idempotencyKey: "pgr_demo_final_report:backoffice",
        contractSource: "service_offer",
        inputs: [
          {
            role: "form",
            objectRef: {
              objectId: "obj_demo_form_final_report",
              revision: 1,
            },
            objectType: "pgo_form",
            objectCode: "987654321",
            uploadedObjectId: "uploaded-form-1",
            fileStorageId: "stored-form-1",
            objectOwnerId: "provider-owner-1",
            objectSnapshot: {
              objectId: "obj_demo_form_final_report",
              objectType: "pgo_form",
              revision: 1,
            },
          },
          {
            role: "test_order",
            objectRef: {
              objectId: "obj_demo_order",
              revision: 1,
            },
            objectType: "pgo_test_order",
            objectSnapshot: {
              objectId: "obj_demo_order",
              objectType: "pgo_test_order",
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

  it("attaches an output object from a strict download URL command", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        fileName: "report.pgo.json",
        downloadUrl: "https://objects.example/report.pgo.json",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(
      expect.objectContaining({
        object: expect.objectContaining({
          role: "report",
          objectCode: "123456789",
          status: "ready",
        }),
      }),
    );
    expect(mockAttachSupportServiceTransactionOutputObject).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      {
        role: "report",
        fileName: "report.pgo.json",
        downloadUrl: "https://objects.example/report.pgo.json",
      },
    );
  });

  it("rejects client-supplied output types and insecure URLs", async () => {
    const fastify = await buildTestServer();

    const withType = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        objectType: "pgo_pdf_report",
        fileName: "report.pgo.json",
        downloadUrl: "https://objects.example/report.pgo.json",
      },
    });
    const insecure = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        fileName: "report.pgo.json",
        downloadUrl: "http://objects.example/report.pgo.json",
      },
    });

    expect(withType.statusCode).toBe(400);
    expect(insecure.statusCode).toBe(400);
    expect(mockAttachSupportServiceTransactionOutputObject).not.toHaveBeenCalled();
  });

  it("marks a transaction delivered only through the dedicated command", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/deliver",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      transaction: expect.objectContaining({ status: "delivered" }),
    });
    expect(mockDeliverSupportServiceTransaction).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
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
