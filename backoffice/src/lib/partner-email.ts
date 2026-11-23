import { PARTNERS_QUERY_KEY, type PartnerSection } from "@/lib/connected-partners";

export const PARTNER_EMAIL_HISTORY_QUERY_KEY = [...PARTNERS_QUERY_KEY, "email-history"] as const;

export type PartnerEmailLanguage = "es" | "en";
// Persisted IDs remain stable when the displayed template order changes.
export const PARTNER_EMAIL_TEMPLATE_OPTIONS = [
  { key: 3, label: "Template 1", detail: "Simple and clear" },
  { key: 1, label: "Template 2", detail: "More detail" },
  { key: 2, label: "Template 3", detail: "Short and direct" },
] as const;
export const PARTNER_MEETING_TEMPLATE_GROUPS = [
  {
    label: "Getting started and support",
    options: [
      { key: 4, label: "Publish your first note" },
      { key: 5, label: "Launch your first service" },
      { key: 6, label: "Prepare your app for the stores" },
      { key: 7, label: "Add your professional directory for free" },
      { key: 8, label: "Send notifications from your own app" },
      { key: 3, label: "Support consultation" },
    ],
  },
  {
    label: "Guided walkthroughs",
    options: [
      { key: 9, label: "Send personalized lessons to students" },
      { key: 10, label: "Run a mobile survey" },
      { key: 11, label: "Build an interactive lesson" },
      { key: 12, label: "Create an interactive patient guide" },
      { key: 13, label: "Design an interactive report for clients" },
      { key: 1, label: "Portal walkthrough" },
    ],
  },
  {
    label: "Follow-up sessions",
    options: [
      { key: 14, label: "Turn a recurring question into a note" },
      { key: 15, label: "Improve an existing service listing" },
      { key: 16, label: "Review survey responses" },
      { key: 17, label: "Announce a release with a notification" },
      { key: 18, label: "Review an interactive report" },
      { key: 2, label: "Follow-up meeting" },
    ],
  },
] as const;
export type PartnerEmailTemplateVariant =
  | (typeof PARTNER_EMAIL_TEMPLATE_OPTIONS)[number]["key"]
  | (typeof PARTNER_MEETING_TEMPLATE_GROUPS)[number]["options"][number]["key"];
export const DEFAULT_PARTNER_EMAIL_TEMPLATE_VARIANT =
  PARTNER_EMAIL_TEMPLATE_OPTIONS[0].key;
export type PartnerEmailBannerBrand = {
  name: string;
  tint: string;
  imageUrl: string;
  contextHash: string;
};
export type PartnerEmailBannerInput = { contextHash: string; dataUrl: string };
export type PartnerMeetingSlot = { date: string; startTime: string };

export type PartnerEmailPreview = {
  partnerId: string;
  partnerName: string;
  from: string;
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
  meetingSlot?: PartnerMeetingSlot;
  accessCodeExpiresAt?: string;
  accessCodeUnavailableReason?: string;
  bannerBrand?: PartnerEmailBannerBrand;
  banner?: PartnerEmailBannerInput;
};

export type PartnerEmailSendInput = {
  language: PartnerEmailLanguage;
  templateVariant: PartnerEmailTemplateVariant;
  previewHash: string;
  requestId: string;
  purpose?: "meetingInvitation";
  meetingSlot?: PartnerMeetingSlot;
  banner?: PartnerEmailBannerInput;
};

export type PartnerEmailSendResult = {
  status: "sent" | "sending" | "unknown" | "failed";
  to: string;
  sentAt: string | null;
  requestId: string;
  error?: string;
};

export type PartnerEmailHistoryRecord = {
  requestId: string;
  partnerId: string;
  partnerName: string | null;
  from: string | null;
  to: string;
  subject: string | null;
  category: PartnerSection | null;
  language: PartnerEmailLanguage;
  templateVariant: PartnerEmailTemplateVariant | null;
  purpose?: "meetingInvitation";
  status: PartnerEmailSendResult["status"];
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  requestedByEmail: string;
  messageAvailable: boolean;
  accessKeyOmitted: boolean;
  messageText?: string | null;
};
export function partnerHistoryTemplateLabel(email: PartnerEmailHistoryRecord) {
  if (email.purpose === "meetingInvitation") {
    for (const group of PARTNER_MEETING_TEMPLATE_GROUPS) {
      const template = group.options.find((option) => option.key === email.templateVariant);
      if (template) return template.label;
    }
    return undefined;
  }
  return PARTNER_EMAIL_TEMPLATE_OPTIONS.find((option) => option.key === email.templateVariant)?.label;
}

export type PartnerEmailHistoryPage = {
  emails: PartnerEmailHistoryRecord[];
  nextCursor: string | null;
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
