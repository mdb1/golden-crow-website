// i18n-literal-keys.test.ts
//
// Every LITERAL key passed to a next-intl translator in src/ must exist in the
// catalog under that translator's namespace — in BOTH locales.
//
// A missing key does not fail the build or throw: next-intl logs and renders the
// raw dotted path ("clients.detail.nutrition.emptyTitle") on the coach's screen.
// That is why it needs a test.
//
// How the scan works (see `scanTranslationCalls` in test-utils/i18n-catalog.ts):
//   - SWC parses each file; translators are the identifiers bound to
//     `useTranslations("ns")` / `getTranslations("ns")` /
//     `getTranslations({ namespace: "ns" })` / `const [t] = await Promise.all([getTranslations("ns"), …])`.
//   - `t("a.b")`, `t.rich("a.b")`, `t.markup("a.b")` must resolve to a STRING at
//     `ns.a.b`; `t.raw("a.b")` must resolve to anything; `t.has(…)` is a probe and
//     is not checked.
//   - `t(cond ? "a" : "b")` checks both literals.
//   - Anything else (`t(\`x.${y}\`)`, `t(key)`) is DYNAMIC: skipped, but counted,
//     and the count is pinned so a big jump in unchecked keys is noticed.
//   - A translator passed into a helper as a parameter is not followed (its
//     namespace is not knowable statically) — SWC's scope contexts make sure such
//     a parameter is never confused with a component's own `t`.

import fs from "node:fs";
import path from "node:path";

import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import {
  catalogNodeAt,
  qualifiedKey,
  scanTranslationCalls,
  type Catalog,
  type TranslationCall,
} from "@/lib/test-utils/i18n-catalog";

const SRC = path.join(__dirname, "..", "..");
const ROOT = path.join(SRC, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "test-utils" || entry.name === "node_modules"
        ? []
        : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$|\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

const scanned = sourceFiles(SRC)
  .map((file) => ({ file, source: fs.readFileSync(file, "utf8") }))
  .filter(({ source }) => /\b(useTranslations|getTranslations)\b/.test(source))
  .map(({ file, source }) => scanTranslationCalls(path.relative(ROOT, file), source));

const calls: TranslationCall[] = scanned.flatMap((r) => r.calls);
const literalCalls = calls.filter((c) => !c.dynamic && c.method !== "has");
const dynamicCalls = calls.filter((c) => c.dynamic);

function missingIn(catalog: Catalog): string[] {
  const missing: string[] = [];
  for (const call of literalCalls) {
    for (const key of call.keys) {
      const node = catalogNodeAt(catalog, qualifiedKey(call.namespace, key));
      const ok = call.method === "raw" ? node !== undefined : typeof node === "string";
      if (!ok) missing.push(`${call.file}: ${call.method}("${key}") in "${call.namespace}"`);
    }
  }
  return [...new Set(missing)].sort();
}

describe("scanTranslationCalls (the scanner itself)", () => {
  const src = `
    import { useTranslations } from "next-intl";
    import { getTranslations } from "next-intl/server";
    function helper(t: (k: string) => string) { return t("param.notChecked"); }
    export function A({ on }: { on: boolean }) {
      const t = useTranslations("ns.a");
      const tCommon = useTranslations("common");
      const dyn = "x";
      return [t("one"), t(on ? "two" : "three"), t.rich("four", {}), t.raw("five"),
              t.has("six"), tCommon("save"), t(\`tpl\`), t(\`d.\${dyn}\`), t(dyn), helper(t)];
    }
    export async function B() {
      const [t, other] = await Promise.all([getTranslations("ns.b"), Promise.resolve(1)]);
      const t2 = await getTranslations({ locale: "es", namespace: "ns.c" });
      return [t("seven"), t2("eight"), other];
    }
  `;
  const result = scanTranslationCalls("fixture.tsx", src);
  const summary = result.calls.map((c) => `${c.namespace}|${c.method}|${c.dynamic ? "DYN" : c.keys.join("+")}`);

  it("resolves each translator to its own namespace, incl. Promise.all and {namespace}", () => {
    expect(summary).toEqual([
      "ns.a|t|one",
      "ns.a|t|two+three",
      "ns.a|rich|four",
      "ns.a|raw|five",
      "ns.a|has|six",
      "common|t|save",
      "ns.a|t|tpl",
      "ns.a|t|DYN",
      "ns.a|t|DYN",
      "ns.b|t|seven",
      "ns.c|t|eight",
    ]);
  });

  it("does not treat a helper's `t` parameter as the component's translator", () => {
    expect(summary.join(" ")).not.toContain("param.notChecked");
  });

  it("reports binding shapes it does not understand instead of skipping them", () => {
    const odd = scanTranslationCalls("odd.tsx", `const holder = { t: useTranslations("x") };`);
    expect(odd.unrecognizedBindings).toHaveLength(1);
  });
});

describe("literal t(\"…\") keys in src/ resolve in the catalog", () => {
  it("found the translators (sanity — an empty scan would pass everything)", () => {
    expect(scanned.length).toBeGreaterThan(100);
    expect(literalCalls.length).toBeGreaterThan(1500);
  });

  it("every translator binding has a shape the scanner understands", () => {
    expect(scanned.flatMap((r) => r.unrecognizedBindings)).toEqual([]);
  });

  it("every literal key exists in messages/en.json", () => {
    expect(missingIn(enMessages as Catalog)).toEqual([]);
  });

  it("every literal key exists in messages/es.json", () => {
    expect(missingIn(esMessages as Catalog)).toEqual([]);
  });

  it("dynamic (unchecked) keys stay within budget — 41 at the time of writing", () => {
    // Not a correctness check: a budget. If this grows, prefer literal keys (or a
    // `switch` over literals) so the new strings are covered by the tests above.
    // Lower the number when you convert some.
    const where = dynamicCalls.map((c) => `${c.file} (${c.namespace})`);
    expect(where.length).toBeLessThanOrEqual(41);
  });
});
