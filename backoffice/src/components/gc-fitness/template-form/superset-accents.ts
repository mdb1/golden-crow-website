// Per-label superset accents of the template form (#507 — split out of template-form.tsx).



/**
 * Per-label accent classes for superset group borders/pills (D9). Reuses the
 * live-run violet pattern family and rotates through a small palette so adjacent
 * blocks (A/B/C) read as distinct groups. Falls back to violet for any label
 * outside the palette.
 */
export const SUPERSET_ACCENTS: {
  card: string;
  badge: string;
  pillActive: string;
}[] = [
  {
    card: "border-category-4/40 bg-category-4/5",
    badge: "bg-category-4/20 text-category-4",
    pillActive: "border-category-4 bg-category-4/15 text-category-4",
  },
  {
    card: "border-category-2/40 bg-category-2/5",
    badge: "bg-category-2/20 text-category-2",
    pillActive: "border-category-2 bg-category-2/15 text-category-2",
  },
  {
    card: "border-category-3/40 bg-category-3/5",
    badge: "bg-category-3/20 text-category-3",
    pillActive: "border-category-3 bg-category-3/15 text-category-3",
  },
];

export function supersetAccentFor(label: string): (typeof SUPERSET_ACCENTS)[number] {
  const trimmed = label.trim().toUpperCase();
  // A→0, B→1, C→2; any other label hashes into the palette.
  const code = trimmed.charCodeAt(0);
  const idx = Number.isFinite(code)
    ? (code - 65 + SUPERSET_ACCENTS.length * 100) % SUPERSET_ACCENTS.length
    : 0;
  return SUPERSET_ACCENTS[idx] ?? SUPERSET_ACCENTS[0];
}
