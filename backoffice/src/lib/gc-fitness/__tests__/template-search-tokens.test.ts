// template-search-tokens.test.ts
//
// Regression for the workout (template) list search: a plain substring
// `includes` failed multi-word queries because punctuation in the template
// name breaks the span — "nete etapa" didn't match "Nete - Etapa 3 - Dia 1"
// since " - " sits between the two words. The list now uses fuzzyTokenScore
// (the same normalized, token-based matcher as the exercise search).

import { fuzzyTokenScore } from "../exercise-search";

// Mirror the haystack the templates client builds: name.en + name.es + tags.
function templateScore(query: string, name: string, tags: string[] = []): number {
  return fuzzyTokenScore(query, [name, ...tags].join(" "));
}

describe("template list token search", () => {
  it('matches "nete etapa" against "Nete - Etapa 3 - Dia 1" (the bug)', () => {
    expect(templateScore("nete etapa", "Nete - Etapa 3 - Dia 1")).toBeGreaterThan(0);
  });

  it('still matches the single token "nete"', () => {
    expect(templateScore("nete", "Nete - Etapa 3 - Dia 1")).toBeGreaterThan(0);
  });

  it('matches "nete et" (partial trailing token)', () => {
    expect(templateScore("nete et", "Nete - Etapa 3 - Dia 1")).toBeGreaterThan(0);
  });

  it("does not match an unrelated query", () => {
    expect(templateScore("legs press", "Nete - Etapa 3 - Dia 1")).toBe(0);
  });

  it("matches against a tag word too", () => {
    expect(templateScore("pull nete", "Tiroides 2 Nete", ["Nete", "Pull"])).toBeGreaterThan(0);
  });

  it('ranks an exact-ish name above a looser match for "push nete"', () => {
    const exact = templateScore("push nete", "Push 2 NETE", ["Nete"]);
    const loose = templateScore("push nete", "Nete - Etapa 3 - Dia 1", ["Nete"]);
    expect(exact).toBeGreaterThan(loose);
  });
});
