import {
  FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import { FaviconExtractionError, extractFavicon } from "../lib/favicon.js";
import {
  sendDiscoverPublisherRequestNotificationEmail,
} from "../lib/discover-publisher-request-notification-email.js";
import { canAccessDiscover } from "../repositories/roles.repository.js";
import {
  createDiscoverFeedItem,
  createDiscoverIndividual,
  createDiscoverOrganization,
  createDiscoverPublisherApprovalRequest,
  deleteDiscoverFeedItem,
  deleteDiscoverIndividual,
  deleteDiscoverOrganization,
  duplicateDiscoverFeedItem,
  evaluateDiscoverIndividualSubmission,
  evaluateDiscoverOrganizationSubmission,
  getDiscoverFeedItem,
  getDiscoverIndividual,
  getDiscoverOrganization,
  listDiscoverFeedItems,
  listDiscoverIndividuals,
  listDiscoverOrganizations,
  syncDiscoverPublisherSnapshot,
  updateDiscoverFeedItem,
  updateDiscoverIndividual,
  updateDiscoverOrganization,
} from "../repositories/discover.repository.js";

const OrganizationStatusSchema = z.enum([
  "active",
  "inactive",
  "archived",
  "pending_approval",
]);
const GeneticReportCategorySelectionSchema = z.string().trim().max(500);
const DISCOVER_FEED_TYPES = [
  "news",
  "research_update",
  "upcoming_event",
  "opportunity",
  "video",
  "external_article",
  "podcast_episode",
  "survey",
  "organization_spotlight",
  "professional_spotlight",
  "community_invitation",
  "bioinformatics_tool",
  "genomic_database",
  "health_guidance",
  "educational_explainer",
  "gene_spotlight",
  "condition_spotlight",
  "genetic_test_guide",
  "report_explainer",
  "clinical_guideline",
  "clinical_trial",
  "patient_registry",
  "research_participation",
  "screening_program",
  "support_service",
  "course",
  "downloadable_resource",
  "lived_experience_story",
  "expert_qa",
  "advocacy_campaign",
] as const;
const FeedTypeSchema = z.enum(DISCOVER_FEED_TYPES);
const FeedStatusSchema = z.enum(["draft", "published", "archived"]);
const SubmissionEvaluationBodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

const QuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const OptionalPublisherUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? undefined : value),
  z.string().trim().url().max(1000).nullable().optional(),
);
const OptionalPublisherTextSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? undefined : value),
  z.string().trim().max(5000).optional(),
);
const PublicImageUploadDataUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? undefined : value),
  z
    .string()
    .trim()
    .max(900000)
    .regex(
      /^data:image\/(?:png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/,
    )
    .optional(),
);
const PublicImageUploadNameSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? undefined : value),
  z.string().trim().max(180).optional(),
);
const PublicImageUploadMimeTypeSchema = z
  .enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ])
  .optional();

const SocialLinksSchema = z
  .object({
    facebook: z.string().optional(),
    twitter: z.string().optional(),
    instagram: z.string().optional(),
    tiktok: z.string().optional(),
    youtube: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    gitlab: z.string().optional(),
    stack_overflow: z.string().optional(),
    hugging_face: z.string().optional(),
    kaggle: z.string().optional(),
    researchgate: z.string().optional(),
    orcid: z.string().optional(),
    google_scholar: z.string().optional(),
    pubmed: z.string().optional(),
    scopus: z.string().optional(),
    web_of_science: z.string().optional(),
    biostars: z.string().optional(),
    protocols_io: z.string().optional(),
    osf: z.string().optional(),
    zenodo: z.string().optional(),
    whatsapp: z.string().optional(),
    telegram: z.string().optional(),
    threads: z.string().optional(),
    pinterest: z.string().optional(),
    snapchat: z.string().optional(),
    reddit: z.string().optional(),
    discord: z.string().optional(),
    twitch: z.string().optional(),
    bluesky: z.string().optional(),
    mastodon: z.string().optional(),
    email: z.string().optional(),
    other: z.string().optional(),
  })
  .optional();

const PublisherRequestBodySchema = z
  .object({
    kind: z.enum(["organization", "individual"]),
    locale: z.enum(["en", "es"]),
    name: z.string().trim().min(1).max(180),
    imageUrl: OptionalPublisherUrlSchema,
    imageUploadDataUrl: PublicImageUploadDataUrlSchema,
    imageUploadName: PublicImageUploadNameSchema,
    imageUploadMimeType: PublicImageUploadMimeTypeSchema,
    websiteUrl: OptionalPublisherUrlSchema,
    description: OptionalPublisherTextSchema,
    descriptionEn: OptionalPublisherTextSchema,
    social: SocialLinksSchema,
    countryCode: z.string().trim().min(1).max(500),
    organizationType: z.string().trim().max(2000).optional(),
    individualType: z.string().trim().max(2000).optional(),
    colorHex: z.string().trim().max(20).nullable().optional(),
    isGeneticReportProvider: z.boolean().optional(),
    geneticReportCategory:
      GeneticReportCategorySelectionSchema.nullable().optional(),
    contactEmail: z.string().trim().toLowerCase().email().max(180),
    startedAt: z.string().trim().datetime(),
    website: OptionalPublisherTextSchema,
    source: z
      .object({
        pageUrl: OptionalPublisherUrlSchema,
        referrer: OptionalPublisherUrlSchema,
      })
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.kind === "organization" && !body.organizationType?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["organizationType"],
        message: "Organization category is required.",
      });
    }

    if (body.kind === "individual" && !body.individualType?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["individualType"],
        message: "Individual publisher category is required.",
      });
    }

    const primaryDescription =
      body.locale === "en" ? body.descriptionEn : body.description;
    if (!primaryDescription?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: [body.locale === "en" ? "descriptionEn" : "description"],
        message: "Publisher description is required.",
      });
    }
  });

type PublisherRequestBody = z.infer<typeof PublisherRequestBodySchema>;

const PublisherFaviconBodySchema = z.object({
  websiteUrl: z.string().trim().min(1).max(1000),
  startedAt: z.string().trim().datetime(),
  website: OptionalPublisherTextSchema,
});

type PublisherFaviconBody = z.infer<typeof PublisherFaviconBodySchema>;

const OrganizationBodySchema = z.object({
  name: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  imageUploadDataUrl: PublicImageUploadDataUrlSchema,
  imageUploadName: PublicImageUploadNameSchema,
  imageUploadMimeType: PublicImageUploadMimeTypeSchema,
  status: OrganizationStatusSchema.optional(),
  websiteUrl: z.string().nullable().optional(),
  description: z.string().optional(),
  descriptionEn: z.string().optional(),
  social: SocialLinksSchema,
  countryCode: z.string().optional(),
  organizationType: z.string().optional(),
  colorHex: z.string().nullable().optional(),
  verified: z.boolean().optional(),
  isGeneticReportProvider: z.boolean().optional(),
  geneticReportCategory:
    GeneticReportCategorySelectionSchema.nullable().optional(),
  contactEmail: z.string().optional(),
  internalNotes: z.string().optional(),
});

const IndividualBodySchema = z.object({
  name: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  imageUploadDataUrl: PublicImageUploadDataUrlSchema,
  imageUploadName: PublicImageUploadNameSchema,
  imageUploadMimeType: PublicImageUploadMimeTypeSchema,
  status: OrganizationStatusSchema.optional(),
  websiteUrl: z.string().nullable().optional(),
  description: z.string().optional(),
  descriptionEn: z.string().optional(),
  social: SocialLinksSchema,
  countryCode: z.string().optional(),
  individualType: z.string().optional(),
  colorHex: z.string().nullable().optional(),
  verified: z.boolean().optional(),
  contactEmail: z.string().optional(),
  internalNotes: z.string().optional(),
});

const FeedPayloadSchema = z.record(z.string(), z.unknown()).optional();
const FeedPayloadBodySchemas = Object.fromEntries(
  DISCOVER_FEED_TYPES.map((type) => [type, FeedPayloadSchema]),
) as Record<(typeof DISCOVER_FEED_TYPES)[number], typeof FeedPayloadSchema>;

const FeedItemBodySchema = z.object({
  publisherOrganizationId: z.string().optional(),
  publisherIndividualId: z.string().optional(),
  type: FeedTypeSchema.optional(),
  status: FeedStatusSchema.optional(),
  publishedAt: z.string().nullable().optional(),
  language: z.enum(["en", "es"]).optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  htmlBody: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  sourceButtonText: z.string().nullable().optional(),
  ...FeedPayloadBodySchemas,
});

const PUBLIC_PUBLISHER_REQUEST_PATH = "/discover/publisher-requests";
const PUBLIC_PUBLISHER_FAVICON_PATH = "/discover/publisher-favicon";
const PUBLISHER_REQUEST_MIN_ELAPSED_MS = 2500;
const PUBLISHER_REQUEST_MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;
const PUBLISHER_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const PUBLISHER_REQUEST_MAX_PER_WINDOW = 5;
const PUBLISHER_FAVICON_MAX_PER_WINDOW = 20;
const publisherRequestRateLimit = new Map<
  string,
  { count: number; resetAt: number }
>();
const publisherFaviconRateLimit = new Map<
  string,
  { count: number; resetAt: number }
>();
const PUBLIC_PUBLISHER_REQUEST_ORIGINS = new Set([
  "https://goldencrowvs.com",
  "https://www.goldencrowvs.com",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

function sendRepositoryError(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  throw error;
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function originFromUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function isAllowedPublisherRequestOrigin(origin: string | undefined) {
  if (!origin) {
    return false;
  }

  return (
    PUBLIC_PUBLISHER_REQUEST_ORIGINS.has(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  );
}

function publisherRequestClientKey(
  request: FastifyRequest,
  body: PublisherRequestBody,
) {
  const forwardedFor = headerValue(request.headers["x-forwarded-for"]);
  const clientIp =
    forwardedFor?.split(",")[0]?.trim() || request.ip || "unknown";
  return `${clientIp}:${body.contactEmail.toLowerCase()}`;
}

function publisherFaviconClientKey(request: FastifyRequest) {
  const forwardedFor = headerValue(request.headers["x-forwarded-for"]);
  return forwardedFor?.split(",")[0]?.trim() || request.ip || "unknown";
}

function pruneRateLimitBuckets(
  buckets: Map<string, { count: number; resetAt: number }>,
  now: number,
) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function enforcePublisherRequestRateLimit(
  request: FastifyRequest,
  body: PublisherRequestBody,
) {
  const now = Date.now();
  pruneRateLimitBuckets(publisherRequestRateLimit, now);

  const key = publisherRequestClientKey(request, body);
  const bucket = publisherRequestRateLimit.get(key);
  if (!bucket) {
    publisherRequestRateLimit.set(key, {
      count: 1,
      resetAt: now + PUBLISHER_REQUEST_WINDOW_MS,
    });
    return;
  }

  bucket.count += 1;
  if (bucket.count > PUBLISHER_REQUEST_MAX_PER_WINDOW) {
    throw new Error("RATE_LIMITED");
  }
}

function enforcePublisherFaviconRateLimit(request: FastifyRequest) {
  const now = Date.now();
  pruneRateLimitBuckets(publisherFaviconRateLimit, now);

  const key = publisherFaviconClientKey(request);
  const bucket = publisherFaviconRateLimit.get(key);
  if (!bucket) {
    publisherFaviconRateLimit.set(key, {
      count: 1,
      resetAt: now + PUBLISHER_REQUEST_WINDOW_MS,
    });
    return;
  }

  bucket.count += 1;
  if (bucket.count > PUBLISHER_FAVICON_MAX_PER_WINDOW) {
    throw new Error("RATE_LIMITED");
  }
}

function assertPublisherRequestGateway(
  request: FastifyRequest,
  body: PublisherRequestBody,
) {
  if (body.website) {
    throw new Error("BOT_FIELD_FILLED");
  }

  const origin = headerValue(request.headers.origin);
  const refererOrigin = originFromUrl(headerValue(request.headers.referer));
  if (
    !isAllowedPublisherRequestOrigin(origin) &&
    !isAllowedPublisherRequestOrigin(refererOrigin)
  ) {
    throw new Error("BAD_ORIGIN");
  }

  const startedAt = Date.parse(body.startedAt);
  const elapsedMs = Date.now() - startedAt;
  if (
    !Number.isFinite(startedAt) ||
    elapsedMs < PUBLISHER_REQUEST_MIN_ELAPSED_MS ||
    elapsedMs > PUBLISHER_REQUEST_MAX_ELAPSED_MS
  ) {
    throw new Error("BAD_FLOW_AGE");
  }

  enforcePublisherRequestRateLimit(request, body);
}

function assertPublisherFaviconGateway(
  request: FastifyRequest,
  body: PublisherFaviconBody,
) {
  if (body.website) {
    throw new Error("BOT_FIELD_FILLED");
  }

  const origin = headerValue(request.headers.origin);
  const refererOrigin = originFromUrl(headerValue(request.headers.referer));
  if (
    !isAllowedPublisherRequestOrigin(origin) &&
    !isAllowedPublisherRequestOrigin(refererOrigin)
  ) {
    throw new Error("BAD_ORIGIN");
  }

  const startedAt = Date.parse(body.startedAt);
  const elapsedMs = Date.now() - startedAt;
  if (
    !Number.isFinite(startedAt) ||
    elapsedMs < PUBLISHER_REQUEST_MIN_ELAPSED_MS ||
    elapsedMs > PUBLISHER_REQUEST_MAX_ELAPSED_MS
  ) {
    throw new Error("BAD_FLOW_AGE");
  }

  enforcePublisherFaviconRateLimit(request);
}

export async function discoverRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post(
    PUBLIC_PUBLISHER_FAVICON_PATH,
    {
      schema: { body: PublisherFaviconBodySchema },
    },
    async (request, reply) => {
      try {
        assertPublisherFaviconGateway(request, request.body);
        const favicon = await extractFavicon(request.body.websiteUrl);

        return reply.send({
          pageUrl: favicon.pageUrl,
          faviconUrl: favicon.faviconUrl,
          contentType: favicon.contentType,
          imageUploadDataUrl: favicon.dataUrl,
          imageUploadName: favicon.fileName,
          imageUploadMimeType: favicon.contentType,
        });
      } catch (error) {
        if (error instanceof FaviconExtractionError) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        if (error instanceof Error) {
          if (error.message === "RATE_LIMITED") {
            return reply.status(429).send({
              error: "Too many logo lookups. Please try again later.",
            });
          }

          if (error.message === "BAD_ORIGIN") {
            return reply.status(403).send({
              error: "Logo lookups must be requested from Pocket Genes.",
            });
          }

          if (
            error.message === "BOT_FIELD_FILLED" ||
            error.message === "BAD_FLOW_AGE"
          ) {
            return reply.status(400).send({
              error: "Please restart the request flow and try again.",
            });
          }
        }

        throw error;
      }
    },
  );

  f.post(
    PUBLIC_PUBLISHER_REQUEST_PATH,
    {
      schema: { body: PublisherRequestBodySchema },
    },
    async (request, reply) => {
      try {
        assertPublisherRequestGateway(request, request.body);
        const result = await createDiscoverPublisherApprovalRequest(
          request.body,
        );
        if (result.kind === "organization") {
          try {
            await sendDiscoverPublisherRequestNotificationEmail(
              result.publisher,
            );
          } catch (error) {
            request.log.error(
              {
                err: error,
                publisherId: result.publisher.id,
              },
              "Failed to send publisher request notification email.",
            );
          }
        }

        return reply.status(201).send({
          status: "ok",
          kind: result.kind,
          publisherId: result.publisher.id,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "RATE_LIMITED") {
            return reply.status(429).send({
              error: "Too many publisher requests. Please try again later.",
            });
          }

          if (error.message === "BAD_ORIGIN") {
            return reply.status(403).send({
              error: "Publisher requests must be submitted from Pocket Genes.",
            });
          }

          if (
            error.message === "BOT_FIELD_FILLED" ||
            error.message === "BAD_FLOW_AGE"
          ) {
            return reply.status(400).send({
              error: "Please restart the request flow and try again.",
            });
          }
        }

        return sendRepositoryError(reply, error);
      }
    },
  );

  f.addHook("onRequest", async (request, reply) => {
    const requestPath = request.url.split("?")[0] ?? request.url;
    if (
      requestPath === PUBLIC_PUBLISHER_REQUEST_PATH ||
      requestPath === PUBLIC_PUBLISHER_FAVICON_PATH
    ) {
      return;
    }

    if (!request.adminContext || !canAccessDiscover(request.adminContext)) {
      return reply.status(403).send({ error: "Discover access required" });
    }
  });

  f.get(
    "/discover/organizations",
    {
      schema: { querystring: QuerySchema },
    },
    async (request, reply) => {
      try {
        const result = await listDiscoverOrganizations(
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
    "/discover/organizations",
    {
      schema: { body: OrganizationBodySchema },
    },
    async (request, reply) => {
      try {
        const organization = await createDiscoverOrganization(
          request.adminContext!,
          request.body,
        );
        return reply.send({ organization });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/discover/organizations/:organizationId",
    {
      schema: {
        params: z.object({ organizationId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const organization = await getDiscoverOrganization(
          request.adminContext!,
          request.params.organizationId,
        );
        return reply.send({ organization });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/discover/organizations/:organizationId",
    {
      schema: {
        params: z.object({ organizationId: z.string().min(1) }),
        body: OrganizationBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const organization = await updateDiscoverOrganization(
          request.adminContext!,
          request.params.organizationId,
          request.body,
        );
        return reply.send({ organization });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/discover/organizations/:organizationId",
    {
      schema: {
        params: z.object({ organizationId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const result = await deleteDiscoverOrganization(
          request.adminContext!,
          request.params.organizationId,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/discover/organizations/:organizationId/submission-evaluation",
    {
      schema: {
        params: z.object({ organizationId: z.string().min(1) }),
        body: SubmissionEvaluationBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await evaluateDiscoverOrganizationSubmission(
          request.adminContext!,
          request.params.organizationId,
          request.body.decision,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/discover/organizations/:organizationId/sync-publisher-snapshot",
    {
      schema: {
        params: z.object({ organizationId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const result = await syncDiscoverPublisherSnapshot(
          request.adminContext!,
          request.params.organizationId,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/discover/individuals",
    {
      schema: { querystring: QuerySchema },
    },
    async (request, reply) => {
      try {
        const result = await listDiscoverIndividuals(
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
    "/discover/individuals",
    {
      schema: { body: IndividualBodySchema },
    },
    async (request, reply) => {
      try {
        const individual = await createDiscoverIndividual(
          request.adminContext!,
          request.body,
        );
        return reply.send({ individual });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/discover/individuals/:individualId",
    {
      schema: {
        params: z.object({ individualId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const individual = await getDiscoverIndividual(
          request.adminContext!,
          request.params.individualId,
        );
        return reply.send({ individual });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/discover/individuals/:individualId",
    {
      schema: {
        params: z.object({ individualId: z.string().min(1) }),
        body: IndividualBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const individual = await updateDiscoverIndividual(
          request.adminContext!,
          request.params.individualId,
          request.body,
        );
        return reply.send({ individual });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/discover/individuals/:individualId",
    {
      schema: {
        params: z.object({ individualId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const result = await deleteDiscoverIndividual(
          request.adminContext!,
          request.params.individualId,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/discover/individuals/:individualId/submission-evaluation",
    {
      schema: {
        params: z.object({ individualId: z.string().min(1) }),
        body: SubmissionEvaluationBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await evaluateDiscoverIndividualSubmission(
          request.adminContext!,
          request.params.individualId,
          request.body.decision,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/discover/feed-items",
    {
      schema: { querystring: QuerySchema },
    },
    async (request, reply) => {
      try {
        const result = await listDiscoverFeedItems(
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
    "/discover/feed-items",
    {
      schema: { body: FeedItemBodySchema },
    },
    async (request, reply) => {
      try {
        const feedItem = await createDiscoverFeedItem(
          request.adminContext!,
          request.body,
        );
        return reply.send({ feedItem });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/discover/feed-items/:feedItemId",
    {
      schema: {
        params: z.object({ feedItemId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const feedItem = await getDiscoverFeedItem(
          request.adminContext!,
          request.params.feedItemId,
        );
        return reply.send({ feedItem });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/discover/feed-items/:feedItemId",
    {
      schema: {
        params: z.object({ feedItemId: z.string().min(1) }),
        body: FeedItemBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const feedItem = await updateDiscoverFeedItem(
          request.adminContext!,
          request.params.feedItemId,
          request.body,
        );
        return reply.send({ feedItem });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.delete(
    "/discover/feed-items/:feedItemId",
    {
      schema: {
        params: z.object({ feedItemId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const result = await deleteDiscoverFeedItem(
          request.adminContext!,
          request.params.feedItemId,
        );
        return reply.send(result);
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/discover/feed-items/:feedItemId/duplicate",
    {
      schema: {
        params: z.object({ feedItemId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const feedItem = await duplicateDiscoverFeedItem(
          request.adminContext!,
          request.params.feedItemId,
        );
        return reply.send({ feedItem });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );
}
