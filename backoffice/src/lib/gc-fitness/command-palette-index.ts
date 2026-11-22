// command-palette-index.ts — #496 (⌘K / Ctrl+K)
//
// The wire shape of the palette's search index and the pure pieces around it.
// Firebase-free on purpose: imported by the `"use server"` reader
// (`command-palette-actions.ts`) AND by the client palette, and a `"use server"`
// module may only export async functions.
//
// The index is deliberately LIGHT — ids and display names only, capped per
// kind — because it crosses the Server Action boundary once per palette open
// (lazily: nothing is fetched until the coach first presses ⌘K).

export interface PaletteName {
  en: string;
  es: string;
}

export interface CommandPaletteIndex {
  /** Active clients of the calling coach (a chat thread per client, id = uid). */
  clients: Array<{ id: string; name: string; email: string }>;
  /** Own + standard workout templates, live only, most recently edited first. */
  templates: Array<{ id: string; name: PaletteName }>;
  /** The viewer-scoped exercise library (same scope as the pickers). */
  exercises: Array<{ id: string; name: PaletteName }>;
}

export const PALETTE_CAPS = {
  clients: 500,
  templates: 300,
  exercises: 1500,
} as const;

/** How many hits each group shows while typing (the list stays scannable). */
export const PALETTE_GROUP_LIMIT = 8;

export const paletteHref = {
  client: (id: string) => `/gc-fitness/clients/${encodeURIComponent(id)}`,
  chat: (clientId: string) => `/gc-fitness/chat?chatId=${encodeURIComponent(clientId)}`,
  template: (id: string) => `/gc-fitness/templates/${encodeURIComponent(id)}/view`,
  exercise: (id: string) => `/gc-fitness/exercises/${encodeURIComponent(id)}/view`,
};

/** Lowercase, accent-free — "Sentadilla búlgara" matches "bulgara". */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Every whitespace-separated term of `query` appears somewhere in `haystack`. */
export function matchesQuery(query: string, ...haystack: string[]): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = normalizeForSearch(haystack.join(" "));
  return terms.every((term) => text.includes(term));
}

/** The name to SHOW in `locale`, falling back to the other language. */
export function localizedPaletteName(name: PaletteName, locale: string): string {
  const primary = locale.startsWith("es") ? name.es : name.en;
  const fallback = locale.startsWith("es") ? name.en : name.es;
  return (primary || fallback || "").trim();
}
