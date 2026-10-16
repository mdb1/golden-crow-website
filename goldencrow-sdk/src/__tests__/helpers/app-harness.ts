// Shared fixtures for the tests that boot the WHOLE app through buildServer()
// (auth-middleware-behaviour, auth-routes, app-route-gate). Not a test file:
// jest only picks up *.test.ts.
//
// Each test file still declares its own jest.mock(...) calls (they are hoisted
// per file); the factories pull `inertFirebaseHandle` from here through
// jest.requireActual so no test can accidentally reach a real Firestore.

import type { AdminContext } from "../../types/sdk.types.js";

/**
 * A stand-in for a Firestore/Storage handle: any property chain is allowed at
 * module load (`adminDbFor("x")`), but the first CALL throws. A handler that
 * gets past the auth hook therefore answers 500 instead of touching anything.
 */
export function inertFirebaseHandle(label: string): unknown {
  const target = function inert() {
    /* never called directly — the Proxy's apply trap intercepts */
  };
  return new Proxy(target, {
    get: (_t, prop) =>
      prop === "then" ? undefined : inertFirebaseHandle(`${label}.${String(prop)}`),
    apply: () => {
      throw new Error(`${label}() — firebase is not available in this test`);
    },
  });
}

type Surface = "backoffice" | "patient" | "pgflex" | "publisher";

/** An AdminContext with exactly the given surfaces open. */
export function contextFor(
  surfaces: Surface[],
  overrides: Partial<AdminContext> = {},
): AdminContext {
  const has = (s: Surface) => surfaces.includes(s);
  const role: AdminContext["role"] = has("backoffice")
    ? "full_admin"
    : has("patient")
      ? "patient"
      : has("pgflex")
        ? "transport_dispatcher"
        : has("publisher")
          ? "organization_publisher"
          : "patient";
  return {
    email: "user@example.com",
    uid: "user-uid",
    role,
    isBootstrap: false,
    canAccessBackoffice: has("backoffice"),
    canAccessPatientPortal: has("patient"),
    canAccessPGFlex: has("pgflex"),
    canAccessPublisherPortal: has("publisher"),
    projectAccess: ["mydnamap"],
    ...overrides,
  };
}

/** Fill `:param` segments with a harmless concrete value. */
export function concretePath(url: string): string {
  return url.replace(/:[A-Za-z0-9_]+/g, "x1");
}

export interface CollectedRoute {
  method: string;
  url: string;
}

/** Normalise the onRoute payload (method may be an array) into flat rows. */
export function collectInto(rows: CollectedRoute[]) {
  return (route: { method: string | string[]; url: string }) => {
    for (const method of [route.method].flat()) {
      rows.push({ method, url: route.url });
    }
  };
}
