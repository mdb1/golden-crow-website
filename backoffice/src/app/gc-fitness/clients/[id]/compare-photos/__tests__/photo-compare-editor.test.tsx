/**
 * @jest-environment jsdom
 */

// photo-compare-editor.test.tsx
//
// SCOPE: the PAIR PICKER, and nothing else. The file is 806 lines, but ~450 of
// them are the JPG export — two canvas painters that jsdom cannot run at all
// (`getContext("2d")` returns null without the `canvas` npm package, so the
// export bails on its own first guard). What decides what the coach actually
// compares is the top 100 lines: which photos are offered, which are refused,
// and what happens to the OTHER half of the pair when one half moves.
//
// The FIRST THREE LINES of this file MUST stay as the
// `/** @jest-environment jsdom */` docblock — the backoffice jest config
// defaults to `testEnvironment: "node"` so without it React Testing Library
// crashes with `ReferenceError: document is not defined`.
//
// The rules being pinned (issue #435). All three are enforced by DISABLING
// options, which is the failure mode worth testing: a disabled option that
// stops being disabled doesn't throw anywhere — it just lets the coach build a
// backwards comparison and export it with the labels swapped.
//
//   1. "after" must be STRICTLY LATER than "before" — same civil day included,
//      because two photos from one check-in have nothing to show.
//   3. the NEWEST photo can never be the "before". Since #308 this is the
//      SYMMETRIC form of rule 1 — a photo is offered as "before" only when
//      something is strictly later than it — which also rules out a same-day
//      sibling of the newest, and an undated photo.
//   4. the OLDEST photo can never be the "after".
//
// Plus the one piece of state that moves on its own: picking a "before" that
// invalidates the current "after" SNAPS after to the newest photo. Without it
// the pair silently stays backwards — both selects still show a date, and the
// only symptom is an export where "Before" is later than "After".
//
// The date each photo is filed under is `checkInDate` when present (a civil
// date, timezone-independent) and only otherwise the `takenAt`/`createdAt`
// instant resolved in the CLIENT's timezone. Those are different clocks and
// the elapsed label is computed from whichever one wins.

import "@testing-library/jest-dom";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { ProgressPhotoRow } from "@/lib/gc-fitness/progress-photo-actions";
import {
  chooseFormSelectValue,
  closeFormSelect,
  isFormSelectOptionDisabled,
  openFormSelect,
} from "@/lib/test-utils/form-select";

let searchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

import { ProgressPhotoCompareEditor, beforeAfterLabels } from "../photo-compare-editor";

const TZ = "America/Argentina/Buenos_Aires";

function photo(overrides: Partial<ProgressPhotoRow> = {}): ProgressPhotoRow {
  return {
    id: "p1",
    caption: null,
    storagePath: "progress_photos/client-1/p1.jpg",
    url: "https://example.test/p1.jpg",
    angle: "front",
    checkInDate: "2026-06-01",
    setId: null,
    createdAt: null,
    takenAt: null,
    ...overrides,
  };
}

// The loader hands the editor its photos NEWEST FIRST, and the whole
// newest/oldest logic reads position (`angled[0]` / `angled[length - 1]`)
// rather than re-sorting. Fixtures keep that order.
const NEWEST = photo({ id: "jun", checkInDate: "2026-06-01" });
const MIDDLE = photo({ id: "may", checkInDate: "2026-05-01" });
const OLDEST = photo({ id: "mar", checkInDate: "2026-03-01" });
const THREE = [NEWEST, MIDDLE, OLDEST];

let user: ReturnType<typeof userEvent.setup>;

function renderEditor(photos: ProgressPhotoRow[], query = "") {
  searchParams = new URLSearchParams(query);
  render(
    <ProgressPhotoCompareEditor
      photos={photos}
      timezone={TZ}
      clientName="Ana Gomez"
    />,
  );
  user = userEvent.setup();
  return { user };
}

/**
 * The three pickers are the portal's FormSelect (#505 — Radix, not a native
 * <select>), named "Angle" / "Before" / "After". Indexing
 * `getAllByRole("combobox")` blindly is the trap that already cost time on
 * the exercise pickers, so they are always found by name.
 */
const PICKER_NAME = { angle: "Angle", before: "Before", after: "After" } as const;

function picker(kind: "angle" | "before" | "after"): HTMLElement {
  return screen.getByRole("combobox", { name: PICKER_NAME[kind] });
}

/**
 * What the coach sees for `photoId` in one of the pickers: opens the listbox,
 * reads the option, closes it again. `null` when the photo is not offered.
 */
async function findOption(
  kind: "before" | "after",
  photoId: string,
): Promise<{ disabled: boolean; textContent: string } | null> {
  const listbox = await openFormSelect(user, picker(kind));
  const opt = listbox.querySelector<HTMLElement>(`[role="option"][data-value="${photoId}"]`);
  const found = opt
    ? { disabled: isFormSelectOptionDisabled(opt), textContent: opt.textContent ?? "" }
    : null;
  await closeFormSelect(user);
  return found;
}

/** Like `findOption`, but the photo MUST be offered. */
async function optionFor(kind: "before" | "after", photoId: string) {
  const found = await findOption(kind, photoId);
  if (!found) throw new Error(`no ${kind} option for ${photoId}`);
  return found;
}

function choose(kind: "angle" | "before" | "after", value: string) {
  return chooseFormSelectValue(user, picker(kind), value);
}

function selectedIds(): { before: string; after: string } {
  return {
    before: picker("before").getAttribute("data-value") ?? "",
    after: picker("after").getAttribute("data-value") ?? "",
  };
}

describe("ProgressPhotoCompareEditor — which photos the pickers offer", () => {
  it("opens on the two most recent photos: newest as AFTER, next as BEFORE", async () => {
    renderEditor(THREE);

    expect(selectedIds()).toEqual({ before: "may", after: "jun" });
  });

  it("refuses the NEWEST photo as 'before' (#435 rule 3)", async () => {
    // Falls out of the symmetric rule (#308): nothing is strictly later than
    // the newest photo, so it is never offered.
    renderEditor(THREE);

    expect((await optionFor("before", "jun")).disabled).toBe(true);
    expect((await optionFor("before", "may")).disabled).toBe(false);
    expect((await optionFor("before", "mar")).disabled).toBe(false);
  });

  it("refuses the OLDEST photo as 'after' (#435 rule 4)", async () => {
    renderEditor(THREE);

    expect((await optionFor("after", "mar")).disabled).toBe(true);
  });

  it("refuses an 'after' that is not STRICTLY later than the before (#435 rule 1)", async () => {
    // Same civil day: two photos from one check-in have nothing to show, so
    // `photoCompareElapsed` returns null and the option must not be pickable.
    // Neither must anything EARLIER than the before.
    const april = photo({ id: "apr", checkInDate: "2026-04-01" });
    const maySame = photo({ id: "may-2", checkInDate: "2026-05-01" });
    const { user } = renderEditor([NEWEST, MIDDLE, maySame, april, OLDEST]);

    await choose("before", "may");

    expect((await optionFor("after", "jun")).disabled).toBe(false); // strictly later
    expect((await optionFor("after", "may-2")).disabled).toBe(true); // same civil day
    expect((await optionFor("after", "apr")).disabled).toBe(true); // earlier
    expect((await optionFor("after", "mar")).disabled).toBe(true); // earlier AND oldest
  });

  it("skips a same-day sibling when seeding the default 'before' (#308)", async () => {
    // REGRESSION. The default pair used to be positional (`angled[1]` vs
    // `angled[0]`), so a client who uploaded two front photos on one day landed
    // on a same-day pair — which rule 1 forbids — with no way out: every option
    // in the after picker was disabled, and re-picking the before snapped the
    // after back to that same newest photo.
    const sameDay = photo({ id: "jun-2", checkInDate: "2026-06-01" });
    renderEditor([NEWEST, sameDay, MIDDLE, OLDEST]);

    expect(selectedIds()).toEqual({ before: "may", after: "jun" });
  });

  it("refuses a same-day sibling of the newest as a 'before' (#308)", async () => {
    // Symmetric to rule 1: a photo is only offered as "before" when something
    // is strictly later than it. `jun-2` shares its day with the newest, so
    // nothing is — picking it could only ever produce an invalid pair.
    const sameDay = photo({ id: "jun-2", checkInDate: "2026-06-01" });
    renderEditor([NEWEST, sameDay, MIDDLE, OLDEST]);

    expect((await optionFor("before", "jun")).disabled).toBe(true);
    expect((await optionFor("before", "jun-2")).disabled).toBe(true);
    expect((await optionFor("before", "may")).disabled).toBe(false);
  });

  it("refuses an UNDATED photo as a 'before' (#308)", async () => {
    // Nothing can be "strictly later" than a photo with no resolvable date, so
    // selecting it disabled the whole after picker — the same dead end.
    renderEditor([
      NEWEST,
      photo({ id: "undated", checkInDate: null, takenAt: null, createdAt: null }),
      MIDDLE,
      OLDEST,
    ]);

    expect((await optionFor("before", "undated")).disabled).toBe(true);
  });

  it("leaves out photos of another angle", async () => {
    renderEditor([NEWEST, photo({ id: "side-1", angle: "side" }), MIDDLE, OLDEST]);

    expect(await findOption("before", "side-1")).toBeNull();
  });

  it("leaves out photos with no URL — they cannot be compared", async () => {
    // A row whose signed URL failed to mint still comes back from the loader.
    renderEditor([NEWEST, photo({ id: "broken", url: null }), MIDDLE, OLDEST]);

    expect(await findOption("after", "broken")).toBeNull();
  });

  it("treats a photo with no angle as a FRONT photo", async () => {
    // Legacy rows predate the angle field; dropping them would empty the
    // comparator for clients who only ever uploaded from the old app.
    renderEditor([photo({ id: "legacy", angle: null, checkInDate: "2026-07-01" }), MIDDLE]);

    expect(await findOption("after", "legacy")).not.toBeNull();
  });
});

describe("ProgressPhotoCompareEditor — moving one half of the pair", () => {
  it("SNAPS after to the newest when the new before invalidates it", async () => {
    // The starting after must NOT already be the newest photo — otherwise
    // "snapped to the newest" and "left untouched" are the same value and the
    // assertion cannot fail. Verified by mutation: with a newest-valued after,
    // deleting the snap left this file green.
    const july = photo({ id: "jul", checkInDate: "2026-07-01" });
    const { user } = renderEditor(
      [july, NEWEST, MIDDLE, OLDEST],
      "before=mar&after=jun",
    );
    expect(selectedIds()).toEqual({ before: "mar", after: "jun" });

    // before → jun, the SAME civil day as the after: the pair stops being
    // valid, so the after jumps to the newest photo instead of sitting there
    // backwards with both selects still showing a date.
    await choose("before", "jun");

    expect(selectedIds()).toEqual({ before: "jun", after: "jul" });
  });

  it("snaps away from an after that the new before has overtaken", async () => {
    const july = photo({ id: "jul", checkInDate: "2026-07-01" });
    const { user } = renderEditor(
      [july, NEWEST, MIDDLE, OLDEST],
      "before=mar&after=may",
    );

    await choose("before", "jun");

    expect(selectedIds()).toEqual({ before: "jun", after: "jul" });
  });

  it("leaves a still-valid after alone", async () => {
    const { user } = renderEditor(THREE);

    await choose("before", "mar");

    expect(selectedIds()).toEqual({ before: "mar", after: "jun" });
  });
});

describe("ProgressPhotoCompareEditor — switching angle", () => {
  it("re-seeds BOTH halves from the new angle's own photos", async () => {
    // Carrying a front photo id into the back picker leaves the select on a
    // value that no option carries — the editor renders its empty state and
    // the coach sees nothing, with both dropdowns looking populated.
    const backNew = photo({ id: "back-jun", angle: "back", checkInDate: "2026-06-10" });
    const backOld = photo({ id: "back-mar", angle: "back", checkInDate: "2026-03-10" });
    const { user } = renderEditor([NEWEST, backNew, MIDDLE, backOld, OLDEST]);

    await choose("angle", "back");

    expect(selectedIds()).toEqual({ before: "back-mar", after: "back-jun" });
  });

  it("applies the same date-first rule when switching angle (#308)", async () => {
    // `defaultsForAngle` is a SECOND copy of the seeding rule; fixing only the
    // initial one leaves the dead end one dropdown away.
    const back = [
      photo({ id: "back-jun-a", angle: "back", checkInDate: "2026-06-10" }),
      photo({ id: "back-jun-b", angle: "back", checkInDate: "2026-06-10" }),
      photo({ id: "back-mar", angle: "back", checkInDate: "2026-03-10" }),
    ];
    const { user } = renderEditor([NEWEST, ...back, MIDDLE]);

    await choose("angle", "back");

    expect(selectedIds()).toEqual({ before: "back-mar", after: "back-jun-a" });
  });

  it("falls back to the single photo for BOTH halves when the angle has only one", async () => {
    const onlyBack = photo({ id: "back-1", angle: "back", checkInDate: "2026-04-01" });
    const { user } = renderEditor([NEWEST, onlyBack, MIDDLE]);

    await choose("angle", "back");

    // Same photo on both sides is not a comparison — and the pickers say so:
    // it is simultaneously the newest (disabled as before) and the oldest
    // (disabled as after).
    expect(selectedIds()).toEqual({ before: "back-1", after: "back-1" });
    expect((await optionFor("before", "back-1")).disabled).toBe(true);
    expect((await optionFor("after", "back-1")).disabled).toBe(true);
  });
});

describe("ProgressPhotoCompareEditor — the URL seeds the pair", () => {
  it("honours ?angle=, ?before= and ?after=", async () => {
    // The client-detail page deep-links into a specific comparison; ignoring
    // the params would silently reset it to the two most recent photos.
    //
    // The seeded pair must DIFFER from those defaults or the assertion holds
    // with the params thrown away — verified by mutation, the two-photo
    // version of this test passed with `params.get("after")` deleted.
    const back = ["2026-06-10", "2026-05-10", "2026-04-10", "2026-03-10"].map(
      (checkInDate, index) =>
        photo({ id: `back-${index + 1}`, angle: "back", checkInDate }),
    );
    renderEditor(
      [NEWEST, ...back, MIDDLE, OLDEST],
      "angle=back&before=back-4&after=back-2",
    );

    // The defaults for this angle would be before=back-2 / after=back-1.
    expect(selectedIds()).toEqual({ before: "back-4", after: "back-2" });
  });
});

describe("ProgressPhotoCompareEditor — the dates it prints", () => {
  it("labels an option by its checkInDate, NOT by the upload instant", async () => {
    // `checkInDate` is a civil date: it must not be shifted by anyone's
    // timezone. The upload instant here is the previous UTC day on purpose.
    renderEditor([
      photo({
        id: "jun",
        checkInDate: "2026-06-01",
        createdAt: "2026-05-31T23:30:00.000Z",
      }),
      MIDDLE,
    ]);

    expect((await optionFor("after", "jun")).textContent).toContain("June 1, 2026");
  });

  it("falls back to the takenAt instant in the CLIENT's timezone", async () => {
    // 2026-06-01T02:00Z is still May 31 in Buenos Aires (UTC-3).
    renderEditor([
      photo({ id: "no-checkin", checkInDate: null, takenAt: "2026-06-01T02:00:00.000Z" }),
      MIDDLE,
    ]);

    expect((await optionFor("after", "no-checkin")).textContent).toContain("May 31");
  });

  it("tells the coach how much time each candidate covers", async () => {
    const { user } = renderEditor([
      photo({ id: "aug", checkInDate: "2026-08-01" }), // 3 months
      photo({ id: "jun15", checkInDate: "2026-06-15" }), // ~1 month
      photo({ id: "jun08", checkInDate: "2026-06-08" }), // 1 week
      photo({ id: "jun04", checkInDate: "2026-06-04" }), // 3 days
      photo({ id: "may", checkInDate: "2026-05-01" }),
    ]);

    await choose("before", "jun04");

    expect((await optionFor("after", "jun08")).textContent).toContain("(4 days)");
    expect((await optionFor("after", "jun15")).textContent).toContain("(~1 week)");
    expect((await optionFor("after", "aug")).textContent).toContain("(~1 month)");
  });
});

describe("ProgressPhotoCompareEditor — nothing to compare", () => {
  it("says so instead of rendering half a comparison", async () => {
    renderEditor([]);

    expect(screen.getByText("Seleccioná fotos para comparar.")).toBeInTheDocument();
  });

  it("renders the two panels once a valid pair resolves", async () => {
    renderEditor(THREE);

    // Slider is the default mode; both images are on screen.
    const images = screen.getAllByRole("img");
    expect(images.map((i) => i.getAttribute("alt"))).toEqual(
      expect.arrayContaining(["before", "after"]),
    );
  });

  it("switches to the side-by-side view", async () => {
    const { user } = renderEditor(THREE);

    await user.click(screen.getByRole("button", { name: "Lado a lado" }));

    const panel = screen.getByText("before").closest("div");
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByText("May 1, 2026")).toBeInTheDocument();
  });
});

// #535 — these words are DRAWN into the JPG the coach sends; they were always English.
describe("beforeAfterLabels", () => {
  it("follows the coach language", () => {
    expect(beforeAfterLabels("es")).toEqual({ before: "Antes", after: "Después" });
    expect(beforeAfterLabels("en")).toEqual({ before: "Before", after: "After" });
  });
});
