import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { canManageLegacyModeration } from "../repositories/roles.repository.js";
import {
  createStoredFileDocument,
  deleteStoredFileDocument,
  FILE_STORAGE_REQUEST_BODY_LIMIT_BYTES,
  getStoredFileDocument,
  listStoredFileDocuments,
  StoredFileDeleteBlockedError,
  StoredFileUpdateBlockedError,
  StoredFileValidationError,
  updateStoredFileDocument,
  validateStoredFileJsonContent,
} from "../repositories/file-storage.repository.js";

const RawDocumentBodySchema = z.object({
  data: z.record(z.string(), z.unknown()),
});
const CreateStoredFileBodySchema = z.object({
  data: z
    .object({
      file_name: z.string().optional(),
      creator_email: z.string().optional(),
      file_type: z.string().trim().min(1),
      file_content: z.string().min(1),
    })
    .strict(),
});
const FileStorageCursorSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_500)
  .refine((value) => !value.includes("/"), "Invalid stored file cursor.")
  .optional();
const FileStorageListQuerySchema = z.object({
  cursor: FileStorageCursorSchema,
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const ValidateStoredFileBodySchema = z
  .object({
    fileType: z.string().trim().min(1).max(120),
    fileContent: z.string().min(1),
  })
  .strict();

export async function fileStorageRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext || !canManageLegacyModeration(request.adminContext)) {
      return reply.status(403).send({ error: "Full admin access required" });
    }
  });

  f.get(
    "/file-storage",
    {
      schema: {
        querystring: FileStorageListQuerySchema,
      },
    },
    async (request, reply) => {
      const page = await listStoredFileDocuments(request.query);
      return reply.send(page);
    },
  );

  f.post(
    "/file-storage/validate",
    {
      bodyLimit: FILE_STORAGE_REQUEST_BODY_LIMIT_BYTES,
      schema: {
        body: ValidateStoredFileBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = validateStoredFileJsonContent(request.body);
        return reply.send({ valid: true, ...result });
      } catch (error) {
        if (error instanceof StoredFileValidationError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  f.post(
    "/file-storage",
    {
      bodyLimit: FILE_STORAGE_REQUEST_BODY_LIMIT_BYTES,
      schema: {
        body: CreateStoredFileBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await createStoredFileDocument({
          ...request.body.data,
          creator_email:
            request.body.data.creator_email?.trim() ||
            request.adminContext?.email,
        });
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
        if (error instanceof StoredFileUpdateBlockedError) {
          return reply.status(409).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.delete(
    "/file-storage/:fileId",
    {
      schema: {
        params: z.object({ fileId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const deleted = await deleteStoredFileDocument(request.params.fileId);
        if (!deleted) {
          return reply.status(404).send({ error: "Stored file not found" });
        }

        return reply.send({ success: true });
      } catch (error) {
        if (error instanceof StoredFileDeleteBlockedError) {
          return reply.status(409).send({ error: error.message });
        }

        throw error;
      }
    }
  );
}
