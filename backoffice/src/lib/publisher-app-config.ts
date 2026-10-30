export type PublisherAppPlatformOption = "ios" | "ios_android";
export type PublisherAppIconSource = "publisher" | "custom";
export type PublisherAppStatus =
  "pending_revision" | "approved" | "changes_requested" | "rejected";

export function publisherAppStatusLabel(status: PublisherAppStatus) {
  switch (status) {
    case "approved":
      return "Approved";
    case "changes_requested":
      return "Changes requested";
    case "rejected":
      return "Rejected";
    default:
      return "Pending revision";
  }
}

export type PublisherAppColors = {
  primary: string;
  secondary: string;
  tertiary: string;
};

export type PublisherAppConfigInput = {
  platformOption: PublisherAppPlatformOption;
  connectEnabled: boolean;
  profileEnabled: boolean;
  learnCustomizationEnabled: boolean;
  colors: PublisherAppColors;
  iconSource: PublisherAppIconSource;
  iconImageUrl: string | null;
  iconImageUploadDataUrl: string | null;
};

export type PublisherAppConfig = PublisherAppConfigInput & {
  id: string;
  publisherKind: "organization" | "individual";
  publisherId: string;
  publisherName: string;
  publisherEmail: string;
  publisherUsername: string;
  catalogEnabled: true;
  feedEnabled: true;
  status: PublisherAppStatus;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  updatedByUserId: string;
};

export type PublisherAppConfigResponse = {
  config: PublisherAppConfig | null;
};

export const DEFAULT_PUBLISHER_APP_COLOR = "#6D28D9";

export function normalizePublisherAppColor(value?: string) {
  const trimmed = value?.trim() ?? "";
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash)
    ? withHash.toUpperCase()
    : undefined;
}

function hexToRgb(value: string) {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) =>
      Math.min(255, Math.max(0, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function mixHexColors(source: string, target: string, targetWeight: number) {
  const sourceRgb = hexToRgb(source);
  const targetRgb = hexToRgb(target);
  const mix = (sourceChannel: number, targetChannel: number) =>
    sourceChannel * (1 - targetWeight) + targetChannel * targetWeight;

  return rgbToHex(
    mix(sourceRgb.red, targetRgb.red),
    mix(sourceRgb.green, targetRgb.green),
    mix(sourceRgb.blue, targetRgb.blue),
  );
}

export function publisherAppDefaultColors(tint?: string): PublisherAppColors {
  const primary =
    normalizePublisherAppColor(tint) ?? DEFAULT_PUBLISHER_APP_COLOR;

  return {
    primary,
    secondary: mixHexColors(primary, "#FFFFFF", 0.34),
    tertiary: mixHexColors(primary, "#F59E0B", 0.46),
  };
}
