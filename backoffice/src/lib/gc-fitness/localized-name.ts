// localized-name.ts
//
// Tiny, firebase-free helper for rendering a bilingual `{ en, es }` name (or
// description) COACH-LANGUAGE-FIRST in lists and pickers. The trainer's active
// UI locale decides which language goes on the primary line; the OTHER
// language is returned as a secondary line only when it carries distinct text
// (so an English-only or mirrored record doesn't render the same string twice).
//
// Mirrors the form-side coach-language-first rule in `localized-field.tsx`.

export interface LocalizedNamePair {
  /** The name in the coach's UI language (falls back to the other language). */
  primary: string;
  /** The other language, shown as a subtitle — null when blank or identical. */
  secondary: string | null;
}

export function localizedNamePair(
  name: { en?: string | null; es?: string | null } | null | undefined,
  locale: string,
): LocalizedNamePair {
  const en = (name?.en ?? "").trim();
  const es = (name?.es ?? "").trim();
  const esFirst = locale.startsWith("es");
  const primary = esFirst ? es || en : en || es;
  const other = esFirst ? en : es;
  const secondary = other && other !== primary ? other : null;
  return { primary, secondary };
}
