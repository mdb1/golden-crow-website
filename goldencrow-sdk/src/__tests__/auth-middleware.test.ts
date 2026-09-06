import {
  isPatientPortalSdkPath,
  isPGFlexSdkPath,
  isPublisherPortalSdkPath,
} from "../middleware/auth.js";

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({})),
}));

jest.mock("../repositories/roles.repository.js", () => ({
  resolveAdminContext: jest.fn(),
}));

describe("auth middleware", () => {
  it("allows patient portal sessions to complete patient profile setup", () => {
    expect(isPatientPortalSdkPath("/auth/profile-setup/patient")).toBe(true);
  });

  it("allows PGFlex sessions to manage only PGFlex logistics and account setup paths", () => {
    expect(isPGFlexSdkPath("/pgflex/logistics")).toBe(true);
    expect(isPGFlexSdkPath("/pgflex/logistics/dispatch-1")).toBe(true);
    expect(isPGFlexSdkPath("/auth/my-account")).toBe(true);
    expect(isPGFlexSdkPath("/auth/profile-setup")).toBe(true);
    expect(isPGFlexSdkPath("/auth/profile-setup/pgflex")).toBe(true);
    expect(isPGFlexSdkPath("/roles")).toBe(false);
  });

  it("allows publisher portal sessions to manage account setup and scoped Discover paths only", () => {
    expect(isPublisherPortalSdkPath("/auth/my-account")).toBe(true);
    expect(isPublisherPortalSdkPath("/auth/profile-setup")).toBe(true);
    expect(isPublisherPortalSdkPath("/auth/profile-setup/publisher")).toBe(
      true,
    );
    expect(isPublisherPortalSdkPath("/discover/organizations")).toBe(true);
    expect(isPublisherPortalSdkPath("/discover/organizations/org-1")).toBe(
      true,
    );
    expect(isPublisherPortalSdkPath("/discover/feed-items/feed-1")).toBe(true);
    expect(isPublisherPortalSdkPath("/roles")).toBe(false);
    expect(
      isPublisherPortalSdkPath(
        "/discover/organizations/org-1/submission-evaluation",
      ),
    ).toBe(false);
  });
});
