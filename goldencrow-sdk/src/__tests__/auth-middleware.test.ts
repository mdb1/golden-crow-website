import { isPatientPortalSdkPath } from "../middleware/auth.js";

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
});
