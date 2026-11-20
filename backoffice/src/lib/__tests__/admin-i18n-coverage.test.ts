// admin-i18n-coverage.test.ts — #497.
//
// The admin console was the last surface outside next-intl: eleven pages mixed
// English ("Monitoring & observability", "Back to admin") with Spanish and none
// followed the operator's locale. They now read every visible string from the
// `admin.*` namespace (messages/{en,es}.json), and the keys themselves are
// checked by i18n-literal-keys.test.ts like the rest of the app.
//
// What this file pins on top of that, because the literal-keys test cannot see
// a string that never went through a translator:
//   1. every admin page.tsx binds a translator (directly, or — for the pages
//      that are a thin shell — by rendering an admin component that does);
//   2. phrases that used to be hardcoded do not come back as JSX text or
//      string props.

import fs from "node:fs";
import path from "node:path";

const ADMIN = path.join(__dirname, "..", "..", "app", "gc-fitness", "admin");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = walk(ADMIN);
const rel = (file: string) => path.relative(ADMIN, file);
const TRANSLATOR = /\b(useTranslations|getTranslations)\(/;

/** Strips comments so a phrase quoted in an explanatory comment doesn't trip the denylist. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("admin pages are translated (#497)", () => {
  const pages = files.filter((f) => path.basename(f) === "page.tsx");

  it("found the admin pages (sanity)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(11);
  });

  it.each(pages.map((p) => [rel(p), p]))("%s binds a next-intl translator", (_name, file) => {
    const src = fs.readFileSync(file, "utf8");
    expect(TRANSLATOR.test(src)).toBe(true);
  });

  const DENYLIST = [
    "Back to admin",
    "Back to Admin Console",
    "Monitoring &amp; observability",
    "Monitoring & observability",
    "Action completed:",
    "Acción completada:",
    "Coach detail",
    "Admin Console",
    "Coach-less users",
    "User search",
    "Data hygiene",
    "Delete coach (cascade)",
    "Delete client (cascade)",
    "Preview deletion (dry run)",
    "Back to coach",
    "Back to client",
    "Cargar más",
    "Moderación",
    "No se pudo cargar",
  ];

  it("previously hardcoded phrases are not back in admin sources", () => {
    const hits: string[] = [];
    for (const file of files) {
      const src = withoutComments(fs.readFileSync(file, "utf8"));
      for (const phrase of DENYLIST) {
        // As JSX text (>phrase) or as a quoted string literal.
        const asText = new RegExp(`>\\s*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
        if (asText.test(src) || src.includes(`"${phrase}`) || src.includes(`\`${phrase}`)) {
          hits.push(`${rel(file)}: ${phrase}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
