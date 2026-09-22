import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  SUPPORT_SERVICE_OFFER_STATUSES,
  SUPPORT_SERVICE_OBJECT_TYPES,
  SUPPORT_SERVICE_STAGES,
  SUPPORT_SERVICE_TRANSACTION_STATUSES,
  attachSupportServiceTransactionOutputObject,
  createSupportServiceOffer,
  createSupportServiceTransaction,
  deleteSupportServiceOffer,
  deleteSupportServiceTransaction,
  deliverSupportServiceTransaction,
  getSupportServiceOffer,
  getSupportServiceTransaction,
  listSupportServiceOffers,
  listSupportServiceTransactions,
  updateSupportServiceOffer,
  updateSupportServiceTransaction,
} from "../repositories/support-services.repository.js";

const ServiceStageSchema = z.enum(SUPPORT_SERVICE_STAGES);
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
  .max(180)
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
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  label: z.string().trim().min(1).max(120),
}).strict();
const FormFieldSchema = z.object({
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
  options: z.array(FormFieldOptionSchema).max(100).optional(),
  helpInfoText: z.string().trim().min(1).max(500).optional(),
}).strict();
const FormShapeSchema = z.object({
  id: FormShapeIdSchema,
  version: VersionSchema.optional(),
  allowUnknownFields: z
    .literal(false)
    .describe("Support service forms reject undeclared fields."),
  fields: z.array(FormFieldSchema).min(2).max(100),
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
const OfferBodySchema = z.object({
  serviceId: ServiceIdSchema,
  serviceVersion: VersionSchema.optional(),
  name: z.string().trim().min(1).max(180),
  serviceCategory: z.string().trim().max(180).optional(),
  providerKind: ProviderKindSchema,
  providerId: ProviderIdSchema,
  providerName: z.string().trim().max(180).optional(),
  stages: z.array(ServiceStageSchema).min(1).max(3).optional(),
  status: OfferStatusSchema.optional(),
  isHiddenFromSearch: z.boolean(),
  description: z.string().trim().min(1).max(4000),
  shortContract: z.string().trim().max(500).optional(),
  providerWork: z.string().trim().min(1).max(4000),
  formShape: FormShapeSchema.optional(),
  inputSlots: z.array(InputSlotSchema).max(50).optional(),
  outputSlots: z.array(OutputSlotSchema).min(1).max(50),
  acceptedConditions: z
    .array(z.string().trim().min(1).max(1000))
    .max(30)
    .optional(),
  scopeRules: z
    .array(z.string().trim().min(1).max(1000))
    .max(30)
    .optional(),
  commercialTerms: CommercialTermsSchema.optional(),
}).strict();
const TransactionBodySchema = z.object({
  requestId: RequestIdSchema,
  offerId: z.string().trim().min(1),
  serviceId: ServiceIdSchema,
  serviceVersion: VersionSchema.optional(),
  providerId: ProviderIdSchema,
  providerKind: ProviderKindSchema,
  status: TransactionStatusSchema.optional(),
  requestedByUserId: z.string().trim().min(1).max(180),
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
}).strict();
const OfferParamsSchema = z.object({
  offerId: z.string().trim().min(1),
});
const TransactionParamsSchema = z.object({
  transactionId: z.string().trim().min(1),
});
const OutputObjectBodySchema = z
  .object({
    role: RoleSchema,
    fileName: z.string().trim().min(1).max(255),
    downloadUrl: z
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
      ),
  })
  .strict();
const EmptyCommandBodySchema = z.object({}).strict();

function sendRepositoryError(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  throw error;
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

    if (!request.adminContext.isBootstrap) {
      return reply.status(403).send({ error: "GOD MODE access required" });
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
    { schema: { body: OfferBodySchema } },
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
      schema: {
        params: OfferParamsSchema,
        body: OfferBodySchema,
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
