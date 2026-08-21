// __tests__/smtp-password.test.ts — issue #970.
//
// Google shows an App Password as "abcd efgh ijkl mnop". Pasted as shown, the
// spaces become part of the credential and Gmail answers `535 Username and
// Password not accepted` — which reads like a wrong password, so the natural
// next move is to regenerate it and paste it wrong again.
//
// The guard has to be narrow in BOTH directions, which is what these tests pin:
// it must fix the Google shape, and it must not touch a real password that
// happens to contain a space.

import { normalizeSmtpPassword } from "../email/smtp";

describe("normalizeSmtpPassword", () => {
  it("de-spaces a Google App Password pasted exactly as displayed", () => {
    expect(normalizeSmtpPassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
  });

  it("leaves an already-correct App Password alone", () => {
    expect(normalizeSmtpPassword("abcdefghijklmnop")).toBe("abcdefghijklmnop");
  });

  it("trims the stray whitespace a copy-paste picks up", () => {
    expect(normalizeSmtpPassword("  abcd efgh ijkl mnop \n")).toBe(
      "abcdefghijklmnop",
    );
  });

  /**
   * The other direction, and the reason the pattern is a shape and not a
   * blanket strip: mangling a correct credential would be a worse bug than the
   * one this fixes, and it would fail identically — 535, looks like a typo.
   */
  it.each([
    ["correct horse battery staple", "a passphrase with spaces"],
    ["abcd efgh ijkl mnopq", "five characters in the last group"],
    ["abcd efgh ijkl", "only three groups"],
    ["abcd  efgh ijkl mnop", "a double space"],
    ["ab!d efgh ijkl mnop", "a non-alphanumeric character"],
    ["abcd efgh ijkl mnop qrst", "five groups"],
  ])("leaves %j untouched (%s)", (raw) => {
    expect(normalizeSmtpPassword(raw)).toBe(raw.trim());
  });

  it("does not invent a password out of whitespace", () => {
    expect(normalizeSmtpPassword("   ")).toBe("");
  });
});
