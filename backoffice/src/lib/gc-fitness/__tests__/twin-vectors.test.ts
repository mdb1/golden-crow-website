// twin-vectors.test.ts — gc-fitness #1644. The twin vectors live ONCE in gc-fitness
// (`twin-vectors/`); Swift, Kotlin and functions read that file directly. This repo builds on
// Vercel without gc-fitness, so it keeps a PINNED COPY in `__tests__/twin-vectors/` plus a
// `MANIFEST.json` of sha256 hashes, written by gc-fitness `scripts/check-twin-vectors.py --sync`.
//
// Two locks:
//   * here — every copy must match its MANIFEST hash and the folder must hold exactly the
//     manifest's files: a copy edited by hand (without re-syncing) is red on every build;
//   * there — `check-twin-vectors.py` (gc-fitness release gate) fails when this copy or this
//     manifest no longer matches the canonical file.
// (No comparison with a sibling gc-fitness checkout here on purpose: that checkout can be on any
// branch, so it would turn this suite red for reasons unrelated to this repo.)
//
// To change a vector: edit it in gc-fitness, run `scripts/check-twin-vectors.py --sync --website
// <this checkout>` there, and commit the copies here in the same change set.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(__dirname, "twin-vectors");
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "MANIFEST.json"), "utf8")) as {
  files: Record<string, string>;
};
const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(path.join(DIR, file))).digest("hex");

describe("twin vectors — pinned copies of gc-fitness (#1644)", () => {
  it("the folder holds exactly the manifest's files", () => {
    const onDisk = fs.readdirSync(DIR).filter((f) => f !== "MANIFEST.json").sort();
    expect(onDisk).toEqual(Object.keys(manifest.files).sort());
  });

  it.each(Object.keys(manifest.files))("%s matches its manifest hash", (file) => {
    expect(sha256(file)).toBe(manifest.files[file]);
  });

  it.each(Object.keys(manifest.files))("%s parses as JSON", (file) => {
    expect(() => JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"))).not.toThrow();
  });
});
