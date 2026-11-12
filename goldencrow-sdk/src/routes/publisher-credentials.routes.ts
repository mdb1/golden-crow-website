import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PublisherAccessKeySchema } from "../lib/publisher-portal-credentials.js";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  publisherAccessKeyStatus,
  revealPublisherAccessKey,
  saveMissingPublisherAccessKey,
} from "../repositories/publisher-portal-credentials.repository.js";

export async function publisherCredentialsRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();
  const path = "/discover/publisher-credentials/:kind/:publisherId";
  const params = z.object({
    kind: z.enum(["organization", "individual"]),
    publisherId: z
      .string()
      .min(1)
      .max(300)
      .refine((value) => !value.includes("/")),
  });
  function failure(reply: import("fastify").FastifyReply, error: unknown) {
    return reply
      .status(isAdminRepositoryError(error) ? error.statusCode : 500)
      .send({
        error: isAdminRepositoryError(error)
          ? error.message
          : "Unable to manage the publisher access key.",
      });
  }
  f.get(path, { schema: { params } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await publisherAccessKeyStatus(
        request.adminContext!,
        request.params.kind,
        request.params.publisherId,
      );
    } catch (error) {
      return failure(reply, error);
    }
  });
  f.post(`${path}/reveal`, { schema: { params } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await revealPublisherAccessKey(
        request.adminContext!,
        request.params.kind,
        request.params.publisherId,
      );
    } catch (error) {
      return failure(reply, error);
    }
  });
  f.put(
    path,
    {
      schema: {
        params,
        body: z.object({ accessKey: PublisherAccessKeySchema }).strict(),
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        return await saveMissingPublisherAccessKey(
          request.adminContext!,
          request.params.kind,
          request.params.publisherId,
          request.body.accessKey,
        );
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
}
