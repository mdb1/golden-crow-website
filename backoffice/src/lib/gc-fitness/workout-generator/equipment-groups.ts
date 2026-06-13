// workout-generator/equipment-groups.ts
//
// Equipment "bundles" the trainer can one-tap to auto-select several pieces of
// equipment at once (issue #296 step 1: "there could be bigger groups, like
// 'gym', or 'home'"). Each group expands to a subset of the canonical
// `EQUIPMENT` vocabulary. Individual items remain independently selectable.
//
// Every id in `items` MUST exist in `EQUIPMENT` (exercise-vocabulary.ts) —
// `equipment-groups.test.ts` asserts this so a vocab rename can't silently
// leave a group pointing at a dead equipment id.

import { EQUIPMENT } from "../exercise-vocabulary";

export interface EquipmentGroup {
  id: string;
  label: { en: string; es: string };
  /** Equipment vocab ids this group selects. */
  items: string[];
}

export const EQUIPMENT_GROUPS: readonly EquipmentGroup[] = [
  {
    id: "full_gym",
    label: { en: "Full gym", es: "Gimnasio completo" },
    items: [
      "barbell",
      "dumbbell",
      "cable",
      "machine",
      "bench",
      "smith",
      "pull_up_bar",
      "kettlebell",
      "discs",
      "rope",
      "medicine_ball",
      "swiss_ball",
      "bodyweight",
    ],
  },
  {
    id: "free_weights",
    label: { en: "Free weights", es: "Peso libre" },
    items: ["barbell", "dumbbell", "bench", "kettlebell", "discs", "bodyweight"],
  },
  {
    id: "home",
    label: { en: "Home", es: "Casa" },
    items: ["bodyweight", "dumbbell", "resistance_band", "kettlebell"],
  },
  {
    id: "minimal",
    label: { en: "Minimal kit", es: "Equipo mínimo" },
    items: ["bodyweight", "dumbbell", "resistance_band"],
  },
  {
    id: "bodyweight_only",
    label: { en: "Bodyweight only", es: "Solo peso corporal" },
    items: ["bodyweight", "pull_up_bar"],
  },
];

/** Expand a set of selected group ids into the union of their equipment items. */
export function expandEquipmentGroups(groupIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of groupIds) {
    const group = EQUIPMENT_GROUPS.find((g) => g.id === id);
    if (!group) continue;
    for (const item of group.items) out.add(item);
  }
  return Array.from(out);
}

/** True when every item the group selects is currently in `selected` (used by
 *  the UI to render a group chip as fully-active). */
export function isGroupFullySelected(
  group: EquipmentGroup,
  selected: ReadonlySet<string>,
): boolean {
  return group.items.every((item) => selected.has(item));
}

/** Validate that every group only references real `EQUIPMENT` vocab ids. */
export function equipmentGroupsReferenceValidVocab(): boolean {
  const vocab = new Set<string>(EQUIPMENT as readonly string[]);
  return EQUIPMENT_GROUPS.every((g) => g.items.every((i) => vocab.has(i)));
}
