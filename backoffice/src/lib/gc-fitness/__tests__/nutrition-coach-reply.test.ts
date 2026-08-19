// nutrition-coach-reply.test.ts
// The pure half of "el coach responde" (#926).
//
// What these lock:
//   1. the draft QUOTES the client and stops there — a canned opener is the thing a coach
//      sends by accident and a client reads as a template;
//   2. the quote is clipped at the chat's own snippet cap, so a long note cannot push the
//      coach's actual answer off a phone screen;
//   3. a meal is only "failing" once it has been asked enough times to mean anything —
//      two days in, one missed dinner is 50% and says nothing;
//   4. `neverHadPlan` is NOT an attention reason, and the nutrition signal stays SEPARATE
//      from the generic at-risk one.

import {
  FAILING_MEAL_MIN_EXPECTED,
  QUOTE_MAX,
  failingMealReplyDraft,
  failingMeals,
  nutritionNeedsAttention,
  nutritionNoteReplyDraft,
  nutritionNoteReplyHref,
  quoteNoteText,
  type MealBreakdownInput,
} from "../nutrition-coach-reply";

function mealRow(
  mealId: string,
  done: number,
  expected: number,
): MealBreakdownInput {
  return {
    mealId,
    name: { es: mealId, en: mealId },
    breakdown: { done, expected, ratio: expected === 0 ? 0 : done / expected },
  };
}

describe("quoteNoteText", () => {
  it("wraps the note in guillemets", () => {
    expect(quoteNoteText("salí tarde del trabajo")).toBe("«salí tarde del trabajo»");
  });

  it("clips at the chat's own snippet cap and marks the cut", () => {
    const long = "a".repeat(QUOTE_MAX + 50);
    const quoted = quoteNoteText(long)!;
    expect(quoted.endsWith("…»")).toBe(true);
    expect(quoted.length).toBeLessThan(long.length);
  });

  it("is null for an empty or whitespace-only note", () => {
    expect(quoteNoteText(null)).toBeNull();
    expect(quoteNoteText("   ")).toBeNull();
  });
});

describe("nutritionNoteReplyDraft", () => {
  const base = { mealName: "Cena", civilDate: "2026-08-14", locale: "es" };

  it("names the meal, dates it, quotes the client, and stops", () => {
    const draft = nutritionNoteReplyDraft({ ...base, note: "salí tarde del trabajo" });
    expect(draft).toContain("Cena");
    expect(draft).toContain("«salí tarde del trabajo»");
    // No canned opener. The context is ours; the answer has to be the coach's.
    expect(draft.toLowerCase()).not.toContain("hola");
  });

  it("leaves the cursor on a blank line for the coach to write", () => {
    const draft = nutritionNoteReplyDraft({ ...base, note: "algo" });
    expect(draft.endsWith("\n\n")).toBe(true);
  });

  it("still carries the meal and the day when the client wrote no note", () => {
    // A missed meal with no explanation is exactly the one worth asking about.
    const draft = nutritionNoteReplyDraft({ ...base, note: null });
    expect(draft).toContain("Cena");
    expect(draft).not.toContain("«");
    expect(draft.endsWith("\n\n")).toBe(true);
  });

  it("spells the date out — the client reads this days later in a thread", () => {
    const draft = nutritionNoteReplyDraft({ ...base, note: "algo", locale: "en" });
    expect(draft).toMatch(/Aug/);
    expect(draft).not.toContain("2026-08-14");
  });
});

describe("nutritionNoteReplyHref", () => {
  it("points at the coach inbox on this client's thread, draft encoded", () => {
    const href = nutritionNoteReplyHref("client-1", "Cena\n«tarde»\n\n");
    expect(href.startsWith("/gc-fitness/chat?")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("chatId")).toBe("client-1");
    expect(params.get("draft")).toBe("Cena\n«tarde»\n\n");
  });
});

describe("failingMeals", () => {
  it("ignores a meal that has not been asked enough times to mean anything", () => {
    // 1 of 3 is 33%, and it is noise: the phase started on Friday.
    expect(failingMeals([mealRow("dinner", 1, FAILING_MEAL_MIN_EXPECTED - 1)])).toEqual([]);
  });

  it("flags a meal under the bar once it has enough history", () => {
    const out = failingMeals([mealRow("dinner", 2, 9)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ mealId: "dinner", done: 2, expected: 9 });
  });

  it("leaves a merely imperfect meal alone", () => {
    // 7 of 10 is not the meal in the wrong place, and a card that flags four meals out of
    // five points at nothing.
    expect(failingMeals([mealRow("lunch", 7, 10)])).toEqual([]);
  });

  it("sorts worst first", () => {
    const out = failingMeals([mealRow("lunch", 4, 10), mealRow("dinner", 1, 10)]);
    expect(out.map((m) => m.mealId)).toEqual(["dinner", "lunch"]);
  });

  it("is stable when two meals are equally bad", () => {
    const out = failingMeals([mealRow("zzz", 1, 10), mealRow("aaa", 1, 10)]);
    expect(out.map((m) => m.mealId)).toEqual(["aaa", "zzz"]);
  });
});

describe("failingMealReplyDraft", () => {
  it("describes the PATTERN instead of quoting one day", () => {
    const draft = failingMealReplyDraft(
      { name: "Cena", done: 2, expected: 9 },
      { pattern: "2 de 9 días" },
    );
    expect(draft).toContain("Cena");
    expect(draft).toContain("2 de 9 días");
    expect(draft.endsWith("\n\n")).toBe(true);
  });
});

describe("nutritionNeedsAttention", () => {
  it("flags a phase that ran out with nothing behind it", () => {
    const out = nutritionNeedsAttention({
      ratio7d: 0.9,
      hasActivePlan: false,
      neverHadPlan: false,
    });
    expect(out).toEqual({ needsAttention: true, reasons: ["no-active-plan"] });
  });

  it("flags a client under the bar on a phase that IS in force", () => {
    const out = nutritionNeedsAttention({
      ratio7d: 0.3,
      hasActivePlan: true,
      neverHadPlan: false,
    });
    expect(out).toEqual({ needsAttention: true, reasons: ["low-adherence"] });
  });

  it("never flags a client nobody ever gave a plan to", () => {
    // Nothing was asked, so there is nothing to chase — and flagging it would put every
    // not-yet-started client on the same list as the ones who are failing.
    const out = nutritionNeedsAttention({
      ratio7d: null,
      hasActivePlan: false,
      neverHadPlan: true,
    });
    expect(out).toEqual({ needsAttention: false, reasons: [] });
  });

  it("leaves a client doing well alone", () => {
    const out = nutritionNeedsAttention({
      ratio7d: 0.85,
      hasActivePlan: true,
      neverHadPlan: false,
    });
    expect(out.needsAttention).toBe(false);
  });

  it("does not flag an active phase that has asked nothing yet", () => {
    // `ratio7d: null` is "nothing was asked in the window" — a phase starting tomorrow.
    // Reading it as zero would send the coach to have the wrong conversation.
    const out = nutritionNeedsAttention({
      ratio7d: null,
      hasActivePlan: true,
      neverHadPlan: false,
    });
    expect(out.needsAttention).toBe(false);
  });
});
