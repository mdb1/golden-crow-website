import { normalizeMirrorEmail } from "../email-normalization";

// Unit tests for normalizeMirrorEmail — the canonical mirror-email normalizer
// shared by trainer provisioning + pending assignment/habit actions. It MUST
// stay in parity with the functions/auth side, so the Gmail dot/plus rules and
// the googlemail alias are locked here (roadmap section D — untested pure helper).

describe("normalizeMirrorEmail", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeMirrorEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });

  describe("Gmail canonicalization", () => {
    it("strips dots from the local part", () => {
      expect(normalizeMirrorEmail("first.last@gmail.com")).toBe("firstlast@gmail.com");
      expect(normalizeMirrorEmail("a.b.c@gmail.com")).toBe("abc@gmail.com");
    });

    it("strips the +tag suffix from the local part", () => {
      expect(normalizeMirrorEmail("user+newsletter@gmail.com")).toBe("user@gmail.com");
    });

    it("strips BOTH dots and +tag together", () => {
      expect(normalizeMirrorEmail("Foo.Bar+spam@Gmail.com")).toBe("foobar@gmail.com");
    });

    it("treats googlemail.com as gmail.com (and applies the gmail rules)", () => {
      expect(normalizeMirrorEmail("user@googlemail.com")).toBe("user@gmail.com");
      expect(normalizeMirrorEmail("a.b+x@googlemail.com")).toBe("ab@gmail.com");
    });

    it("is idempotent on an already-normalized gmail address", () => {
      expect(normalizeMirrorEmail("user@gmail.com")).toBe("user@gmail.com");
    });

    it("only strips text AFTER the first plus", () => {
      expect(normalizeMirrorEmail("tag+a+b@gmail.com")).toBe("tag@gmail.com");
    });
  });

  describe("non-Gmail domains keep dots and plus", () => {
    it("preserves dots in the local part", () => {
      expect(normalizeMirrorEmail("first.last@outlook.com")).toBe("first.last@outlook.com");
    });

    it("preserves +tag", () => {
      expect(normalizeMirrorEmail("user+tag@proton.me")).toBe("user+tag@proton.me");
    });

    it("does NOT rewrite a lookalike domain", () => {
      expect(normalizeMirrorEmail("a.b@gmail.com.evil.com")).toBe("a.b@gmail.com.evil.com");
    });
  });

  describe("malformed / degenerate input is returned lowercased, unchanged structurally", () => {
    it("no @ sign", () => {
      expect(normalizeMirrorEmail("NotAnEmail")).toBe("notanemail");
    });

    it("leading @ (empty local part)", () => {
      expect(normalizeMirrorEmail("@Gmail.com")).toBe("@gmail.com");
    });

    it("trailing @ (empty domain)", () => {
      expect(normalizeMirrorEmail("user@")).toBe("user@");
    });

    it("empty string", () => {
      expect(normalizeMirrorEmail("")).toBe("");
    });
  });
});
