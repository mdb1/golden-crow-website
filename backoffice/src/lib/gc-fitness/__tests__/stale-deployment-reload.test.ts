/**
 * @jest-environment jsdom
 */

// stale-deployment-reload.test.ts
//
// Coach report 2026-10-12: "ponía guardar cambios y me aparece error" — the
// full-page one being Next's built-in "This page couldn't load". Two pieces of
// the fix live in stale-deployment.ts and are pinned here:
//   • the chunk-load symptom of a deploy counts as a stale tab too;
//   • the automatic reload can fire at most once a minute per tab, so a
//     stale-looking error that a reload does NOT cure never becomes a loop.

import {
  isChunkLoadError,
  isStaleDeploymentError,
  reloadOntoCurrentDeployment,
  resetStaleDeploymentForTests,
} from "@/lib/gc-fitness/stale-deployment";

beforeEach(() => {
  resetStaleDeploymentForTests();
  window.sessionStorage.clear();
});

describe("chunk-load errors are a stale tab", () => {
  it.each([
    ["webpack", Object.assign(new Error("Loading chunk 7341 failed."), { name: "ChunkLoadError" })],
    ["webpack css", new Error("Loading CSS chunk 12 failed.\n(/_next/static/css/a.css)")],
    ["chrome ESM", new TypeError("Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js")],
    ["safari ESM", new TypeError("Importing a module script failed.")],
    ["firefox ESM", new TypeError("error loading dynamically imported module")],
  ])("recognizes the %s phrasing", (_label, error) => {
    expect(isChunkLoadError(error)).toBe(true);
    expect(isStaleDeploymentError(error)).toBe(true);
  });

  it("does not swallow ordinary failures", () => {
    for (const error of [
      new Error("Forbidden"),
      new TypeError("Failed to fetch"),
      new Error("Cannot read properties of undefined (reading 'map')"),
      null,
      "Loading chunk 1 failed",
    ]) {
      expect(isChunkLoadError(error)).toBe(false);
    }
  });
});

describe("reloadOntoCurrentDeployment", () => {
  it("reloads the first time", () => {
    const reload = jest.fn();
    expect(reloadOntoCurrentDeployment(reload, () => 1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("refuses a second reload inside a minute — no loops", () => {
    const reload = jest.fn();
    reloadOntoCurrentDeployment(reload, () => 1_000_000);
    expect(reloadOntoCurrentDeployment(reload, () => 1_000_000 + 59_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows it again once the minute is over", () => {
    const reload = jest.fn();
    reloadOntoCurrentDeployment(reload, () => 1_000_000);
    expect(reloadOntoCurrentDeployment(reload, () => 1_000_000 + 61_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when sessionStorage is unusable (the loop guard would be blind)", () => {
    const reload = jest.fn();
    const spy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    try {
      expect(reloadOntoCurrentDeployment(reload, () => 1_000_000)).toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(reload).not.toHaveBeenCalled();
  });
});
