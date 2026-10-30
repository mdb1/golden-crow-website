import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createPublisherAppConfig,
  deletePublisherAppConfig,
  getPublisherAppConfig,
  updatePublisherAppConfig,
} from "../repositories/publisher-app-config.repository.js";
import { sendPublisherAppCreationNotificationEmails } from "../lib/publisher-app-creation-notification-email.js";

const APP_ICON_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

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
    iconSource: z.enum(["publisher", "custom"]).default("publisher"),
    iconImageUrl: z.string().trim().url().max(2_048).nullable().default(null),
    iconImageUploadDataUrl: z
      .string()
      .max(900_000)
      .regex(APP_ICON_DATA_URL_PATTERN)
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.iconSource === "custom" &&
      !value.iconImageUrl &&
      !value.iconImageUploadDataUrl
    ) {
      context.addIssue({
        code: "custom",
        path: ["iconSource"],
        message: "Choose a custom app icon or use the publisher icon.",
      });
    }
  });

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
        try {
          await sendPublisherAppCreationNotificationEmails(config);
        } catch (error) {
          request.log.error(
            { err: error, appConfigId: config.id },
            "Failed to send publisher app creation notification emails.",
          );
        }
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

  f.delete("/publisher-app/config", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    try {
      const deleted = await deletePublisherAppConfig(request.adminContext);
      return reply.send({ deleted: true, configId: deleted.id });
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });
}
