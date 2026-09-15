// stale-deployment.test.ts
//
// #382 — recognizing the error that means "this tab is running the previous
// deployment's JavaScript".
//
// Next.js rotates every Server Action ID on each build, so a tab opened before
// a redeploy can no longer save anything. The throw a coach actually saw was
//
//   Server Action "404583b2f953d9aaa930ceeb294cfc3118d27cf578" was not found
//   on the server.
//
// rendered verbatim under a form they had already filled in.
//
// The detector reads THREE independent signals because each is fragile alone,
// and this suite pins all three: if Next renames the error class, drops the
// `E715` code, or rewords the message, the other two still fire. A detector
// that silently stops matching would put the raw message back on screen
// without anything going red.

import {
  hasReportedStaleDeployment,
  isStaleDeploymentError,
  noteIfStaleDeployment,
  reportStaleDeployment,
  resetStaleDeploymentForTests,
  subscribeStaleDeployment,
} from "@/lib/gc-fitness/stale-deployment";

/** The real throw from next/dist/client/.../server-action-reducer.js. */
function nextUnrecognizedActionError(): Error {
  const error = new Error(
    'Server Action "404583b2f953d9aaa930ceeb294cfc3118d27cf578" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
  );
  error.name = "UnrecognizedActionError";
  Object.defineProperty(error, "__NEXT_ERROR_CODE", {
    value: "E715",
    enumerable: false,
  });
  return error;
}

beforeEach(() => {
  resetStaleDeploymentForTests();
});

describe("isStaleDeploymentError", () => {
  it("recognizes the real Next.js error", () => {
    expect(isStaleDeploymentError(nextUnrecognizedActionError())).toBe(true);
  });

  it("recognizes it by name alone", () => {
    const error = new Error("something else entirely");
    error.name = "UnrecognizedActionError";

    expect(isStaleDeploymentError(error)).toBe(true);
  });

  it("recognizes it by the E715 code alone", () => {
    const error = Object.assign(new Error("renamed in a future next"), {
      __NEXT_ERROR_CODE: "E715",
    });

    expect(isStaleDeploymentError(error)).toBe(true);
  });

  it("recognizes it by message alone", () => {
    // The fallback that survives Next renaming the class AND the code.
    expect(
      isStaleDeploymentError(
        new Error('Server Action "abc123" was not found on the server.'),
      ),
    ).toBe(true);
    // The server-side phrasing of the same condition.
    expect(
      isStaleDeploymentError(
        new Error("Failed to find Server Action. This request might be from an older or newer deployment."),
      ),
    ).toBe(true);
  });

  it("does NOT fire on ordinary failures", () => {
    // A false positive is expensive: it tells a coach their tab is stale and
    // sends them to reload, throwing away the form, when the real problem was
    // a validation error or a dropped connection.
    expect(isStaleDeploymentError(new Error("Forbidden"))).toBe(false);
    expect(isStaleDeploymentError(new Error("Not found"))).toBe(false);
    expect(
      isStaleDeploymentError(new Error("Failed to fetch")),
    ).toBe(false);
    expect(
      isStaleDeploymentError(new Error("The exercise was not found")),
    ).toBe(false);
    expect(isStaleDeploymentError(null)).toBe(false);
    expect(isStaleDeploymentError(undefined)).toBe(false);
    expect(isStaleDeploymentError("Server Action was not found")).toBe(false);
    expect(isStaleDeploymentError({ ok: false })).toBe(false);
  });
});

describe("noteIfStaleDeployment", () => {
  it("reports and claims the error so the caller skips its own toast", () => {
    const listener = jest.fn();
    subscribeStaleDeployment(listener);

    const handled = noteIfStaleDeployment(nextUnrecognizedActionError());

    expect(handled).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    // "Couldn't save, try again" is the wrong advice here — every retry from a
    // stale tab fails identically until the page is reloaded.
    expect(hasReportedStaleDeployment()).toBe(true);
  });

  it("leaves ordinary errors to the caller", () => {
    const listener = jest.fn();
    subscribeStaleDeployment(listener);

    expect(noteIfStaleDeployment(new Error("Forbidden"))).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(hasReportedStaleDeployment()).toBe(false);
  });
});

describe("the report latch", () => {
  it("survives a listener subscribing AFTER the error", () => {
    // A Server Action can fail during hydration, before the banner mounts.
    // Without the latch the banner would never appear and the coach would be
    // left with a form that silently refuses to save.
    reportStaleDeployment();

    expect(hasReportedStaleDeployment()).toBe(true);
  });

  it("notifies every live subscriber", () => {
    const a = jest.fn();
    const b = jest.fn();
    subscribeStaleDeployment(a);
    const unsubscribeB = subscribeStaleDeployment(b);
    unsubscribeB();

    reportStaleDeployment();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });
});
