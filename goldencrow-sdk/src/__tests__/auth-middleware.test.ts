import { isPatientPortalSdkPath, isPGFlexSdkPath } from "../middleware/auth.js";

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
    expect(isPGFlexSdkPath("/roles")).toBe(false);
  });
});
