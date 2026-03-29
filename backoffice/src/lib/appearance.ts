export type AppearanceMode = "dark" | "light";

export const APPEARANCE_STORAGE_KEY = "pocket-genes-admin-appearance";

export function isAppearanceMode(value: string | null | undefined): value is AppearanceMode {
  return value === "dark" || value === "light";
}

export function resolveAppearance(value: string | null | undefined): AppearanceMode {
  return isAppearanceMode(value) ? value : "light";
}

export function toggleAppearance(mode: AppearanceMode): AppearanceMode {
  return mode === "dark" ? "light" : "dark";
}
