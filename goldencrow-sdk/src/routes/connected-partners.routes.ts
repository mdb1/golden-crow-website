import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PartnerEmailBannerInputSchema } from "../lib/partner-email-banner.js";
import {
  PartnerIdSchema,
  PartnerInputSchema,
  PartnerLinkIdSchema,
  PartnerSectionSchema,
  PartnerSectionCursorSchema,
} from "../contracts/connected-partners.js";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import { PARTNER_CSV_MAX_BYTES } from "../lib/partner-csv.js";
import {
  importPartnerCsv,
  previewPartnerCsv,
  PartnerCsvValidationError,
} from "../repositories/partner-csv-import.repository.js";
import {
  createPartner,
  deletePartners,
  getPartner,
  listPartners,
  listPartnersBySection,
  listPartnerLinkOptions,
  updatePartner,
} from "../repositories/connected-partners.repository.js";

import {
  PartnerEmailLanguageSchema,
  PartnerEmailTemplateVariantSchema,
  PartnerEmailSendInputSchema,
  PartnerEmailHistoryQuerySchema,
  listPartnerEmailHistory,
  getPartnerEmailHistory,
  previewPartnerEmail,
  sendPartnerEmail,
} from "../repositories/partner-email.repository.js";

const ParamsSchema = z.object({ partnerId: PartnerIdSchema }).strict();
const ROUTE = "/admin/connected-partners";
const CsvBodySchema = z
  .object({
    csv: z
      .string()
      .min(1)
      .max(PARTNER_CSV_MAX_BYTES)
      .refine(
        (value) => Buffer.byteLength(value, "utf8") <= PARTNER_CSV_MAX_BYTES,
        "CSV file exceeds the 256 KiB limit.",
      ),
  })
  .strict();

export async function connectedPartnersRoutes(
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
  f.setErrorHandler((error, _request, reply) => {
    if (error instanceof PartnerCsvValidationError) {
      return reply
        .status(error.statusCode)
        .send({ error: error.message, preview: error.preview });
    }
    if (isAdminRepositoryError(error)) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    return reply.send(error);
  });
  f.addHook("onSend", async (request, reply, payload) => {
    if (request.method === "GET")
      reply.header("Cache-Control", "private, no-store");
    return payload;
  });

  f.get(
    ROUTE,
    {
      schema: {
        querystring: z.union([
          z.object({ cursor: PartnerIdSchema.optional() }).strict(),
          z
            .object({
              section: PartnerSectionSchema,
              cursor: PartnerSectionCursorSchema.optional(),
              limit: z.coerce.number().int().min(1).max(20).optional(),
            })
            .strict(),
        ]),
      },
    },
    async (request) =>
      "section" in request.query
        ? listPartnersBySection(
            request.adminContext!,
            request.query.section,
            request.query.cursor,
            request.query.limit,
          )
        : listPartners(request.adminContext!, request.query.cursor),
  );

  f.get(
    `${ROUTE}/link-options`,
    {
      schema: {
        querystring: z
          .object({
            kind: z.enum(["organization", "individual", "app"]),
            cursor: PartnerLinkIdSchema.optional(),
            organizationId: PartnerLinkIdSchema.optional(),
            individualPublisherId: PartnerLinkIdSchema.optional(),
            id: PartnerLinkIdSchema.optional(),
          })
          .strict(),
      },
    },
    async (request) =>
      listPartnerLinkOptions(request.adminContext!, request.query),
  );

  f.get(
    `${ROUTE}/sent-email-log`,
    { schema: { querystring: PartnerEmailHistoryQuerySchema } },
    async (request) => listPartnerEmailHistory(request.adminContext!, request.query),
  );
  f.get(
    `${ROUTE}/sent-email-log/:requestId`,
    { schema: { params: z.object({ requestId: z.uuid() }).strict() } },
    async (request) => ({ email: await getPartnerEmailHistory(request.adminContext!, request.params.requestId) }),
  );

  f.get(
    `${ROUTE}/:partnerId`,
    {
      schema: { params: ParamsSchema },
    },
    async (request) => ({
      partner: await getPartner(
        request.adminContext!,
        request.params.partnerId,
      ),
    }),
  );

  f.get(
    `${ROUTE}/:partnerId/email-preview`,
    {
      schema: {
        params: ParamsSchema,
        querystring: z
          .object({
            language: PartnerEmailLanguageSchema.default("es"),
            templateVariant: z.enum(["1", "2", "3"]).default("1")
              .transform((value) => value === "3" ? (3 as const) : value === "2" ? (2 as const) : (1 as const)),
          })
          .strict(),
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return previewPartnerEmail(
        request.adminContext!,
        request.params.partnerId,
        request.query.language,
        undefined,
        request.query.templateVariant,
      );
    },
  );

  f.post(
    `${ROUTE}/:partnerId/email-preview`,
    {
      bodyLimit: 1024 * 1024,
      schema: {
        params: ParamsSchema,
        body: z.object({
          language: PartnerEmailLanguageSchema,
          templateVariant: PartnerEmailTemplateVariantSchema.default(1),
          banner: PartnerEmailBannerInputSchema,
        }).strict(),
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return previewPartnerEmail(
        request.adminContext!, request.params.partnerId, request.body.language,
        request.body.banner, request.body.templateVariant,
      );
    },
  );

  f.post(
    `${ROUTE}/:partnerId/email`,
    { bodyLimit: 1024 * 1024, schema: { params: ParamsSchema, body: PartnerEmailSendInputSchema } },
    async (request) =>
      sendPartnerEmail(
        request.adminContext!,
        request.params.partnerId,
        request.body,
      ),
  );

  f.post(
    `${ROUTE}/import/preview`,
    { bodyLimit: 2 * 1024 * 1024, schema: { body: CsvBodySchema } },
    async (request) =>
      previewPartnerCsv(request.adminContext!, request.body.csv),
  );

  f.post(
    `${ROUTE}/import`,
    {
      bodyLimit: 2 * 1024 * 1024,
      schema: { body: CsvBodySchema.extend({ importId: z.uuid() }).strict() },
    },
    async (request) =>
      importPartnerCsv(
        request.adminContext!,
        request.body.csv,
        request.body.importId,
      ),
  );

  f.post(
    ROUTE,
    {
      schema: { body: PartnerInputSchema },
    },
    async (request, reply) =>
      reply.status(201).send({
        partner: await createPartner(request.adminContext!, request.body),
      }),
  );

  f.put(
    `${ROUTE}/:partnerId`,
    {
      schema: { params: ParamsSchema, body: PartnerInputSchema },
    },
    async (request) => ({
      partner: await updatePartner(
        request.adminContext!,
        request.params.partnerId,
        request.body,
      ),
    }),
  );

  f.post(
    `${ROUTE}/delete`,
    {
      schema: {
        body: z
          .object({ ids: z.array(PartnerIdSchema).min(1).max(500) })
          .strict(),
      },
    },
    async (request) => deletePartners(request.adminContext!, request.body.ids),
  );
}
