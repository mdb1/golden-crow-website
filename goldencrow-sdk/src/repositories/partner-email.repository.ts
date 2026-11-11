import { z } from "zod";
import { adminDbFor } from "../config/firebase.js";
import { PartnerIdSchema } from "../contracts/connected-partners.js";
import {
  buildConnectedPartnerEmail,
  type PartnerEmailPreview,
} from "../lib/connected-partner-email.js";
import {
  GmailDeliveryOutcomeUnknownError,
  sendGmailMessage,
} from "../lib/gmail-mailer.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { getPartner } from "./connected-partners.repository.js";
import { partnerPublisherStoredAccessKey } from "./publisher-portal-credentials.repository.js";
import {
  PartnerEmailBannerInputSchema,
  partnerBannerAttachment,
  partnerBannerBrand,
  type PartnerEmailBannerInput,
} from "../lib/partner-email-banner.js";

export const PARTNER_EMAIL_SENDS_COLLECTION = "partner_email_sends";
export const PartnerEmailLanguageSchema = z.enum(["es", "en"]);
export const PartnerEmailSendInputSchema = z
  .object({
    language: PartnerEmailLanguageSchema,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    requestId: z.uuid(),
    banner: PartnerEmailBannerInputSchema.optional(),
  })
  .strict();
const StoredSendSchema = PartnerEmailSendInputSchema.omit({ banner: true })
  .extend({
    partnerId: PartnerIdSchema,
    to: z.email(),
    status: z.enum(["sending", "sent", "unknown", "failed"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    sentAt: z.iso.datetime().nullable(),
    requestedByEmail: z.string(),
  })
  .strict();
type StoredSend = z.infer<typeof StoredSendSchema>;
export type PartnerEmailSendResult = Pick<
  StoredSend,
  "status" | "to" | "sentAt" | "requestId"
> & { error?: string };

function requireGodMode(context: AdminContext) {
  if (!context.isBootstrap)
    throw new AdminRepositoryError("GOD MODE access required", 403);
}

function readStored(value: unknown): StoredSend {
  const parsed = StoredSendSchema.safeParse(value);
  if (!parsed.success)
    throw new AdminRepositoryError(
      "The email send record is invalid. Review delivery before starting another send.",
      409,
    );
  return parsed.data;
}

function requireSameRequest(
  record: StoredSend,
  partnerId: string,
  input: z.infer<typeof PartnerEmailSendInputSchema>,
) {
  if (
    record.partnerId !== partnerId ||
    record.previewHash !== input.previewHash ||
    record.language !== input.language ||
    record.requestId !== input.requestId
  )
    throw new AdminRepositoryError(
      "This send belongs to another preview. Check Sent mail before starting another send.",
      409,
    );
}

function result(record: StoredSend): PartnerEmailSendResult {
  const errors = {
    sending:
      "This email send is still in progress. Check its delivery status using the same request.",
    unknown:
      "Email delivery could not be confirmed. Check Sent mail before starting another send. This request will not send the email again.",
    failed:
      "The email was not accepted for delivery. You can retry this same request after checking the mail configuration.",
  };
  return {
    status: record.status,
    to: record.to,
    sentAt: record.sentAt,
    requestId: record.requestId,
    ...(record.status !== "sent" ? { error: errors[record.status] } : {}),
  };
}

export async function previewPartnerEmail(
  context: AdminContext,
  partnerId: string,
  language: "es" | "en" = "es",
  banner?: PartnerEmailBannerInput,
): Promise<PartnerEmailPreview> {
  requireGodMode(context);
  const parsedLanguage = PartnerEmailLanguageSchema.parse(language);
  const partner = await getPartner(context, partnerId);
  const base = buildConnectedPartnerEmail(partner, parsedLanguage);
  if (base.category === "noOrganization") {
    if (banner)
      throw new AdminRepositoryError(
        "This partner does not have a publisher banner.",
        400,
      );
    return base;
  }
  const accessKey = await partnerPublisherStoredAccessKey(context, partner);
  const kind =
    partner.linkedApp?.publisherKind ??
    (partner.linkedOrganization ? "organization" : "individual");
  const publisherId =
    partner.linkedApp?.publisherId ??
    (kind === "organization"
      ? partner.linkedOrganizationId
      : partner.linkedIndividualPublisherId);
  const publisher = await adminDbFor("mydnamap")
    .collection(
      kind === "organization" ? "feed_organizations" : "feed_individuals",
    )
    .doc(publisherId!)
    .get();
  if (!publisher.exists)
    throw new AdminRepositoryError("The linked publisher is unavailable.", 409);
  const data = publisher.data()!;
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : (partner.linkedApp?.publisherName ??
        partner.linkedOrganization?.name ??
        partner.linkedIndividualPublisher!.name);
  const imageUrl = [data.imageUrl, data.imageUploadDataUrl].find(
    (value) =>
      typeof value === "string" &&
      /^(https:\/\/|data:image\/(png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,)/.test(value),
  ) as string | undefined;
  const tint =
    typeof data.colorHex === "string" && /^#?[a-f0-9]{6}$/i.test(data.colorHex)
      ? data.colorHex
      : "#6D28D9";
  const brand = partnerBannerBrand(
    name,
    tint,
    imageUrl ?? "",
    parsedLanguage,
    base.ctaLabel,
  );
  if (banner) {
    banner = PartnerEmailBannerInputSchema.parse(banner);
    if (banner.contextHash !== brand.contextHash)
      throw new AdminRepositoryError(
        "Publisher branding changed. Generate a new email preview.",
        412,
      );
    partnerBannerAttachment(banner);
  }
  const preview = buildConnectedPartnerEmail(
    partner,
    parsedLanguage,
    accessKey ?? undefined,
    { brand, banner },
  );
  return accessKey
    ? preview
    : {
        ...preview,
        accessCodeUnavailableReason:
          "No saved access key matches this recipient. Save the current key in the linked publisher's detail to include it in this link.",
      };
}

export async function sendPartnerEmail(
  context: AdminContext,
  partnerId: string,
  rawInput: z.infer<typeof PartnerEmailSendInputSchema>,
): Promise<PartnerEmailSendResult> {
  requireGodMode(context);
  const input = PartnerEmailSendInputSchema.parse(rawInput);
  const parsedPartnerId = PartnerIdSchema.safeParse(partnerId);
  if (!parsedPartnerId.success)
    throw new AdminRepositoryError("Invalid partner ID", 400);
  const db = adminDbFor("mydnamap");
  const ref = db
    .collection(PARTNER_EMAIL_SENDS_COLLECTION)
    .doc(input.requestId);

  // A replay reads the prior command before loading mutable partner state. A
  // contact edit/deletion cannot turn a status check into another SMTP send.
  const previousSnapshot = await ref.get();
  if (previousSnapshot.exists) {
    const previous = readStored(previousSnapshot.data());
    requireSameRequest(previous, partnerId, input);
    if (previous.status !== "failed") return result(previous);
  }

  let preview: PartnerEmailPreview;
  try {
    preview = await previewPartnerEmail(
      context,
      partnerId,
      input.language,
      input.banner,
    );
  } catch (error) {
    if (error instanceof AdminRepositoryError && error.statusCode === 409)
      throw new AdminRepositoryError(
        "Partner connections changed. Generate a new email preview before sending.",
        412,
      );
    throw error;
  }
  if (preview.bannerBrand && !preview.banner)
    throw new AdminRepositoryError(
      "Generate the app banner before sending this email.",
      412,
    );
  if (preview.previewHash !== input.previewHash)
    throw new AdminRepositoryError(
      "Partner details changed. Generate a new email preview before sending.",
      412,
    );

  const now = new Date().toISOString();
  const reservation = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const existing = readStored(snapshot.data());
      requireSameRequest(existing, partnerId, input);
      if (existing.status !== "failed")
        return { execute: false, record: existing };
      const retry = { ...existing, status: "sending" as const, updatedAt: now };
      transaction.set(ref, retry);
      return { execute: true, record: retry };
    }
    const record: StoredSend = {
      requestId: input.requestId,
      language: input.language,
      previewHash: input.previewHash,
      partnerId,
      to: preview.to,
      status: "sending",
      createdAt: now,
      updatedAt: now,
      sentAt: null,
      requestedByEmail: context.email,
    };
    transaction.create(ref, record);
    return { execute: true, record };
  });
  if (!reservation.execute) return result(reservation.record);

  // Only failures positively known to precede acceptance may be retried.
  // Network loss and Gmail 5xx responses are explicitly indeterminate.
  try {
    await sendGmailMessage({
      to: preview.to,
      subject: preview.subject,
      text: preview.text,
      html: preview.html,
      ...(preview.banner
        ? { inlineAttachments: [partnerBannerAttachment(preview.banner)] }
        : {}),
    });
  } catch (error) {
    const record = {
      ...reservation.record,
      status:
        error instanceof GmailDeliveryOutcomeUnknownError
          ? ("unknown" as const)
          : ("failed" as const),
      updatedAt: new Date().toISOString(),
    };
    try {
      await ref.set(record);
    } catch {
      return result({ ...record, status: "unknown" });
    }
    return result(record);
  }
  const completed: StoredSend = {
    ...reservation.record,
    status: "sent",
    sentAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    await ref.set(completed);
  } catch {
    // Sending succeeded but confirmation persistence failed. The durable
    // reservation remains sending; every replay is check-only and cannot resend.
    return result({ ...completed, status: "unknown", sentAt: null });
  }
  return result(completed);
}
