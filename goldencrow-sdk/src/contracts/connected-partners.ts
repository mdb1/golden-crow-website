import { z } from "zod";
import { PUBLISHER_APP_STATUSES } from "../lib/publisher-app-status.js";

export const CONNECTED_PARTNERS_COLLECTION = "connected-partners";

export const PartnerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const PartnerLinkIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(1500)
  .regex(/^[^/]+$/)
  .refine(
    (id) =>
      id !== "." &&
      id !== ".." &&
      !/^__.*__$/.test(id) &&
      Buffer.byteLength(id, "utf8") <= 1500,
    "Invalid linked document ID",
  );

export const PartnerOrganizationSnapshotSchema = z
  .object({ id: PartnerLinkIdSchema, name: z.string().trim().min(1) })
  .strict();
export const PartnerIndividualPublisherSnapshotSchema = PartnerOrganizationSnapshotSchema;

export const PartnerAppSnapshotSchema = z
  .object({
    id: PartnerLinkIdSchema,
    // Existing snapshots predate support for individual apps and are organization apps.
    publisherKind: z.enum(["organization", "individual"]).default("organization"),
    publisherId: PartnerLinkIdSchema,
    publisherName: z.string().trim().min(1),
    status: z.enum(PUBLISHER_APP_STATUSES),
    appProviderIdentifier: z.string().trim().min(1).optional(),
  })
  .strict();

// Meeting dates are civil dates, so they never shift with the viewer's timezone.
export const PartnerInputSchema = z
  .object({
    companyName: z.string().trim().min(1).max(180),
    firstName: z.string().trim().min(1).max(140),
    lastName: z.string().trim().min(1).max(140),
    phoneNumber: z.string().trim().max(50).default(""),
    email: z.string().trim().toLowerCase().email().max(254),
    meetingDate: z.iso.date().nullable().default(null),
    notes: z
      .string()
      .trim()
      .max(10000)
      .nullable()
      .default(null)
      .transform((value) => value || null),
    linkedOrganizationId: PartnerLinkIdSchema.nullable().default(null),
    linkedIndividualPublisherId: PartnerLinkIdSchema.nullable().default(null),
    linkedAppId: PartnerLinkIdSchema.nullable().default(null),
  })
  .strict();

export type PartnerInput = z.infer<typeof PartnerInputSchema>;
export const StoredPartnerSchema = PartnerInputSchema.extend({
  linkedOrganizationSnapshot: PartnerOrganizationSnapshotSchema.nullable().default(null),
  linkedIndividualPublisherSnapshot: PartnerIndividualPublisherSnapshotSchema.nullable().default(null),
  linkedAppSnapshot: PartnerAppSnapshotSchema.nullable().default(null),
}).strict();
export type PartnerOrganizationSnapshot = z.infer<typeof PartnerOrganizationSnapshotSchema>;
export type PartnerIndividualPublisherSnapshot = z.infer<typeof PartnerIndividualPublisherSnapshotSchema>;
export type PartnerAppSnapshot = z.infer<typeof PartnerAppSnapshotSchema>;
export type StoredPartner = z.infer<typeof StoredPartnerSchema>;
export type Partner = StoredPartner & {
  id: string;
  linkedOrganization: PartnerOrganizationSnapshot | null;
  linkedIndividualPublisher: PartnerIndividualPublisherSnapshot | null;
  linkedApp: PartnerAppSnapshot | null;
};
export type PartnersPage = { items: Partner[]; nextCursor: string | null };
export const PARTNER_SECTION_KEYS = [
  "noOrganization",
  "organizationWithoutApp",
  "freeApp",
  "contract",
  "individualWithoutApp",
  "individualFreeApp",
  "individualContract",
  "other",
] as const;
export const PartnerSectionSchema = z.enum(PARTNER_SECTION_KEYS);
export type PartnerSection = z.infer<typeof PartnerSectionSchema>;
export const PartnerSectionCursorSchema = z
  .string()
  .max(1024)
  .regex(/^ps1\.[A-Za-z0-9_-]+$/);
export type PartnerSectionPage = PartnersPage & { scanIncomplete: boolean };
export type PartnerLinkOption = {
  id: string;
  name: string;
  publisherId?: string;
  publisherKind?: PartnerAppSnapshot["publisherKind"];
  status?: PartnerAppSnapshot["status"];
  appProviderIdentifier?: string;
};
export type PartnerLinkOptionsPage = { items: PartnerLinkOption[]; nextCursor: string | null };
