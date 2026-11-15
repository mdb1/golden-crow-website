/**
 * #505 — WCAG AA contrast over the coach portal's semantic tokens.
 *
 * Reads the REAL `globals.css` (no copy of the values to drift) and checks, in
 * BOTH themes, that every tone is legible where the portal uses it:
 *   - `text-X` on `--card` and on `--background`              ≥ 4.5:1
 *   - `text-X` on its own `--X-soft` tint over card/background ≥ 4.5:1
 *   - `text-X` on `bg-X/20` (the strongest tint the portal uses) ≥ 4.5:1
 *   - `--X-foreground` on a solid `bg-X` fill                   ≥ 4.5:1
 *   - dots / borders (`bg-X` on card)                           ≥ 3:1
 * and that the #1636 status trio stays wired to success / warning / danger.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const dark = block("  .gc-fitness-theme");
const light = { ...dark, ...block('html[data-theme="light"] .gc-fitness-theme') };
const THEMES = { dark, light } as const;

type RGBA = [number, number, number, number];

function resolve(vars: Record<string, string>, name: string, depth = 0): string {
  const raw = vars[name];
  if (raw == null) throw new Error(`missing token ${name}`);
  const ref = raw.match(/^var\((--[\w-]+)\)$/);
  if (ref && depth < 5) return resolve(vars, ref[1], depth + 1);
  return raw;
}

function parse(color: string): RGBA {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((p) => p.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`unparseable color ${color}`);
}

function over(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1) as RGBA;
}

function luminance([r, g, b]: RGBA): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Fails with the pair's name and ratio, not just "expected ≥ 4.5". */
function expectAtLeast(label: string, ratio: number, min: number) {
  expect({ label, ratio: Number(ratio.toFixed(2)), ok: ratio >= min }).toEqual({
    label,
    ratio: expect.any(Number),
    ok: true,
  });
}

const TONES = ["success", "warning", "danger", "info", "highlight"] as const;
const CATEGORIES = Array.from({ length: 10 }, (_, i) => `category-${i + 1}`);

describe.each(Object.entries(THEMES))("coach portal tokens — %s theme", (_theme, vars) => {
  const c = (name: string) => parse(resolve(vars, `--${name}`));
  const card = over(c("card"), [255, 255, 255, 1]);
  const background = c("background");
  const surfaces = { card, background };

  it.each(TONES)("%s: text, tint, fill and dot are AA", (tone) => {
    const fg = c(tone);
    for (const [surfaceName, surface] of Object.entries(surfaces)) {
      expectAtLeast(`${tone} on ${surfaceName}`, contrast(fg, surface), 4.5);
      expectAtLeast(`${tone} on ${tone}-soft/${surfaceName}`, contrast(fg, over(c(`${tone}-soft`), surface)), 4.5);
      expectAtLeast(`${tone} on ${tone}/20 over ${surfaceName}`, contrast(fg, over([fg[0], fg[1], fg[2], 0.2], surface)), 4.5);
    }
    expectAtLeast(`${tone}-foreground on ${tone}`, contrast(c(`${tone}-foreground`), fg), 4.5);
    expectAtLeast(`${tone} dot on card`, contrast(fg, card), 3);
  });

  it.each(CATEGORIES)("%s: text and tint are AA on card and canvas", (cat) => {
    const fg = c(cat);
    for (const [surfaceName, surface] of Object.entries(surfaces)) {
      expectAtLeast(`${cat} on ${surfaceName}`, contrast(fg, surface), 4.5);
      expectAtLeast(`${cat} on ${cat}/20 over ${surfaceName}`, contrast(fg, over([fg[0], fg[1], fg[2], 0.2], surface)), 4.5);
    }
  });

  it("the #1636 status trio maps to success / warning / danger", () => {
    expect(resolve(vars, "--status-ok")).toBe(resolve(vars, "--success"));
    expect(resolve(vars, "--status-due")).toBe(resolve(vars, "--warning"));
    expect(resolve(vars, "--status-overdue")).toBe(resolve(vars, "--danger"));
    expect(resolve(vars, "--status-ok-soft")).toBe(resolve(vars, "--success-soft"));
    expect(resolve(vars, "--status-due-soft")).toBe(resolve(vars, "--warning-soft"));
    expect(resolve(vars, "--status-overdue-soft")).toBe(resolve(vars, "--danger-soft"));
  });
});

it("every token used by the portal is exposed to Tailwind (@theme inline)", () => {
  for (const name of [...TONES.flatMap((t) => [t, `${t}-foreground`, `${t}-soft`]), ...CATEGORIES]) {
    expect(css).toContain(`--color-${name}: var(--${name});`);
  }
  for (const s of ["ok", "due", "overdue"]) {
    expect(css).toContain(`--color-status-${s}: var(--status-${s});`);
  }
  expect(css).toContain("--radius-card: 1.25rem;");
});
