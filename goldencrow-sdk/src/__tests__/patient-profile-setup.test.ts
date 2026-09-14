import {
  buildPatientProfileSetupInput,
  buildPatientUsername,
  buildProfileSetupUsername,
  buildPublisherProfileSetupInput,
  buildTransportDispatcherProfileSetupInput,
} from "../repositories/profile-setup.repository.js";

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({})),
  adminDbFor: jest.fn(() => ({})),
}));

describe("patient profile setup", () => {
  it("builds the automatic profile username from the email by default", () => {
    expect(
      buildProfileSetupUsername("Federico.Example@example.com", 12345),
    ).toBe("federico.example-example-12345");
    expect(buildProfileSetupUsername("a@example.com", 12345)).toBe(
      "a-example-12345",
    );
    expect(buildProfileSetupUsername("info@medicgen.com", 12345)).toBe(
      "info-medicgen-12345",
    );
  });

  it("adds a bounded five-digit numeric suffix to automatic profile usernames", () => {
    expect(buildProfileSetupUsername("member@example.com", 7)).toBe(
      "member-example-00007",
    );
    expect(buildProfileSetupUsername("member@example.com", 120000)).toBe(
      "member-example-99999",
    );
  });

  it("adds an exact five-digit suffix to the existing username suggestion", () => {
    expect(buildPatientUsername("paciente@example.com", 123)).toBe(
      "paciente-example-00123",
    );
    expect(buildPatientUsername("patient@example.com", 7)).toBe(
      "patient-example-00007",
    );
  });

  it("keeps generated usernames within the profile limit", () => {
    expect(
      buildPatientUsername(
        "this-is-a-very-long-patient-email@example.com",
        456,
      ),
    ).toMatch(/^[a-z0-9._-]{3,32}$/);
    expect(
      buildPatientUsername(
        "this-is-a-very-long-patient-email@example.com",
        456,
      ),
    ).toHaveLength(32);
  });

  it("uses the patient name and leaves every professional field empty", () => {
    expect(buildPatientProfileSetupInput("Paciente Ejemplo")).toEqual({
      fullName: "Paciente Ejemplo",
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

  it("uses the transport dispatcher display name and leaves every professional field empty", () => {
    expect(
      buildTransportDispatcherProfileSetupInput("Transportista Ejemplo"),
    ).toEqual({
      fullName: "Transportista Ejemplo",
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

  it("uses the publisher display name and leaves every professional field empty", () => {
    expect(buildPublisherProfileSetupInput("Laboratorio Ejemplo")).toEqual({
      fullName: "Laboratorio Ejemplo",
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
