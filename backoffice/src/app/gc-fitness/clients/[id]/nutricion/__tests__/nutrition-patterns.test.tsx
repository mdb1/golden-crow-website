/**
 * @jest-environment jsdom
 */

// nutrition-patterns.test.tsx — the coach's "Por qué falla" + "Más números" (gc-fitness#1148).
// The numbers come from the twins (which have their own suites); this pins what the coach READS:
// the headline sentence with its denominator, the reasons, and the empty state instead of a
// "pattern" made of two bad days.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import React from "react";

import { log, phaseA } from "@/lib/gc-fitness/__tests__/nutrition-fixtures";
import { analyzeNutritionExcuses, nutritionNotePresetGroups } from "@/lib/gc-fitness/nutrition-excuses";
import { nutritionHighlights } from "@/lib/gc-fitness/nutrition-highlights";

import { NutritionPatterns } from "../_components/NutritionPatterns";

function renderFor(logs: ReturnType<typeof log>[]) {
  const excuses = analyzeNutritionExcuses([phaseA()], logs, "2026-08-03", "2026-08-30", nutritionNotePresetGroups("en"));
  const highlights = nutritionHighlights([phaseA()], logs, "2026-08-03", "2026-08-30");
  render(<NutritionPatterns excuses={excuses} highlights={highlights} rangeDays={28} />);
}

describe("NutritionPatterns", () => {
  it("leads with the meal × weekday, its denominator and the top reasons", () => {
    renderFor([
      log("2026-08-06", { m3: { status: "missed", note: "Pizza con amigos" } }),
      log("2026-08-13", { m3: { status: "missed", note: "Pizza con amigos" } }),
      log("2026-08-20", { m3: { status: "missed", note: "Comí afuera" } }),
      log("2026-08-21", { m1: { status: "done" } }),
    ]);
    expect(screen.getByTestId("nutrition-patterns-headline")).toHaveTextContent(
      "Tends to miss Dinner on Thursdays: 3 of 4 (75%).",
    );
    // The Spanish preset reads in the coach's language.
    expect(screen.getByTestId("nutrition-patterns-reason-0")).toHaveTextContent("Pizza con amigos");
    expect(screen.getByTestId("nutrition-patterns-reason-1")).toHaveTextContent("Ate out");
    expect(screen.getByTestId("nutrition-highlight-perfect-days")).toHaveTextContent("Perfect days0 of 28");
    expect(document.body.textContent).not.toMatch(/patterns[A-Z]|highlights[A-Z]/);
  });

  it("says there is not enough yet instead of inventing a pattern", () => {
    renderFor([
      log("2026-08-06", { m3: { status: "missed", note: "Pizza" } }),
      log("2026-08-13", { m3: { status: "missed", note: "Pizza" } }),
    ]);
    expect(screen.getByTestId("nutrition-patterns-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("nutrition-patterns-headline")).not.toBeInTheDocument();
  });
});
