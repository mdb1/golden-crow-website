// heavy-routes-have-loading.test.ts — #492.
//
// Without a `loading.tsx` a navigation to these routes froze on the previous
// page until every Firestore read finished. Pin that each one keeps its
// instant skeleton (deleting one turns this red), and that every admin
// section has one of its own.

import fs from "node:fs";
import path from "node:path";

const GC = path.join(__dirname, "..");

const REQUIRED = [
  "payments",
  "challenges",
  "checklist",
  "clients/[id]/pagos",
  "clients/[id]/nutricion",
  "admin",
];

it.each(REQUIRED)("%s has a loading.tsx", (route) => {
  expect(fs.existsSync(path.join(GC, route, "loading.tsx"))).toBe(true);
});

it("every admin section with a page has its own loading.tsx", () => {
  const admin = path.join(GC, "admin");
  const missing = fs
    .readdirSync(admin, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && e.name !== "__tests__")
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(admin, name, "page.tsx")))
    .filter((name) => !fs.existsSync(path.join(admin, name, "loading.tsx")));
  expect(missing).toEqual([]);
});
