// server-actions-require-auth.test.ts — #483.
//
// Every export of a `"use server"` file is a public HTTP endpoint: anyone who
// knows (or replays) its action ID can POST to it, signed in or not. Until #451
// `countOpenReports` (moderation-actions.ts) answered without any auth. This
// test makes that class of bug a red build instead of a code-review catch.
//
// The rule: each exported function of each `"use server"` file must CALL, in
// its own body, one of
//   - an auth helper (`getCurrentTrainer`, `getCurrentAdmin`, …), or
//   - a function of the same file that does (transitively), or
//   - an imported guarded export of another `"use server"` file (that this
//     test proves guarded), or
//   - a function from GUARDED_LIB_FUNCTIONS (non-"use server" lib code that
//     checks auth itself — listed explicitly, with where it checks).
// An export that is public ON PURPOSE goes in INTENTIONALLY_PUBLIC with the
// reason. Keep both lists short; prefer calling the helper.
//
// The scan is textual (TypeScript 7 ships no JS compiler API): comments and
// strings are blanked, then the file is split at column-0 declarations —
// Prettier puts every top-level declaration there.

import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..", "..");

const AUTH_HELPERS = [
  "getCurrentGCFitnessUser",
  "getCurrentTrainer",
  "getCurrentAdmin",
  "getCurrentTrainerIdToken",
];

/** Non-"use server" functions that run an auth helper before doing anything. */
const GUARDED_LIB_FUNCTIONS: Record<string, string> = {};

/** "file.ts#export" → why it is reachable without a session. */
const INTENTIONALLY_PUBLIC: Record<string, string> = {};

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

/** Blank out comments and string/template literal CONTENTS, keeping offsets. */
function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i++;
      }
    } else if (c === "/" && next === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += quote;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        // Template placeholders hold code (`${await getCurrentTrainer()}` is
        // not a pattern anyone uses, but don't hide calls inside them).
        out += src[i] === "\n" ? "\n" : quote === "`" ? src[i] : " ";
        i++;
      }
      out += quote;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

interface Declaration {
  name: string;
  exported: boolean;
  body: string;
}

const DECL =
  /^(export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+))/;

function declarations(code: string): Declaration[] {
  const lines = code.split("\n");
  const starts: Array<{ line: number; name: string; exported: boolean }> = [];
  lines.forEach((line, index) => {
    const m = DECL.exec(line);
    if (m) starts.push({ line: index, name: m[2] ?? m[3], exported: Boolean(m[1]) });
  });
  // A segment ends at the next column-0 line that is not a closer.
  return starts.map((start) => {
    let end = start.line + 1;
    while (end < lines.length && !/^[^\s})\]>|]/.test(lines[end])) end++;
    return {
      name: start.name,
      exported: start.exported,
      body: lines.slice(start.line, end).join("\n"),
    };
  });
}

function importedNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const m of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from/g)) {
    for (const part of m[1].split(",")) {
      const local = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
      if (local) names.add(local);
    }
  }
  return names;
}

function calls(body: string, name: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_$.])${name.replace(/\$/g, "\\$")}\\s*\\(`).test(body);
}

interface ServerFile {
  rel: string;
  code: string;
  decls: Declaration[];
  imports: Set<string>;
}

function parseServerFile(rel: string, raw: string): ServerFile {
  const code = stripCommentsAndStrings(raw);
  return { rel, code, decls: declarations(code), imports: importedNames(code) };
}

const serverFiles: ServerFile[] = sourceFiles(SRC)
  .map((file) => ({ file, raw: fs.readFileSync(file, "utf8") }))
  .filter(({ raw }) => /^["']use server["'];?\s*$/m.test(raw))
  .map(({ file, raw }) => parseServerFile(path.relative(SRC, file), raw));

/** Fixpoint over every "use server" file: which declarations are guarded. */
function computeGuarded(files: ServerFile[] = serverFiles): Map<string, Set<string>> {
  const serverFiles = files;
  const guarded = new Map<string, Set<string>>(
    serverFiles.map((f) => [f.rel, new Set<string>()]),
  );
  const exportedGuarded = () => {
    const names = new Set<string>();
    for (const f of serverFiles) {
      for (const d of f.decls) {
        if (d.exported && guarded.get(f.rel)!.has(d.name)) names.add(d.name);
      }
    }
    return names;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const crossFile = exportedGuarded();
    for (const f of serverFiles) {
      const mine = guarded.get(f.rel)!;
      const allowed = [
        ...AUTH_HELPERS.filter((n) => f.imports.has(n)),
        ...Object.keys(GUARDED_LIB_FUNCTIONS).filter((n) => f.imports.has(n)),
        ...[...crossFile].filter((n) => f.imports.has(n)),
        ...mine,
      ];
      for (const d of f.decls) {
        if (mine.has(d.name)) continue;
        const body = d.body.replace(DECL, "");
        if (allowed.some((n) => n !== d.name && calls(body, n))) {
          mine.add(d.name);
          changed = true;
        }
      }
    }
  }
  return guarded;
}

describe("every exported Server Action checks auth (#483)", () => {
  const guarded = computeGuarded();

  it("finds the \"use server\" files (the scan is not silently empty)", () => {
    expect(serverFiles.length).toBeGreaterThan(30);
    const exportsCount = serverFiles.reduce(
      (n, f) => n + f.decls.filter((d) => d.exported).length,
      0,
    );
    expect(exportsCount).toBeGreaterThan(150);
  });

  it("no export of a \"use server\" file is reachable without an auth check", () => {
    const offenders: string[] = [];
    for (const f of serverFiles) {
      for (const d of f.decls) {
        if (!d.exported) continue;
        const key = `${f.rel}#${d.name}`;
        if (INTENTIONALLY_PUBLIC[key]) continue;
        if (!guarded.get(f.rel)!.has(d.name)) offenders.push(key);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("re-exports are not allowed in a \"use server\" file (they would dodge this scan)", () => {
    const offenders = serverFiles
      .filter((f) => /^export\s*(\*|\{)/m.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("the allow-lists only name things that exist", () => {
    for (const key of Object.keys(INTENTIONALLY_PUBLIC)) {
      const [rel, name] = key.split("#");
      const f = serverFiles.find((s) => s.rel === rel);
      expect(f?.decls.some((d) => d.exported && d.name === name)).toBe(true);
    }
  });

  it("the scanner itself catches an unguarded export (self-test)", () => {
    const a = parseServerFile(
      "a.ts",
      [
        '"use server";',
        'import { getCurrentTrainer } from "./auth-helpers";',
        "async function guard() {",
        "  return getCurrentTrainer();",
        "}",
        "export async function ok(input: { a: number }): Promise<",
        "  { ok: true }",
        "> {",
        "  await guard();",
        "  return { ok: true };",
        "}",
        "export async function leaky(): Promise<number> {",
        "  // getCurrentTrainer() in a comment does not count",
        '  const s = "getCurrentTrainer()";',
        "  return s.length;",
        "}",
        "export const arrow = async () => {",
        "  await getCurrentTrainer();",
        "};",
      ].join("\n"),
    );
    const b = parseServerFile(
      "b.ts",
      [
        '"use server";',
        'import { ok } from "./a";',
        "export async function wrapsGuarded() {",
        "  return ok({ a: 1 });",
        "}",
        "export async function wrapsUnimported() {",
        "  return arrow();",
        "}",
      ].join("\n"),
    );
    expect(a.decls.map((d) => d.name)).toEqual(["guard", "ok", "leaky", "arrow"]);
    const guarded = computeGuarded([a, b]);
    expect([...guarded.get("a.ts")!].sort()).toEqual(["arrow", "guard", "ok"]);
    expect([...guarded.get("b.ts")!]).toEqual(["wrapsGuarded"]);
  });
});
