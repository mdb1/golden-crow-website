import type { ExerciseRow } from "./exercises-listener";

/**
 * Builds the fuzzy-search haystack for exercise discovery. We intentionally
 * include the canonical names plus aliases/keywords/tags so a coach can find
 * an exercise by the gym term they remember, not only by the stored title.
 */
export function exerciseSearchHaystack(
  row: Pick<
    ExerciseRow,
    | "name"
    | "description"
    | "muscleGroups"
    | "equipment"
    | "keywords"
    | "tags"
    | "variations"
  >,
): string {
  return [
    row.name.en,
    row.name.es,
    row.description.en,
    row.description.es,
    row.muscleGroups.join(" "),
    row.equipment.join(" "),
    row.keywords?.join(" "),
    row.tags?.join(" "),
    row.variations?.join(" "),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}
