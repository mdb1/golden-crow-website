// stale-deployment.ts
//
// Detects the ONE error that means "this tab is running last deployment's
// JavaScript against this deployment's server", and lets any call site report
// it to the banner in `stale-deployment-banner.tsx`.
//
// WHY (#382). Next.js derives every Server Action's ID from a hash of the
// build. A redeploy rotates those IDs, and a tab opened before it keeps
// POSTing an ID the server no longer knows, so Next throws
//
//     Server Action "404583b2…" was not found on the server.
//
// A coach saw that under a form they had already filled in. The message is
// accurate and useless: nothing in it says the page is simply old, and the
// only escape — a hard reload — throws the form away, which is why the
// report reads "pierden la sesión del formulario".
//
// This module does not reload anything. Losing the form is the actual injury;
// a banner that explains the state and lets the coach copy their work first is
// worth more than an automatic refresh.
//
// THE REAL FIXES ARE ELSEWHERE, and this is the floor under them:
//   • `scripts/vercel-ignore-build.sh` stops the backoffice redeploying for
//     commits that don't touch it — most rotations never happen.
//   • Vercel Skew Protection keeps serving the matching deployment to old
//     clients — but it has a maximum age (default one day), so a tab left open
//     over a weekend lands here anyway.

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
  return (
    /server action[^]*was not found on the server/i.test(message) ||
    /failed to find server action/i.test(message)
  );
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
}
