import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import { canAccessDiscover } from "../repositories/roles.repository.js";
import {
  createDiscoverFeedItem,
  createDiscoverIndividual,
  createDiscoverOrganization,
  deleteDiscoverFeedItem,
  duplicateDiscoverFeedItem,
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

const OrganizationStatusSchema = z.enum(["active", "inactive", "archived"]);
const FeedTypeSchema = z.enum([
  "news",
  "research_update",
  "upcoming_event",
  "opportunity",
]);
const FeedStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);

const QuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const OrganizationBodySchema = z.object({
  name: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  status: OrganizationStatusSchema.optional(),
  websiteUrl: z.string().nullable().optional(),
  description: z.string().optional(),
  description_en: z.string().optional(),
  countryCode: z.string().optional(),
  organizationType: z.string().optional(),
  color_hex: z.string().nullable().optional(),
  colorHex: z.string().nullable().optional(),
  verified: z.boolean().optional(),
  contactEmail: z.string().optional(),
  internalNotes: z.string().optional(),
});

const IndividualBodySchema = z.object({
  name: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  status: OrganizationStatusSchema.optional(),
  websiteUrl: z.string().nullable().optional(),
  description: z.string().optional(),
  description_en: z.string().optional(),
  countryCode: z.string().optional(),
  individualType: z.string().optional(),
  color_hex: z.string().nullable().optional(),
  colorHex: z.string().nullable().optional(),
  verified: z.boolean().optional(),
  contactEmail: z.string().optional(),
  internalNotes: z.string().optional(),
});

const StringArraySchema = z.array(z.string()).optional();
const NewsPayloadSchema = z.object({
  category: z.string().optional(),
  region: z.string().optional(),
});

const ResearchUpdatePayloadSchema = z.object({
  research_topic: z.string().optional(),
  genes: StringArraySchema,
  conditions: StringArraySchema,
  journal: z.string().optional(),
});

const UpcomingEventPayloadSchema = z.object({
  date: z.string().nullable().optional(),
  location: z.string().optional(),
  max_attendance: z.number().nullable().optional(),
  virtual_meeting_link: z.string().nullable().optional(),
  virtualMeetingLink: z.string().nullable().optional(),
  meeting_url: z.string().nullable().optional(),
  meetingUrl: z.string().nullable().optional(),
});

const OpportunityPayloadSchema = z.object({
  opportunity_type: z.string().optional(),
  requirements: z.string().optional(),
  eligibility: z.string().optional(),
  location: z.string().optional(),
});

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
  html_body: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  news: NewsPayloadSchema.optional(),
  research_update: ResearchUpdatePayloadSchema.optional(),
  upcoming_event: UpcomingEventPayloadSchema.optional(),
  opportunity: OpportunityPayloadSchema.optional(),
});

function sendRepositoryError(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  throw error;
}

export async function discoverRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
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
        const result = await listDiscoverOrganizations(request.adminContext!, request.query);
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
        const result = await listDiscoverIndividuals(request.adminContext!, request.query);
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

  f.get(
    "/discover/feed-items",
    {
      schema: { querystring: QuerySchema },
    },
    async (request, reply) => {
      try {
        const result = await listDiscoverFeedItems(request.adminContext!, request.query);
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
