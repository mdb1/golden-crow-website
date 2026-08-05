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
//   3. the NEWEST photo can never be the "before".
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

let searchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

import { ProgressPhotoCompareEditor } from "../photo-compare-editor";

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

function renderEditor(photos: ProgressPhotoRow[], query = "") {
  searchParams = new URLSearchParams(query);
  render(
    <ProgressPhotoCompareEditor
      photos={photos}
      timezone={TZ}
      clientName="Ana Gomez"
    />,
  );
  return { user: userEvent.setup() };
}

/**
 * The three selects carry no label, so they are identified by an option only
 * they can have — indexing `getAllByRole("combobox")` blindly is the trap that
 * already cost time on the exercise pickers.
 */
function selectNamed(kind: "angle" | "before" | "after"): HTMLSelectElement {
  const marker = kind === "angle" ? "Front" : kind === "before" ? "Before" : "After";
  const node = screen
    .getAllByRole("combobox")
    .find((el) =>
      Array.from(el.querySelectorAll("option")).some(
        (opt) => opt.textContent === marker,
      ),
    );
  if (!node) throw new Error(`${kind} select not found`);
  return node as HTMLSelectElement;
}

/** The option for `photoId` inside one of the pickers. */
function optionFor(kind: "before" | "after", photoId: string): HTMLOptionElement {
  const opt = selectNamed(kind).querySelector<HTMLOptionElement>(
    `option[value="${photoId}"]`,
  );
  if (!opt) throw new Error(`no ${kind} option for ${photoId}`);
  return opt;
}

function selectedIds(): { before: string; after: string } {
  return {
    before: selectNamed("before").value,
    after: selectNamed("after").value,
  };
}

describe("ProgressPhotoCompareEditor — which photos the pickers offer", () => {
  it("opens on the two most recent photos: newest as AFTER, next as BEFORE", () => {
    renderEditor(THREE);

    expect(selectedIds()).toEqual({ before: "may", after: "jun" });
  });

  it("refuses the NEWEST photo as 'before' (#435 rule 3)", () => {
    renderEditor(THREE);

    expect(optionFor("before", "jun")).toBeDisabled();
    expect(optionFor("before", "may")).toBeEnabled();
    expect(optionFor("before", "mar")).toBeEnabled();
  });

  it("refuses the OLDEST photo as 'after' (#435 rule 4)", () => {
    renderEditor(THREE);

    expect(optionFor("after", "mar")).toBeDisabled();
  });

  it("refuses an 'after' that is not STRICTLY later than the before (#435 rule 1)", async () => {
    // Same civil day: two photos from one check-in have nothing to show, so
    // `photoCompareElapsed` returns null and the option must not be pickable.
    const sameDay = photo({ id: "jun-2", checkInDate: "2026-06-01" });
    const { user } = renderEditor([NEWEST, sameDay, MIDDLE, OLDEST]);

    await user.selectOptions(selectNamed("before"), "jun-2");

    expect(optionFor("after", "jun")).toBeDisabled(); // same civil day
    expect(optionFor("after", "may")).toBeDisabled(); // earlier
    expect(optionFor("after", "mar")).toBeDisabled(); // earlier AND oldest
  });

  it("DEAD END when the two most recent photos share a check-in day", async () => {
    // Found writing this file, and it is a live defect, not a harness artifact.
    // The default pair is positional (`angled[1]` vs `angled[0]`) with NO date
    // check, so a client who uploaded two front photos on one day opens the
    // comparator on a pair that rule 1 itself forbids — and cannot get out of
    // it: every option in the after picker is disabled, and re-picking the
    // before snaps the after back to that same newest photo.
    //
    // This test pins the CURRENT (broken) behaviour so the fix has something
    // to flip. See the issue linked from #306.
    const sameDay = photo({ id: "jun-2", checkInDate: "2026-06-01" });
    renderEditor([NEWEST, sameDay, MIDDLE, OLDEST]);

    expect(selectedIds()).toEqual({ before: "jun-2", after: "jun" });
    // …a same-day pair, which is exactly what rule 1 exists to prevent.
    const afterOptions = Array.from(
      selectNamed("after").querySelectorAll("option[value]:not([value=''])"),
    );
    expect(afterOptions.every((o) => (o as HTMLOptionElement).disabled)).toBe(true);
  });

  it("leaves out photos of another angle", () => {
    renderEditor([NEWEST, photo({ id: "side-1", angle: "side" }), MIDDLE, OLDEST]);

    expect(
      selectNamed("before").querySelector('option[value="side-1"]'),
    ).toBeNull();
  });

  it("leaves out photos with no URL — they cannot be compared", () => {
    // A row whose signed URL failed to mint still comes back from the loader.
    renderEditor([NEWEST, photo({ id: "broken", url: null }), MIDDLE, OLDEST]);

    expect(
      selectNamed("after").querySelector('option[value="broken"]'),
    ).toBeNull();
  });

  it("treats a photo with no angle as a FRONT photo", () => {
    // Legacy rows predate the angle field; dropping them would empty the
    // comparator for clients who only ever uploaded from the old app.
    renderEditor([photo({ id: "legacy", angle: null, checkInDate: "2026-07-01" }), MIDDLE]);

    expect(optionFor("after", "legacy")).toBeInTheDocument();
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
    await user.selectOptions(selectNamed("before"), "jun");

    expect(selectedIds()).toEqual({ before: "jun", after: "jul" });
  });

  it("snaps away from an after that the new before has overtaken", async () => {
    const july = photo({ id: "jul", checkInDate: "2026-07-01" });
    const { user } = renderEditor(
      [july, NEWEST, MIDDLE, OLDEST],
      "before=mar&after=may",
    );

    await user.selectOptions(selectNamed("before"), "jun");

    expect(selectedIds()).toEqual({ before: "jun", after: "jul" });
  });

  it("leaves a still-valid after alone", async () => {
    const { user } = renderEditor(THREE);

    await user.selectOptions(selectNamed("before"), "mar");

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

    await user.selectOptions(selectNamed("angle"), "back");

    expect(selectedIds()).toEqual({ before: "back-mar", after: "back-jun" });
  });

  it("falls back to the single photo for BOTH halves when the angle has only one", async () => {
    const onlyBack = photo({ id: "back-1", angle: "back", checkInDate: "2026-04-01" });
    const { user } = renderEditor([NEWEST, onlyBack, MIDDLE]);

    await user.selectOptions(selectNamed("angle"), "back");

    // Same photo on both sides is not a comparison — and the pickers say so:
    // it is simultaneously the newest (disabled as before) and the oldest
    // (disabled as after).
    expect(selectedIds()).toEqual({ before: "back-1", after: "back-1" });
    expect(optionFor("before", "back-1")).toBeDisabled();
    expect(optionFor("after", "back-1")).toBeDisabled();
  });
});

describe("ProgressPhotoCompareEditor — the URL seeds the pair", () => {
  it("honours ?angle=, ?before= and ?after=", () => {
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
  it("labels an option by its checkInDate, NOT by the upload instant", () => {
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

    expect(optionFor("after", "jun").textContent).toContain("June 1, 2026");
  });

  it("falls back to the takenAt instant in the CLIENT's timezone", () => {
    // 2026-06-01T02:00Z is still May 31 in Buenos Aires (UTC-3).
    renderEditor([
      photo({ id: "no-checkin", checkInDate: null, takenAt: "2026-06-01T02:00:00.000Z" }),
      MIDDLE,
    ]);

    expect(optionFor("after", "no-checkin").textContent).toContain("May 31");
  });

  it("tells the coach how much time each candidate covers", async () => {
    const { user } = renderEditor([
      photo({ id: "aug", checkInDate: "2026-08-01" }), // 3 months
      photo({ id: "jun15", checkInDate: "2026-06-15" }), // ~1 month
      photo({ id: "jun08", checkInDate: "2026-06-08" }), // 1 week
      photo({ id: "jun04", checkInDate: "2026-06-04" }), // 3 days
      photo({ id: "may", checkInDate: "2026-05-01" }),
    ]);

    await user.selectOptions(selectNamed("before"), "jun04");

    expect(optionFor("after", "jun08").textContent).toContain("(4 days)");
    expect(optionFor("after", "jun15").textContent).toContain("(~1 week)");
    expect(optionFor("after", "aug").textContent).toContain("(~1 month)");
  });
});

describe("ProgressPhotoCompareEditor — nothing to compare", () => {
  it("says so instead of rendering half a comparison", () => {
    renderEditor([]);

    expect(screen.getByText("Seleccioná fotos para comparar.")).toBeInTheDocument();
  });

  it("renders the two panels once a valid pair resolves", () => {
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
