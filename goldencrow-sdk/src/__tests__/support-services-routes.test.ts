import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../types/sdk.types.js";

const mockCreateSupportServiceOffer = jest.fn();
const mockUpdateSupportServiceOffer = jest.fn();
const mockDeleteSupportServiceOffer = jest.fn();
const mockListSupportServiceOffers = jest.fn();
const mockListSupportServiceTransactions = jest.fn();
const mockCreateSupportServiceTransaction = jest.fn();
const mockDeleteSupportServiceTransaction = jest.fn();
const mockAttachSupportServiceTransactionOutputObject = jest.fn();
const mockAttachSupportServiceTransactionOutputReport = jest.fn();
const mockRemoveSupportServiceTransactionOutputReport = jest.fn();
const mockGetSupportServiceTransactionLinkedReports = jest.fn();
const mockListSupportServiceLinkedReportCandidates = jest.fn();
const mockDeliverSupportServiceTransaction = jest.fn();
const mockGetSupportServiceIdAvailability = jest.fn();
const mockGetSupportServiceOfferTransactionStats = jest.fn();

jest.mock("../repositories/support-services.repository.js", () => ({
  SUPPORT_SERVICE_CATEGORY_KEYS: ["sot_genomic_report_generation"],
  SUPPORT_SERVICE_PROMOTIONAL_BANNER_IMAGE_DATA_URL_MAX_LENGTH: 900_000,
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
  attachSupportServiceTransactionOutputReport:
    mockAttachSupportServiceTransactionOutputReport,
  createSupportServiceOffer: mockCreateSupportServiceOffer,
  createSupportServiceTransaction: mockCreateSupportServiceTransaction,
  deleteSupportServiceOffer: mockDeleteSupportServiceOffer,
  deleteSupportServiceTransaction: mockDeleteSupportServiceTransaction,
  deliverSupportServiceTransaction: mockDeliverSupportServiceTransaction,
  getSupportServiceIdAvailability: mockGetSupportServiceIdAvailability,
  getSupportServiceOffer: jest.fn(),
  getSupportServiceOfferTransactionStats:
    mockGetSupportServiceOfferTransactionStats,
  getSupportServiceTransaction: jest.fn(),
  getSupportServiceTransactionLinkedReports:
    mockGetSupportServiceTransactionLinkedReports,
  listSupportServiceLinkedReportCandidates:
    mockListSupportServiceLinkedReportCandidates,
  listSupportServiceOffers: mockListSupportServiceOffers,
  listSupportServiceTransactions: mockListSupportServiceTransactions,
  removeSupportServiceTransactionOutputReport:
    mockRemoveSupportServiceTransactionOutputReport,
  updateSupportServiceOffer: mockUpdateSupportServiceOffer,
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

const organizationPublisherContext: AdminContext = {
  email: "publisher@example.org",
  uid: "publisher-1",
  role: "organization_publisher",
  organizationId: "feed-org-1",
  isBootstrap: false,
  canAccessBackoffice: false,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: true,
  projectAccess: ["mydnamap"],
};

const individualPublisherContext: AdminContext = {
  email: "professional@example.org",
  uid: "publisher-2",
  role: "individual_publisher",
  individualId: "feed-individual-1",
  isBootstrap: false,
  canAccessBackoffice: false,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  canAccessPublisherPortal: true,
  projectAccess: ["mydnamap"],
};

const validOfferPayload = {
  serviceId: "pgs_pocket_genes_report_studio_12345",
  serviceVersion: 1,
  name: "Create the final self-contained report",
  serviceCategory: "sot_genomic_report_generation",
  providerKind: "organization",
  providerId: "feed-org-1",
  providerName: "Pocket Genes Report Studio",
  stages: ["bioinformatics"],
  status: "active",
  isHiddenFromSearch: false,
  isHighlightedOffer: false,
  isProfessionalOffer: true,
  promotionalBannerImageUrl: null,
  description:
    "Combine the complete test order with the interactive genomic result into a final PDF.",
  shortContract: "form + test_order + pgi1 -> final PDF",
  providerWork:
    "Verify the match and scope, perform report review, and issue a complete PDF.",
  formShape: {
    id: "pgfs_pocket_genes_report_studio_12345",
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

const completeMoreInformation = {
  frequentQuestions: [
    {
      question: "How should I prepare?",
      answer: "Follow the instructions sent by the provider.",
    },
  ],
  keyInsights: [
    {
      title: "Actionable results",
      description: "The service focuses on findings that can guide care.",
    },
  ],
  scientificFacts: [
    {
      title: "Validated workflow",
      description: "The analysis follows a documented scientific workflow.",
    },
  ],
  usefulLinks: [
    { title: "Preparation guide", url: "https://example.org/preparation" },
  ],
  sampleLink: {
    title: "Example report",
    description: "Review an example of the delivered result.",
    buttonTitle: "View example",
    url: "https://example.org/sample-report",
  },
  bulletSegments: [
    {
      title: "Clear delivery",
      description: "Results are organized for practical review.",
      imageUrl: "https://example.org/images/delivery.png",
    },
  ],
  technicalInformationFacts: [
    {
      title: "Pipeline",
      description: "Quality-controlled processing and interpretation.",
      subitems: ["Quality control", "Expert review"],
    },
  ],
  biologicalSampleRequirements: [
    {
      title: "Blood sample",
      description: "A whole-blood sample is accepted.",
      instructions: "Use the collection kit supplied by the provider.",
    },
  ],
  websiteUrl: "https://example.org/services/report",
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
      serviceId: "pgs_pocket_genes_report_studio_12345",
      name: "Create the final self-contained report",
    });
    mockUpdateSupportServiceOffer.mockResolvedValue({
      id: "offer-1",
      serviceId: "pgs_pocket_genes_report_studio_12345",
      serviceVersion: 2,
      name: "Create the final self-contained report",
    });
    mockDeleteSupportServiceOffer.mockResolvedValue(undefined);
    mockListSupportServiceOffers.mockResolvedValue({
      offers: [],
      nextCursor: undefined,
    });
    mockListSupportServiceTransactions.mockResolvedValue({
      transactions: [],
      nextCursor: undefined,
    });
    mockCreateSupportServiceTransaction.mockResolvedValue({
      id: "txn-1",
      requestId: "pgr_demo_final_report",
      serviceId: "pgs_pocket_genes_report_studio_12345",
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
    mockGetSupportServiceTransactionLinkedReports.mockResolvedValue([
      {
        reportCode: "ABC123",
        available: true,
        providerFormat: "pdf",
        uploadVersionCount: 2,
      },
    ]);
    mockListSupportServiceLinkedReportCandidates.mockResolvedValue({
      reports: [
        {
          reportCode: "XYZ789",
          available: true,
          providerFormat: "pdf",
          uploadVersionCount: 1,
        },
      ],
    });
    mockAttachSupportServiceTransactionOutputReport.mockResolvedValue({
      transaction: {
        id: "txn-1",
        requestId: "pgr_demo_final_report",
        status: "delivered",
        outputReports: [{ reportCode: "XYZ789" }],
      },
      report: {
        reportCode: "XYZ789",
        available: true,
        providerFormat: "pdf",
        uploadVersionCount: 1,
      },
    });
    mockRemoveSupportServiceTransactionOutputReport.mockResolvedValue({
      transaction: {
        id: "txn-1",
        requestId: "pgr_demo_final_report",
        status: "delivered",
        outputReports: [],
      },
      reportCode: "ABC123",
    });
    mockDeliverSupportServiceTransaction.mockResolvedValue({
      id: "txn-1",
      requestId: "pgr_demo_final_report",
      status: "delivered",
    });
    mockGetSupportServiceIdAvailability.mockResolvedValue({
      serviceId: "pgs_pocket_genes_report_studio_12345",
      available: true,
    });
    mockGetSupportServiceOfferTransactionStats.mockResolvedValue({
      offerId: "offer-1",
      currentServiceVersion: 3,
      totalTransactions: 8,
      activeTransactions: 5,
      terminalTransactions: 3,
      currentVersionActiveTransactions: 2,
      outdatedActiveTransactions: 3,
      versions: [],
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
        serviceId: "pgs_pocket_genes_report_studio_12345",
      }),
    });
    expect(mockCreateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({
        providerKind: "organization",
        providerId: "feed-org-1",
        stages: ["bioinformatics"],
        isHighlightedOffer: false,
        isProfessionalOffer: true,
        promotionalBannerImageUrl: null,
      }),
    );
  });

  it("accepts and forwards every canonical more-information section", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        moreInformation: completeMoreInformation,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({ moreInformation: completeMoreInformation }),
    );
  });

  it("accepts uploaded image data instead of an image URL for illustrated segments", async () => {
    const fastify = await buildTestServer();
    const imageUploadDataUrl =
      "data:image/png;base64,aWxsdXN0cmF0ZWQtc2VnbWVudA==";
    const moreInformation = {
      bulletSegments: [
        {
          title: "Uploaded illustration",
          description: "This segment uses embedded image data.",
          imageUploadDataUrl,
        },
      ],
    };

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: { ...validOfferPayload, moreInformation },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({ moreInformation }),
    );
  });

  it.each([
    ["a snake-case section", { frequent_questions: [] }],
    [
      "an unknown item key",
      { frequentQuestions: [{ question: "Question", answer: "Answer", note: "No" }] },
    ],
    [
      "a non-HTTPS useful link",
      { usefulLinks: [{ title: "Guide", url: "http://example.org/guide" }] },
    ],
    ["a malformed host", { websiteUrl: "https://bad..example.org" }],
    [
      "both illustrated-segment image sources",
      {
        bulletSegments: [
          {
            title: "Two sources",
            description: "This must be rejected.",
            imageUrl: "https://example.org/image.png",
            imageUploadDataUrl: "data:image/png;base64,AAAA",
          },
        ],
      },
    ],
    [
      "no illustrated-segment image source",
      {
        bulletSegments: [
          { title: "No source", description: "This must be rejected." },
        ],
      },
    ],
  ])("rejects moreInformation with %s", async (_label, moreInformation) => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: { ...validOfferPayload, moreInformation },
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateSupportServiceOffer).not.toHaveBeenCalled();
  });

  it("requires and forwards the existing-transaction contract acknowledgement on updates", async () => {
    const fastify = await buildTestServer();
    const withoutAcknowledgement = await fastify.inject({
      method: "PUT",
      url: "/admin/support-services/offers/offer-1",
      payload: validOfferPayload,
    });

    expect(withoutAcknowledgement.statusCode).toBe(400);
    expect(mockUpdateSupportServiceOffer).not.toHaveBeenCalled();

    const acknowledged = await fastify.inject({
      method: "PUT",
      url: "/admin/support-services/offers/offer-1",
      payload: {
        ...validOfferPayload,
        acknowledgesExistingTransactionContracts: true,
      },
    });

    expect(acknowledged.statusCode).toBe(200);
    expect(mockUpdateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      "offer-1",
      expect.objectContaining({
        acknowledgesExistingTransactionContracts: true,
      }),
    );
  });

  it("checks exact five-digit service ID availability", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/offers/service-id-availability?serviceId=pgs_pocket_genes_report_studio_12345",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      serviceId: "pgs_pocket_genes_report_studio_12345",
      available: true,
    });
    expect(mockGetSupportServiceIdAvailability).toHaveBeenCalledWith(
      bootstrapContext,
      "pgs_pocket_genes_report_studio_12345",
      undefined,
    );
  });

  it("returns transaction version statistics for one offer", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/offers/offer-1/transaction-stats",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        offerId: "offer-1",
        activeTransactions: 5,
        outdatedActiveTransactions: 3,
      }),
    );
    expect(mockGetSupportServiceOfferTransactionStats).toHaveBeenCalledWith(
      bootstrapContext,
      "offer-1",
    );
  });

  it("rejects a new service offer without an exact five-digit suffix", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        serviceId: "pgs_pocket_genes_report_studio_1",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateSupportServiceOffer).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing category", undefined],
    ["an empty category", ""],
    ["a translated label", "Generación de informe genómico"],
    ["an unknown key", "sot_unknown"],
    ["a key with surrounding whitespace", " sot_genomic_report_generation "],
  ])("rejects %s before calling the offer repository", async (_label, category) => {
    const fastify = await buildTestServer();
    const payload: Record<string, unknown> = { ...validOfferPayload };
    if (category === undefined) {
      delete payload.serviceCategory;
    } else {
      payload.serviceCategory = category;
    }

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateSupportServiceOffer).not.toHaveBeenCalled();
  });

  it("accepts canonical promotional banner upload data through the enlarged offer route", async () => {
    const fastify = await buildTestServer();
    const prefix = "data:image/png;base64,";
    const promotionalBannerImageUploadDataUrl = `${prefix}${"A".repeat(
      900_000 - prefix.length,
    )}`;

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        promotionalBannerImageUrl: null,
        promotionalBannerImageUploadDataUrl,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({ promotionalBannerImageUploadDataUrl }),
    );
  });

  it.each([
    ["an unsupported uploaded MIME type", "data:image/gif;base64,AAAA"],
    [
      "an oversized uploaded banner",
      `data:image/png;base64,${"A".repeat(900_001)}`,
    ],
  ])("rejects %s before calling the offer repository", async (_name, upload) => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        promotionalBannerImageUrl: null,
        promotionalBannerImageUploadDataUrl: upload,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateSupportServiceOffer).not.toHaveBeenCalled();
  });

  it("returns diagnostic JSON when a support service list fails unexpectedly", async () => {
    const fastify = await buildTestServer();
    mockListSupportServiceOffers.mockRejectedValue(
      new Error("Firestore support services query failed."),
    );

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/offers?limit=20",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "Support services request failed.",
      message: "Firestore support services query failed.",
      errorName: "Error",
      statusCode: 500,
      hint: expect.stringContaining("Vercel request id"),
    });
  });

  it("creates a service offer without form shape or commercial terms", async () => {
    const fastify = await buildTestServer();
    const payload = {
      ...validOfferPayload,
      serviceId: "pgs_pocket_genes_report_studio_22345",
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
        serviceId: "pgs_pocket_genes_report_studio_22345",
      }),
    );
    const [, offerBody] = mockCreateSupportServiceOffer.mock.calls.at(-1) ?? [];
    expect(offerBody).not.toHaveProperty("formShape");
    expect(offerBody).not.toHaveProperty("commercialTerms");
  });

  it.each([
    {
      name: "no input slots",
      formShape: undefined,
      inputSlots: [],
      outputSlots: validOfferPayload.outputSlots,
    },
    {
      name: "no output slots",
      formShape: validOfferPayload.formShape,
      inputSlots: validOfferPayload.inputSlots,
      outputSlots: [],
    },
    {
      name: "no input or output slots",
      formShape: undefined,
      inputSlots: [],
      outputSlots: [],
    },
  ])("accepts a service offer with $name", async ({
    formShape,
    inputSlots,
    outputSlots,
  }) => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        formShape,
        inputSlots,
        outputSlots,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateSupportServiceOffer).toHaveBeenLastCalledWith(
      bootstrapContext,
      expect.objectContaining({ inputSlots, outputSlots }),
    );
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

  it("requires canonical offer flags and rejects snake case and the retired paused status", async () => {
    const fastify = await buildTestServer();
    const missingResponses = await Promise.all(
      ["isHiddenFromSearch", "isHighlightedOffer", "isProfessionalOffer"].map(
        async (key) => {
          const payload: Record<string, unknown> = { ...validOfferPayload };
          delete payload[key];
          return fastify.inject({
            method: "POST",
            url: "/admin/support-services/offers",
            payload,
          });
        },
      ),
    );
    const snakeCaseResponse = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: {
        ...validOfferPayload,
        is_highlighted_offer: false,
      },
    });
    const pausedResponse = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: { ...validOfferPayload, status: "paused" },
    });

    expect(missingResponses.map((response) => response.statusCode)).toEqual([
      400, 400, 400,
    ]);
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
        serviceId: "pgs_pocket_genes_report_studio_32345",
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

  it.each([
    ["not allowed", "Readable label"],
    ["valid_value", "x".repeat(121)],
  ])(
    "rejects form options outside the native value and label contract",
    async (value, label) => {
      const fastify = await buildTestServer();

      const response = await fastify.inject({
        method: "POST",
        url: "/admin/support-services/offers",
        payload: {
          ...validOfferPayload,
          formShape: {
            ...validOfferPayload.formShape,
            fields: [
              {
                key: "presentation",
                label: "Presentation",
                type: "enum",
                required: true,
                options: [{ value, label }],
              },
            ],
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(mockCreateSupportServiceOffer).not.toHaveBeenCalled();
    },
  );

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

  it("accepts an email-only service transaction without a requester user ID", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions",
      payload: {
        requestId: "pgr_email_only_report",
        offerId: "offer-1",
        serviceId: "pgs_pocket_genes_report_studio_1",
        providerId: "feed-org-1",
        providerKind: "organization",
        requestedByUserEmail: "future.user@example.com",
        requestedAtClient: "2026-09-16T12:00:00.000Z",
        status: "received",
        idempotencyKey: "pgr_email_only_report:backoffice",
        contractSource: "service_offer",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateSupportServiceTransaction).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({
        requestedByUserEmail: "future.user@example.com",
      }),
    );
    const [, transactionBody] =
      mockCreateSupportServiceTransaction.mock.calls.at(-1) ?? [];
    expect(transactionBody).not.toHaveProperty("requestedByUserId");
  });

  it("rejects a service transaction without any requester identity", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions",
      payload: {
        requestId: "pgr_missing_requester",
        offerId: "offer-1",
        serviceId: "pgs_pocket_genes_report_studio_1",
        providerId: "feed-org-1",
        providerKind: "organization",
        requestedAtClient: "2026-09-16T12:00:00.000Z",
        status: "received",
        idempotencyKey: "pgr_missing_requester:backoffice",
        contractSource: "service_offer",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateSupportServiceTransaction).not.toHaveBeenCalled();
  });

  it("lists, attaches, and removes supplemental transaction reports through dedicated routes", async () => {
    const fastify = await buildTestServer();

    const detail = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-reports",
    });
    const candidates = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-reports/candidates?query=XYZ&limit=20",
    });
    const attached = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-reports",
      payload: { reportCode: "XYZ789" },
    });
    const removed = await fastify.inject({
      method: "DELETE",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-reports/ABC123",
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual({
      reports: [expect.objectContaining({ reportCode: "ABC123" })],
    });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json()).toEqual({
      reports: [expect.objectContaining({ reportCode: "XYZ789" })],
    });
    expect(attached.statusCode).toBe(201);
    expect(removed.statusCode).toBe(200);
    expect(mockListSupportServiceLinkedReportCandidates).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      { query: "XYZ", limit: 20 },
    );
    expect(mockAttachSupportServiceTransactionOutputReport).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      "XYZ789",
    );
    expect(mockRemoveSupportServiceTransactionOutputReport).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      "ABC123",
    );
  });

  it("rejects malformed report codes before invoking linked-report commands", async () => {
    const fastify = await buildTestServer();

    const attached = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-reports",
      payload: { reportCode: "abc-12" },
    });
    const removed = await fastify.inject({
      method: "DELETE",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-reports/TOO-LONG",
    });

    expect(attached.statusCode).toBe(400);
    expect(removed.statusCode).toBe(400);
    expect(mockAttachSupportServiceTransactionOutputReport).not.toHaveBeenCalled();
    expect(mockRemoveSupportServiceTransactionOutputReport).not.toHaveBeenCalled();
  });

  it("attaches an output object from a strict download URL command", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
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
        downloadUrl: "https://objects.example/report.pgo.json",
      },
    );
  });

  it("attaches an output object from a strict File Storage command", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        fileStorageId: "stored-output-1",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockAttachSupportServiceTransactionOutputObject).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      {
        role: "report",
        fileStorageId: "stored-output-1",
      },
    );
  });

  it("rejects client-supplied output metadata, ambiguous sources, and insecure URLs", async () => {
    const fastify = await buildTestServer();

    const withType = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        objectType: "pgo_pdf_report",
        downloadUrl: "https://objects.example/report.pgo.json",
      },
    });
    const insecure = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        downloadUrl: "http://objects.example/report.pgo.json",
      },
    });
    const ambiguous = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        downloadUrl: "https://objects.example/report.pgo.json",
        fileStorageId: "stored-output-1",
      },
    });
    const obsoleteFileName = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        fileName: "report.pgo.json",
        downloadUrl: "https://objects.example/report.pgo.json",
      },
    });
    const pathLikeFileId = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        fileStorageId: "folder/stored-output-1",
      },
    });

    expect(withType.statusCode).toBe(400);
    expect(insecure.statusCode).toBe(400);
    expect(ambiguous.statusCode).toBe(400);
    expect(obsoleteFileName.statusCode).toBe(400);
    expect(pathLikeFileId.statusCode).toBe(400);
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

  it.each([
    ["organization", organizationPublisherContext],
    ["individual", individualPublisherContext],
  ])(
    "allows %s publishers to load their scoped support-service lists",
    async (_publisherKind, publisherContext) => {
      const fastify = await buildTestServer(publisherContext);

      const [offersResponse, transactionsResponse] = await Promise.all([
        fastify.inject({
          method: "GET",
          url: "/admin/support-services/offers?limit=20",
        }),
        fastify.inject({
          method: "GET",
          url: "/admin/support-services/transactions?limit=20",
        }),
      ]);

      expect(offersResponse.statusCode).toBe(200);
      expect(transactionsResponse.statusCode).toBe(200);
      expect(mockListSupportServiceOffers).toHaveBeenCalledWith(
        publisherContext,
        expect.objectContaining({ limit: 20 }),
      );
      expect(mockListSupportServiceTransactions).toHaveBeenCalledWith(
        publisherContext,
        expect.objectContaining({ limit: 20 }),
      );
    },
  );

  it.each([
    ["organization", organizationPublisherContext],
    ["individual", individualPublisherContext],
  ])(
    "blocks %s publishers from creating or deleting service transactions",
    async (_publisherKind, publisherContext) => {
      const fastify = await buildTestServer(publisherContext);

      const isIndividual = publisherContext.role === "individual_publisher";
      const createResponse = await fastify.inject({
        method: "POST",
        url: "/admin/support-services/transactions",
        payload: {
          requestId: "pgr_publisher_forbidden",
          offerId: "offer-1",
          serviceId: "pgs_pocket_genes_report_studio_1",
          providerId: isIndividual ? "feed-individual-1" : "feed-org-1",
          providerKind: isIndividual ? "individual" : "organization",
          requestedByUserEmail: "requester@example.org",
          requestedAtClient: "2026-09-16T12:00:00.000Z",
          status: "received",
          idempotencyKey: "pgr_publisher_forbidden:backoffice",
          contractSource: "service_offer",
        },
      });
      const deleteResponse = await fastify.inject({
        method: "DELETE",
        url: "/admin/support-services/transactions/pgr_publisher_forbidden",
      });

      expect(createResponse.statusCode).toBe(403);
      expect(deleteResponse.statusCode).toBe(403);
      expect(mockCreateSupportServiceTransaction).not.toHaveBeenCalled();
      expect(mockDeleteSupportServiceTransaction).not.toHaveBeenCalled();
    },
  );

  it("rejects an individual publisher without a linked individual profile", async () => {
    const fastify = await buildTestServer({
      ...individualPublisherContext,
      individualId: undefined,
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/offers",
    });

    expect(response.statusCode).toBe(403);
    expect(mockListSupportServiceOffers).not.toHaveBeenCalled();
  });

  it("keeps unrelated backoffice roles out of support services", async () => {
    const fastify = await buildTestServer({
      ...organizationPublisherContext,
      role: "2pq_admin",
      organizationId: undefined,
      canAccessBackoffice: true,
      canAccessPublisherPortal: false,
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/offers",
    });

    expect(response.statusCode).toBe(403);
    expect(mockListSupportServiceOffers).not.toHaveBeenCalled();
  });
});
