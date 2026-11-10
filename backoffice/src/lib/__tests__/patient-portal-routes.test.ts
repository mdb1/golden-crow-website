import {
  normalizePatientPortalCallbackUrl,
  PATIENT_PORTAL_ENTRY_ROUTE,
} from "@/lib/patient-portal-routes";

describe("patient portal routes", () => {
  it("routes portal entry points and legacy home callbacks to consents", () => {
    expect(normalizePatientPortalCallbackUrl("/patient-portal")).toBe(
      PATIENT_PORTAL_ENTRY_ROUTE,
    );
    expect(normalizePatientPortalCallbackUrl("/patient-portal/")).toBe(
      PATIENT_PORTAL_ENTRY_ROUTE,
    );
    expect(normalizePatientPortalCallbackUrl("/patient-portal/home")).toBe(
      PATIENT_PORTAL_ENTRY_ROUTE,
    );
    expect(
      normalizePatientPortalCallbackUrl("/patient-portal/home?from=login"),
    ).toBe(PATIENT_PORTAL_ENTRY_ROUTE);
  });

  it("preserves valid patient portal deep links and rejects unsafe callbacks", () => {
    expect(normalizePatientPortalCallbackUrl("/patient-portal/consents")).toBe(
      "/patient-portal/consents",
    );
    const invitation = "/patient-portal/consents/new?studyRequestFormId=FORM-101";
    expect(normalizePatientPortalCallbackUrl(invitation)).toBe(invitation);
    expect(normalizePatientPortalCallbackUrl("/patient-portal/%2e%2e/login")).toBeUndefined();
    expect(normalizePatientPortalCallbackUrl("/patient-portal/complete-profile?callbackUrl=x")).toBeUndefined();
    expect(normalizePatientPortalCallbackUrl("/patient-portal/login")).toBe(
      undefined,
    );
    expect(normalizePatientPortalCallbackUrl("/2pq-dashboard")).toBe(undefined);
    expect(normalizePatientPortalCallbackUrl("//patient-portal/consents")).toBe(
      undefined,
    );
    expect(
      normalizePatientPortalCallbackUrl("/patient-portal/consents\\evil"),
    ).toBe(undefined);
  });
});
