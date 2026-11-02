import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createPublisherAppConfig,
  createPublisherAppIdentifier,
  deactivatePublisherAppIdentifier,
  deletePublisherAppConfig,
  getPublisherAppConfigById,
  getPublisherAppConfig,
  getPublisherAppRuntimeConfig,
  getPublisherAppRuntimeConfigById,
  listPublisherAppConfigsPage,
  updatePublisherAppConfig,
  updatePublisherAppConfigById,
} from "../repositories/publisher-app-config.repository.js";
import { sendPublisherAppCreationNotificationEmails } from "../lib/publisher-app-creation-notification-email.js";

const APP_ICON_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const HexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use the #RRGGBB hex color format.")
  .transform((value) => value.toUpperCase());

const PublisherAppConfigBodyShape = {
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
};

function validatePublisherAppIcon(
  value: {
    iconSource: "publisher" | "custom";
    iconImageUrl: string | null;
    iconImageUploadDataUrl: string | null;
  },
  context: z.RefinementCtx,
) {
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
}

const PublisherAppConfigCreateBodySchema = z
  .object({
    ...PublisherAppConfigBodyShape,
    termsAccepted: z.literal(true),
  })
  .strict()
  .superRefine(validatePublisherAppIcon);

const PublisherAppConfigUpdateBodySchema = z
  .object({
    ...PublisherAppConfigBodyShape,
    termsAccepted: z.literal(true).optional(),
  })
  .strict()
  .superRefine(validatePublisherAppIcon);

const PublisherAppConfigAdminUpdateBodySchema = z
  .object({
    ...PublisherAppConfigBodyShape,
    status: z.enum([
      "pending_revision",
      "active",
      "approved",
      "changes_requested",
      "rejected",
    ]),
  })
  .strict()
  .superRefine(validatePublisherAppIcon);

const PublisherAppConfigAdminParamsSchema = z.object({
  configId: z.string().trim().min(1).max(300),
});

const PublisherAppConfigAdminListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).max(300).optional(),
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

  f.get(
    "/admin/publisher-app-configs",
    { schema: { querystring: PublisherAppConfigAdminListQuerySchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }
      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }

      try {
        return reply.send(
          await listPublisherAppConfigsPage({
            limit: request.query.limit,
            cursor: request.query.cursor,
          }),
        );
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/publisher-app-configs/:configId",
    { schema: { params: PublisherAppConfigAdminParamsSchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }
      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }

      try {
        const config = await getPublisherAppConfigById(request.params.configId);
        return reply.send({ config });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.get(
    "/admin/publisher-app-configs/:configId/runtime",
    { schema: { params: PublisherAppConfigAdminParamsSchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }
      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }
      try {
        return reply.send(
          await getPublisherAppRuntimeConfigById(request.params.configId),
        );
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.put(
    "/admin/publisher-app-configs/:configId",
    {
      schema: {
        params: PublisherAppConfigAdminParamsSchema,
        body: PublisherAppConfigAdminUpdateBodySchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }
      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }

      try {
        const config = await updatePublisherAppConfigById(
          request.adminContext,
          request.params.configId,
          request.body,
        );
        return reply.send({ config });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

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

  f.get("/publisher-app/config/runtime", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }
    try {
      return reply.send(
        await getPublisherAppRuntimeConfig(request.adminContext),
      );
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });

  f.post("/publisher-app/config/identifier", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }
    try {
      return reply.send({
        config: await createPublisherAppIdentifier(request.adminContext),
      });
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });

  f.delete("/publisher-app/config/identifier", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }
    try {
      return reply.send({
        config: await deactivatePublisherAppIdentifier(request.adminContext),
      });
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });

  f.post(
    "/publisher-app/config",
    { schema: { body: PublisherAppConfigCreateBodySchema } },
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
    { schema: { body: PublisherAppConfigUpdateBodySchema } },
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
