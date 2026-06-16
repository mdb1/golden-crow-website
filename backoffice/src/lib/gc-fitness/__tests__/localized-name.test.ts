// __tests__/localized-name.test.ts
//
// Coach-language-first name rendering helper used by the habit library + the
// habit assignment pickers. The trainer's active locale picks the primary
// line; the other language is a subtitle only when distinct.

import { localizedNamePair } from "../localized-name";

describe("localizedNamePair", () => {
  const name = { en: "Reading", es: "Lectura" };

  it("puts Spanish first for an es locale, English as subtitle", () => {
    expect(localizedNamePair(name, "es")).toEqual({
      primary: "Lectura",
      secondary: "Reading",
    });
  });

  it("puts English first for an en locale, Spanish as subtitle", () => {
    expect(localizedNamePair(name, "en")).toEqual({
      primary: "Reading",
      secondary: "Lectura",
    });
  });

  it("treats a region-tagged locale (es-AR) as Spanish-first", () => {
    expect(localizedNamePair(name, "es-AR").primary).toBe("Lectura");
  });

  it("hides the subtitle when both languages are identical", () => {
    expect(localizedNamePair({ en: "Mobility", es: "Mobility" }, "es")).toEqual({
      primary: "Mobility",
      secondary: null,
    });
  });

  it("falls back to the other language when the primary is blank", () => {
    expect(localizedNamePair({ en: "Only EN", es: "" }, "es")).toEqual({
      primary: "Only EN",
      secondary: null,
    });
  });

  it("tolerates null / undefined fields", () => {
    expect(localizedNamePair({ en: null, es: undefined }, "en")).toEqual({
      primary: "",
      secondary: null,
    });
    expect(localizedNamePair(null, "es")).toEqual({
      primary: "",
      secondary: null,
    });
  });
});
