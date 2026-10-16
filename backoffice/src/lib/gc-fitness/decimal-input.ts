/**
 * Text typed into a numeric field → number, accepting both decimal separators.
 *
 * Coaches type on Spanish and English keyboards, so "12,5" and "12.5" both
 * mean 12.5. Thousands groups are read only when they are well formed —
 * "1.234,5" (es) and "1,234.5" (en) → 1234.5 — and anything else ("1,5,0",
 * "1.2.3", "12kg") is NaN rather than a guessed number, so callers can show
 * an error. A lone dot or comma is the decimal point ("2.000" is 2: the field
 * can't tell, and that is what it always meant here).
 */
const SIMPLE = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;
const ES_GROUPED = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/;
const EN_GROUPED = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

export function parseDecimalInput(raw: string): number {
  const text = raw.trim().replace(/\s+/g, "");
  if (SIMPLE.test(text)) return Number(text.replace(",", "."));
  if (ES_GROUPED.test(text)) return Number(text.replace(/\./g, "").replace(",", "."));
  if (EN_GROUPED.test(text)) return Number(text.replace(/,/g, ""));
  return Number.NaN;
}
