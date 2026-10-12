// nutrition-plan-draft.ts
//
// localStorage draft for the nutrition plan editor (`AssignNutritionForm`).
//
// WHY. A coach reported losing a nutrition plan they were editing: they pressed
// "Guardar cambios" and got an error page. The routine editor already kept a
// draft (`template-form.tsx`), so a reload brought the routine back; the
// nutrition editor kept everything in React state, so ANY failure that ends in
// a reload — a deploy that rotated the Server Action IDs (#382), a chunk that
// no longer exists, a crash to the error page — threw the whole plan away.
//
// Storage-only and framework-free so the rules are testable without rendering
// the 1200-line form: versioned envelope, expiry, and every storage call
// wrapped (private mode / quota / blocked storage must never break the editor).

const PREFIX = "gc-fitness:nutrition-plan-draft:";
const VERSION = 1;
/**
 * A draft older than this is not "what I was just doing" any more — restoring
 * a two-week-old half-plan over the real one would be its own surprise.
 */
export const NUTRITION_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Envelope<T> {
  v: number;
  savedAt: number;
  data: T;
}

/** One draft per (client, plan being edited); a new plan is `new`. */
export function nutritionPlanDraftKey(
  clientId: string,
  planId: string | null,
): string {
  return `${PREFIX}${clientId}:${planId ?? "new"}`;
}

export function readNutritionPlanDraft<T>(
  key: string,
  now: number = Date.now(),
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Envelope<T>> | null;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.v !== VERSION ||
      typeof parsed.savedAt !== "number" ||
      parsed.data === undefined ||
      parsed.data === null
    ) {
      window.localStorage.removeItem(key);
      return null;
    }
    if (now - parsed.savedAt > NUTRITION_DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeNutritionPlanDraft<T>(
  key: string,
  data: T,
  now: number = Date.now(),
): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: Envelope<T> = { v: VERSION, savedAt: now, data };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* quota / private mode — the editor keeps working without a draft */
  }
}

export function clearNutritionPlanDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
