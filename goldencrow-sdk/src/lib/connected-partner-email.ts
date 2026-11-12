import { createHash } from "node:crypto";
import type {
  Partner,
  PartnerSection,
} from "../contracts/connected-partners.js";
import { ENV } from "../config/env.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import { partnerSection } from "./partner-section.js";
import {
  PARTNER_BANNER_CONTENT_ID,
  type PartnerEmailBannerBrand,
  type PartnerEmailBannerInput,
} from "./partner-email-banner.js";
import {
  PARTNER_EMAIL_COPY,
  type PartnerEmailCopy as Copy,
  type PartnerEmailLanguage,
  type PartnerEmailStage,
  type PartnerEmailTemplateVariant,
} from "./partner-email-copy.js";
export type {
  PartnerEmailLanguage,
  PartnerEmailTemplateVariant,
} from "./partner-email-copy.js";
export type PartnerEmailPreview = {
  partnerId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  ctaLabel: string;
  ctaUrl: string;
  category: PartnerSection;
  language: PartnerEmailLanguage;
  templateVariant: PartnerEmailTemplateVariant;
  previewHash: string;
  accessCodeExpiresAt?: string;
  accessCodeUnavailableReason?: string;
  bannerBrand?: PartnerEmailBannerBrand;
  banner?: PartnerEmailBannerInput;
};

const JOIN_URL = "https://goldencrowvs.com/pocket-genes/join-us/new/";
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function publisherLoginUrl(
  callback: string,
  email: string,
  accessKey?: string,
) {
  const url = new URL(
    "/publisher-portal/login",
    `${ENV.BACKOFFICE_ORIGIN.replace(/\/+$/, "")}/`,
  );
  url.searchParams.set("email", email);
  if (accessKey) url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("callbackUrl", callback);
  return url.toString();
}

function emailCopy(
  partner: Partner,
  category: PartnerSection,
  language: PartnerEmailLanguage,
  templateVariant: PartnerEmailTemplateVariant,
  currentPublisherName?: string,
): Copy {
  const stage: PartnerEmailStage | null =
    category === "noOrganization"
      ? "noOrganization"
      : category === "organizationWithoutApp" || category === "individualWithoutApp"
        ? "withoutApp"
        : category === "freeApp" || category === "individualFreeApp"
          ? "freeApp"
          : category === "contract" || category === "individualContract"
            ? "contract"
            : null;
  if (!stage)
    throw new AdminRepositoryError(
      "Review the partner's missing connections or app status before sending an email.",
      409,
    );
  const values: Record<string, string> = {
    companyName: partner.companyName,
    publisherName:
      currentPublisherName ??
      partner.linkedApp?.publisherName ??
      partner.linkedOrganization?.name ??
      partner.linkedIndividualPublisher?.name ??
      partner.companyName,
  };
  const interpolate = (value: string) =>
    value.replace(/\{(companyName|publisherName)\}/g, (_match, field: string) => values[field]!);
  const copy = PARTNER_EMAIL_COPY[templateVariant][stage][language];
  return {
    ...copy,
    subject: interpolate(copy.subject),
    preheader: interpolate(copy.preheader),
    heading: interpolate(copy.heading),
    lead: interpolate(copy.lead),
    paragraphs: copy.paragraphs.map(interpolate),
    ctaLabel: interpolate(copy.ctaLabel),
    closing: interpolate(copy.closing),
  };
}

export function buildConnectedPartnerEmail(
  partner: Partner,
  language: PartnerEmailLanguage = "es",
  accessKey?: string,
  presentation?: {
    brand: PartnerEmailBannerBrand;
    banner?: PartnerEmailBannerInput;
  },
  templateVariant: PartnerEmailTemplateVariant = 1,
): PartnerEmailPreview {
  const category = partnerSection(partner);
  const copy = emailCopy(
    partner, category, language, templateVariant, presentation?.brand.name,
  );
  const ctaUrl = copy.callback
    ? publisherLoginUrl(copy.callback, partner.email, accessKey)
    : JOIN_URL;
  const greeting =
    language === "es"
      ? partner.firstName.trim() ? `Hola ${partner.firstName.trim()},` : "Hola,"
      : partner.firstName.trim() ? `Hi ${partner.firstName.trim()},` : "Hi,";
  const signature =
    language === "es" ? "Equipo Pocket Genes" : "The Pocket Genes team";
  const closing = [copy.closing, signature].filter(Boolean).join("\n\n");
  const bannerHtml = presentation?.banner
    ? `<div style="margin:0 0 24px;"><a href="${escapeHtml(ctaUrl)}" style="display:block;text-decoration:none;"><img src="cid:${PARTNER_BANNER_CONTENT_ID}" width="600" alt="${escapeHtml(language === "es" ? `Así podría verse la app de ${presentation.brand.name}` : `See what ${presentation.brand.name}’s app could look like`)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:14px;"></a></div>`
    : "";
  const ctaHtml = `<a href="${escapeHtml(ctaUrl)}" class="pg-email-cta" style="display:block;max-width:100%;box-sizing:border-box;text-align:center;overflow-wrap:break-word;background:#6f3cc3;color:#ffffff;text-decoration:none;border-radius:12px;padding:22px 24px;font-size:17px;line-height:24px;font-weight:800;">${escapeHtml(copy.ctaLabel)}</a>`;
  const text = [
    greeting,
    "",
    copy.heading,
    "",
    copy.lead,
    "",
    ...copy.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    `${copy.ctaLabel}: ${ctaUrl}`,
    "",
    closing,
  ].join("\n");
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
@media only screen and (max-width:480px) {
  .pg-email-outer { padding:20px 8px !important; }
  .pg-email-header, .pg-email-content { padding:28px 24px !important; }
  .pg-email-title { font-size:28px !important; line-height:34px !important; }
}
</style></head><body style="margin:0;padding:0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f8f7ff;font-family:Arial,Helvetica,sans-serif;color:#111827;"><tr><td class="pg-email-outer" align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;table-layout:fixed;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e7e5ff;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(86,50,164,0.14);"><tr><td class="pg-email-header" style="background:#2d1b69;padding:36px 40px;overflow-wrap:break-word;word-wrap:break-word;"><div style="font-size:13px;line-height:18px;letter-spacing:0.26em;text-transform:uppercase;font-weight:800;color:#d8c9ff;">Pocket Genes</div><div class="pg-email-title" style="margin-top:16px;font-size:36px;line-height:42px;font-weight:800;color:#ffffff;">${escapeHtml(copy.heading)}</div></td></tr>
<tr><td class="pg-email-content" style="padding:40px;background:#ffffff;overflow-wrap:break-word;word-wrap:break-word;"><p style="margin:0 0 24px;font-size:20px;line-height:30px;color:#111827;">${escapeHtml(greeting)}</p><p style="margin:0 0 28px;font-size:22px;line-height:32px;font-weight:800;color:#111827;">${escapeHtml(copy.lead)}</p>
${bannerHtml}${presentation?.banner ? `<div style="margin:0 0 28px;">${ctaHtml}</div>` : ""}
${copy.paragraphs.map((paragraph) => `<p style="margin:0 0 24px;font-size:18px;line-height:30px;color:#4b5563;">${escapeHtml(paragraph)}</p>`).join("\n")}
${!presentation?.banner || copy.paragraphs.length ? ctaHtml : ""}
<p style="margin:28px 0 0;font-size:16px;line-height:26px;color:#6b7280;">${escapeHtml(closing).replace(/\n/g, "<br>")}</p></td></tr></table></td></tr></table></body></html>`;
  const content = {
    partnerId: partner.id,
    to: partner.email,
    subject: copy.subject,
    text,
    html,
    ctaLabel: copy.ctaLabel,
    ctaUrl,
    category,
    language,
    templateVariant,
  };
  // Bind both exact rendered content and current publisher/app identity. Historical
  // snapshots cannot authorize an email or decide which stage it describes.
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        content,
        linkedOrganization: partner.linkedOrganization,
        linkedIndividualPublisher: partner.linkedIndividualPublisher,
        linkedApp: partner.linkedApp,
        bannerBrand: presentation?.brand,
        bannerDigest: presentation?.banner
          ? createHash("sha256")
              .update(presentation.banner.dataUrl)
              .digest("hex")
          : undefined,
      }),
    )
    .digest("hex");
  return {
    ...content,
    previewHash,
    ...(presentation
      ? {
          bannerBrand: presentation.brand,
          ...(presentation.banner ? { banner: presentation.banner } : {}),
        }
      : {}),
  };
}
