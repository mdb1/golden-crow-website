import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  SUPPORT_SERVICE_CATEGORY_KEYS,
  SUPPORT_SERVICE_OFFER_STATUSES,
  SUPPORT_SERVICE_OBJECT_TYPES,
  SUPPORT_SERVICE_PROMOTIONAL_BANNER_IMAGE_DATA_URL_MAX_LENGTH,
  SUPPORT_SERVICE_STAGES,
  SUPPORT_SERVICE_TRANSACTION_STATUSES,
  attachSupportServiceTransactionOutputReport,
  attachSupportServiceTransactionOutputObject,
  createSupportServiceOffer,
  createSupportServiceTransaction,
  deleteSupportServiceOffer,
  deleteSupportServiceTransaction,
  deliverSupportServiceTransaction,
  getSupportServiceIdAvailability,
  getSupportServiceOffer,
  getSupportServiceOfferTransactionStats,
  getSupportServiceTransaction,
  getSupportServiceTransactionLinkedReports,
  listSupportServiceLinkedReportCandidates,
  listSupportServiceOffers,
  listSupportServiceTransactions,
  removeSupportServiceTransactionOutputReport,
  updateSupportServiceOffer,
  updateSupportServiceTransaction,
} from "../repositories/support-services.repository.js";

const ServiceStageSchema = z.enum(SUPPORT_SERVICE_STAGES);
const ServiceCategorySchema = z.enum(SUPPORT_SERVICE_CATEGORY_KEYS);
const ServiceObjectTypeSchema = z.enum(SUPPORT_SERVICE_OBJECT_TYPES);
const OfferStatusSchema = z.enum(SUPPORT_SERVICE_OFFER_STATUSES);
const TransactionStatusSchema = z.enum(SUPPORT_SERVICE_TRANSACTION_STATUSES);
const FORM_OBJECT_TYPE = "pgo_form";
const FormFieldTypeSchema = z.enum([
  "text",
  "long_text",
  "email",
  "phone",
  "url",
  "address",
  "postal_code",
  "country_code",
  "identifier",
  "number",
  "integer",
  "positive_integer",
  "percentage",
  "boolean",
  "date",
  "datetime",
  "time",
  "enum",
  "multi_enum",
  "string_list",
  "integer_list",
  "number_list",
]);
const MutationModeSchema = z.enum(["new_object", "new_revision"]);
const ProviderKindSchema = z.enum(["organization", "individual"]);
const ServiceIdSchema = z
  .string()
  .trim()
  .regex(
    /^pgs_[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]+$/,
    "Use a generated pgs_<provider_slug>_<n> service ID.",
  );
const GeneratedServiceIdSchema = z
  .string()
  .trim()
  .regex(
    /^pgs_[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]{5}$/,
    "Use a generated pgs_<provider_slug>_<five_digits> service ID.",
  );
const ProviderIdSchema = z.string().trim().min(1).max(180);
const VersionSchema = z.coerce.number().int().positive();
const RequestIdSchema = z
  .string()
  .trim()
  .regex(/^pgr_[a-z0-9_]+$/, "Use a pgr_* request ID.");
const FormShapeIdSchema = z
  .string()
  .trim()
  .regex(/^pgfs_[a-z0-9_]+$/, "Use a pgfs_* form shape ID.");
const TurnaroundSchema = z
  .string()
  .trim()
  .regex(
    /^[1-9]\d*[wdhm]$/,
    "Use a compact duration such as 2w, 1d, 3h, or 15m.",
  );
const OFFER_REQUEST_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const OptionalPromotionalBannerImageUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? null : value),
  z
    .string()
    .trim()
    .url()
    .max(1_000)
    .refine(
      (value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Promotional banner image URL must use HTTPS." },
    )
    .nullable()
    .optional(),
);
const PromotionalBannerImageUploadDataUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? undefined : value),
  z
    .string()
    .trim()
    .max(SUPPORT_SERVICE_PROMOTIONAL_BANNER_IMAGE_DATA_URL_MAX_LENGTH)
    .regex(
      /^data:image\/(?:png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/,
      "Promotional banner upload must be a PNG, JPG, WebP, SVG, or ICO data URL.",
    )
    .nullable()
    .optional(),
);
const MoreInformationTextSchema = z.string().trim().min(1);
const MoreInformationHttpsUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      if (
        value !== value.trim() ||
        !value.startsWith("https://") ||
        /\s/.test(value)
      ) {
        return false;
      }
      try {
        const authority =
          value.slice("https://".length).split(/[/?#]/, 1)[0] ?? "";
        const bracketedIpv6Authority = authority.match(
          /^\[([0-9A-Fa-f:.]+)\](?::([0-9]{1,5}))?$/,
        );
        const dnsAuthority = authority.match(/^([^:]+)(?::([0-9]{1,5}))?$/);
        const dnsHost = dnsAuthority?.[1];
        const validDnsOrIpv4Host = Boolean(
          dnsHost &&
            dnsHost.split(".").every((label) =>
              /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(
                label,
              ),
            ),
        );
        if (!bracketedIpv6Authority && !validDnsOrIpv4Host) {
          return false;
        }

        const url = new URL(value);
        if (
          url.protocol !== "https:" ||
          !url.hostname ||
          url.username ||
          url.password
        ) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    { message: "Use an absolute lowercase HTTPS URL without userinfo or whitespace." },
  );
const MoreInformationFrequentQuestionSchema = z
  .object({
    question: MoreInformationTextSchema,
    answer: MoreInformationTextSchema,
  })
  .strict();
const MoreInformationFactSchema = z
  .object({
    title: MoreInformationTextSchema,
    description: MoreInformationTextSchema,
  })
  .strict();
const MoreInformationUsefulLinkSchema = z
  .object({
    title: MoreInformationTextSchema,
    url: MoreInformationHttpsUrlSchema,
  })
  .strict();
const MoreInformationSampleLinkSchema = z
  .object({
    title: MoreInformationTextSchema,
    description: MoreInformationTextSchema,
    buttonTitle: MoreInformationTextSchema,
    url: MoreInformationHttpsUrlSchema,
  })
  .strict();
const MoreInformationBulletSegmentSchema = z
  .object({
    title: MoreInformationTextSchema,
    description: MoreInformationTextSchema,
    imageUrl: MoreInformationHttpsUrlSchema.optional(),
    imageUploadDataUrl: z
      .string()
      .min(1)
      .max(SUPPORT_SERVICE_PROMOTIONAL_BANNER_IMAGE_DATA_URL_MAX_LENGTH)
      .regex(
        /^data:image\/(?:png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/,
        "Illustrated segment upload must be a PNG, JPG, WebP, SVG, or ICO data URL.",
      )
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.imageUrl) === Boolean(value.imageUploadDataUrl)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Illustrated segments require exactly one of imageUrl or imageUploadDataUrl.",
      });
    }
  });
const MoreInformationTechnicalFactSchema = MoreInformationFactSchema.extend({
  subitems: z.array(MoreInformationTextSchema),
}).strict();
const MoreInformationBiologicalSampleRequirementSchema =
  MoreInformationFactSchema.extend({
    instructions: MoreInformationTextSchema,
  }).strict();
const MoreInformationSchema = z
  .object({
    frequentQuestions: z
      .array(MoreInformationFrequentQuestionSchema)
      .nullable()
      .optional(),
    keyInsights: z.array(MoreInformationFactSchema).nullable().optional(),
    scientificFacts: z.array(MoreInformationFactSchema).nullable().optional(),
    usefulLinks: z
      .array(MoreInformationUsefulLinkSchema)
      .nullable()
      .optional(),
    sampleLink: MoreInformationSampleLinkSchema.nullable().optional(),
    bulletSegments: z
      .array(MoreInformationBulletSegmentSchema)
      .nullable()
      .optional(),
    technicalInformationFacts: z
      .array(MoreInformationTechnicalFactSchema)
      .nullable()
      .optional(),
    biologicalSampleRequirements: z
      .array(MoreInformationBiologicalSampleRequirementSchema)
      .nullable()
      .optional(),
    websiteUrl: MoreInformationHttpsUrlSchema.nullable().optional(),
  })
  .strict();
const ObjectIdSchema = z
  .string()
  .trim()
  .regex(/^obj_[a-z0-9_]+$/, "Use an obj_* object ID.");
const ObjectTypeSchema = z
  .string()
  .trim()
  .regex(/^pgo_[a-z0-9_]+$/, "Use a pgo_* object type.");
const SameIdentityObjectTypeSchema = z
  .string()
  .trim()
  .regex(
    /^same_as:[a-z][a-z0-9_]*$/,
    "Use same_as:<input_role> for revised source objects.",
  );
const RoleSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*$/, "Use a lowercase role key.");
const OptionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Requester email must be blank or a valid email.",
  )
  .optional();
const ObjectRefSchema = z.object({
  objectId: ObjectIdSchema,
  revision: z.coerce.number().int().positive(),
});
const FormFieldOptionSchema = z.object({
  value: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
      "Use an option value up to 128 characters with letters, numbers, dots, underscores, colons, or hyphens.",
    ),
  label: z.string().trim().min(1).max(120),
}).strict();
const FormFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(
        /^[a-z][a-z0-9_]{0,63}$/,
        "Use a lowercase form field key up to 64 characters.",
      ),
    label: z.string().trim().min(1).max(120),
    type: FormFieldTypeSchema,
    required: z.boolean(),
    options: z.array(FormFieldOptionSchema).min(1).max(100).optional(),
    helpInfoText: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    const usesOptions = field.type === "enum" || field.type === "multi_enum";
    if (usesOptions && !field.options) {
      ctx.addIssue({
        code: "custom",
        message: "Enum fields require options.",
        path: ["options"],
      });
    }
    if (!usesOptions && field.options !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Only enum fields may declare options.",
        path: ["options"],
      });
    }
    const values = field.options?.map((option) => option.value) ?? [];
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: "custom",
        message: "Option values must be unique.",
        path: ["options"],
      });
    }
  });
const FormShapeSchema = z.object({
  id: FormShapeIdSchema,
  version: VersionSchema,
  allowUnknownFields: z
    .literal(false)
    .describe("Support service forms reject undeclared fields."),
  fields: z.array(FormFieldSchema),
}).strict();
const InputSlotSchema = z.object({
  role: RoleSchema,
  objectType: ServiceObjectTypeSchema,
  acceptedTypes: z
    .array(ServiceObjectTypeSchema)
    .length(1, "Each input slot accepts exactly one object type."),
  required: z.literal(true),
  cardinality: z.object({
    min: z.literal(1),
    max: z.literal(1),
  }),
}).strict().superRefine((slot, ctx) => {
  if (slot.acceptedTypes[0] !== slot.objectType) {
    ctx.addIssue({
      code: "custom",
      message: "acceptedTypes must contain the same object type as objectType.",
      path: ["acceptedTypes"],
    });
  }
});
const OutputSlotSchema = z
  .object({
    role: RoleSchema,
    objectType: z.union([
      ObjectTypeSchema.refine(
        (value) =>
          value !== FORM_OBJECT_TYPE &&
          SUPPORT_SERVICE_OBJECT_TYPES.includes(
            value as (typeof SUPPORT_SERVICE_OBJECT_TYPES)[number],
          ),
        "Output slots must use a registered non-form object type.",
      ),
      SameIdentityObjectTypeSchema,
    ]),
    mutationMode: MutationModeSchema,
    sameIdentityAsInput: RoleSchema.optional(),
  })
  .strict()
  .superRefine((slot, ctx) => {
    if (slot.mutationMode === "new_revision") {
      if (!slot.sameIdentityAsInput) {
        ctx.addIssue({
          code: "custom",
          message: "new_revision outputs must name sameIdentityAsInput.",
          path: ["sameIdentityAsInput"],
        });
      } else if (slot.objectType !== `same_as:${slot.sameIdentityAsInput}`) {
        ctx.addIssue({
          code: "custom",
          message: "new_revision outputs must use same_as:<input_role>.",
          path: ["objectType"],
        });
      }
      return;
    }

    if (slot.objectType.startsWith("same_as:")) {
      ctx.addIssue({
        code: "custom",
        message: "same_as outputs must use new_revision.",
        path: ["objectType"],
      });
    }
    if (slot.sameIdentityAsInput) {
      ctx.addIssue({
        code: "custom",
        message: "sameIdentityAsInput is only valid for new_revision outputs.",
        path: ["sameIdentityAsInput"],
      });
    }
  });
const PricingModelSchema = z.enum([
  "not_specified",
  "free",
  "fixed",
  "calculated_after_submission",
]);
const CommercialTermsSchema = z.object({
  pricingModel: PricingModelSchema.optional(),
  price: z
    .object({
      amount: z.coerce.number().min(0).optional(),
      currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
      summary: z.string().trim().min(1).max(500).optional(),
    })
    .strict()
    .optional(),
  turnaround: TurnaroundSchema.optional(),
}).strict();
const TransactionSlotSchema = z
  .object({
    role: RoleSchema,
    objectRef: ObjectRefSchema,
    objectType: ServiceObjectTypeSchema,
    objectSnapshot: z.record(z.string(), z.unknown()),
    objectCode: z.string().trim().regex(/^\d{9}$/).optional(),
    uploadedObjectId: z.string().trim().min(1).optional(),
    fileStorageId: z.string().trim().min(1).optional(),
    objectOwnerId: z.string().trim().min(1).optional(),
  })
  .strict();
const TransactionOutputObjectSchema = z
  .object({
    role: RoleSchema,
    objectType: ServiceObjectTypeSchema,
    objectCode: z.string().trim().regex(/^\d{9}$/),
  })
  .strict();
const TransactionOutputReportSchema = z
  .object({
    reportCode: z.string().trim().regex(/^[A-Z0-9]{6}$/),
  })
  .strict();
const ListQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  query: z.string().trim().max(180).optional(),
  status: z.string().trim().max(40).optional(),
});
const ListOffersQuerySchema = ListQuerySchema.extend({
  stage: z.string().trim().max(40).optional(),
  serviceId: z.string().trim().max(160).optional(),
});
const ListTransactionsQuerySchema = ListQuerySchema.extend({
  serviceId: z.string().trim().max(160).optional(),
});
const ServiceIdAvailabilityQuerySchema = z.object({
  serviceId: GeneratedServiceIdSchema,
  excludeOfferId: z.string().trim().min(1).max(180).optional(),
});
const OfferBodySchema = z.object({
  serviceId: ServiceIdSchema,
  serviceVersion: VersionSchema.optional(),
  name: z.string().trim().min(1).max(180),
  serviceCategory: ServiceCategorySchema,
  providerKind: ProviderKindSchema,
  providerId: ProviderIdSchema,
  providerName: z.string().trim().max(180).optional(),
  stages: z.array(ServiceStageSchema).min(1).max(3).optional(),
  status: OfferStatusSchema.optional(),
  isHiddenFromSearch: z.boolean(),
  isHighlightedOffer: z.boolean(),
  isProfessionalOffer: z.boolean(),
  promotionalBannerImageUrl: OptionalPromotionalBannerImageUrlSchema,
  promotionalBannerImageUploadDataUrl:
    PromotionalBannerImageUploadDataUrlSchema,
  description: z.string().trim().min(1).max(4000),
  shortContract: z.string().trim().max(500).optional(),
  providerWork: z.string().trim().min(1).max(4000),
  formShape: FormShapeSchema.optional(),
  inputSlots: z.array(InputSlotSchema).max(50).optional(),
  outputSlots: z.array(OutputSlotSchema).max(50),
  acceptedConditions: z
    .array(z.string().trim().min(1).max(1000))
    .max(30)
    .optional(),
  scopeRules: z
    .array(z.string().trim().min(1).max(1000))
    .max(30)
    .optional(),
  commercialTerms: CommercialTermsSchema.optional(),
  moreInformation: MoreInformationSchema.nullable().optional(),
}).strict();
const CreateOfferBodySchema = OfferBodySchema.extend({
  serviceId: GeneratedServiceIdSchema,
});
const UpdateOfferBodySchema = OfferBodySchema.extend({
  acknowledgesExistingTransactionContracts: z.literal(true),
});
const TransactionBodySchema = z.object({
  requestId: RequestIdSchema,
  offerId: z.string().trim().min(1),
  serviceId: ServiceIdSchema,
  serviceVersion: VersionSchema.optional(),
  providerId: ProviderIdSchema,
  providerKind: ProviderKindSchema,
  status: TransactionStatusSchema.optional(),
  requestedByUserId: z.string().trim().min(1).max(180).optional(),
  requestedByUserEmail: OptionalEmailSchema,
  requestedAt: z.string().trim().datetime().optional(),
  requestedAtClient: z.string().trim().datetime(),
  requestRevision: VersionSchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(240),
  inputs: z.array(TransactionSlotSchema).max(50).optional(),
  outputObjects: z.array(TransactionOutputObjectSchema).max(50).optional(),
  outputReports: z.array(TransactionOutputReportSchema).max(50).optional(),
  missingRequiredInputRoles: z.array(RoleSchema).max(50).optional(),
  issues: z.array(z.unknown()).max(100).optional(),
  offerSnapshot: z.record(z.string(), z.unknown()).optional(),
  providerSnapshot: z.record(z.string(), z.unknown()).optional(),
  contractSource: z.string().trim().min(1).max(180),
  attachmentsPending: z.boolean().optional(),
}).strict().superRefine((transaction, ctx) => {
  if (!transaction.requestedByUserId && !transaction.requestedByUserEmail) {
    ctx.addIssue({
      code: "custom",
      message: "Provide a requester user ID or requester email.",
      path: ["requestedByUserId"],
    });
  }
});
const OfferParamsSchema = z.object({
  offerId: z.string().trim().min(1),
});
const TransactionParamsSchema = z.object({
  transactionId: z.string().trim().min(1),
});
const ReportCodeSchema = z.string().trim().regex(/^[A-Z0-9]{6}$/);
const TransactionReportParamsSchema = TransactionParamsSchema.extend({
  reportCode: ReportCodeSchema,
});
const OutputReportBodySchema = z
  .object({ reportCode: ReportCodeSchema })
  .strict();
const OutputReportCandidatesQuerySchema = z.object({
  query: z.string().trim().regex(/^[A-Za-z0-9]{1,6}$/).optional(),
  cursor: ReportCodeSchema.optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
const HttpsDownloadUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "downloadUrl must use HTTPS." },
  );
const OutputObjectBodySchema = z.union([
  z
    .object({
      role: RoleSchema,
      downloadUrl: HttpsDownloadUrlSchema,
    })
    .strict(),
  z
    .object({
      role: RoleSchema,
      fileStorageId: z
        .string()
        .trim()
        .min(1)
        .max(240)
        .regex(/^[^/]+$/, "fileStorageId must be a Firestore document ID."),
    })
    .strict(),
]);
const EmptyCommandBodySchema = z.object({}).strict();

function sendRepositoryError(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  const errorName = error instanceof Error ? error.name : typeof error;
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "The support services request failed unexpectedly.";
  return reply.status(500).send({
    error: "Support services request failed.",
    message,
    errorName,
    statusCode: 500,
    hint: "The support services route failed before completing the Firebase request. Use the request path and Vercel request id from the backoffice log modal to inspect the server trace.",
  });
}

export async function supportServicesRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    const publisherId =
      request.adminContext.role === "organization_publisher"
        ? request.adminContext.organizationId
        : request.adminContext.role === "individual_publisher"
          ? request.adminContext.individualId
          : undefined;
    const canAccessAsPublisher =
      request.adminContext.canAccessPublisherPortal === true &&
      Boolean(publisherId?.trim());
    if (
      !request.adminContext.isBootstrap &&
      !canAccessAsPublisher
    ) {
      return reply
        .status(403)
        .send({ error: "Support services access required" });
    }
  });

  f.get(
    "/admin/support-services/offers",
    { schema: { querystring: ListOffersQuerySchema } },
    async (request, reply) => {
      try {
        const result = await listSupportServiceOffers(
          request.adminContext!,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/support-services/offers",
    {
      bodyLimit: OFFER_REQUEST_BODY_LIMIT_BYTES,
      schema: { body: CreateOfferBodySchema },
    },
    async (request, reply) => {
      try {
        const offer = await createSupportServiceOffer(
          request.adminContext!,
          request.body,
        );
        return reply.status(201).send({ offer });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/offers/service-id-availability",
    { schema: { querystring: ServiceIdAvailabilityQuerySchema } },
    async (request, reply) => {
      try {
        const availability = await getSupportServiceIdAvailability(
          request.adminContext!,
          request.query.serviceId,
          request.query.excludeOfferId,
        );
        return reply.send(availability);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/offers/:offerId/transaction-stats",
    { schema: { params: OfferParamsSchema } },
    async (request, reply) => {
      try {
        const stats = await getSupportServiceOfferTransactionStats(
          request.adminContext!,
          request.params.offerId,
        );
        return reply.send(stats);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/offers/:offerId",
    { schema: { params: OfferParamsSchema } },
    async (request, reply) => {
      try {
        const offer = await getSupportServiceOffer(
          request.adminContext!,
          request.params.offerId,
        );
        return reply.send({ offer });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/transactions/:transactionId/output-reports/candidates",
    {
      schema: {
        params: TransactionParamsSchema,
        querystring: OutputReportCandidatesQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await listSupportServiceLinkedReportCandidates(
          request.adminContext!,
          request.params.transactionId,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/transactions/:transactionId/output-reports",
    { schema: { params: TransactionParamsSchema } },
    async (request, reply) => {
      try {
        const reports = await getSupportServiceTransactionLinkedReports(
          request.adminContext!,
          request.params.transactionId,
        );
        return reply.send({ reports });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/support-services/transactions/:transactionId/output-reports",
    {
      schema: {
        params: TransactionParamsSchema,
        body: OutputReportBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await attachSupportServiceTransactionOutputReport(
          request.adminContext!,
          request.params.transactionId,
          request.body.reportCode,
        );
        return reply.status(201).send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/admin/support-services/transactions/:transactionId/output-reports/:reportCode",
    { schema: { params: TransactionReportParamsSchema } },
    async (request, reply) => {
      try {
        const result = await removeSupportServiceTransactionOutputReport(
          request.adminContext!,
          request.params.transactionId,
          request.params.reportCode,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/support-services/transactions/:transactionId/output-objects",
    {
      schema: {
        params: TransactionParamsSchema,
        body: OutputObjectBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await attachSupportServiceTransactionOutputObject(
          request.adminContext!,
          request.params.transactionId,
          request.body,
        );
        return reply.status(201).send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/support-services/transactions/:transactionId/deliver",
    {
      schema: {
        params: TransactionParamsSchema,
        body: EmptyCommandBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const transaction = await deliverSupportServiceTransaction(
          request.adminContext!,
          request.params.transactionId,
        );
        return reply.send({ transaction });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/admin/support-services/offers/:offerId",
    {
      bodyLimit: OFFER_REQUEST_BODY_LIMIT_BYTES,
      schema: {
        params: OfferParamsSchema,
        body: UpdateOfferBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const offer = await updateSupportServiceOffer(
          request.adminContext!,
          request.params.offerId,
          request.body,
        );
        return reply.send({ offer });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/admin/support-services/offers/:offerId",
    { schema: { params: OfferParamsSchema } },
    async (request, reply) => {
      try {
        await deleteSupportServiceOffer(
          request.adminContext!,
          request.params.offerId,
        );
        return reply.send({
          deleted: true,
          offerId: request.params.offerId,
        });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/transactions",
    { schema: { querystring: ListTransactionsQuerySchema } },
    async (request, reply) => {
      try {
        const result = await listSupportServiceTransactions(
          request.adminContext!,
          request.query,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/support-services/transactions",
    { schema: { body: TransactionBodySchema } },
    async (request, reply) => {
      if (!request.adminContext?.isBootstrap) {
        return reply.status(403).send({
          error:
            "Service transactions can only be created by app users or GOD MODE.",
        });
      }
      try {
        const transaction = await createSupportServiceTransaction(
          request.adminContext!,
          request.body,
        );
        return reply.status(201).send({ transaction });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/support-services/transactions/:transactionId",
    { schema: { params: TransactionParamsSchema } },
    async (request, reply) => {
      try {
        const transaction = await getSupportServiceTransaction(
          request.adminContext!,
          request.params.transactionId,
        );
        return reply.send({ transaction });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/admin/support-services/transactions/:transactionId",
    {
      schema: {
        params: TransactionParamsSchema,
        body: TransactionBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const transaction = await updateSupportServiceTransaction(
          request.adminContext!,
          request.params.transactionId,
          request.body,
        );
        return reply.send({ transaction });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/admin/support-services/transactions/:transactionId",
    { schema: { params: TransactionParamsSchema } },
    async (request, reply) => {
      if (!request.adminContext?.isBootstrap) {
        return reply.status(403).send({
          error: "Only GOD MODE can delete service transactions.",
        });
      }
      try {
        const result = await deleteSupportServiceTransaction(
          request.adminContext!,
          request.params.transactionId,
        );
        return reply.send({
          deleted: true,
          transactionId: request.params.transactionId,
          cleanupWarnings: result.cleanupWarnings,
        });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );
}
