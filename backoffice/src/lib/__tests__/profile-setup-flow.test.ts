import {
  DEFAULT_PROFILE_SETUP_CONDITION,
  DEFAULT_PROFILE_SETUP_GENDER,
  DEFAULT_PROFILE_SETUP_ICON_COLOR,
  DEFAULT_PROFILE_SETUP_ICON_NAME,
  DEFAULT_PROFILE_SETUP_OWNER_BIO,
  DEFAULT_PROFILE_SETUP_OWNER_COMPANY,
  DEFAULT_PROFILE_SETUP_OWNER_CONTACT_NUMBER,
  DEFAULT_PROFILE_SETUP_OWNER_PROFESSION,
  PROFILE_SETUP_STEPS,
  normalizeProfileSetupForm,
} from "@/lib/profile-setup-flow";

const baseForm = {
  fullName: " Dr. Jane Doe ",
  iconName: "",
  iconColorHex: "",
  ownerProfession: " Genetics ",
  ownerCompany: " Lab ",
  ownerContactNumber: " +54 11 5555 5555 ",
  ownerBio: " Bio ",
  gender: " Prefer Not To Say ",
  condition: "",
};

describe("legacy profile setup flow", () => {
  it("shows name and one optional professional-details dot", () => {
    const visibleStepKeys = PROFILE_SETUP_STEPS.map((step) => step.key);

    expect(visibleStepKeys).not.toContain("iconName");
    expect(visibleStepKeys).not.toContain("iconColorHex");
    expect(visibleStepKeys).not.toContain("gender");
    expect(visibleStepKeys).not.toContain("condition");
    expect(visibleStepKeys).not.toContain("username");
    expect(visibleStepKeys).toEqual(["fullName", "professionalDetails"]);
  });

  it("groups all optional professional fields into one visible step", () => {
    expect(PROFILE_SETUP_STEPS[1]).toMatchObject({
      key: "professionalDetails",
      fieldKeys: [
        "ownerProfession",
        "ownerCompany",
        "ownerContactNumber",
        "ownerBio",
      ],
    });
  });

  it("defaults skipped fields before submitting profile setup", () => {
    expect(normalizeProfileSetupForm(baseForm)).toEqual({
      fullName: "Dr. Jane Doe",
      iconName: DEFAULT_PROFILE_SETUP_ICON_NAME,
      iconColorHex: DEFAULT_PROFILE_SETUP_ICON_COLOR,
      ownerProfession: "Genetics",
      ownerCompany: "Lab",
      ownerContactNumber: "+54 11 5555 5555",
      ownerBio: "Bio",
      gender: "Prefer Not To Say",
      condition: DEFAULT_PROFILE_SETUP_CONDITION,
    });
  });

  it("uses blank defaults for optional text fields when they are empty", () => {
    expect(
      normalizeProfileSetupForm({
        ...baseForm,
        ownerProfession: "",
        ownerCompany: "",
        ownerContactNumber: "",
        ownerBio: "",
        gender: "",
      })
    ).toMatchObject({
      ownerProfession: DEFAULT_PROFILE_SETUP_OWNER_PROFESSION,
      ownerCompany: DEFAULT_PROFILE_SETUP_OWNER_COMPANY,
      ownerContactNumber: DEFAULT_PROFILE_SETUP_OWNER_CONTACT_NUMBER,
      ownerBio: DEFAULT_PROFILE_SETUP_OWNER_BIO,
      gender: DEFAULT_PROFILE_SETUP_GENDER,
    });
  });

  it("preserves existing skipped field values when they are already valid", () => {
    expect(
      normalizeProfileSetupForm({
        ...baseForm,
        iconName: "sparkles",
        iconColorHex: "#00D2FF",
        condition: "Other",
      })
    ).toMatchObject({
      iconName: "sparkles",
      iconColorHex: "#00D2FF",
      condition: "Other",
    });
  });
});
