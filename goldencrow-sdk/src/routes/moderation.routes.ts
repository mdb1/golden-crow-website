import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { canManageLegacyModeration } from "../repositories/roles.repository.js";
import {
  deleteModerationDocument,
  deleteModerationSubdocument,
  getModerationDocument,
  getModerationSubdocument,
  listModerationDocuments,
  listModerationSubdocuments,
  updateModerationDocument,
  updateModerationSubdocument,
} from "../repositories/moderation.repository.js";

const CollectionKeySchema = z.enum([
  "profiles",
  "public_profiles",
  "community_users",
  "community_posts",
  "report_codes",
  "uploaded_reports",
  "file_storage",
  "report_owners",
  "user_progress",
]);

const SubcollectionKeySchema = z.enum(["comments", "events"]);

const RawDocumentBodySchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export async function moderationRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext || !canManageLegacyModeration(request.adminContext)) {
      return reply.status(403).send({ error: "Full admin access required" });
    }
  });

  f.get(
    "/moderation/:collectionKey",
    {
      schema: {
        params: z.object({
          collectionKey: CollectionKeySchema,
        }),
      },
    },
    async (request, reply) => {
      const documents = await listModerationDocuments(request.params.collectionKey);
      return reply.send({ documents });
    }
  );

  f.get(
    "/moderation/:collectionKey/:documentId",
    {
      schema: {
        params: z.object({
          collectionKey: CollectionKeySchema,
          documentId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const document = await getModerationDocument(
        request.params.collectionKey,
        request.params.documentId
      );
      if (!document) {
        return reply.status(404).send({ error: "Document not found" });
      }

      return reply.send({ document });
    }
  );

  f.put(
    "/moderation/:collectionKey/:documentId",
    {
      schema: {
        params: z.object({
          collectionKey: CollectionKeySchema,
          documentId: z.string().min(1),
        }),
        body: RawDocumentBodySchema,
      },
    },
    async (request, reply) => {
      const document = await updateModerationDocument(
        request.params.collectionKey,
        request.params.documentId,
        request.body.data
      );

      if (!document) {
        return reply.status(404).send({ error: "Document not found" });
      }

      return reply.send({ document });
    }
  );

  f.delete(
    "/moderation/:collectionKey/:documentId",
    {
      schema: {
        params: z.object({
          collectionKey: CollectionKeySchema,
          documentId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const deleted = await deleteModerationDocument(
        request.params.collectionKey,
        request.params.documentId
      );

      if (!deleted) {
        return reply.status(404).send({ error: "Document not found" });
      }

      return reply.send({ success: true });
    }
  );

  f.get(
    "/moderation/:collectionKey/:documentId/:subcollectionKey",
    {
      schema: {
        params: z.object({
          collectionKey: CollectionKeySchema,
          documentId: z.string().min(1),
          subcollectionKey: SubcollectionKeySchema,
        }),
      },
    },
    async (request, reply) => {
      const documents = await listModerationSubdocuments(
        request.params.collectionKey,
        request.params.documentId,
        request.params.subcollectionKey
      );

      return reply.send({ documents });
    }
  );

  f.get(
    "/moderation/:collectionKey/:documentId/:subcollectionKey/:subdocumentId",
    {
      schema: {
        params: z.object({
          collectionKey: CollectionKeySchema,
          documentId: z.string().min(1),
          subcollectionKey: SubcollectionKeySchema,
          subdocumentId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const document = await getModerationSubdocument(
        request.params.collectionKey,
        request.params.documentId,
        request.params.subcollectionKey,
        request.params.subdocumentId
      );

      if (!document) {
        return reply.status(404).send({ error: "Subdocument not found" });
      }

      return reply.send({ document });
    }
  );

  f.put(
    "/moderation/:collectionKey/:documentId/:subcollectionKey/:subdocumentId",
    {
      schema: {
        params: z.object({
          collectionKey: CollectionKeySchema,
          documentId: z.string().min(1),
          subcollectionKey: SubcollectionKeySchema,
          subdocumentId: z.string().min(1),
        }),
        body: RawDocumentBodySchema,
      },
    },
    async (request, reply) => {
      const document = await updateModerationSubdocument(
        request.params.collectionKey,
        request.params.documentId,
        request.params.subcollectionKey,
        request.params.subdocumentId,
        request.body.data
      );

      if (!document) {
        return reply.status(404).send({ error: "Subdocument not found" });
      }

      return reply.send({ document });
    }
  );

  f.delete(
    "/moderation/:collectionKey/:documentId/:subcollectionKey/:subdocumentId",
    {
      schema: {
        params: z.object({
          collectionKey: CollectionKeySchema,
          documentId: z.string().min(1),
          subcollectionKey: SubcollectionKeySchema,
          subdocumentId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const deleted = await deleteModerationSubdocument(
        request.params.collectionKey,
        request.params.documentId,
        request.params.subcollectionKey,
        request.params.subdocumentId
      );

      if (!deleted) {
        return reply.status(404).send({ error: "Subdocument not found" });
      }

      return reply.send({ success: true });
    }
  );
}
