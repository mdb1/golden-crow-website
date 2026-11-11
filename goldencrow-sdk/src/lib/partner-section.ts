import type {
  Partner,
  PartnerSection,
} from "../contracts/connected-partners.js";

// Classification always uses the current directly linked records. Historical
// snapshots are display context and cannot establish identity or app status.
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
  if (!app || app.id !== partner.linkedAppId) return "other";
  const ownerId =
    app.publisherKind === "organization" ? organizationId : individualId;
  if (!ownerId || app.publisherId !== ownerId) return "other";
  if (app.status === "active_for_testing")
    return organizationId ? "freeApp" : "individualFreeApp";
  if (app.status === "active" || app.status.startsWith("active_"))
    return organizationId ? "contract" : "individualContract";
  return "other";
}

// Visible app stages combine organization and individual publishers. Keep the
// granular classification unchanged for email content and scoped API filters.
const SHARED_SECTION_COUNTERPARTS: Partial<
  Record<PartnerSection, PartnerSection>
> = {
  organizationWithoutApp: "individualWithoutApp",
  freeApp: "individualFreeApp",
  contract: "individualContract",
};

export function partnerMatchesSection(
  partner: Partner,
  selected: PartnerSection,
): boolean {
  const category = partnerSection(partner);
  return (
    category === selected || category === SHARED_SECTION_COUNTERPARTS[selected]
  );
}
