// action-result.test.ts — #451 regression net.
//
// The #1104 rule: Server Actions RETURN failures because Next.js redacts
// thrown messages in production. These helpers turn whatever was thrown into a
// coach-safe one-liner.

import { z } from "zod";

import { GENERIC_ACTION_ERROR, toActionFailure, zodErrorToMessage } from "../action-result";

function zodError(schema: z.ZodTypeAny, value: unknown): z.ZodError {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("expected a parse failure");
  return result.error;
}

describe("zodErrorToMessage", () => {
  it("returns the schema's own message verbatim", () => {
    const err = zodError(z.object({ url: z.string().url("Enter a valid image link (https://…).") }), {
      url: "not a url",
    });
    expect(zodErrorToMessage(err)).toBe("Enter a valid image link (https://…).");
  });

  it("dedupes repeated messages and joins distinct ones with a space", () => {
    const schema = z.object({
      a: z.string().min(1, "Required."),
      b: z.string().min(1, "Required."),
      c: z.number().min(1, "Too small."),
    });
    expect(zodErrorToMessage(zodError(schema, { a: "", b: "", c: 0 }))).toBe("Required. Too small.");
  });

  it("caps at three lines", () => {
    const schema = z.object({
      a: z.string().min(1, "One."),
      b: z.string().min(1, "Two."),
      c: z.string().min(1, "Three."),
      d: z.string().min(1, "Four."),
    });
    expect(zodErrorToMessage(zodError(schema, { a: "", b: "", c: "", d: "" }))).toBe(
      "One. Two. Three.",
    );
  });

  it("trims messages and skips blank ones; all-blank falls back to the generic copy", () => {
    const err = new z.ZodError([
      { code: "custom", message: "   ", path: ["a"], input: undefined },
      { code: "custom", message: "  Pick one.  ", path: ["b"], input: undefined },
    ]);
    expect(zodErrorToMessage(err)).toBe("Pick one.");
    const blank = new z.ZodError([{ code: "custom", message: "", path: [], input: undefined }]);
    expect(zodErrorToMessage(blank)).toBe(GENERIC_ACTION_ERROR);
    expect(zodErrorToMessage(new z.ZodError([]))).toBe(GENERIC_ACTION_ERROR);
  });
});

describe("toActionFailure", () => {
  it("flattens a ZodError", () => {
    const err = zodError(z.string().min(3, "Too short."), "x");
    expect(toActionFailure(err)).toEqual({ ok: false, error: "Too short." });
  });

  it("passes an Error's message through — including the uniform 'Forbidden'", () => {
    expect(toActionFailure(new Error("Enter a name."))).toEqual({ ok: false, error: "Enter a name." });
    expect(toActionFailure(new Error("Forbidden"))).toEqual({ ok: false, error: "Forbidden" });
  });

  it("uses the generic copy for a blank Error message", () => {
    expect(toActionFailure(new Error("   "))).toEqual({ ok: false, error: GENERIC_ACTION_ERROR });
    expect(toActionFailure(new Error())).toEqual({ ok: false, error: GENERIC_ACTION_ERROR });
  });

  it.each(["boom", 42, null, undefined, { message: "not an Error" }])(
    "never echoes a non-Error throw (%p) — generic copy",
    (thrown) => {
      expect(toActionFailure(thrown)).toEqual({ ok: false, error: GENERIC_ACTION_ERROR });
    },
  );

  it("always returns ok:false with a string error", () => {
    const result = toActionFailure(new TypeError("x"));
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
  });
});
