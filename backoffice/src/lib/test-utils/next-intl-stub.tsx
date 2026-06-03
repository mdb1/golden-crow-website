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

function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
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

export function useTranslations(namespace?: string): TFn {
  return makeTFn(namespace);
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
