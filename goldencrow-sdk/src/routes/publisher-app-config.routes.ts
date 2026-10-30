import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createPublisherAppConfig,
  getPublisherAppConfig,
  updatePublisherAppConfig,
} from "../repositories/publisher-app-config.repository.js";

const HexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use the #RRGGBB hex color format.")
  .transform((value) => value.toUpperCase());

const PublisherAppConfigBodySchema = z
  .object({
    platformOption: z.enum(["ios", "ios_android"]),
    connectEnabled: z.boolean(),
    profileEnabled: z.boolean(),
    learnCustomizationEnabled: z.boolean(),
    colors: z
      .object({
        primary: HexColorSchema,
        secondary: HexColorSchema,
        tertiary: HexColorSchema,
      })
      .strict(),
  })
  .strict();

function sendRepositoryError(reply: FastifyReply, error: unknown) {
  if (isAdminRepositoryError(error)) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  throw error;
}

export async function publisherAppConfigRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get("/publisher-app/config", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    try {
      const config = await getPublisherAppConfig(request.adminContext);
      return reply.send({ config });
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });

  f.post(
    "/publisher-app/config",
    { schema: { body: PublisherAppConfigBodySchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      try {
        const config = await createPublisherAppConfig(
          request.adminContext,
          request.body,
        );
        return reply.status(201).send({ config });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/publisher-app/config",
    { schema: { body: PublisherAppConfigBodySchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      try {
        const config = await updatePublisherAppConfig(
          request.adminContext,
          request.body,
        );
        return reply.send({ config });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );
}
