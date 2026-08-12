import {
  buildPatientProfileSetupInput,
  buildPatientUsername,
} from "../repositories/profile-setup.repository.js";

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({})),
  adminDbFor: jest.fn(() => ({})),
}));

describe("patient profile setup", () => {
  it("adds an exact three-digit suffix to the existing username suggestion", () => {
    expect(buildPatientUsername("paciente@example.com", 123)).toBe(
      "paciente123",
    );
    expect(buildPatientUsername("patient@example.com", 7)).toBe("patient007");
  });

  it("keeps generated usernames within the profile limit", () => {
    expect(
      buildPatientUsername("this-is-a-very-long-patient-email@example.com", 456),
    ).toMatch(/^[a-z0-9._-]{3,32}$/);
    expect(
      buildPatientUsername("this-is-a-very-long-patient-email@example.com", 456),
    ).toHaveLength(32);
  });

  it("uses the patient name and leaves every professional field empty", () => {
    expect(
      buildPatientProfileSetupInput(
        "paciente@example.com",
        "Paciente Ejemplo",
        123,
      ),
    ).toEqual({
      fullName: "Paciente Ejemplo",
      username: "paciente123",
      iconName: "person.crop.circle.fill",
      iconColorHex: "#5A4FCF",
      ownerProfession: "",
      ownerCompany: "",
      ownerContactNumber: "",
      ownerBio: "",
      gender: "",
      condition: "",
    });
  });
});
