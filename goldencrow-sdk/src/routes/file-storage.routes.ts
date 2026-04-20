import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { canManageLegacyModeration } from "../repositories/roles.repository.js";
import {
  createStoredFileDocument,
  getStoredFileDocument,
  listStoredFileDocuments,
  StoredFileValidationError,
  updateStoredFileDocument,
} from "../repositories/file-storage.repository.js";

const RawDocumentBodySchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export async function fileStorageRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext || !canManageLegacyModeration(request.adminContext)) {
      return reply.status(403).send({ error: "Full admin access required" });
    }
  });

  f.get("/file-storage", async (_request, reply) => {
    const documents = await listStoredFileDocuments();
    return reply.send({ documents });
  });

  f.post(
    "/file-storage",
    {
      schema: {
        body: RawDocumentBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await createStoredFileDocument(request.body.data);
        return reply.send(result);
      } catch (error) {
        if (error instanceof StoredFileValidationError) {
          return reply.status(400).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.get(
    "/file-storage/:fileId",
    {
      schema: {
        params: z.object({ fileId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const document = await getStoredFileDocument(request.params.fileId);
      if (!document) {
        return reply.status(404).send({ error: "Stored file not found" });
      }

      return reply.send({ document });
    }
  );

  f.put(
    "/file-storage/:fileId",
    {
      schema: {
        params: z.object({ fileId: z.string().min(1) }),
        body: RawDocumentBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await updateStoredFileDocument(request.params.fileId, request.body.data);
        if (!result.document) {
          return reply.status(404).send({ error: "Stored file not found" });
        }

        return reply.send(result);
      } catch (error) {
        if (error instanceof StoredFileValidationError) {
          return reply.status(400).send({ error: error.message });
        }

        throw error;
      }
    }
  );
}
