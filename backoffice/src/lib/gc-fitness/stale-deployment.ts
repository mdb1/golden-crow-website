// stale-deployment.ts
//
// Detects the ONE error that means "this tab is running last deployment's
// JavaScript against this deployment's server", and lets any call site report
// it to the banner in `stale-deployment-banner.tsx`.
//
// WHY (#382). Next.js salts every Server Action ID with
// NEXT_SERVER_ACTIONS_ENCRYPTION_KEY; when that was unset, builds invented
// their own key and a redeploy could rotate every ID. A tab opened before it
// kept POSTing an ID the server no longer knew, so Next threw
//
//     Server Action "404583b2…" was not found on the server.
//
// (server side: a 404 with `x-nextjs-action-not-found: 1`; client side:
// `UnrecognizedActionError`, code E715.) A coach saw that under a form they
// had already filled in, and the only escape — a hard reload — threw the form
// away, which is why the report reads "pierden la sesión del formulario".
//
// Losing the form is the actual injury, so nothing here reloads on its own.
// `reloadOntoCurrentDeployment` exists for the callers that have FIRST saved
// the coach's work to a draft a reload restores (`use-form-draft.ts`, the
// routine and nutrition-plan editors) and for error boundaries, where the form
// is already gone.
//
// THE REAL FIXES ARE ELSEWHERE, and this is the floor under them:
//   • The fixed key (backoffice/.env.example; a production build refuses to
//     run without it) keeps an action's ID stable while its file and name
//     don't change. Renaming or moving an action — or reordering inline
//     "use server" closures — still changes IDs: see backoffice/README.md.
//   • `scripts/vercel-ignore-build.sh` + the version-bump hook stop the
//     backoffice redeploying for commits that don't touch it.
//   • There is NO Skew Protection (Hobby plan), so a redeploy still deletes the
//     old JS chunks — `isChunkLoadError` below is that symptom, and the key
//     does nothing for it.

/**
 * True for Next.js's unrecognized-Server-Action error.
 *
 * Three independent signals because each one is fragile alone: `name` is set
 * by `UnrecognizedActionError` (next 16), `__NEXT_ERROR_CODE` is the stable
 * `E715` tag Next stamps on the throw site, and the message match is the
 * version-proof fallback for when both get renamed. Any one of them is enough.
 */
export function isStaleDeploymentError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    message?: unknown;
    __NEXT_ERROR_CODE?: unknown;
  };
  if (candidate.name === "UnrecognizedActionError") return true;
  if (candidate.__NEXT_ERROR_CODE === "E715") return true;
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  // Both phrasings Next has shipped: the client-side reducer throws "Server
  // Action "<id>" was not found on the server." and the server-side handler
  // logs "Failed to find Server Action".
  if (
    /server action[^]*was not found on the server/i.test(message) ||
    /failed to find server action/i.test(message)
  ) {
    return true;
  }
  return isChunkLoadError(error);
}

/**
 * True when the browser failed to load one of last deployment's JS chunks.
 *
 * Same root cause as the Server Action case, other symptom: without Skew
 * Protection the old tab asks the NEW deployment for chunk files that only
 * existed in the old one, gets a 404, and webpack/turbopack throw while
 * rendering — which is what escapes every route boundary and lands on Next's
 * built-in "This page couldn't load" (the coach saw it browser-translated as
 * "No se pudo cargar esta página" right after "Guardar cambios").
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  if (candidate.name === "ChunkLoadError") return true;
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  return (
    /loading (css )?chunk [^ ]+ failed/i.test(message) ||
    /failed to fetch dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

const AUTO_RELOAD_STAMP_KEY = "gc-fitness:stale-auto-reload-at";
/** A second stale error inside this window means the reload did not help. */
const AUTO_RELOAD_COOLDOWN_MS = 60_000;

/**
 * Reload the tab onto the current deployment — but only when the caller has
 * ALREADY put the coach's work somewhere a reload can't touch (a localStorage
 * draft) or there is no work left to lose (an error boundary already
 * unmounted the form).
 *
 * Latched per tab through sessionStorage: if the page reloads and hits a stale
 * error again within a minute, something other than skew is wrong, and an
 * endless reload loop is worse than the banner. Returns whether it reloaded,
 * so the caller can fall back to the banner.
 */
export function reloadOntoCurrentDeployment(
  reload: () => void = () => window.location.reload(),
  now: () => number = Date.now,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(AUTO_RELOAD_STAMP_KEY));
    if (Number.isFinite(last) && last > 0 && now() - last < AUTO_RELOAD_COOLDOWN_MS) {
      return false;
    }
    window.sessionStorage.setItem(AUTO_RELOAD_STAMP_KEY, String(now()));
  } catch {
    // Storage blocked: without the latch we cannot rule out a loop, so leave
    // the reload to the coach.
    return false;
  }
  reload();
  return true;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let reported = false;

/**
 * Announce that this tab is stale. Idempotent: the first report latches, so a
 * coach who clicks Save three times gets one banner, and a listener that
 * mounts after the fact still learns about it.
 */
export function reportStaleDeployment(): void {
  reported = true;
  for (const listener of listeners) listener();
}

/** Has a stale-deployment error already been seen in this tab? */
export function hasReportedStaleDeployment(): boolean {
  return reported;
}

export function subscribeStaleDeployment(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The call-site helper: pass whatever landed in a `catch`. Returns true when
 * the error was a stale deployment (and the banner has been raised), so the
 * caller can skip its own "something went wrong" toast — telling a coach to
 * "try again" here is wrong, since every retry from this tab fails the same
 * way until the page is reloaded.
 */
export function noteIfStaleDeployment(error: unknown): boolean {
  if (!isStaleDeploymentError(error)) return false;
  reportStaleDeployment();
  return true;
}

/** Test seam — resets the module-level latch between cases. */
export function resetStaleDeploymentForTests(): void {
  reported = false;
  listeners.clear();
  try {
    window.sessionStorage.removeItem(AUTO_RELOAD_STAMP_KEY);
  } catch {
    /* no window in node tests */
  }
}
