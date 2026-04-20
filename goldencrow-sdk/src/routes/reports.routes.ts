import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import { canManageLegacyModeration } from "../repositories/roles.repository.js";
import {
  listReports,
  getReportById,
  deleteReport,
  publishStoredFileAsReportCode,
} from "../repositories/reports.repository.js";

// NOTE: Do NOT register this plugin in routes/index.ts here — registration happens in Plan 04.

export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext || !canManageLegacyModeration(request.adminContext)) {
      return reply.status(403).send({ error: "Full admin access required" });
    }
  });

  // GET /reports — list reports with optional userId, source, and cursor filters
  f.get(
    "/reports",
    {
      schema: {
        querystring: z.object({
          userId: z.string().optional(),
          source: z.enum(["myDNAMap", "ActyonGenomics", "vcf", "2pq"]).optional(),
          startAfter: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { userId, source, startAfter } = request.query;

      const filters: {
        userId?: string;
        source?: "myDNAMap" | "ActyonGenomics" | "vcf" | "2pq";
      } = {};
      if (userId !== undefined) filters.userId = userId;
      if (source !== undefined) filters.source = source;

      const result = await listReports(filters, 50, startAfter);
      return reply.send(result);
    }
  );

  f.post(
    "/reports/publish-from-file-storage",
    {
      schema: {
        body: z.object({
          fileId: z.string().min(1),
          reportCode: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      try {
        const result = await publishStoredFileAsReportCode({
          fileId: request.body.fileId,
          reportCode: request.body.reportCode,
          ownerId: request.adminContext?.uid ?? "",
          ownerEmail: request.adminContext?.email ?? "",
        });
        return reply.send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({
            error: error.message,
            errorName: error.name,
            statusCode: error.statusCode,
          });
        }

        throw error;
      }
    }
  );

  // GET /reports/:reportId — fetch a single report by Firestore document ID
  f.get(
    "/reports/:reportId",
    {
      schema: {
        params: z.object({ reportId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const report = await getReportById(request.params.reportId);
      if (!report) return reply.status(404).send({ error: "Report not found" });
      return reply.send({ report });
    }
  );

  // DELETE /reports/:reportId — delete a report Firestore document
  // Always returns 200; storageDeleted: false signals the known Storage gap
  f.delete(
    "/reports/:reportId",
    {
      schema: {
        params: z.object({ reportId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const result = await deleteReport(request.params.reportId);
      return reply.send(result);
    }
  );
}
