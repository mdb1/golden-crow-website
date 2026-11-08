import { FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createOrganizationPublisherAppConfig,
  createOrganizationPublisherAppIdentifier,
  createPublisherAppConfig,
  createPublisherAppIdentifier,
  deactivatePublisherAppIdentifier,
  deletePublisherAppConfig,
  getPublisherAppConfigById,
  getPublisherAppCatalogIcon,
  getOrganizationPublisherAppCreationData,
  getPublisherAppCatalogSnapshot,
  getPublisherAppConfig,
  getPublisherAppRuntimeConfig,
  getPublisherAppRuntimeConfigById,
  listPublisherAppConfigsPage,
  refreshPublisherAppCatalogSnapshot,
  updatePublisherAppConfig,
  updatePublisherAppConfigById,
  updateOrganizationPublisherAppConfig,
} from "../repositories/publisher-app-config.repository.js";
import { sendPublisherAppCreationNotificationEmails } from "../lib/publisher-app-creation-notification-email.js";
import { derivePublisherAppCounterpointColors } from "../lib/publisher-app-color-identity.js";

const APP_ICON_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const CUSTOM_APP_CONFIG_BODY_LIMIT_BYTES = 16 * 1024 * 1024;

const HexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use the #RRGGBB hex color format.")
  .transform((value) => value.toUpperCase());
const OverrideHexColorSchema = z
  .string()
  .trim()
  .regex(
    /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/,
    "Use the #RRGGBB or #RRGGBBAA hex color format.",
  )
  .transform((value) => value.toUpperCase());

const NonBlankTextSchema = z.string().trim().min(1);
const IdentifierSchema = NonBlankTextSchema.regex(
  /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/,
);
const LessonIdentifierSchema = NonBlankTextSchema.regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,
);
const HttpsUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  }, "Use a credential-free HTTPS URL.");
const SemanticColorsSchema = z
  .object({
    primary: HexColorSchema,
    primaryStrong: HexColorSchema,
    primaryDeep: HexColorSchema,
    primarySoft: HexColorSchema,
    secondary: HexColorSchema,
    accent: HexColorSchema,
    accentTextLight: HexColorSchema,
    accentTextDark: HexColorSchema,
    accentSurfaceLight: HexColorSchema,
  })
  .strict();

const LearnParagraphSchema = z
  .object({
    paragraphTitle: NonBlankTextSchema,
    icon: NonBlankTextSchema,
    contentText: NonBlankTextSchema,
  })
  .strict();
const LearnLessonSchema = z
  .object({
    lessonIdentifier: LessonIdentifierSchema,
    lessonTitle: NonBlankTextSchema,
    imageUrl: HttpsUrlSchema.nullable(),
    lessonColor: HexColorSchema,
    paragraphs: z.array(LearnParagraphSchema).min(1),
    usefulLinks: z.array(HttpsUrlSchema),
    relatedLessons: z.array(LessonIdentifierSchema),
  })
  .strict();
const LearnChapterSchema = z
  .object({
    chapterTitle: NonBlankTextSchema,
    lessons: z.array(LearnLessonSchema).min(1),
  })
  .strict();
const LearnSubjectSchema = z
  .object({
    subjectIdentifier: NonBlankTextSchema,
    subjectTitle: NonBlankTextSchema,
    chapters: z.array(LearnChapterSchema).min(1),
  })
  .strict();
const LearnConfigurationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("base") }).strict(),
  z
    .object({
      mode: z.literal("replace"),
      curriculumId: IdentifierSchema,
      curriculumRevision: z.number().int().min(1).max(2_147_483_647),
      defaultLanguage: NonBlankTextSchema.regex(
        /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/,
      ),
      subjects: z.array(LearnSubjectSchema).min(1),
      topics: z.record(z.string(), z.array(NonBlankTextSchema)),
    })
    .strict(),
]);

const ColorOverrideSchema = z
  .object({
    light: OverrideHexColorSchema.optional(),
    dark: OverrideHexColorSchema.optional(),
  })
  .strict()
  .refine((value) => value.light || value.dark, {
    message: "Choose at least one appearance mode.",
  });

const TextOverrideSchema = z
  .object({
    key: NonBlankTextSchema,
    en: NonBlankTextSchema,
    es: NonBlankTextSchema,
  })
  .strict();

const PublisherAppAdvancedConfigurationSchema = z
  .object({
    displayName: NonBlankTextSchema,
    semanticColors: SemanticColorsSchema.nullable(),
    colorOverrides: z.record(NonBlankTextSchema, ColorOverrideSchema),
    catalogEnabled: z.boolean(),
    feedEnabled: z.boolean(),
    discoverScope: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("all") }).strict(),
      z
        .object({
          mode: z.literal("organization"),
          publisherOrganizationId: NonBlankTextSchema,
        })
        .strict(),
    ]),
    serviceScope: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("all") }).strict(),
      z
        .object({
          mode: z.literal("provider"),
          providerId: NonBlankTextSchema,
          providerKind: z.enum(["organization", "individual"]),
        })
        .strict(),
    ]),
    localization: z
      .object({
        defaultLanguage: z.enum(["en", "es"]),
        availableLanguages: z
          .array(z.enum(["en", "es"]))
          .min(1)
          .max(2),
      })
      .strict(),
    textOverrides: z.array(TextOverrideSchema),
    learn: LearnConfigurationSchema,
    links: z
      .object({
        joinUs: z.object({ en: HttpsUrlSchema, es: HttpsUrlSchema }).strict(),
        supportEmail: z.string().trim().email(),
        privacyUrl: HttpsUrlSchema,
        termsUrl: HttpsUrlSchema,
      })
      .strict(),
  })
  .strict();

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
      counterpointClockwise: HexColorSchema.optional(),
      counterpointAnticlockwise: HexColorSchema.optional(),
      counterpointFarClockwise: HexColorSchema.optional(),
      counterpointFarAnticlockwise: HexColorSchema.optional(),
    })
    .strict()
    .transform((colors) => ({
      ...derivePublisherAppCounterpointColors(colors.primary),
      ...colors,
    })),
  iconSource: z.enum(["publisher", "custom"]).default("publisher"),
  iconImageUrl: z.string().trim().url().max(2_048).nullable().default(null),
  iconImageUploadDataUrl: z
    .string()
    .max(900_000)
    .regex(APP_ICON_DATA_URL_PATTERN)
    .nullable()
    .default(null),
  advancedConfiguration: PublisherAppAdvancedConfigurationSchema.optional(),
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

const OrganizationAppParamsSchema = z.object({
  organizationId: z.string().trim().min(1).max(300).regex(/^[^/]+$/),
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

  // Only immutable, catalog-published image bytes are public, never app config data.
  f.get("/publisher-app/icon", {
    schema: { querystring: z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/) }) },
  }, async (request, reply) => {
    try {
      const icon = await getPublisherAppCatalogIcon(request.query.hash);
      return reply
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
        .header("Cross-Origin-Resource-Policy", "cross-origin")
        .header("X-Content-Type-Options", "nosniff")
        .type(icon.contentType)
        .send(icon.bytes);
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });

  f.put("/admin/publisher-app-configs/organizations/:organizationId", {
    bodyLimit: CUSTOM_APP_CONFIG_BODY_LIMIT_BYTES,
    schema: { params: OrganizationAppParamsSchema, body: PublisherAppConfigUpdateBodySchema },
  }, async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }
    if (!request.adminContext.isBootstrap) {
      return reply.status(403).send({ error: "GOD MODE access required" });
    }
    try {
      return reply.send({ config: await updateOrganizationPublisherAppConfig(
        request.adminContext, request.params.organizationId, request.body,
      ) });
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });

  f.get(
    "/admin/publisher-app-configs/organizations/:organizationId",
    { schema: { params: OrganizationAppParamsSchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }
      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }
      try {
        reply.header("Cache-Control", "private, no-store");
        return reply.send(await getOrganizationPublisherAppCreationData(
          request.adminContext,
          request.params.organizationId,
        ));
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

  f.post(
    "/admin/publisher-app-configs/organizations/:organizationId",
    {
      bodyLimit: CUSTOM_APP_CONFIG_BODY_LIMIT_BYTES,
      schema: {
        params: OrganizationAppParamsSchema,
        body: PublisherAppConfigCreateBodySchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }
      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }
      try {
        const config = await createOrganizationPublisherAppConfig(
          request.adminContext,
          request.params.organizationId,
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

  f.post(
    "/admin/publisher-app-configs/organizations/:organizationId/identifier",
    { schema: { params: OrganizationAppParamsSchema } },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }
      if (!request.adminContext.isBootstrap) {
        return reply.status(403).send({ error: "GOD MODE access required" });
      }
      try {
        return reply.send({
          config: await createOrganizationPublisherAppIdentifier(
            request.adminContext,
            request.params.organizationId,
          ),
        });
      } catch (error) {
        return sendRepositoryError(reply, error);
      }
    },
  );

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

  f.get("/admin/publisher-app-configs/snapshot", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }
    if (!request.adminContext.isBootstrap) {
      return reply.status(403).send({ error: "GOD MODE access required" });
    }

    try {
      reply.header("Cache-Control", "private, no-store");
      return reply.send({
        snapshot: await getPublisherAppCatalogSnapshot(),
      });
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });

  f.put("/admin/publisher-app-configs/snapshot", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }
    if (!request.adminContext.isBootstrap) {
      return reply.status(403).send({ error: "GOD MODE access required" });
    }

    try {
      reply.header("Cache-Control", "private, no-store");
      return reply.send({
        snapshot: await refreshPublisherAppCatalogSnapshot(
          request.adminContext,
        ),
      });
    } catch (error) {
      return sendRepositoryError(reply, error);
    }
  });

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
      bodyLimit: CUSTOM_APP_CONFIG_BODY_LIMIT_BYTES,
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
    {
      bodyLimit: CUSTOM_APP_CONFIG_BODY_LIMIT_BYTES,
      schema: { body: PublisherAppConfigCreateBodySchema },
    },
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
    {
      bodyLimit: CUSTOM_APP_CONFIG_BODY_LIMIT_BYTES,
      schema: { body: PublisherAppConfigUpdateBodySchema },
    },
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
