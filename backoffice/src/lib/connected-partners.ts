import type { PublisherAppStatus } from "@/lib/publisher-app-config";

export const PARTNERS_API_ROUTE = "/admin/connected-partners";
export const PARTNERS_ROUTE = "/god-mode/partners";
export const PARTNERS_QUERY_KEY = ["connected-partners"] as const;
export const PARTNER_PAGE_SIZE = 20;

export type PartnerInput = {
  companyName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  meetingDate: string | null;
  notes: string | null;
  linkedOrganizationId: string | null;
  linkedIndividualPublisherId: string | null;
  linkedAppId: string | null;
};

export type PartnerOrganizationSnapshot = { id: string; name: string };
export type PartnerIndividualPublisherSnapshot = { id: string; name: string };
export type PartnerAppSnapshot = {
  id: string;
  publisherKind: "organization" | "individual";
  publisherId: string;
  publisherName: string;
  status: PublisherAppStatus;
  appProviderIdentifier?: string;
};
export type Partner = PartnerInput & {
  id: string;
  linkedOrganizationSnapshot: PartnerOrganizationSnapshot | null;
  linkedIndividualPublisherSnapshot: PartnerIndividualPublisherSnapshot | null;
  linkedAppSnapshot: PartnerAppSnapshot | null;
  linkedOrganization: PartnerOrganizationSnapshot | null;
  linkedIndividualPublisher: PartnerIndividualPublisherSnapshot | null;
  linkedApp: PartnerAppSnapshot | null;
};
export type PartnersPage = { items: Partner[]; nextCursor: string | null };
export function partnerContactName(
  partner: Pick<PartnerInput, "firstName" | "lastName">,
) {
  return [partner.firstName.trim(), partner.lastName.trim()]
    .filter(Boolean)
    .join(" ");
}
export type PartnerSectionPage = PartnersPage & { scanIncomplete: boolean };
export type PartnerLinkOption = {
  id: string;
  name: string;
  publisherKind?: "organization" | "individual";
  publisherId?: string;
  status?: PublisherAppStatus;
  appProviderIdentifier?: string;
};
export type PartnerLinkOptionsPage = {
  items: PartnerLinkOption[];
  nextCursor: string | null;
};

export const PARTNER_SECTIONS = [
  { key: "noOrganization", label: "No organization yet" },
  { key: "organizationWithoutApp", label: "Without app" },
  { key: "freeApp", label: "With free app" },
  { key: "contract", label: "With contract" },
] as const;
export const PARTNER_INDIVIDUAL_SECTIONS = [
  { key: "individualWithoutApp", label: "Without app" },
  { key: "individualFreeApp", label: "With free app" },
  { key: "individualContract", label: "With contract" },
] as const;
export type PartnerSection =
  | (typeof PARTNER_SECTIONS)[number]["key"]
  | (typeof PARTNER_INDIVIDUAL_SECTIONS)[number]["key"]
  | "other";

export function partnerSection(partner: Partner): PartnerSection {
  const organizationId = partner.linkedOrganizationId;
  const individualId = partner.linkedIndividualPublisherId;
  if (!organizationId && !individualId && !partner.linkedAppId)
    return "noOrganization";
  if (organizationId && partner.linkedOrganization?.id !== organizationId)
    return "other";
  if (individualId && partner.linkedIndividualPublisher?.id !== individualId)
    return "other";
  if (!partner.linkedAppId)
    return organizationId ? "organizationWithoutApp" : "individualWithoutApp";
  const app = partner.linkedApp;
  if (!app || app.id !== partner.linkedAppId)
    return "other";
  const ownerId = app.publisherKind === "organization" ? organizationId : individualId;
  if (!ownerId || app.publisherId !== ownerId)
    return "other";
  if (app.status === "active_for_testing")
    return organizationId ? "freeApp" : "individualFreeApp";
  if (app.status === "active" || app.status.startsWith("active_"))
    return organizationId ? "contract" : "individualContract";
  return "other";
}
