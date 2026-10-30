import {
  canAccessBackoffice,
  canAccessPatientPortal,
  canAccessPGFlex,
  canAccessPublisherPortal,
  canAccessSurface,
} from "../lib/access-surfaces.js";

describe("access surfaces", () => {
  it("grants 2PQ admins the same backoffice surface as full admins", () => {
    const twoPQAdminRole = {
      role: "2pq_admin" as const,
      isActive: true,
      canAccessPatientPortal: false,
    };

    expect(canAccessBackoffice(twoPQAdminRole)).toBe(true);
    expect(canAccessPatientPortal(twoPQAdminRole)).toBe(false);
    expect(canAccessPGFlex(twoPQAdminRole)).toBe(false);
    expect(canAccessPublisherPortal(twoPQAdminRole)).toBe(false);
    expect(canAccessSurface("backoffice", twoPQAdminRole)).toBe(true);
  });

  it("keeps patient roles out of both surfaces by default", () => {
    const patientRole = {
      role: "patient" as const,
      isActive: true,
      canAccessPatientPortal: false,
    };

    expect(canAccessBackoffice(patientRole)).toBe(false);
    expect(canAccessPatientPortal(patientRole)).toBe(false);
    expect(canAccessPGFlex(patientRole)).toBe(false);
    expect(canAccessPublisherPortal(patientRole)).toBe(false);
  });

  it("grants only the patient portal when explicitly enabled", () => {
    const patientRole = {
      role: "patient" as const,
      isActive: true,
      canAccessPatientPortal: true,
    };

    expect(canAccessBackoffice(patientRole)).toBe(false);
    expect(canAccessPatientPortal(patientRole)).toBe(true);
    expect(canAccessPGFlex(patientRole)).toBe(false);
    expect(canAccessPublisherPortal(patientRole)).toBe(false);
  });

  it("keeps backoffice and patient portal access mutually exclusive", () => {
    const patientRole = {
      role: "patient" as const,
      isActive: true,
      canAccessPatientPortal: true,
    };

    expect(canAccessBackoffice(patientRole, true)).toBe(true);
    expect(canAccessPatientPortal(patientRole, true)).toBe(false);
    expect(canAccessPGFlex(patientRole, true)).toBe(false);
    expect(canAccessPublisherPortal(patientRole, true)).toBe(false);
  });

  it("never gives an admin role patient portal access", () => {
    const doctorRole = {
      role: "institution_doctor" as const,
      isActive: true,
      canAccessPatientPortal: true,
    };

    expect(canAccessBackoffice(doctorRole)).toBe(true);
    expect(canAccessPatientPortal(doctorRole)).toBe(false);
    expect(canAccessPGFlex(doctorRole)).toBe(false);
    expect(canAccessPublisherPortal(doctorRole)).toBe(false);
  });

  it("keeps transport dispatchers out of backoffice and inside PGFlex", () => {
    const dispatcherRole = {
      role: "transport_dispatcher" as const,
      isActive: true,
      canAccessPatientPortal: false,
    };

    expect(canAccessBackoffice(dispatcherRole)).toBe(false);
    expect(canAccessPatientPortal(dispatcherRole)).toBe(false);
    expect(canAccessPGFlex(dispatcherRole)).toBe(true);
    expect(canAccessPublisherPortal(dispatcherRole)).toBe(false);
    expect(canAccessSurface("pgflex", dispatcherRole)).toBe(true);
    expect(canAccessSurface("backoffice", dispatcherRole)).toBe(false);
  });

  it("keeps Discover publishers out of backoffice and inside the publisher portal", () => {
    const publisherRole = {
      role: "organization_publisher" as const,
      isActive: true,
      canAccessPatientPortal: false,
      organizationId: "org-1",
    };

    expect(canAccessBackoffice(publisherRole)).toBe(false);
    expect(canAccessPatientPortal(publisherRole)).toBe(false);
    expect(canAccessPGFlex(publisherRole)).toBe(false);
    expect(canAccessPublisherPortal(publisherRole)).toBe(true);
    expect(canAccessSurface("publisher-portal", publisherRole)).toBe(true);
    expect(canAccessSurface("backoffice", publisherRole)).toBe(false);
  });

  it("keeps valid publisher access when the same email is allowlisted for backoffice", () => {
    const publisherRole = {
      role: "individual_publisher" as const,
      isActive: true,
      canAccessPatientPortal: false,
      individualId: "individual-1",
    };

    expect(canAccessBackoffice(publisherRole, true)).toBe(true);
    expect(canAccessPublisherPortal(publisherRole, true)).toBe(true);
    expect(canAccessSurface("publisher-portal", publisherRole, true)).toBe(
      true,
    );
  });

  it("rejects publisher roles that are not linked to their publisher entity", () => {
    const unscopedPublisherRole = {
      role: "organization_publisher" as const,
      isActive: true,
      canAccessPatientPortal: false,
    };

    expect(canAccessPublisherPortal(unscopedPublisherRole)).toBe(false);
  });
});
