// client-name.test.ts — #451 regression net.
//
// The single name rule every coach surface uses: coach nickname → display
// name → email → uid, skipping whitespace-only values at each step.

import { coachVisibleClientName } from "../client-name";

function client(overrides: Partial<Parameters<typeof coachVisibleClientName>[0]> = {}) {
  return {
    uid: "uid-1",
    email: "ana@example.com",
    displayName: "Ana García",
    coachNickname: null,
    ...overrides,
  };
}

describe("coachVisibleClientName", () => {
  it("prefers the coach's nickname, trimmed", () => {
    expect(coachVisibleClientName(client({ coachNickname: "  Anita  " }))).toBe("Anita");
  });

  it("falls back to the display name when the nickname is null / undefined / blank", () => {
    expect(coachVisibleClientName(client())).toBe("Ana García");
    expect(coachVisibleClientName(client({ coachNickname: undefined }))).toBe("Ana García");
    expect(coachVisibleClientName(client({ coachNickname: "   " }))).toBe("Ana García");
  });

  it("trims the display name", () => {
    expect(coachVisibleClientName(client({ displayName: "  Ana  " }))).toBe("Ana");
  });

  it("falls back to the email, then the uid", () => {
    expect(coachVisibleClientName(client({ displayName: "  " }))).toBe("ana@example.com");
    expect(coachVisibleClientName(client({ displayName: "", email: " " }))).toBe("uid-1");
  });

  it("does not escape or alter markup — rendering is React's job", () => {
    expect(coachVisibleClientName(client({ coachNickname: "<b>Ana</b>" }))).toBe("<b>Ana</b>");
  });
});
