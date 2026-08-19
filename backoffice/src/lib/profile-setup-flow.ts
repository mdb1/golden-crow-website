export type ProfileSetupDefaults = {
  fullName: string;
  username: string;
  iconName: string;
  iconColorHex: string;
  ownerProfession: string;
  ownerCompany: string;
  ownerContactNumber: string;
  ownerBio: string;
  gender: string;
  condition: string;
};

export type ProfileSetupForm = Omit<ProfileSetupDefaults, "username">;
export type ProfileSetupFieldKey = keyof ProfileSetupForm;
export type ProfileSetupStepKey = "fullName" | "professionalDetails";

export type ProfileSetupStep = {
  key: ProfileSetupStepKey;
  fieldKeys: ProfileSetupFieldKey[];
  title: string;
  description: string;
  required?: boolean;
};

export const DEFAULT_PROFILE_SETUP_ICON_NAME = "person.crop.circle.fill";
export const DEFAULT_PROFILE_SETUP_ICON_COLOR = "#5A4FCF";
export const DEFAULT_PROFILE_SETUP_OWNER_PROFESSION = "";
export const DEFAULT_PROFILE_SETUP_OWNER_COMPANY = "";
export const DEFAULT_PROFILE_SETUP_OWNER_CONTACT_NUMBER = "";
export const DEFAULT_PROFILE_SETUP_OWNER_BIO = "";
export const DEFAULT_PROFILE_SETUP_GENDER = "";
export const DEFAULT_PROFILE_SETUP_CONDITION = "";

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const PROFILE_SETUP_PROFESSIONAL_FIELD_KEYS = [
  "ownerProfession",
  "ownerCompany",
  "ownerContactNumber",
  "ownerBio",
] as const;

export const PROFILE_SETUP_STEPS: ProfileSetupStep[] = [
  {
    key: "fullName",
    fieldKeys: ["fullName"],
    title: "Your name",
    description:
      "This appears in the private profile, public profile, and report-owner record.",
    required: true,
  },
  {
    key: "professionalDetails",
    fieldKeys: [...PROFILE_SETUP_PROFESSIONAL_FIELD_KEYS],
    title: "Professional details",
    description: "Add optional report-owner details now, or leave them blank.",
  },
];

export function hasProfileSetupProfessionalDetails(state: ProfileSetupForm) {
  return PROFILE_SETUP_PROFESSIONAL_FIELD_KEYS.some(
    (fieldKey) => state[fieldKey].trim().length > 0
  );
}

export function profileSetupFormWithSkippedDefaults(
  state: ProfileSetupDefaults | ProfileSetupForm
): ProfileSetupForm {
  const iconColorHex = state.iconColorHex.trim();

  return {
    fullName: state.fullName,
    iconName: state.iconName.trim() || DEFAULT_PROFILE_SETUP_ICON_NAME,
    iconColorHex: COLOR_PATTERN.test(iconColorHex)
      ? iconColorHex
      : DEFAULT_PROFILE_SETUP_ICON_COLOR,
    ownerProfession:
      state.ownerProfession.trim() || DEFAULT_PROFILE_SETUP_OWNER_PROFESSION,
    ownerCompany: state.ownerCompany.trim() || DEFAULT_PROFILE_SETUP_OWNER_COMPANY,
    ownerContactNumber:
      state.ownerContactNumber.trim() ||
      DEFAULT_PROFILE_SETUP_OWNER_CONTACT_NUMBER,
    ownerBio: state.ownerBio.trim() || DEFAULT_PROFILE_SETUP_OWNER_BIO,
    gender: state.gender.trim() || DEFAULT_PROFILE_SETUP_GENDER,
    condition: state.condition.trim() || DEFAULT_PROFILE_SETUP_CONDITION,
  };
}

export function normalizeProfileSetupForm(
  state: ProfileSetupForm
): ProfileSetupForm {
  const defaultsApplied = profileSetupFormWithSkippedDefaults(state);

  return {
    fullName: defaultsApplied.fullName.trim(),
    iconName: defaultsApplied.iconName,
    iconColorHex: defaultsApplied.iconColorHex,
    ownerProfession: defaultsApplied.ownerProfession.trim(),
    ownerCompany: defaultsApplied.ownerCompany.trim(),
    ownerContactNumber: defaultsApplied.ownerContactNumber.trim(),
    ownerBio: defaultsApplied.ownerBio.trim(),
    gender: defaultsApplied.gender.trim(),
    condition: defaultsApplied.condition,
  };
}
