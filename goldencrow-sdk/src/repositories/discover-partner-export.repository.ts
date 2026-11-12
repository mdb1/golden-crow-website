import { z } from "zod";
import { adminDbFor } from "../config/firebase.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import {
  listDiscoverIndividuals,
  listDiscoverOrganizations,
} from "./discover.repository.js";

export const DiscoverPartnerExportQuerySchema = z
  .object({
    kind: z.enum(["organization", "individual"]),
    cursor: z.string().min(1).max(4096).optional(),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();

export async function listDiscoverPartnerExport(
  context: AdminContext,
  rawOptions: z.input<typeof DiscoverPartnerExportQuerySchema>,
) {
  if (!context.isBootstrap) {
    throw new AdminRepositoryError("GOD MODE access required", 403);
  }
  const { kind, ...options } =
    DiscoverPartnerExportQuerySchema.parse(rawOptions);
  const page =
    kind === "organization"
      ? await listDiscoverOrganizations(context, options)
      : await listDiscoverIndividuals(context, options);
  const publishers =
    "organizations" in page ? page.organizations : page.individuals;
  if (!publishers.length) return { items: [], nextCursor: page.nextCursor };

  // Each publisher has one canonical config. Fetch this page's ownership fields
  // in one batch instead of scanning apps or loading full app configurations.
  const db = adminDbFor("mydnamap");
  const apps = await db.getAll(
    ...publishers.map((publisher) =>
      db.collection("app_configs").doc(`${kind}_${publisher.id}`),
    ),
    { fieldMask: ["publisherKind", "publisherId"] },
  );
  const appsById = new Map(apps.map((app) => [app.id, app]));
  return {
    items: publishers.map((publisher) => {
      const app = appsById.get(`${kind}_${publisher.id}`);
      const owner = app?.data();
      const linkedAppId =
        app?.exists &&
        owner?.publisherKind === kind &&
        owner.publisherId === publisher.id
          ? app.id
          : null;
      return {
        id: publisher.id,
        name: publisher.name,
        contactEmail: publisher.contactEmail,
        internalNotes: publisher.internalNotes,
        ...(kind === "individual" && "linkedParentOrganizationId" in publisher
          ? { linkedParentOrganizationId: publisher.linkedParentOrganizationId }
          : {}),
        linkedAppId,
      };
    }),
    nextCursor: page.nextCursor,
  };
}
