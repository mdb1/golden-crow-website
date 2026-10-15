/**
 * @jest-environment jsdom
 */

// global-error.test.tsx — the last boundary (#382).
//
// Without Skew Protection a deploy deletes the previous build's JS chunks. An
// open tab that then lazily loads one throws ChunkLoadError, which can escape
// every route boundary and land here. That case must reload ONCE onto the new
// deployment (the long forms come back from their drafts) — and never loop.
// Any other error must keep its normal flow: generic copy, no reload.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import GlobalError from "@/app/global-error";
import { resetStaleDeploymentForTests } from "@/lib/gc-fitness/stale-deployment";

const RELOAD_STAMP = "gc-fitness:stale-auto-reload-at";

function chunkLoadError(): Error {
  return Object.assign(new Error("Loading chunk 7341 failed."), {
    name: "ChunkLoadError",
  });
}

function unrecognizedAction(): Error {
  const error = new Error(
    'Server Action "40a599bf0ba5a8e99a03f2f1e6e29733170e1d1939" was not found on the server.',
  );
  error.name = "UnrecognizedActionError";
  return error;
}

beforeEach(() => {
  resetStaleDeploymentForTests();
  window.sessionStorage.clear();
  // <html> inside a test container, jsdom's unimplemented location.reload, and
  // the boundary's own console.error are all expected noise here.
  jest.spyOn(console, "error").mockImplementation(() => {});
  // The page picks its copy from the browser language; coaches are es-AR.
  jest.spyOn(window.navigator, "language", "get").mockReturnValue("es-AR");
});

afterEach(() => {
  jest.restoreAllMocks();
});

it.each([
  ["a JS chunk of the previous build is gone", chunkLoadError],
  ["a Server Action of the previous build is gone", unrecognizedAction],
])("%s → new-version copy and ONE automatic reload", (_label, makeError) => {
  render(<GlobalError error={makeError()} reset={() => {}} />);

  expect(screen.getByText("Hay una versión nueva del sistema")).toBeInTheDocument();
  // reloadOntoCurrentDeployment stamps the tab right before reloading.
  expect(window.sessionStorage.getItem(RELOAD_STAMP)).not.toBeNull();
});

it("does not reload again within the minute — no loop", () => {
  const stamp = String(Date.now());
  window.sessionStorage.setItem(RELOAD_STAMP, stamp);

  render(<GlobalError error={chunkLoadError()} reset={() => {}} />);

  expect(screen.getByText("Hay una versión nueva del sistema")).toBeInTheDocument();
  expect(window.sessionStorage.getItem(RELOAD_STAMP)).toBe(stamp);
});

it("any other error keeps its normal flow: generic copy, no reload", () => {
  render(<GlobalError error={new Error("Forbidden")} reset={() => {}} />);

  expect(screen.getByText("Algo salió mal al cargar esta página")).toBeInTheDocument();
  expect(window.sessionStorage.getItem(RELOAD_STAMP)).toBeNull();
});
