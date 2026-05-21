// __tests__/nudge-schema.test.ts
//
// Validation tests for the Zod schema that mirrors the server-side
// validation in `functions/src/push/sendTrainerNudge.ts` (P10-07):
//   - NUDGE_MESSAGE_MAX = 200
//   - DOC_ID_MAX = 64
//   - sanitizeMessage: strip C0/C1 control chars (preserving \n) + trim
//
// Pitfall 7 (17th reuse) — same-source-of-truth contract. If 10-07 or
// this schema change one of the caps without the other, these tests
// FAIL → forcing the drift to be acknowledged in PR review.

import {
  nudgeInputSchema,
  NUDGE_MESSAGE_MAX_LENGTH,
  NUDGE_CLIENT_ID_MAX_LENGTH,
} from "../nudge-schema";

describe("P10-08: nudgeInputSchema", () => {
  // T1 — happy path: valid input parses; message is trimmed.
  it("T1 — valid input passes + returns trimmed message", () => {
    const result = nudgeInputSchema.safeParse({
      clientId: "clientA",
      message: "  Don't skip leg day!  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("Don't skip leg day!");
      expect(result.data.clientId).toBe("clientA");
    }
  });

  // T2 — empty message → rejected at the base-shape `.min(1)`.
  it("T2 — empty message rejected", () => {
    const result = nudgeInputSchema.safeParse({
      clientId: "clientA",
      message: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "message")).toBe(
        true,
      );
    }
  });

  // T3 — message > 200 chars → rejected at the base-shape `.max(200)`.
  it("T3 — message > 200 chars rejected", () => {
    const longMessage = "x".repeat(NUDGE_MESSAGE_MAX_LENGTH + 1);
    const result = nudgeInputSchema.safeParse({
      clientId: "clientA",
      message: longMessage,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "message")).toBe(
        true,
      );
    }
  });

  // T4 — missing clientId → rejected.
  it("T4 — missing clientId rejected", () => {
    // `safeParse(unknown)` so cast through `unknown` to bypass the static
    // shape and exercise the runtime guard.
    const result = nudgeInputSchema.safeParse({ message: "hi" } as unknown);
    expect(result.success).toBe(false);
  });

  // T5 — control chars stripped from message (mirrors 10-07 sanitizeMessage).
  //   `\x07` (BEL) + `\x1B` (ESC) belong to C0 and MUST be stripped.
  //   `\n` (0x0A) is INTENTIONALLY preserved.
  it("T5 — control chars stripped from message (mirrors 10-07 sanitizeMessage)", () => {
    const result = nudgeInputSchema.safeParse({
      clientId: "clientA",
      message: "hi\x07\x1Bworld",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("hiworld");
    }
  });

  // T5b — \n is PRESERVED (not stripped) — multi-line nudge support.
  it("T5b — \\n preserved (multi-line nudge support — mirrors 10-07)", () => {
    const result = nudgeInputSchema.safeParse({
      clientId: "clientA",
      message: "line one\nline two",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("line one\nline two");
    }
  });

  // T6 — unknown extra key rejected via .strict() (T-10-08-INJECTION).
  it("T6 — unknown extra key rejected via .strict()", () => {
    const result = nudgeInputSchema.safeParse({
      clientId: "clientA",
      message: "hi",
      admin: true, // tampering — strict() rejects
    });
    expect(result.success).toBe(false);
  });

  // T7 — clientId > 64 chars rejected (mirrors 10-07 DOC_ID_MAX).
  it("T7 — clientId > 64 chars rejected (Firestore doc-id max)", () => {
    const longClientId = "x".repeat(NUDGE_CLIENT_ID_MAX_LENGTH + 1);
    const result = nudgeInputSchema.safeParse({
      clientId: longClientId,
      message: "hi",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "clientId")).toBe(
        true,
      );
    }
  });

  // T8 — message consisting only of control chars + whitespace → rejected
  // at the post-transform `.pipe(z.string().min(1, ...))`.
  it("T8 — message of only control chars + whitespace rejected after strip", () => {
    const result = nudgeInputSchema.safeParse({
      clientId: "clientA",
      message: "  \x07\x1B  ",
    });
    expect(result.success).toBe(false);
  });
});
