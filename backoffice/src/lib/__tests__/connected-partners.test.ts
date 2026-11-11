import {
  partnerSection,
  type Partner,
  type PartnerAppSnapshot,
} from "@/lib/connected-partners";

const partner: Partner = {
  id: "partner",
  companyName: "Genome Studio",
  firstName: "Ada",
  lastName: "Rivera",
  phoneNumber: "",
  email: "ada@example.com",
  meetingDate: null,
  notes: null,
  linkedOrganizationId: null,
  linkedIndividualPublisherId: null,
  linkedAppId: null,
  linkedOrganizationSnapshot: null,
  linkedIndividualPublisherSnapshot: null,
  linkedAppSnapshot: null,
  linkedOrganization: null,
  linkedIndividualPublisher: null,
  linkedApp: null,
};
const organization = { id: "org", name: "Genome Studio" };
const individual = { id: "individual", name: "Ada Rivera" };

function linkedApp(
  publisherKind: PartnerAppSnapshot["publisherKind"],
  status: PartnerAppSnapshot["status"],
): Partner {
  return {
    ...partner,
    ...(publisherKind === "organization"
      ? { linkedOrganizationId: organization.id, linkedOrganization: organization }
      : { linkedIndividualPublisherId: individual.id, linkedIndividualPublisher: individual }),
    linkedAppId: "app",
    linkedApp: {
      id: "app",
      publisherKind,
      publisherId: publisherKind === "organization" ? organization.id : individual.id,
      publisherName: "Genome Studio",
      status,
    },
  };
}

it("distinguishes prospects from linked individual and organization publishers without apps", () => {
  expect(partnerSection(partner)).toBe("noOrganization");
  expect(partnerSection({
    ...partner, linkedIndividualPublisherId: individual.id, linkedIndividualPublisher: individual,
  })).toBe("individualWithoutApp");
  expect(partnerSection({
    ...partner, linkedOrganizationId: organization.id, linkedOrganization: organization,
    linkedIndividualPublisherId: individual.id, linkedIndividualPublisher: individual,
  })).toBe("organizationWithoutApp");
});

it.each(["organization", "individual"] as const)("groups %s apps by their current status", (kind) => {
  expect(partnerSection(linkedApp(kind, "active_for_testing")))
    .toBe(kind === "organization" ? "freeApp" : "individualFreeApp");
  for (const status of ["active", "active_waiting_for_payment", "active_waiting_for_upload"] as const) {
    expect(partnerSection(linkedApp(kind, status)))
      .toBe(kind === "organization" ? "contract" : "individualContract");
  }
  expect(partnerSection(linkedApp(kind, "pending_revision"))).toBe("other");
});

it("supports both publisher links and checks the app's actual owner kind", () => {
  const both = {
    ...linkedApp("individual", "active_for_testing"),
    linkedOrganizationId: organization.id,
    linkedOrganization: organization,
  };
  expect(partnerSection(both)).toBe("freeApp");
  expect(partnerSection({ ...both, linkedApp: { ...both.linkedApp!, publisherId: "wrong" } }))
    .toBe("other");
  expect(partnerSection({ ...both, linkedIndividualPublisher: null })).toBe("other");
});

it("never treats historical snapshots as current links or app status", () => {
  const active = linkedApp("individual", "active");
  expect(partnerSection({
    ...active,
    linkedAppSnapshot: active.linkedApp,
    linkedApp: { ...active.linkedApp!, status: "active_for_testing" },
  })).toBe("individualFreeApp");
  expect(partnerSection({ ...active, linkedAppSnapshot: active.linkedApp, linkedApp: null })).toBe("other");
  expect(partnerSection({ ...active, linkedIndividualPublisherSnapshot: individual, linkedIndividualPublisher: null }))
    .toBe("other");
});
