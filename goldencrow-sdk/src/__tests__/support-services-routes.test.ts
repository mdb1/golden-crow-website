import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import type { AdminContext } from "../types/sdk.types.js";

const mockCreateSupportServiceOffer = jest.fn();
const mockUpdateSupportServiceOffer = jest.fn();
const mockDeleteSupportServiceOffer = jest.fn();
const mockListSupportServiceOffers = jest.fn();
const mockListSupportServiceTransactions = jest.fn();
const mockListDeferredServiceTransactions = jest.fn();
const mockListDeferredServiceTransactionLinks = jest.fn();
const mockGetDeferredServiceTransaction = jest.fn();
const mockGetDeferredServiceTransactionNotificationPreview = jest.fn();
const mockUpdateDeferredServiceTransaction = jest.fn();
const mockDeleteDeferredServiceTransaction = jest.fn();
const mockResendDeferredServiceTransactionNotification = jest.fn();
const mockCreateSupportServiceTransaction = jest.fn();
const mockUpdateSupportServiceTransaction = jest.fn();
const mockDeleteSupportServiceTransaction = jest.fn();
const mockAttachSupportServiceTransactionOutputObject = jest.fn();
const mockGetSupportServiceTransactionOutputObject = jest.fn();
const mockRemoveSupportServiceTransactionOutputObject = jest.fn();
const mockAttachSupportServiceTransactionOutputReport = jest.fn();
const mockRemoveSupportServiceTransactionOutputReport = jest.fn();
const mockGetSupportServiceTransactionLinkedReports = jest.fn();
const mockListSupportServiceLinkedReportCandidates = jest.fn();
const mockDeliverSupportServiceTransaction = jest.fn();
const mockGetSupportServiceIdAvailability = jest.fn();
const mockGetSupportServiceOfferTransactionStats = jest.fn();

jest.mock("../repositories/support-services.repository.js", () => ({
  SUPPORT_SERVICE_CATEGORY_KEYS: [
    "sot_complete_health_genomics_report",
    "sot_genomic_report_generation",
    "sot_genomic_report_review",
    "sot_human_advice_medical_consultation",
  ],
  isCanonicalSupportServiceCategoryValue: (value: unknown) => {
    if (typeof value !== "string" || !value) {
      return false;
    }
    const categories = value.split(",");
    const knownCategories = new Set([
      "sot_complete_health_genomics_report",
      "sot_genomic_report_generation",
      "sot_genomic_report_review",
      "sot_human_advice_medical_consultation",
    ]);
    return (
      categories.every(
        (category) =>
          category &&
          category === category.trim() &&
          knownCategories.has(category),
      ) &&
      new Set(categories).size === categories.length
    );
  },
  supportServiceCategoryStageContractIssue: (
    serviceCategory: unknown,
    stagesValue: unknown,
  ) => {
    if (typeof serviceCategory !== "string") {
      return null;
    }
    const categories = serviceCategory.split(",");
    const stages =
      stagesValue === undefined
        ? ["test_planning"]
        : Array.isArray(stagesValue)
          ? stagesValue
          : [];
    const knownStages = new Set([
      "test_planning",
      "wet_lab",
      "bioinformatics",
      "human_advice",
    ]);
    if (
      stages.length === 0 ||
      stages.length > knownStages.size ||
      stages.some((stage) => !knownStages.has(String(stage))) ||
      new Set(stages).size !== stages.length
    ) {
      return "stages must be a non-empty array of at most four unique canonical stage keys.";
    }
    const hasHumanAdvice = categories.some((category) =>
      category.startsWith("sot_human_advice_"),
    );
    const hasOnlyHumanAdvice = categories.every((category) =>
      category.startsWith("sot_human_advice_"),
    );
    const hasCompleteService = categories.some((category) =>
      category.startsWith("sot_complete_"),
    );
    const stageSet = new Set(stages);

    if (
      hasOnlyHumanAdvice &&
      (stages.length !== 1 || stages[0] !== "human_advice")
    ) {
      return "Service offers containing only sot_human_advice_* categories must use exactly the human_advice stage.";
    }
    if (hasHumanAdvice && !stageSet.has("human_advice")) {
      return "Service offers containing any sot_human_advice_* category must include the human_advice stage.";
    }
    if (!hasHumanAdvice && stageSet.has("human_advice")) {
      return "Service offers without a sot_human_advice_* category cannot include the human_advice stage.";
    }
    if (
      hasCompleteService &&
      !["test_planning", "wet_lab", "bioinformatics"].every((stage) =>
        stageSet.has(stage),
      )
    ) {
      return "Service offers containing any sot_complete_* category must include the test_planning, wet_lab, and bioinformatics stages.";
    }
    return null;
  },
  SUPPORT_SERVICE_PROMOTIONAL_BANNER_IMAGE_DATA_URL_MAX_LENGTH: 900_000,
  SUPPORT_SERVICE_STAGES: [
    "test_planning",
    "wet_lab",
    "bioinformatics",
    "human_advice",
  ],
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
  getSupportServiceTransactionOutputObject:
    mockGetSupportServiceTransactionOutputObject,
  removeSupportServiceTransactionOutputObject:
    mockRemoveSupportServiceTransactionOutputObject,
  attachSupportServiceTransactionOutputReport:
    mockAttachSupportServiceTransactionOutputReport,
  createSupportServiceOffer: mockCreateSupportServiceOffer,
  createSupportServiceTransaction: mockCreateSupportServiceTransaction,
  deleteDeferredServiceTransaction: mockDeleteDeferredServiceTransaction,
  deleteSupportServiceOffer: mockDeleteSupportServiceOffer,
  deleteSupportServiceTransaction: mockDeleteSupportServiceTransaction,
  deliverSupportServiceTransaction: mockDeliverSupportServiceTransaction,
  getSupportServiceIdAvailability: mockGetSupportServiceIdAvailability,
  getDeferredServiceTransaction: mockGetDeferredServiceTransaction,
  getDeferredServiceTransactionNotificationPreview:
    mockGetDeferredServiceTransactionNotificationPreview,
  getSupportServiceOffer: jest.fn(),
  getSupportServiceOfferTransactionStats:
    mockGetSupportServiceOfferTransactionStats,
  getSupportServiceTransaction: jest.fn(),
  getSupportServiceTransactionLinkedReports:
    mockGetSupportServiceTransactionLinkedReports,
  listSupportServiceLinkedReportCandidates:
    mockListSupportServiceLinkedReportCandidates,
  listDeferredServiceTransactionLinks:
    mockListDeferredServiceTransactionLinks,
  listDeferredServiceTransactions: mockListDeferredServiceTransactions,
  listSupportServiceOffers: mockListSupportServiceOffers,
  listSupportServiceTransactions: mockListSupportServiceTransactions,
  removeSupportServiceTransactionOutputReport:
    mockRemoveSupportServiceTransactionOutputReport,
  resendDeferredServiceTransactionNotification:
    mockResendDeferredServiceTransactionNotification,
  updateSupportServiceOffer: mockUpdateSupportServiceOffer,
  updateDeferredServiceTransaction: mockUpdateDeferredServiceTransaction,
  updateSupportServiceTransaction: mockUpdateSupportServiceTransaction,
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
    mockListDeferredServiceTransactions.mockResolvedValue({
      deferredTransactions: [],
      nextCursor: undefined,
    });
    mockListDeferredServiceTransactionLinks.mockResolvedValue({
      transactions: [
        {
          transactionId: "pgr_deferred_1",
          exists: true,
          serviceOfferName: "Frozen report offer",
          serviceId: "pgs_report_offer_12345",
        },
      ],
      nextCursor: "next-links-cursor",
    });
    mockGetDeferredServiceTransaction.mockResolvedValue({
      id: "deferred-1",
      email: "person@example.com",
      deferredTransactionIds: ["pgr_deferred_1"],
      transactionCount: 1,
      transactions: [],
    });
    mockGetDeferredServiceTransactionNotificationPreview.mockResolvedValue({
      deferredId: "deferred-1",
      deferredEmail: "person@example.com",
      transactionId: "pgr_deferred_1",
      linkedTransactionIds: ["pgr_deferred_1"],
      requesterEmailMismatch: false,
      previewFingerprint: "a".repeat(64),
      transaction: {
        id: "pgr_deferred_1",
        name: "Report service",
        requestedByUserEmail: "person@example.com",
        status: "received",
      },
      provider: {
        id: "provider-1",
        accountType: "organization",
        name: "Genome Lab",
        email: "provider@example.com",
        status: "active",
      },
      email: {
        recipientEmail: "federico@goldencrowvs.com",
        subject: "New Pocket Genes service request",
        text: "A new service request has been submitted.",
        input: {
          transactionName: "Report service",
          requesterEmail: "person@example.com",
        },
      },
    });
    mockUpdateDeferredServiceTransaction.mockResolvedValue({
      id: "deferred-2",
      email: "updated@example.com",
      deferredTransactionIds: ["pgr_deferred_1"],
      transactionCount: 1,
      transactions: [],
    });
    mockDeleteDeferredServiceTransaction.mockResolvedValue(undefined);
    mockResendDeferredServiceTransactionNotification.mockResolvedValue({
      transactionId: "pgr_deferred_1",
      resendRequestId: "123e4567-e89b-42d3-a456-426614174000",
      recipientEmail: "federico@goldencrowvs.com",
      status: "sent",
    });
    mockDeleteSupportServiceTransaction.mockResolvedValue({
      cleanupWarnings: [],
      deletedArtifacts: {
        forms: 0,
        reports: 0,
        outputObjects: 0,
        inputObjects: 0,
        objectCodes: 0,
        reportCodes: 0,
        storedFiles: 0,
      },
    });
    mockCreateSupportServiceTransaction.mockResolvedValue({
      id: "txn-1",
      requestId: "pgr_demo_final_report",
      serviceId: "pgs_pocket_genes_report_studio_12345",
    });
    mockUpdateSupportServiceTransaction.mockResolvedValue({
      id: "txn-1",
      requestId: "pgr_demo_final_report",
      serviceId: "pgs_pocket_genes_report_studio_12345",
      customTransactionName: "Personalized title",
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
    mockGetSupportServiceTransactionOutputObject.mockResolvedValue({
      id: "pgo_output_123456789",
      role: "report",
      objectCode: "123456789",
      objectType: "pgo_pdf_report",
      objectId: "obj_output_123456789",
      objectRevision: 1,
      fileName: "Final report",
      source: "file_storage",
      fileStorageId: "stored-output-1",
      content: {
        title: "Final report",
        download_url: "https://objects.example/report.pdf",
      },
      contentSizeBytes: 96,
      uploadVersionCount: 1,
    });
    mockRemoveSupportServiceTransactionOutputObject.mockResolvedValue({
      transaction: {
        id: "txn-1",
        requestId: "pgr_demo_final_report",
        outputObjects: [],
      },
      role: "report",
      objectCode: "123456789",
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

  it("lists and updates deferred transactions only through the GOD MODE context", async () => {
    const fastify = await buildTestServer();

    const listResponse = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/deferred-transactions?limit=20&query=person",
    });
    const updateResponse = await fastify.inject({
      method: "PUT",
      url: "/admin/support-services/deferred-transactions/deferred-1",
      payload: {
        email: "updated@example.com",
        deferredTransactionIds: ["pgr_deferred_1"],
      },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(mockListDeferredServiceTransactions).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({ limit: 20, query: "person" }),
    );
    expect(updateResponse.statusCode).toBe(200);
    expect(mockUpdateDeferredServiceTransaction).toHaveBeenCalledWith(
      bootstrapContext,
      "deferred-1",
      {
        email: "updated@example.com",
        deferredTransactionIds: ["pgr_deferred_1"],
      },
    );
  });

  it("pages linked deferred transactions through GOD MODE", async () => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/deferred-transactions/deferred-1/transactions?limit=7&cursor=links-cursor",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      transactions: [
        {
          transactionId: "pgr_deferred_1",
          exists: true,
          serviceOfferName: "Frozen report offer",
          serviceId: "pgs_report_offer_12345",
        },
      ],
      nextCursor: "next-links-cursor",
    });
    expect(mockListDeferredServiceTransactionLinks).toHaveBeenCalledWith(
      bootstrapContext,
      "deferred-1",
      expect.objectContaining({ limit: 7, cursor: "links-cursor" }),
    );
  });

  it("previews and resends one linked deferred transaction notification through GOD MODE", async () => {
    const fastify = await buildTestServer();
    const path =
      "/admin/support-services/deferred-transactions/deferred-1/transactions/pgr_deferred_1/notification";
    const previewResponse = await fastify.inject({
      method: "GET",
      url: path,
    });
    const resendResponse = await fastify.inject({
      method: "POST",
      url: path,
      payload: {
        resendRequestId: "123e4567-e89b-42d3-a456-426614174000",
        previewFingerprint: "a".repeat(64),
      },
    });

    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toEqual({
      preview: expect.objectContaining({
        transactionId: "pgr_deferred_1",
        email: expect.objectContaining({
          recipientEmail: "federico@goldencrowvs.com",
        }),
      }),
    });
    expect(
      mockGetDeferredServiceTransactionNotificationPreview,
    ).toHaveBeenCalledWith(
      bootstrapContext,
      "deferred-1",
      "pgr_deferred_1",
    );
    expect(resendResponse.statusCode).toBe(200);
    expect(mockResendDeferredServiceTransactionNotification).toHaveBeenCalledWith(
      bootstrapContext,
      "deferred-1",
      "pgr_deferred_1",
      "123e4567-e89b-42d3-a456-426614174000",
      "a".repeat(64),
    );
  });

  it("rejects client-supplied notification recipients and content", async () => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/deferred-transactions/deferred-1/transactions/pgr_deferred_1/notification",
      payload: {
        resendRequestId: "123e4567-e89b-42d3-a456-426614174000",
        previewFingerprint: "a".repeat(64),
        recipientEmail: "attacker@example.com",
        text: "Replace the canonical message",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(
      mockResendDeferredServiceTransactionNotification,
    ).not.toHaveBeenCalled();
  });

  it("rejects duplicate deferred transaction IDs before repository access", async () => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "PUT",
      url: "/admin/support-services/deferred-transactions/deferred-1",
      payload: {
        email: "person@example.com",
        deferredTransactionIds: ["pgr_deferred_1", "pgr_deferred_1"],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockUpdateDeferredServiceTransaction).not.toHaveBeenCalled();
  });

  it("deletes a deferred transaction index through GOD MODE", async () => {
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/support-services/deferred-transactions/deferred-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true,
      deferredId: "deferred-1",
    });
    expect(mockDeleteDeferredServiceTransaction).toHaveBeenCalledWith(
      bootstrapContext,
      "deferred-1",
    );
  });

  it("returns the repository 404 when a deferred transaction index is missing", async () => {
    mockDeleteDeferredServiceTransaction.mockRejectedValueOnce(
      new AdminRepositoryError(
        "Deferred service transaction index not found.",
        404,
      ),
    );
    const fastify = await buildTestServer();
    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/support-services/deferred-transactions/missing-index",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Deferred service transaction index not found.",
    });
  });

  it("blocks publisher access to deferred transaction administration", async () => {
    const fastify = await buildTestServer(organizationPublisherContext);
    const listResponse = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/deferred-transactions",
    });
    const deleteResponse = await fastify.inject({
      method: "DELETE",
      url: "/admin/support-services/deferred-transactions/deferred-1",
    });
    const linksResponse = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/deferred-transactions/deferred-1/transactions",
    });
    const previewResponse = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/deferred-transactions/deferred-1/transactions/pgr_deferred_1/notification",
    });
    const resendResponse = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/deferred-transactions/deferred-1/transactions/pgr_deferred_1/notification",
      payload: {
        resendRequestId: "123e4567-e89b-42d3-a456-426614174000",
        previewFingerprint: "a".repeat(64),
      },
    });

    expect(listResponse.statusCode).toBe(403);
    expect(listResponse.json()).toEqual({
      error: "Only GOD MODE can manage deferred service transactions.",
    });
    expect(deleteResponse.statusCode).toBe(403);
    expect(deleteResponse.json()).toEqual({
      error: "Only GOD MODE can manage deferred service transactions.",
    });
    expect(linksResponse.statusCode).toBe(403);
    expect(previewResponse.statusCode).toBe(403);
    expect(resendResponse.statusCode).toBe(403);
    expect(mockListDeferredServiceTransactions).not.toHaveBeenCalled();
    expect(mockDeleteDeferredServiceTransaction).not.toHaveBeenCalled();
    expect(mockListDeferredServiceTransactionLinks).not.toHaveBeenCalled();
    expect(
      mockGetDeferredServiceTransactionNotificationPreview,
    ).not.toHaveBeenCalled();
    expect(
      mockResendDeferredServiceTransactionNotification,
    ).not.toHaveBeenCalled();
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
    [
      "a padded token",
      "sot_genomic_report_generation, sot_genomic_report_review",
    ],
    [
      "an empty token",
      "sot_genomic_report_generation,,sot_genomic_report_review",
    ],
    [
      "a duplicate token",
      "sot_genomic_report_generation,sot_genomic_report_generation",
    ],
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

  it("accepts mixed complete and human-advice categories with all four stages", async () => {
    const fastify = await buildTestServer();
    const serviceCategory =
      "sot_complete_health_genomics_report,sot_human_advice_medical_consultation";
    const stages = [
      "test_planning",
      "wet_lab",
      "bioinformatics",
      "human_advice",
    ];

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: { ...validOfferPayload, serviceCategory, stages },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({ serviceCategory, stages }),
    );
  });

  it("accepts a human-advice-only offer with exactly its human-advice stage", async () => {
    const fastify = await buildTestServer();
    const serviceCategory = "sot_human_advice_medical_consultation";
    const stages = ["human_advice"];

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/offers",
      payload: { ...validOfferPayload, serviceCategory, stages },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreateSupportServiceOffer).toHaveBeenCalledWith(
      bootstrapContext,
      expect.objectContaining({ serviceCategory, stages }),
    );
  });

  it.each([
    [
      "human advice without its required stage",
      "sot_genomic_report_generation,sot_human_advice_medical_consultation",
      ["bioinformatics"],
    ],
    [
      "a human-advice-only offer with an additional stage",
      "sot_human_advice_medical_consultation",
      ["human_advice", "bioinformatics"],
    ],
    [
      "human advice stage without a human-advice category",
      "sot_genomic_report_generation",
      ["bioinformatics", "human_advice"],
    ],
    [
      "a complete category missing a required genomic stage",
      "sot_complete_health_genomics_report",
      ["test_planning", "bioinformatics"],
    ],
    [
      "a mixed complete and human-advice offer missing human advice",
      "sot_complete_health_genomics_report,sot_human_advice_medical_consultation",
      ["test_planning", "wet_lab", "bioinformatics"],
    ],
    [
      "a duplicate stage",
      "sot_genomic_report_generation",
      ["bioinformatics", "bioinformatics"],
    ],
  ])(
    "rejects %s before calling the offer repository",
    async (_label, serviceCategory, stages) => {
      const fastify = await buildTestServer();

      const response = await fastify.inject({
        method: "POST",
        url: "/admin/support-services/offers",
        payload: { ...validOfferPayload, serviceCategory, stages },
      });

      expect(response.statusCode).toBe(400);
      expect(mockCreateSupportServiceOffer).not.toHaveBeenCalled();
    },
  );

  it("passes god-mode linked-artifact choices to transaction deletion", async () => {
    const fastify = await buildTestServer();
    const options = {
      deleteLinkedForm: true,
      deleteLinkedReports: true,
      deleteOutputObjects: true,
      deleteInputObjects: false,
    };

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/support-services/transactions/pgr_demo_final_report?deleteLinkedForm=true&deleteLinkedReports=true&deleteOutputObjects=true&deleteInputObjects=false",
    });

    expect(response.statusCode).toBe(200);
    expect(mockDeleteSupportServiceTransaction).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      options,
    );
    expect(response.json()).toMatchObject({
      deleted: true,
      transactionId: "pgr_demo_final_report",
      deletedArtifacts: { forms: 0, reports: 0, outputObjects: 0 },
    });
  });

  it("enforces the category-stage contract on offer updates", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "PUT",
      url: "/admin/support-services/offers/offer-1",
      payload: {
        ...validOfferPayload,
        serviceCategory: "sot_human_advice_medical_consultation",
        stages: ["test_planning"],
        acknowledgesExistingTransactionContracts: true,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockUpdateSupportServiceOffer).not.toHaveBeenCalled();
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

  it("accepts a trimmed custom transaction name and null to clear it", async () => {
    const fastify = await buildTestServer();
    const payload = {
      requestId: "pgr_demo_final_report",
      offerId: "offer-1",
      serviceId: "pgs_pocket_genes_report_studio_1",
      providerId: "feed-org-1",
      providerKind: "organization",
      requestedByUserId: "user-1",
      requestedAtClient: "2026-09-16T12:00:00.000Z",
      status: "received",
      idempotencyKey: "pgr_demo_final_report:backoffice",
      contractSource: "service_offer",
    };

    const renameResponse = await fastify.inject({
      method: "PUT",
      url: "/admin/support-services/transactions/pgr_demo_final_report",
      payload: {
        ...payload,
        customTransactionName: "  Personalized title  ",
      },
    });

    expect(renameResponse.statusCode).toBe(200);
    expect(mockUpdateSupportServiceTransaction).toHaveBeenLastCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      expect.objectContaining({
        customTransactionName: "Personalized title",
      }),
    );

    const clearResponse = await fastify.inject({
      method: "PUT",
      url: "/admin/support-services/transactions/pgr_demo_final_report",
      payload: { ...payload, customTransactionName: null },
    });

    expect(clearResponse.statusCode).toBe(200);
    expect(mockUpdateSupportServiceTransaction).toHaveBeenLastCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      expect.objectContaining({ customTransactionName: null }),
    );
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

  it("atomically creates File Storage content and attaches an output object", async () => {
    const fastify = await buildTestServer();
    const fileContent = JSON.stringify({
      title: "Final report",
      download_url: "https://objects.example/report.pdf",
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        fileContent,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockAttachSupportServiceTransactionOutputObject).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      {
        role: "report",
        fileContent,
      },
    );
  });

  it("removes an attached output object by its frozen role", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects/report",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        role: "report",
        objectCode: "123456789",
        transaction: expect.objectContaining({ outputObjects: [] }),
      }),
    );
    expect(mockRemoveSupportServiceTransactionOutputObject).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      "report",
    );
  });

  it("loads a linked output object through the transaction-scoped route", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "GET",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects/report",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      object: expect.objectContaining({
        role: "report",
        objectCode: "123456789",
        objectType: "pgo_pdf_report",
        content: {
          title: "Final report",
          download_url: "https://objects.example/report.pdf",
        },
      }),
    });
    expect(mockGetSupportServiceTransactionOutputObject).toHaveBeenCalledWith(
      bootstrapContext,
      "pgr_demo_final_report",
      "report",
    );
  });

  it("rejects malformed output roles before invoking removal", async () => {
    const fastify = await buildTestServer();

    const response = await fastify.inject({
      method: "DELETE",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects/Report-1",
    });

    expect(response.statusCode).toBe(400);
    expect(mockRemoveSupportServiceTransactionOutputObject).not.toHaveBeenCalled();
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
    const ambiguousInline = await fastify.inject({
      method: "POST",
      url: "/admin/support-services/transactions/pgr_demo_final_report/output-objects",
      payload: {
        role: "report",
        fileStorageId: "stored-output-1",
        fileContent: "{}",
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
    expect(ambiguousInline.statusCode).toBe(400);
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
