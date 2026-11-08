import type { PublisherAppColorOverride } from "@/lib/publisher-app-config";

type Overrides = Record<string, PublisherAppColorOverride>;
export type PublisherAppPaletteOverrideLocks = Record<string, Partial<Record<"light" | "dark", true>>>;

type PreviousPalette = {
  current: Overrides;
  savedBaseline?: Overrides;
  inferredBaselines?: Overrides[];
};

/** Includes explicit native-fallback choices, which have no color value to copy. */
export function getManualPublisherAppPaletteOverrideLocks({
  current,
  savedBaseline,
  inferredBaselines = [],
}: PreviousPalette): PublisherAppPaletteOverrideLocks {
  const locks: PublisherAppPaletteOverrideLocks = {};
  const baselines = savedBaseline === undefined ? inferredBaselines : [savedBaseline];
  const keys = new Set([...Object.keys(current), ...Object.keys(savedBaseline ?? {})]);
  for (const key of keys) {
    for (const mode of ["light", "dark"] as const) {
      const value = current[key]?.[mode];
      const manual = value === undefined
        ? savedBaseline?.[key]?.[mode] !== undefined
        : !baselines.some((baseline) => baseline[key]?.[mode]?.toUpperCase() === value.toUpperCase());
      if (manual) locks[key] = { ...locks[key], [mode]: true };
    }
  }
  return locks;
}

/**
 * A saved baseline makes absence meaningful: removing an automatically generated
 * appearance in the individual color editor is a deliberate return to native.
 * Older apps have no such provenance, so only present values can be classified.
 */
export function mergePublisherAppPaletteOverrides({
  generated,
  current,
  savedBaseline,
  inferredBaselines,
}: {
  generated: Overrides;
} & PreviousPalette): Overrides {
  const merged: Overrides = Object.fromEntries(
    Object.entries(generated).map(([key, modes]) => [key, { ...modes }]),
  );
  const locks = getManualPublisherAppPaletteOverrideLocks({ current, savedBaseline, inferredBaselines });
  for (const [key, modes] of Object.entries(locks)) {
    for (const mode of ["light", "dark"] as const) {
      if (!modes[mode]) continue;
      const value = current[key]?.[mode];
      if (value !== undefined) {
        merged[key] = { ...merged[key], [mode]: value };
      } else {
        delete merged[key]?.[mode];
      }
    }
    if (merged[key] && !merged[key].light && !merged[key].dark) delete merged[key];
  }
  return merged;
}
