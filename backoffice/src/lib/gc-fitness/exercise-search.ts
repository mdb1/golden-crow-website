import type { ExerciseRow } from "./exercises-listener";

/**
 * Builds the fuzzy-search haystack for exercise discovery. We intentionally
 * include the canonical names plus aliases/keywords/tags so a coach can find
 * an exercise by the gym term they remember, not only by the stored title.
 */
export function exerciseSearchHaystack(
  row: Pick<
    ExerciseRow,
    | "name"
    | "description"
    | "muscleGroups"
    | "equipment"
    | "keywords"
    | "tags"
    | "variations"
  >,
): string {
  return [
    row.name.en,
    row.name.es,
    row.description.en,
    row.description.es,
    row.muscleGroups.join(" "),
    row.equipment.join(" "),
    row.keywords?.join(" "),
    row.tags?.join(" "),
    row.variations?.join(" "),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

/**
 * Lowercases + strips Latin diacritics + collapses whitespace, treating a set
 * of separators/punctuation as word boundaries. Used both inside the search
 * matcher (so the matcher sees normalized input AND normalized haystack) and
 * in `displayEs` to decide whether the ES line is meaningfully different from
 * EN.
 *
 * Word separators: hyphen/underscore/slash AND the punctuation set
 * `()[]{},.:;"'`. This makes "Pull-Ups" match a "pull ups" query and
 * "Bench Press (Barbell)" expose "barbell" as its own searchable word so the
 * query "bench press barbell" strong-matches every name word.
 *
 * Examples:
 *   "Sentadílla"          -> "sentadilla"
 *   "Press de banca"      -> "press de banca"
 *   "  Squat  "           -> "squat"
 *   "Pull-Ups"            -> "pull ups"
 *   "Bench Press (Barbell)" -> "bench press barbell"
 */
export function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    // Hyphens, underscores, slashes AND the punctuation set ()[]{},.:;"'
    // all behave as word separators so "Pull-Ups" matches a "pull ups"
    // query and "(Barbell)" becomes a standalone "barbell" word.
    .replace(/[-_/()[\]{},.:;"']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips a single trailing "s" when the word is long enough to keep a
 * meaningful stem. Both the query token and the haystack word are stemmed so
 * "ups" vs "up" and "up" vs "ups" both match; "press" -> "pres" stays
 * symmetric. Guard `length > 1` so a bare "s" doesn't collapse to "".
 */
function singularStem(w: string): string {
  if (w.length > 1 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/**
 * True when a query token strong-matches a haystack word: either the word
 * starts with the token verbatim, or the singular stems align by startsWith.
 * The stem comparison gives plural/singular tolerance in both directions.
 */
function tokenStrongMatchesWord(token: string, word: string): boolean {
  if (word.startsWith(token)) return true;
  const stemToken = singularStem(token);
  const stemWord = singularStem(word);
  return stemWord.startsWith(stemToken) || stemToken.startsWith(stemWord);
}

/**
 * Score how well a query matches a haystack on a 0..1 scale.
 *
 * Token-based and ORDER-INDEPENDENT: each query token is matched against
 * any haystack word (strong startsWith / plural-stem match preferred, loose
 * contains as a fallback). The caller's typed token order is intentionally
 * ignored so "incline bench dum" surfaces "Incline Dumbbell Press" even
 * though the query mixes a non-existent middle token ("bench") and a
 * different order than the exercise name.
 *
 * Returns:
 *   - 0          → no useful match (less than 60% of query tokens land)
 *   - 0 < s ≤ 1  → matched. Score = matchedTokens / totalTokens, with a
 *                  bonus for strong (startsWith / plural-stem) hits over
 *                  loose contains-only hits.
 *
 * Threshold tuning: 60% is permissive enough to forgive one missing token in
 * a 3-token query (2/3 = 0.66 ≥ 0.6), but still rejects "incline xyz xyz"
 * (1/3 = 0.33 < 0.6). Single-token queries always require a full match.
 */
export function fuzzyTokenScore(query: string, haystack: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) return 1;
  const words = normalizeSearchText(haystack).split(" ").filter(Boolean);
  if (words.length === 0) return 0;

  let strongHits = 0;
  let weakHits = 0;
  for (const token of tokens) {
    let matched: "strong" | "weak" | null = null;
    for (const word of words) {
      if (tokenStrongMatchesWord(token, word)) {
        matched = "strong";
        break;
      }
    }
    if (!matched) {
      for (const word of words) {
        if (word.includes(token)) {
          matched = "weak";
          break;
        }
      }
    }
    if (matched === "strong") strongHits += 1;
    else if (matched === "weak") weakHits += 1;
  }

  const matchedRatio = (strongHits + weakHits) / tokens.length;
  // 60% threshold: tolerates one missing token in a 3-token query, but
  // rejects 1-of-3 noise. Single-token queries require a full hit (1.0).
  if (matchedRatio < 0.6) return 0;
  // Strong matches outweigh weak ones — exact-word startsWith ranks above
  // a mid-word contains match.
  return Math.min(1, (strongHits + weakHits * 0.6) / tokens.length);
}

/**
 * Backward-compat boolean wrapper used by the multi-add dialog +
 * picker's "Exercise not found?" check. Returns true when the score is
 * above zero (i.e., the threshold-passing match in fuzzyTokenScore).
 */
export function fuzzyTokenMatch(query: string, haystack: string): boolean {
  return fuzzyTokenScore(query, haystack) > 0;
}

// ---------------------------------------------------------------------------
// Name-aware ranking (issue #291).
//
// scoreExercise returns a score in clearly-separated numeric BANDS so the tier
// ordering can never be inverted by the within-tier fraction:
//
//   exact name match            -> 5.x   (highest)
//   name phrase-prefix          -> 4.x
//   all tokens strong-match name-> 3.x   (minus a small per-extra-word penalty)
//   name partial / contains     -> 2.x
//   haystack-only (kw/tags/...)  -> 1.x   (lowest non-zero)
//   no match                    -> 0
//
// The fractional part within a band is always < 1 so cross-band ordering holds.
// ---------------------------------------------------------------------------

const BAND_EXACT = 5;
const BAND_PREFIX = 4;
const BAND_ALL_TOKENS = 3;
const BAND_PARTIAL = 2;
const BAND_HAYSTACK = 1;

/**
 * Per-extra-name-word penalty so a tighter name beats a longer one within the
 * all-tokens-strong-match band: "Bench Press (Barbell)" (3 name words, 1 extra
 * over the 2-token query) ranks above "Incline Bench Press" (3 name words but
 * the query tokens land on the trailing two, leaving "incline" as the extra).
 * Kept small (< the band gap / max-extra-words) so it never crosses bands.
 */
const EXTRA_WORD_PENALTY = 0.02;

function allTokensStrongMatchWords(tokens: string[], words: string[]): boolean {
  if (tokens.length === 0 || words.length === 0) return false;
  return tokens.every((token) =>
    words.some((word) => tokenStrongMatchesWord(token, word)),
  );
}

/**
 * Name-aware ranked score for a single row against a query. Higher is better.
 * Computed against the EN+ES NAME first, with the broader haystack
 * (keywords/tags/muscles/variations) as the lowest-band fallback.
 */
export function scoreExercise(query: string, row: ExerciseRow): number {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return 0;
  const tokens = normQuery.split(" ").filter(Boolean);

  const nameEn = normalizeSearchText(row.name.en ?? "");
  const nameEs = normalizeSearchText(row.name.es ?? "");

  // Tier 1 — exact normalized name match (EN or ES).
  if (normQuery === nameEn || normQuery === nameEs) {
    return BAND_EXACT;
  }

  // Tier 2 — name phrase-prefix (normalized name startsWith normalized query).
  // Require a word-boundary so "press" doesn't prefix-"pressure"; the
  // normalized query already ends mid-word only if the user typed a partial.
  const prefixEn = nameEn === normQuery || nameEn.startsWith(`${normQuery} `);
  const prefixEs = nameEs === normQuery || nameEs.startsWith(`${normQuery} `);
  if (prefixEn || prefixEs) {
    return BAND_PREFIX;
  }

  // Tier 3 — all query tokens strong-match the name words (order-independent),
  // with a per-extra-name-word penalty so the tighter name ranks higher.
  const enWords = nameEn.split(" ").filter(Boolean);
  const esWords = nameEs.split(" ").filter(Boolean);
  const matchesEn = allTokensStrongMatchWords(tokens, enWords);
  const matchesEs = allTokensStrongMatchWords(tokens, esWords);
  if (matchesEn || matchesEs) {
    // Use the side that matched with the FEWEST words (tightest name).
    const candidateWordCounts: number[] = [];
    if (matchesEn) candidateWordCounts.push(enWords.length);
    if (matchesEs) candidateWordCounts.push(esWords.length);
    const nameWordCount = Math.min(...candidateWordCounts);
    const extraWords = Math.max(0, nameWordCount - tokens.length);
    return BAND_ALL_TOKENS - extraWords * EXTRA_WORD_PENALTY;
  }

  // Tier 4 — name partial / contains (normalized name contains the query, or a
  // looser fuzzy match against the name only).
  if (nameEn.includes(normQuery) || nameEs.includes(normQuery)) {
    return BAND_PARTIAL;
  }
  const nameFuzzy = Math.max(
    fuzzyTokenScore(query, row.name.en ?? ""),
    fuzzyTokenScore(query, row.name.es ?? ""),
  );
  if (nameFuzzy > 0) {
    // Keep the fraction strictly < 1 so it stays inside the partial band.
    return BAND_PARTIAL - 0.5 + nameFuzzy * 0.5;
  }

  // Tier 5 — haystack-only match (keywords/tags/muscles/variations).
  const haystackScore = fuzzyTokenScore(query, exerciseSearchHaystack(row));
  if (haystackScore > 0) {
    return BAND_HAYSTACK + haystackScore * 0.5;
  }

  return 0;
}

/**
 * Filter + name-aware stable rank. Empty/whitespace query returns the rows
 * unchanged (same order, same elements) so callers can pass the raw list
 * through without a re-sort. Otherwise keeps only rows with a positive score
 * and STABLE-sorts by score desc, tie-break alphabetical by normalized EN
 * name (then original index for full determinism).
 */
export function searchExercises<T extends ExerciseRow>(
  rows: T[],
  query: string,
): T[] {
  if (!query || !query.trim()) return [...rows];

  const decorated = rows
    .map((row, index) => ({ row, index, score: scoreExercise(query, row) }))
    .filter((d) => d.score > 0);

  decorated.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const nameA = normalizeSearchText(a.row.name.en ?? "");
    const nameB = normalizeSearchText(b.row.name.en ?? "");
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return a.index - b.index;
  });

  return decorated.map((d) => d.row);
}
