import type { PublisherAppStatus } from "@/lib/publisher-app-config";

export const PARTNERS_API_ROUTE = "/admin/connected-partners";
export const PARTNERS_ROUTE = "/god-mode/partners";
export const PARTNERS_QUERY_KEY = ["connected-partners"] as const;

export type PartnerInput = {
  companyName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  meetingDate: string | null;
  notes: string | null;
  linkedOrganizationId: string | null;
  linkedAppId: string | null;
};

export type PartnerOrganizationSnapshot = { id: string; name: string };
export type PartnerAppSnapshot = {
  id: string;
  publisherId: string;
  publisherName: string;
  status: PublisherAppStatus;
};
export type Partner = PartnerInput & {
  id: string;
  linkedOrganizationSnapshot: PartnerOrganizationSnapshot | null;
  linkedAppSnapshot: PartnerAppSnapshot | null;
  linkedOrganization: PartnerOrganizationSnapshot | null;
  linkedApp: PartnerAppSnapshot | null;
};
export type PartnersPage = { items: Partner[]; nextCursor: string | null };
export type PartnerLinkOption = {
  id: string;
  name: string;
  publisherId?: string;
  status?: PublisherAppStatus;
};
export type PartnerLinkOptionsPage = {
  items: PartnerLinkOption[];
  nextCursor: string | null;
};

export const PARTNER_SECTIONS = [
  { key: "noOrganization", label: "No organization yet" },
  { key: "organizationWithoutApp", label: "Organization without app" },
  { key: "freeApp", label: "Organization with free app" },
  { key: "contract", label: "Organization with contract" },
] as const;
export type PartnerSection = (typeof PARTNER_SECTIONS)[number]["key"] | "other";

export function partnerSection(partner: Partner): PartnerSection {
  if (!partner.linkedOrganizationId && !partner.linkedAppId)
    return "noOrganization";
  if (partner.linkedOrganization?.id !== partner.linkedOrganizationId)
    return "other";
  if (!partner.linkedAppId) return "organizationWithoutApp";
  const app = partner.linkedApp;
  if (
    app?.id !== partner.linkedAppId ||
    app.publisherId !== partner.linkedOrganizationId
  )
    return "other";
  if (app.status === "active_for_testing") return "freeApp";
  if (app.status === "active" || app.status.startsWith("active_"))
    return "contract";
  return "other";
}
