// next-intl-stub.tsx
//
// Jest-only stub for `next-intl`. The published package ships ESM-only at
// its public entrypoint, which neither ts-jest nor the default Jest
// runtime can `require()` without a CJS-loader gymnastics step. The
// runtime UI is fine — Next.js handles ESM natively. Tests are not.
//
// This stub exposes the two symbols backoffice component tests actually
// import:
//
//   - `useTranslations(namespace?)` — returns a `t(key, vars?)` function
//     that walks the EN message catalog by `${namespace}.${key}` and
//     interpolates `{var}` placeholders. Unknown keys return the dotted
//     path verbatim so failures surface obviously in assertions.
//   - `useLocale()` — returns `en` so locale-aware formatting code has a
//     deterministic default in tests.
//   - `NextIntlClientProvider` — a pass-through wrapper (no provider
//     plumbing needed when the stub `useTranslations` reads the catalog
//     directly).
//
// Active under the `^next-intl$` moduleNameMapper entry in
// `jest.config.js`. Real next-intl is always used in app code.

import React from "react";

// Import the canonical EN catalog so the stub returns realistic strings
// matching what the rendered UI would produce under `NextIntlClientProvider`
// with `locale="en"`. Keeping it pinned to EN matches every existing
// component test (which assert on English literals via the catalog).
import enMessages from "../../../messages/en.json";

type MessageNode = string | { [key: string]: MessageNode };

function lookup(path: string): string | undefined {
  const segments = path.split(".");
  let node: MessageNode = enMessages as MessageNode;
  for (const seg of segments) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as { [key: string]: MessageNode })[seg];
    if (node === undefined) return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Minimal ICU `plural` support: `{count, plural, one {# thing} other {# things}}`.
 *
 * The catalog has 30 of these, and without this the stub returned the PATTERN
 * verbatim — so any test asserting on a pluralized string was really asserting
 * that the string is broken, and any test written against it had to hard-code
 * the ICU source. English cardinal rules only (`one` for exactly 1, `other`
 * otherwise), which is what the EN catalog this stub reads is written in.
 *
 * `=0` / `=1` exact matches are honored first, as ICU does. `#` becomes the
 * count. Nested plurals are out of scope — the catalog has none.
 */
function applyPlurals(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(
    /\{(\w+),\s*plural,\s*([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (whole, name: string, body: string) => {
      const raw = vars[name];
      if (raw === undefined) return whole;
      const count = Number(raw);
      if (!Number.isFinite(count)) return whole;
      const branches = new Map<string, string>();
      const re = /(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(body)) !== null) {
        branches.set(match[1], match[2]);
      }
      const chosen =
        branches.get(`=${count}`) ??
        (count === 1 ? branches.get("one") : undefined) ??
        branches.get("other") ??
        "";
      return chosen.replace(/#/g, String(count));
    },
  );
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return applyPlurals(template, vars).replace(/\{(\w+)\}/g, (_, key) => {
    const value = vars[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

type TFn = ((key: string, vars?: Record<string, string | number>) => string) & {
  rich: (
    key: string,
    tags: Record<string, (chunks: React.ReactNode) => React.ReactNode>,
  ) => React.ReactNode;
};

function makeTFn(namespace?: string): TFn {
  const prefix = namespace ? `${namespace}.` : "";

  const t = ((key: string, vars?: Record<string, string | number>) => {
    const fullKey = `${prefix}${key}`;
    const template = lookup(fullKey);
    if (template === undefined) {
      // Surface missing keys obviously in assertion failures.
      return fullKey;
    }
    return interpolate(template, vars);
  }) as TFn;

  // Minimal `t.rich` support: matches `<tag>...</tag>` against the
  // `tags` map. Sufficient for the few rich-text catalog entries in
  // the gc-fitness migration (e.g. `<strong>Add quick reply</strong>`).
  t.rich = (
    key,
    tags: Record<string, (chunks: React.ReactNode) => React.ReactNode>,
  ) => {
    const fullKey = `${prefix}${key}`;
    const template = lookup(fullKey);
    if (template === undefined) return fullKey;
    const parts: React.ReactNode[] = [];
    const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(template)) !== null) {
      if (match.index > lastIndex) {
        parts.push(template.slice(lastIndex, match.index));
      }
      const [, tag, inner] = match;
      const fn = tags[tag];
      parts.push(fn ? fn(inner) : `<${tag}>${inner}</${tag}>`);
      lastIndex = re.lastIndex;
    }
    if (lastIndex < template.length) {
      parts.push(template.slice(lastIndex));
    }
    return parts.length === 1 ? parts[0] : parts;
  };

  return t;
}

// Real `useTranslations` returns a REFERENTIALLY STABLE `t` across renders for
// a given namespace — and components rely on that: `t` legitimately appears in
// `useEffect` dependency arrays. A stub that minted a fresh closure per render
// turns any such effect into an infinite render loop ("Maximum update depth
// exceeded"), which looks like a component bug and is not one.
//
// `AssignTemplateModal` is the case that surfaced this: its template-detail
// effect lists `t` in its deps and calls `setOverrideDrafts({})` on the
// no-template branch. A fresh `{}` is never `Object.is`-equal, so each render
// re-ran the effect, which re-rendered, forever. Caching per namespace matches
// production behavior and the loop disappears.
const tFnCache = new Map<string, TFn>();

export function useTranslations(namespace?: string): TFn {
  const key = namespace ?? "";
  const cached = tFnCache.get(key);
  if (cached) return cached;
  const fn = makeTFn(namespace);
  tFnCache.set(key, fn);
  return fn;
}

export function useLocale(): string {
  return "en";
}

export function NextIntlClientProvider({
  children,
}: {
  children: React.ReactNode;
  locale?: string;
  messages?: unknown;
}): React.ReactElement {
  return <>{children}</>;
}
