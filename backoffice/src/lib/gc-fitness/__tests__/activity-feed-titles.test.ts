// activity-feed-titles.test.ts — #513.
//
// The feed's titles are Spanish sentences built in lib/; the list renders them
// through `admin.audit.titles.<key>` (activity-feed-titles.ts). Three ways that
// can rot without anything failing on screen — each pinned here.

import fs from "node:fs";
import path from "node:path";

import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import { FEED_TITLE_KEYS, feedTitleKey } from "../activity-feed-titles";

const MODEL_FILES = ["activity-feed-model.ts", "activity-feed-actions.ts", "activity-feed-model-ext.ts"].map((f) =>
  fs.readFileSync(path.join(__dirname, "..", f), "utf8"),
);

const esTitles = (esMessages as { admin: { audit: { titles: Record<string, string> } } }).admin
  .audit.titles;
const enTitles = (enMessages as { admin: { audit: { titles: Record<string, string> } } }).admin
  .audit.titles;

describe("activity feed titles (#513)", () => {
  it("every key exists in BOTH catalogs, and es.json says exactly the source sentence", () => {
    for (const [spanish, key] of Object.entries(FEED_TITLE_KEYS)) {
      expect(esTitles[key]).toBe(spanish);
      expect(typeof enTitles[key]).toBe("string");
      expect(enTitles[key].length).toBeGreaterThan(0);
    }
  });

  it("the catalogs carry no orphan title keys", () => {
    const keys = new Set<string>(Object.values(FEED_TITLE_KEYS));
    expect(Object.keys(esTitles).filter((k) => !keys.has(k))).toEqual([]);
    expect(Object.keys(enTitles).filter((k) => !keys.has(k))).toEqual([]);
  });

  it("every mapped sentence still exists in the model (a renamed title would otherwise go stale)", () => {
    const source = MODEL_FILES.join("\n");
    for (const spanish of Object.keys(FEED_TITLE_KEYS)) {
      expect(source).toContain(JSON.stringify(spanish));
    }
  });

  it("every title literal in the model is mapped (a new title without a key fails HERE)", () => {
    // Heuristic scan: capitalised string literals on a `title` line, in the
    // ternary branches right after one, or in the coach/admin title tables.
    const found = new Set<string>();
    for (const source of MODEL_FILES) {
      let window = 0;
      for (const raw of source.split("\n")) {
        const line = raw.trim();
        const isTitleLine = /\btitle\b\s*[:=]/.test(line);
        if (isTitleLine) window = 6;
        const inTable = /^(active|deleted):/.test(line) || /^if \(kind ===.*return "/.test(line) ||
          /^if \(summaryAction ===.*return "/.test(line) || /^return "/.test(line);
        if (isTitleLine || inTable || (window > 0 && /^[?:]/.test(line))) {
          for (const m of line.matchAll(/"([^"]+)"/g)) {
            if (/^[A-ZÁÉÍÓÚ][a-záéíóúñ]/.test(m[1])) found.add(m[1]);
          }
        }
        if (window > 0) window -= 1;
      }
    }
    // Not vacuous: the scan must actually be seeing the titles.
    expect(found.size).toBeGreaterThan(160);
    const unmapped = [...found].filter((title) => feedTitleKey(title) === null);
    expect(unmapped).toEqual([]);
  });

  it("an unknown title has no key (it renders verbatim)", () => {
    expect(feedTitleKey("create random_collection")).toBeNull();
    expect(feedTitleKey("constructor")).toBeNull();
  });
});
