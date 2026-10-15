"use client";

// use-form-draft.ts
//
// #382 — a per-tab draft for the long forms, so a reload never throws away
// what the coach was typing.
//
// WHY. A deploy can leave an open tab unable to save: its JS chunks or Server
// Action IDs no longer exist on the server, and the only way out is a reload —
// which used to wipe the form. The routine and nutrition-plan editors grew
// their own drafts for that (template-form.tsx, nutrition-plan-draft.ts); this
// is the reusable version for every other long form.
//
// WHY sessionStorage (not localStorage). The draft only has to survive a
// reload of the SAME tab — the stale-deployment reload, or the coach pressing
// F5. sessionStorage does exactly that and is gone when the tab closes, so a
// half-written form never outlives the session on a shared computer, and two
// tabs editing the same entity can't overwrite each other's drafts. (The two
// older editors keep their localStorage drafts: the routine list surfaces
// pending drafts across visits, and that is a feature people rely on.)
//
// Keys are `draft:<form>:<entity>` — `formDraftKey("exercise", id)` — and
// `clearAllFormDrafts()` runs on sign-out.
//
// Contract for callers:
//   • `value`   — the form's current state, JSON-serializable.
//   • `onRestore(draft)` — called ONCE after mount when a draft exists; merge
//     it into the form. Omitted fields are absent from `draft`.
//   • `omit`    — top-level fields that must never reach the browser's
//     storage (sensitive or meaningless after a reload).
//   • `clear()` after a SUCCESSFUL submit; `discard()` when the coach cancels.
// Every storage call is wrapped: blocked storage / quota / private mode must
// never break the form — it just runs without a draft.

import { useCallback, useEffect, useRef, useState } from "react";

export const FORM_DRAFT_PREFIX = "draft:";
const VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 400;

interface Envelope<T> {
  v: number;
  savedAt: number;
  data: T;
}

/** One draft per (form, entity being edited); a new entity is `new`. */
export function formDraftKey(
  form: string,
  entity: string | null | undefined,
): string {
  return `${FORM_DRAFT_PREFIX}${form}:${entity || "new"}`;
}

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readFormDraft<T>(key: string): T | null {
  const store = sessionStore();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Envelope<T>> | null;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.v !== VERSION ||
      parsed.data === undefined ||
      parsed.data === null
    ) {
      store.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeFormDraft<T>(key: string, data: T): void {
  const store = sessionStore();
  if (!store) return;
  try {
    const envelope: Envelope<T> = { v: VERSION, savedAt: Date.now(), data };
    store.setItem(key, JSON.stringify(envelope));
  } catch {
    /* quota / blocked — the form keeps working without a draft */
  }
}

export function clearFormDraft(key: string): void {
  try {
    sessionStore()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Sign-out: no draft of this coach's forms survives into the next session. */
export function clearAllFormDrafts(): void {
  const store = sessionStore();
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key?.startsWith(FORM_DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Shallow copy of `value` without the `omit` fields (objects only). */
export function omitDraftFields<T>(
  value: T,
  omit: readonly string[] | undefined,
): Partial<T> {
  if (!omit?.length || !value || typeof value !== "object" || Array.isArray(value)) {
    return value as Partial<T>;
  }
  const copy = { ...(value as Record<string, unknown>) };
  for (const field of omit) delete copy[field];
  return copy as Partial<T>;
}

export interface UseFormDraftOptions<T> {
  /** `formDraftKey(...)`, or null to switch drafts off (e.g. view mode). */
  key: string | null;
  value: T;
  onRestore: (draft: Partial<T>) => void;
  omit?: readonly (keyof T & string)[];
  /**
   * The untouched state, when it is NOT the first render's value — a form
   * seeded asynchronously (e.g. from a query) passes the seeded value here, so
   * seeding isn't mistaken for an edit. Defaults to the first render's value.
   */
  baseline?: T;
  debounceMs?: number;
}

export interface FormDraftControls<T> {
  /** A draft was restored on mount and the coach hasn't dismissed the notice. */
  restored: boolean;
  /** Successful submit: drop the draft. */
  clear: () => void;
  /**
   * The coach cancelled or discarded the draft: drop it. Pass the values the
   * form is being reset to, so that reset isn't mistaken for a new edit; with
   * no argument the next render's value becomes the baseline.
   */
  discard: (resetTo?: T) => void;
  /** Hide the "draft restored" notice, keeping the draft. */
  dismissNotice: () => void;
}

export function useFormDraft<T>({
  key,
  value,
  onRestore,
  omit,
  baseline,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseFormDraftOptions<T>): FormDraftControls<T> {
  const [restored, setRestored] = useState(false);
  const serialized = JSON.stringify(omitDraftFields(value, omit));

  // The value the form had before the coach touched it. A form at its
  // baseline has nothing worth keeping, so no draft is written for it (and an
  // edit reverted by hand drops the stale draft).
  const baselineRef = useRef<string | null>(null);
  if (baseline !== undefined) {
    baselineRef.current = JSON.stringify(omitDraftFields(baseline, omit));
  } else if (baselineRef.current === null) {
    baselineRef.current = serialized;
  }

  const latestRef = useRef(serialized);
  latestRef.current = serialized;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // An edit not yet written. Separate from the timer: the autosave effect's
  // cleanup cancels the timer on unmount BEFORE the flush below runs, and the
  // flush still has to know there was something to save.
  const pendingRef = useRef(false);
  // Set by the restore effect: in that same commit the autosave effect still
  // sees the PRE-restore value, and saving it would wipe the draft just read.
  const justRestoredRef = useRef(false);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  const persist = useCallback(
    (snapshot: string) => {
      pendingRef.current = false;
      if (!key) return;
      if (snapshot === baselineRef.current) {
        clearFormDraft(key);
        return;
      }
      writeFormDraft(key, JSON.parse(snapshot) as unknown);
    },
    [key],
  );

  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Restore once per key, after mount (sessionStorage doesn't exist on the
  // server, so reading during render would break hydration).
  useEffect(() => {
    if (!key) return;
    const draft = readFormDraft<Partial<T>>(key);
    if (draft === null) return;
    justRestoredRef.current = true;
    restoreRef.current(draft);
    setRestored(true);
  }, [key]);

  // Debounced autosave.
  useEffect(() => {
    if (!key) return;
    if (justRestoredRef.current) {
      justRestoredRef.current = false;
      return;
    }
    cancelPending();
    pendingRef.current = true;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persist(serialized);
    }, debounceMs);
    return cancelPending;
  }, [key, serialized, debounceMs, persist, cancelPending]);

  // A reload or a route change inside the debounce window must not lose the
  // last keystrokes: flush on pagehide and on unmount.
  useEffect(() => {
    if (!key) return;
    const flush = () => {
      if (!pendingRef.current) return;
      cancelPending();
      persist(latestRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [key, persist, cancelPending]);

  const clear = useCallback(() => {
    cancelPending();
    pendingRef.current = false;
    if (key) clearFormDraft(key);
    // From here on the saved state is the baseline: nothing to keep until the
    // coach edits again.
    baselineRef.current = latestRef.current;
    setRestored(false);
  }, [key, cancelPending]);

  const discard = useCallback(
    (resetTo?: T) => {
      cancelPending();
      pendingRef.current = false;
      if (key) clearFormDraft(key);
      baselineRef.current =
        resetTo === undefined
          ? null
          : JSON.stringify(omitDraftFields(resetTo, omit));
      setRestored(false);
    },
    // `omit` is a constant list at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, cancelPending],
  );

  const dismissNotice = useCallback(() => setRestored(false), []);

  return { restored, clear, discard, dismissNotice };
}
