/**
 * @jest-environment jsdom
 */

// template-form-save.test.tsx
//
// The SAVE half of the template editor. `template-form-cancel.test.tsx` covers
// the draft/discard flow; this file covers what the form actually hands to the
// Server Action when the coach presses Save.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// `onSubmit` is a PROP, so every assertion here is on the real payload — the
// exact object `createWorkoutTemplate` / `updateWorkoutTemplate` receives, and
// therefore the exact doc shape iOS and Android read back.
//
// The normalization block in `handleSubmit` is ~140 lines of alignment rules,
// every one of which was written after a specific bad doc reached Firestore:
//
//   • `order` is RECOMPUTED 1-based contiguous. The Firestore rule layer
//     (P04-02) asserts `order == arrayIndex + 1`; a stale order from a
//     reordered draft is rejected at the rules layer, not here.
//   • SET-COUNT ALIGNMENT. The operator's PULL template shipped with
//     `sets: 1` and `weightBySetKg: [24, 24, 23]` because `sets` used to be
//     derived from `repsBySet.length` alone. Every per-set array now lands on
//     one canonical length.
//   • THE "SIN PESO" SENTINEL (#159 / reps-sin-weight). An explicit empty
//     `weightBySetKg: []` is a real prescription — reps with no weight — and
//     must survive as a length-0 array. Zero-filling it turns a bodyweight
//     exercise into "0 kg × reps" on the client's phone.
//   • KEYS ARE DELETED, NEVER SET TO `undefined`. The backoffice's Firestore
//     handle has no `ignoreUndefinedProperties`, so `setTypesBySet: undefined`
//     throws "Cannot use 'undefined' as a Firestore value" at write time —
//     a crash, not a bad doc. Same for `supersetGroup`.
//   • `endsOn` NO LONGER EXISTS on templates (removed in 703d8b2, "templates
//     do not need endDates") but is STILL IN THE ZOD SCHEMA, so it survives a
//     parse. A localStorage draft written before that commit still carries it,
//     which is why the restore path strips it explicitly.
//
// Where a rule is reachable from the UI, the test drives the UI (the sets input
// on a superset leader, the per-set type picker); where it is pure
// normalization, the test seeds `defaultValues` and presses Save.

import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { WorkoutTemplateInput } from "@/lib/gc-fitness/workout-template-schema";

const mockBack = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock("@/lib/gc-fitness/exercises-listener", () => ({
  useExercisesQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
    hasSnapshot: true,
  }),
}));
jest.mock("@/lib/gc-fitness/workout-templates-listener", () => ({
  useWorkoutTemplates: () => ({ data: [], isLoading: false, error: null }),
}));

// Exercise-picking surfaces have their own tests; these fixtures arrive with
// their exercises already chosen.
jest.mock("../exercise-picker-popover", () => ({
  ExercisePickerPopover: () => null,
}));
jest.mock("../exercise-multi-add-dialog", () => ({
  ExerciseMultiAddDialog: () => null,
}));
jest.mock("../template-tags-picker", () => ({
  TemplateTagsPicker: () => null,
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { TemplateForm } from "../template-form";

type Ex = Partial<WorkoutTemplateInput["exercises"][number]> &
  Record<string, unknown>;

const DRAFT_PREFIX = "gc-fitness:template-draft:";

function exercise(overrides: Ex = {}): Ex {
  return {
    exerciseId: "0025",
    sets: 3,
    reps: 10,
    rest_seconds: 90,
    transition_rest_seconds: 60,
    order: 1,
    ...overrides,
  };
}

function defaults(exercises: Ex[], extra: Record<string, unknown> = {}) {
  return {
    name: { en: "Push Day", es: "Empuje" },
    description: { en: "", es: "" },
    tag: "push",
    tags: ["push"],
    exercises,
    ...extra,
  } as Partial<WorkoutTemplateInput>;
}

/** Renders in EDIT mode (the Save CTA reads "Save changes"). */
function renderForm(
  defaultValues: Partial<WorkoutTemplateInput>,
  draftKey?: string,
) {
  const onSubmit = jest.fn().mockResolvedValue({ ok: true as const });
  render(
    <TemplateForm
      mode="edit"
      defaultValues={defaultValues}
      draftKey={draftKey}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

/** Press Save and return the single payload handed to the Server Action. */
async function save(onSubmit: jest.Mock): Promise<WorkoutTemplateInput> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  return onSubmit.mock.calls[0][0] as WorkoutTemplateInput;
}

/** Step 2 ("Details") is where the per-set editors live. */
async function goToDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "2. Details" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe("TemplateForm save — exercise order", () => {
  it("renumbers `order` 1-based contiguous, ignoring what came in", async () => {
    // The Firestore rules assert `order == arrayIndex + 1`. A draft that was
    // reordered (or a doc written before the rule) carries stale numbers; the
    // form must not pass them through, or the write is rejected server-side
    // with an error the coach can do nothing about.
    const { onSubmit } = renderForm(
      defaults([
        exercise({ exerciseId: "a", order: 7 }),
        exercise({ exerciseId: "b", order: 7 }),
        exercise({ exerciseId: "c", order: 0 }),
      ]),
    );

    const payload = await save(onSubmit);

    expect(payload.exercises.map((e) => e.order)).toEqual([1, 2, 3]);
    expect(payload.exercises.map((e) => e.exerciseId)).toEqual(["a", "b", "c"]);
  });
});

describe("TemplateForm save — per-set arrays land on one length", () => {
  it("heals the sets=1 / weightBySetKg=[24,24,23] desync", async () => {
    // The operator's actual PULL template. `sets` used to be derived from
    // repsBySet.length only, so the longer weight array survived and the
    // assign modal rendered a workout nobody authored.
    const { onSubmit } = renderForm(
      defaults([
        exercise({
          sets: 1,
          reps: 8,
          repsBySet: [8],
          weightBySetKg: [24, 24, 23],
        }),
      ]),
    );

    const payload = await save(onSubmit);
    const ex = payload.exercises[0];

    expect(ex.sets).toBe(3);
    expect(ex.repsBySet).toHaveLength(3);
    expect(ex.weightBySetKg).toHaveLength(3);
    // The declared count follows the longest authored array, and the short
    // array is padded from the exercise-level fallback rather than truncating
    // work the coach already entered.
    expect(ex.repsBySet).toEqual([8, 8, 8]);
    expect(ex.weightBySetKg).toEqual([24, 24, 23]);
  });

  it("pads a short weight array with 0 rather than leaving holes", async () => {
    const { onSubmit } = renderForm(
      defaults([
        exercise({ sets: 3, reps: 10, repsBySet: [10, 10, 10], weightBySetKg: [40] }),
      ]),
    );

    const payload = await save(onSubmit);

    // A sparse array would serialize with nulls, which iOS's Codable rejects.
    expect(payload.exercises[0].weightBySetKg).toEqual([40, 0, 0]);
  });
});

describe("TemplateForm save — the 'Sin peso' sentinel (#159)", () => {
  it("keeps an explicit empty weightBySetKg as a length-0 array", async () => {
    // `weightBySetKg: []` IS the prescription: reps, no weight. Coercing it to
    // undefined (dropped) or zero-filling it both change what the client sees.
    const { onSubmit } = renderForm(
      defaults([
        exercise({ sets: 3, reps: 12, repsBySet: [12, 12, 12], weightBySetKg: [] }),
      ]),
    );

    const payload = await save(onSubmit);
    const ex = payload.exercises[0];

    expect(ex.weightBySetKg).toEqual([]);
    // And the sentinel must not shrink the set count with it.
    expect(ex.sets).toBe(3);
    expect(ex.repsBySet).toEqual([12, 12, 12]);
  });
});

describe("TemplateForm save — setTypesBySet (#403)", () => {
  it("OMITS the key entirely when every set is normal", async () => {
    const { onSubmit } = renderForm(
      defaults([
        exercise({ sets: 2, repsBySet: [10, 10], setTypesBySet: ["normal", "normal"] }),
      ]),
    );

    const payload = await save(onSubmit);

    // `in`, not `toBeUndefined()`: the wire contract is that the key is ABSENT.
    // Present-with-undefined is what makes the Admin SDK throw
    // "Cannot use 'undefined' as a Firestore value".
    expect("setTypesBySet" in payload.exercises[0]).toBe(false);
  });

  it("keeps and pads the array when any set is non-normal", async () => {
    const { onSubmit } = renderForm(
      defaults([
        exercise({
          sets: 3,
          repsBySet: [10, 10, 10],
          setTypesBySet: ["warmup"], // shorter than the set count
        }),
      ]),
    );

    const payload = await save(onSubmit);

    // Padded POSITIONALLY with "normal" — the first set stays the warmup.
    expect(payload.exercises[0].setTypesBySet).toEqual([
      "warmup",
      "normal",
      "normal",
    ]);
  });

  it("writes the type the coach picks in the per-set menu", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(
      defaults([exercise({ sets: 3, reps: 10, repsBySet: [10, 10, 10] })]),
    );

    await goToDetails(user);
    // The set-number cell IS the type picker trigger. Its aria-label is
    // hardcoded Spanish in the component, catalog or no catalog.
    await user.click(
      screen.getByRole("button", { name: /^Tipo de la serie 2:/ }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /fallo/i }));

    const payload = await save(onSubmit);

    // Positional: set 2 and only set 2.
    expect(payload.exercises[0].setTypesBySet).toEqual([
      "normal",
      "failure",
      "normal",
    ]);
  });
});

describe("TemplateForm save — supersets", () => {
  // NOTE — this is the ONE per-exercise key that does NOT follow the
  // "omit when empty" convention, and the test asserts what the form really
  // emits, not what the code reads like it emits.
  //
  // The normalizer spreads `...ex` FIRST and then tries to omit a blank group
  // with a conditional spread:
  //     ...(ex.supersetGroup?.trim() ? { supersetGroup: ex.supersetGroup.trim() } : {})
  // A conditional spread can only ADD a key — `...ex` already put
  // `supersetGroup` in the object, so the blank case emits `""` rather than
  // omitting. (`setTypesBySet` a few lines below gets this right by using an
  // explicit `delete`.) The trim half is dead too: `values` is the ZOD-PARSED
  // object and `supersetGroupSchema` is `.trim()`ed, so nothing untrimmed ever
  // reaches here.
  //
  // Not a live bug: `""` is a legal Firestore value (only `undefined` throws)
  // and every reader goes through `normalizeSupersetGroup` + a truthiness
  // check, so an empty label is "no group" on all three surfaces. Pinned here
  // so the next person doesn't read the source and assume omission.
  it("emits '' for a blank group — the conditional spread does not omit", async () => {
    const { onSubmit } = renderForm(
      defaults([
        exercise({ exerciseId: "a", supersetGroup: " B " }),
        exercise({ exerciseId: "b", supersetGroup: "   " }),
      ]),
    );

    const payload = await save(onSubmit);

    // Trimmed — by Zod, on the way in.
    expect(payload.exercises[0].supersetGroup).toBe("B");
    expect(payload.exercises[1].supersetGroup).toBe("");
    // What DOES matter, and is the reason the key can stay: never `undefined`,
    // which is the value the Admin SDK throws on.
    expect(payload.exercises[1].supersetGroup).not.toBeUndefined();
  });

  it("propagates a set-count change from the leader to every member", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm(
      defaults([
        exercise({ exerciseId: "a", supersetGroup: "A", sets: 3, repsBySet: [10, 10, 10] }),
        exercise({ exerciseId: "b", supersetGroup: "A", sets: 3, repsBySet: [10, 10, 10] }),
        exercise({ exerciseId: "solo", sets: 3, repsBySet: [10, 10, 10] }),
      ]),
    );

    await goToDetails(user);
    const leaderSets = document.querySelector<HTMLInputElement>(
      '[data-field-sets="0"]',
    )!;
    await user.clear(leaderSets);
    await user.type(leaderSets, "4");
    await user.tab(); // commits on blur

    const payload = await save(onSubmit);

    // A superset is one round: members running a different number of sets is
    // not a thing the client app can execute.
    expect(payload.exercises[0].sets).toBe(4);
    expect(payload.exercises[1].sets).toBe(4);
    // …and the change is scoped to the group.
    expect(payload.exercises[2].sets).toBe(3);
  });

  it("locks a follower's set count in the UI", async () => {
    const user = userEvent.setup();
    renderForm(
      defaults([
        exercise({ exerciseId: "a", supersetGroup: "A" }),
        exercise({ exerciseId: "b", supersetGroup: "A" }),
      ]),
    );

    await goToDetails(user);

    // The guard the coach actually meets: a follower can't be edited into a
    // different count in the first place, so the propagation above is the only
    // way the numbers change.
    expect(
      document.querySelector('[data-field-sets="1"]'),
    ).toBeDisabled();
    expect(
      document.querySelector('[data-field-sets="0"]'),
    ).not.toBeDisabled();
  });
});

describe("TemplateForm save — legacy `endsOn` from an old draft", () => {
  it("never reaches the payload", async () => {
    // Templates lost their end date in 703d8b2, but `endsOn` is still a key in
    // `workoutTemplateSchema`, so a draft written before that commit parses
    // clean and would be persisted onto the template doc. The restore path
    // strips it; this is the only test that watches it do so.
    const draftKey = "edit:tpl-legacy";
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${draftKey}`,
      JSON.stringify({
        ...defaults([exercise()]),
        endsOn: "2026-12-31",
      }),
    );

    const { onSubmit } = renderForm(defaults([exercise()]), draftKey);

    const payload = await save(onSubmit);

    expect("endsOn" in payload).toBe(false);
  });

  it("keeps restoring the rest of that draft", async () => {
    // The strip must be surgical — a draft that loses its exercises on restore
    // is worse than one that carries a dead field.
    const draftKey = "edit:tpl-legacy-2";
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${draftKey}`,
      JSON.stringify({
        ...defaults([exercise({ exerciseId: "drafted", sets: 5, repsBySet: [6, 6, 6, 6, 6] })]),
        endsOn: "2026-12-31",
      }),
    );

    const { onSubmit } = renderForm(defaults([exercise()]), draftKey);

    const payload = await save(onSubmit);

    expect(payload.exercises[0].exerciseId).toBe("drafted");
    expect(payload.exercises[0].sets).toBe(5);
  });
});

describe("TemplateForm save — the legacy `tag` mirror", () => {
  it("mirrors tags[0] onto `tag` so un-migrated clients keep reading", async () => {
    const { onSubmit } = renderForm(
      defaults([exercise()], { tag: "stale", tags: ["pull", "upper"] }),
    );

    const payload = await save(onSubmit);

    expect(payload.tags).toEqual(["pull", "upper"]);
    expect(payload.tag).toBe("pull");
  });
});
