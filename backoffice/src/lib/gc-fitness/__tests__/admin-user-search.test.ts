// __tests__/admin-user-search.test.ts
//
// Unit coverage for the pure email-prefix range-bound builder used by the
// admin user-email search (GitHub issue #163). These exports are side-effect
// free (no firebase imports) — the unit-testable seam for the Admin-SDK query.
//
// The server-action block (searchUsersByEmailForAdmin) is appended later and
// mirrors admin-actions.app-config.test.ts mocks.

import {
  buildEmailPrefixBounds,
  normalizeSearchQuery,
} from "../admin-user-search";

// Standard Firestore prefix-range upper-bound sentinel (highest BMP private-use
// code point). The PLAN renders `endAt` as the bare query because the sentinel
// is a non-printing glyph; the real upper bound is `q + SENTINEL`.
const SENTINEL = "";

describe("normalizeSearchQuery", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeSearchQuery("  Foo@Example.COM ")).toBe("foo@example.com");
  });

  it("does NOT apply gmail dot/plus canonicalization (literal prefix matching)", () => {
    // Unlike normalizeMirrorEmail, this keeps dots + the +tag so the literal
    // stored email prefix matches.
    expect(normalizeSearchQuery("First.Last+tag@Gmail.com")).toBe(
      "first.last+tag@gmail.com",
    );
  });

  it("returns empty string for an all-whitespace input", () => {
    expect(normalizeSearchQuery("   ")).toBe("");
  });
});

describe("buildEmailPrefixBounds", () => {
  it("builds a [q, q+sentinel] range for a non-empty query", () => {
    expect(buildEmailPrefixBounds("ab")).toEqual({
      startAt: "ab",
      endAt: "ab" + SENTINEL,
    });
  });

  it("returns null for an empty query", () => {
    expect(buildEmailPrefixBounds("")).toBeNull();
  });

  it("returns null for an all-whitespace query", () => {
    expect(buildEmailPrefixBounds("   ")).toBeNull();
  });

  it("normalizes (trim + lowercase) before building bounds", () => {
    expect(buildEmailPrefixBounds("  AB ")).toEqual({
      startAt: "ab",
      endAt: "ab" + SENTINEL,
    });
  });

  it("uses the high-codepoint sentinel as the upper bound", () => {
    const bounds = buildEmailPrefixBounds("john@");
    expect(bounds).not.toBeNull();
    expect(bounds!.startAt).toBe("john@");
    expect(bounds!.endAt).toBe("john@" + SENTINEL);
  });
});
