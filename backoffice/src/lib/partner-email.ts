import type { PartnerSection } from "@/lib/connected-partners";

export type PartnerEmailLanguage = "es" | "en";
export type PartnerEmailBannerBrand = {
  name: string;
  tint: string;
  imageUrl: string;
  contextHash: string;
};
export type PartnerEmailBannerInput = { contextHash: string; dataUrl: string };

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
  previewHash: string;
  accessCodeExpiresAt?: string;
  accessCodeUnavailableReason?: string;
  bannerBrand?: PartnerEmailBannerBrand;
  banner?: PartnerEmailBannerInput;
};

export type PartnerEmailSendInput = {
  language: PartnerEmailLanguage;
  previewHash: string;
  requestId: string;
  banner?: PartnerEmailBannerInput;
};

export type PartnerEmailSendResult = {
  status: "sent" | "sending" | "unknown" | "failed";
  to: string;
  sentAt: string | null;
  requestId: string;
  error?: string;
};

// Preserve the email's exact presentation while making this a read-only preview.
// The empty iframe sandbox also blocks scripts, forms and top-level navigation.
export function partnerEmailPreviewDocument(
  html: string,
  banner?: PartnerEmailBannerInput,
) {
  const withImage =
    banner &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(banner.dataUrl)
      ? html.replaceAll('src="cid:partner-publisher-app-banner"', `src="${banner.dataUrl}"`)
      : html;
  const readOnlyHtml = withImage.replace(/<a\b[^>]*>/gi, (anchor) =>
    anchor.replace(/\shref(?=\s*=)/gi, " data-preview-href"),
  );
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>html{color-scheme:light}body{margin:0}a{cursor:default!important}</style></head><body>${readOnlyHtml}</body></html>`;
}
