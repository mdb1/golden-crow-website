import { createHash } from "node:crypto";
import { z } from "zod";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import type { GmailInlineAttachmentInput } from "./gmail-mailer.js";

export const PARTNER_BANNER_CONTENT_ID = "partner-publisher-app-banner";
// Match the display-name rule used by PublisherAppPromoBanner in backoffice.
const ORGANIZATION_NAME_DIVIDER =
  /[,.;:|/\\_~=*•·‧⋅∙‣…()[\]{}\p{Dash_Punctuation}−，．、。；：｜／]/u;

export function partnerEmailDisplayName(
  name: string,
  publisherKind: "organization" | "individual" = "organization",
) {
  if (publisherKind === "individual") return name.trim() || "Tu marca";
  return name.split(ORGANIZATION_NAME_DIVIDER, 1)[0]?.trim() ||
    name.trim() || "Tu marca";
}

export const PartnerEmailBannerInputSchema = z
  .object({
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    dataUrl: z
      .string()
      .max(750000)
      .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type PartnerEmailBannerInput = z.infer<
  typeof PartnerEmailBannerInputSchema
>;
export type PartnerEmailBannerBrand = {
  name: string;
  tint: string;
  imageUrl: string;
  contextHash: string;
};

export function partnerBannerBrand(
  name: string,
  tint: string,
  imageUrl: string,
  language: string,
  ctaLabel: string,
  publisherKind: "organization" | "individual" = "organization",
): PartnerEmailBannerBrand {
  const brand = { name: partnerEmailDisplayName(name, publisherKind), tint, imageUrl };
  const contextHash = createHash("sha256")
    .update(
      JSON.stringify({
        renderer: "publisher-portal-atomic-v3",
        sourceName: name,
        publisherKind,
        ...brand,
        language,
        ctaLabel,
      }),
    )
    .digest("hex");
  return { ...brand, contextHash };
}

export function partnerBannerAttachment(
  banner: PartnerEmailBannerInput,
): GmailInlineAttachmentInput {
  const contentBase64 = banner.dataUrl.slice("data:image/jpeg;base64,".length);
  const bytes = Buffer.from(contentBase64, "base64");
  const invalid = () =>
    new AdminRepositoryError(
      "The app banner is invalid. Generate a new email preview.",
      400,
    );
  if (
    bytes.length < 256 ||
    bytes.toString("base64") !== contentBase64 ||
    bytes.readUInt16BE(0) !== 0xffd8 ||
    bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
  )
    throw invalid();
  // Canvas emits baseline/progressive JPEG. Bound its actual frame, rather than
  // trusting client-provided dimensions or accepting a decompression-sized image.
  let validFrame = false;
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) throw invalid();
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) throw invalid();
    if (marker === 0xc0 || marker === 0xc2) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      validFrame = width === 1024 && height >= 500 && height <= 1000;
      break;
    }
    if (marker === 0xda || marker === 0xd9) break;
    offset += length + 2;
  }
  if (!validFrame) throw invalid();
  return {
    contentId: PARTNER_BANNER_CONTENT_ID,
    filename: "your-publisher-app.jpg",
    mimeType: "image/jpeg",
    contentBase64,
  };
}
