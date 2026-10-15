// no-inline-server-actions.test.ts
//
// #382 — fails if an inline `"use server"` closure comes back.
//
// Next.js names inline closures by POSITION in their file
// ($$RSC_SERVER_ACTION_0, _1, …) and hashes that name into the action ID. Add
// or reorder one and the closures after it change names — and an old tab's ID
// can then resolve to a DIFFERENT closure: measured on admin/page.tsx, the
// "promote to admin" ID ran "add to allowlist" with the form's data. Named
// exports in a "use server" module don't move; bind per-render values with
// `.bind(null, …)`. See backoffice/README.md → "Rules for anyone touching a
// Server Action".
//
// The check: a "use server" directive that is indented (i.e. inside a function
// body) anywhere under src/. File-level directives start at column 0.

import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "node_modules"
        ? []
        : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

it("has no inline \"use server\" closures", () => {
  const offenders = sourceFiles(SRC).flatMap((file) =>
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^\s+["']use server["'];?\s*$/.test(line))
      .map(({ index }) => `${path.relative(SRC, file)}:${index + 1}`),
  );
  expect(offenders).toEqual([]);
});
