/**
 * @jest-environment jsdom
 */

// macro-fields.test.tsx — #451 regression net (#918 / #949 macro inputs).
//
// The four macro fields are STRINGS on purpose (blank = "no target", never 0);
// `numberOrNull` is what turns them into the wire value when the meal /
// template dialog saves. So the value that matters is numberOrNull's output —
// that is what reaches Firestore — plus the exact draft the inputs emit.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";

import {
  EMPTY_MACROS,
  MacroFields,
  numberOrNull,
  toMacroDraft,
  type MacroDraft,
} from "@/app/gc-fitness/library/_nutrition/macro-fields";

describe("numberOrNull — what the dialogs persist", () => {
  it.each<[string, number | null]>([
    ["", null],
    ["   ", null],
    ["12", 12],
    [" 12 ", 12],
    ["12.5", 12.5],
    ["12,5", 12.5], // Spanish-keyboard decimal comma
    [",5", 0.5],
    ["0", 0],
    ["2000", 2000],
    ["abc", null],
    ["12abc", null],
    ["12.5.3", null],
    ["Infinity", null],
    ["NaN", null],
  ])("%p → %p", (raw, expected) => {
    expect(numberOrNull(raw)).toBe(expected);
  });

  it("does NOT clamp negatives — the server schema (min 0) is the gate", () => {
    expect(numberOrNull("-5")).toBe(-5);
  });

  // BUG (medium): `raw.replace(",", ".")` only replaces the FIRST comma, and
  // a dot is never read as a thousands separator. An es-AR coach typing
  // "1.234,5" (how their locale writes 1234.5) gets "1.234.5" → NaN → null,
  // i.e. the target is SILENTLY DROPPED and the plan saves with "no target" —
  // exactly the "a field that silently drops what the keyboard produced reads
  // as broken" failure the helper's own comment warns about.
  // (`macro-fields.tsx:63`.) The correct result is either 1234.5 or a visible
  // validation error; the test pins the former.
  it.failing("reads a Spanish-formatted '1.234,5' as 1234.5 instead of dropping it", () => {
    expect(numberOrNull("1.234,5")).toBe(1234.5);
  });

  // Same root cause: "1,234,5"/"1,5,0" style typos come back as null with no
  // feedback. Documented (not marked failing): the right answer is a visible
  // error rather than a guessed number.
  it("a second comma currently makes the whole value null", () => {
    expect(numberOrNull("1,5,0")).toBeNull();
  });
});

describe("toMacroDraft", () => {
  it("missing / null fields become '', never '0'", () => {
    expect(toMacroDraft(null)).toEqual(EMPTY_MACROS);
    expect(toMacroDraft(undefined)).toEqual(EMPTY_MACROS);
    expect(toMacroDraft({ kcal: null, proteinG: undefined })).toEqual(EMPTY_MACROS);
  });

  it("zero is kept as '0' — a zero target is a statement", () => {
    expect(toMacroDraft({ kcal: 0, proteinG: 150, carbsG: 12.5, fatG: 60 })).toEqual({
      kcal: "0",
      proteinG: "150",
      carbsG: "12.5",
      fatG: "60",
    });
  });

  it("round-trips through numberOrNull", () => {
    const draft = toMacroDraft({ kcal: 1930, proteinG: 90, carbsG: 280, fatG: 50 });
    expect(Object.values(draft).map(numberOrNull)).toEqual([1930, 90, 280, 50]);
  });
});

function Harness({ initial = EMPTY_MACROS, drafts }: { initial?: MacroDraft; drafts: MacroDraft[] }) {
  const [value, setValue] = useState<MacroDraft>(initial);
  return (
    <MacroFields
      legend="Macros"
      help="Leave blank for no target."
      value={value}
      testIdPrefix="m"
      onChange={(next) => {
        drafts.push(next);
        setValue(next);
      }}
    />
  );
}

describe("MacroFields", () => {
  it("emits the full draft with only the edited key changed, as raw text", async () => {
    const user = userEvent.setup();
    const drafts: MacroDraft[] = [];
    render(<Harness drafts={drafts} initial={{ kcal: "2000", proteinG: "", carbsG: "", fatG: "" }} />);
    await user.type(screen.getByTestId("m-proteinG"), "12,5");
    expect(drafts.at(-1)).toEqual({ kcal: "2000", proteinG: "12,5", carbsG: "", fatG: "" });
    // ...and that raw text is what the dialogs persist as 12.5:
    expect(numberOrNull(drafts.at(-1)!.proteinG)).toBe(12.5);
  });

  it("keeps a half-typed '2.' instead of clearing it", async () => {
    const user = userEvent.setup();
    const drafts: MacroDraft[] = [];
    render(<Harness drafts={drafts} />);
    await user.type(screen.getByTestId("m-fatG"), "2.");
    expect(screen.getByTestId("m-fatG")).toHaveValue("2.");
    expect(drafts.at(-1)?.fatG).toBe("2.");
  });

  it("accepts letters as raw text (no silent rewrite) — they persist as null", async () => {
    const user = userEvent.setup();
    const drafts: MacroDraft[] = [];
    render(<Harness drafts={drafts} />);
    await user.type(screen.getByTestId("m-kcal"), "abc");
    expect(drafts.at(-1)?.kcal).toBe("abc");
    expect(numberOrNull(drafts.at(-1)!.kcal)).toBeNull();
  });

  it("clearing a field emits '' (no target), not '0'", async () => {
    const user = userEvent.setup();
    const drafts: MacroDraft[] = [];
    render(<Harness drafts={drafts} initial={{ kcal: "1800", proteinG: "", carbsG: "", fatG: "" }} />);
    await user.clear(screen.getByTestId("m-kcal"));
    expect(drafts.at(-1)?.kcal).toBe("");
    expect(numberOrNull(drafts.at(-1)!.kcal)).toBeNull();
  });

  it("labels the gram fields and uses a decimal keypad", () => {
    render(<Harness drafts={[]} />);
    expect(screen.getByText("P (g)")).toBeInTheDocument();
    expect(screen.getByText("C (g)")).toBeInTheDocument();
    expect(screen.getByText("G (g)")).toBeInTheDocument();
    expect(screen.getByTestId("m-kcal")).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByText("Leave blank for no target.")).toBeInTheDocument();
  });

  it("no hint with no macros; partial hint with some; full hint + mismatch with all four", () => {
    const { rerender } = render(
      <MacroFields legend="M" value={EMPTY_MACROS} onChange={() => undefined} testIdPrefix="m" />,
    );
    expect(screen.queryByTestId("m-kcal-hint")).not.toBeInTheDocument();

    rerender(
      <MacroFields
        legend="M"
        value={{ kcal: "", proteinG: "100", carbsG: "", fatG: "" }}
        onChange={() => undefined}
        testIdPrefix="m"
      />,
    );
    expect(screen.getByTestId("m-kcal-hint")).toHaveTextContent(
      "The macros entered add up to ≈400 kcal (some are missing).",
    );

    // 90 P / 280 C / 50 F = 360 + 1120 + 450 = 1930, with the comma decimal accepted.
    rerender(
      <MacroFields
        legend="M"
        value={{ kcal: "2000", proteinG: "90", carbsG: "280", fatG: "50,0" }}
        onChange={() => undefined}
        testIdPrefix="m"
      />,
    );
    expect(screen.getByTestId("m-kcal-hint")).toHaveTextContent("The macros add up to ≈1930 kcal.");
    expect(screen.getByTestId("m-kcal-hint")).toHaveTextContent("70 kcal below the target.");
  });
});
