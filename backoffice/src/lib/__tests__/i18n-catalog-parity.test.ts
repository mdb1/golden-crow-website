// i18n-catalog-parity.test.ts
//
// Guards the two next-intl catalogs against drifting apart.
//
// What breaks on screen when they drift:
//   - a key only in one locale → next-intl renders the raw dotted key for the
//     other locale's coaches;
//   - an ICU ARGUMENT renamed in one locale (`{name}` vs `{nombre}`) → the call
//     site passes `name`, so the Spanish string throws a FORMATTING_ERROR and
//     falls back to the key;
//   - a rich-text TAG that exists in one locale only → `t.rich` has no renderer
//     for it (or the other locale renders literal "<strong>").
//
// "Argument" here is parsed, not grepped: plural / select branch text and
// selectors are not arguments, an argument nested inside a branch is. The reader
// (`icuSignature`) was cross-checked against @formatjs/icu-messageformat-parser
// (the parser next-intl runs) on every message of both catalogs — identical.

import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import {
  flattenCatalog,
  icuSignature,
  type Catalog,
} from "@/lib/test-utils/i18n-catalog";

const en = flattenCatalog(enMessages as Catalog);
const es = flattenCatalog(esMessages as Catalog);

describe("icuSignature (the ICU reader the parity checks rely on)", () => {
  it("returns plain arguments", () => {
    expect(icuSignature("Hi {name}, you have {count} new")).toEqual({
      args: ["count", "name"],
      tags: [],
    });
  });

  it("counts the plural argument but NOT its selectors or branch text", () => {
    expect(
      icuSignature("{count, plural, =0 {none} one {# item} other {# items}}"),
    ).toEqual({ args: ["count"], tags: [] });
  });

  it("does count an argument nested inside a plural/select branch", () => {
    expect(
      icuSignature("{g, select, male {he met {who}} other {they met {who}}}"),
    ).toEqual({ args: ["g", "who"], tags: [] });
    expect(
      icuSignature("{n, plural, offset:1 one {just {who}} other {{who} and # more}}"),
    ).toEqual({ args: ["n", "who"], tags: [] });
  });

  it("reads typed arguments (number/date) by name only", () => {
    expect(icuSignature("{d, date, short} · {kg, number, ::unit/kilogram}")).toEqual({
      args: ["d", "kg"],
      tags: [],
    });
  });

  it("follows ICU apostrophe quoting like intl-messageformat", () => {
    // `'` before a brace quotes it → not an argument.
    expect(icuSignature("'{literal}' then {real}").args).toEqual(["real"]);
    // A plain apostrophe (English possessive) does NOT quote.
    expect(icuSignature("{client}'s birthday").args).toEqual(["client"]);
    // `''` is an escaped apostrophe.
    expect(icuSignature("it''s {x}").args).toEqual(["x"]);
  });

  it("collects rich-text tags (open tag names only)", () => {
    expect(
      icuSignature("Assigned to <client>{name}</client> · <strong>{n}</strong>"),
    ).toEqual({ args: ["n", "name"], tags: ["client", "strong"] });
  });

  it("rejects malformed messages instead of guessing", () => {
    expect(() => icuSignature("{unclosed")).toThrow();
    expect(() => icuSignature("stray }")).toThrow();
    expect(() => icuSignature("{n, plural, one}")).toThrow();
  });
});

describe("messages/en.json ↔ messages/es.json", () => {
  it("catalogs are non-trivial (sanity: the import did not come back empty)", () => {
    expect(en.size).toBeGreaterThan(2000);
  });

  it("have exactly the same key set", () => {
    const onlyEn = [...en.keys()].filter((k) => !es.has(k)).sort();
    const onlyEs = [...es.keys()].filter((k) => !en.has(k)).sort();
    expect({ onlyEn, onlyEs }).toEqual({ onlyEn: [], onlyEs: [] });
  });

  it("every leaf is a non-empty string", () => {
    const bad: string[] = [];
    for (const [locale, map] of [["en", en], ["es", es]] as const) {
      for (const [key, value] of map) {
        if (typeof value !== "string" || value.trim() === "") bad.push(`${locale}:${key}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every message parses as ICU in both locales", () => {
    const broken: string[] = [];
    for (const [locale, map] of [["en", en], ["es", es]] as const) {
      for (const [key, value] of map) {
        try {
          icuSignature(String(value));
        } catch (err) {
          broken.push(`${locale}:${key} — ${(err as Error).message}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("every key takes the same ICU argument names in both locales", () => {
    const drift: string[] = [];
    for (const [key, enValue] of en) {
      const esValue = es.get(key);
      if (typeof enValue !== "string" || typeof esValue !== "string") continue;
      const a = icuSignature(enValue).args.join(",");
      const b = icuSignature(esValue).args.join(",");
      if (a !== b) drift.push(`${key}: en{${a}} es{${b}}`);
    }
    expect(drift).toEqual([]);
  });

  it("every key uses the same rich-text tags in both locales", () => {
    const drift: string[] = [];
    for (const [key, enValue] of en) {
      const esValue = es.get(key);
      if (typeof enValue !== "string" || typeof esValue !== "string") continue;
      const a = icuSignature(enValue).tags.join(",");
      const b = icuSignature(esValue).tags.join(",");
      if (a !== b) drift.push(`${key}: en<${a}> es<${b}>`);
    }
    expect(drift).toEqual([]);
  });
});
