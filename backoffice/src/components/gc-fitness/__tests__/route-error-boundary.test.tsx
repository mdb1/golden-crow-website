/**
 * @jest-environment jsdom
 */

// route-error-boundary.test.tsx — the section-level error screen of the coach
// portal (and, since 2026-10-12, the /gc-fitness catch-all `error.tsx`).
//
// Coach report 2026-10-12: after "Guardar cambios" the page turned into an
// error the coach could not get out of. For a STALE tab "Reintentar" can never
// work — it re-renders last deployment's JS — so that case must say a new
// version is out and reload instead.

import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import enMessages from "@/../messages/en.json";

import { RouteErrorBoundary } from "@/components/gc-fitness/route-error-boundary";
import { resetStaleDeploymentForTests } from "@/lib/gc-fitness/stale-deployment";

beforeEach(() => {
  resetStaleDeploymentForTests();
  window.sessionStorage.clear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("a stale tab reloads itself once and offers Reload, not Retry", async () => {
  const reload = jest.fn();
  const reset = jest.fn();
  const chunk = Object.assign(new Error("Loading chunk 7341 failed."), {
    name: "ChunkLoadError",
  });

  render(
    <RouteErrorBoundary routeName="root" error={chunk} reset={reset} reload={reload} />,
  );

  expect(screen.getByText(enMessages.staleDeployment.title)).toBeInTheDocument();
  expect(reload).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: enMessages.common.retry }),
  ).not.toBeInTheDocument();

  await userEvent.setup().click(
    screen.getByRole("button", { name: enMessages.staleDeployment.reload }),
  );
  expect(reload).toHaveBeenCalledTimes(2);
  expect(reset).not.toHaveBeenCalled();
});

it("any other error keeps the generic card with Retry, and never reloads", async () => {
  const reload = jest.fn();
  const reset = jest.fn();

  render(
    <RouteErrorBoundary
      routeName="root"
      error={new Error("Cannot read properties of undefined")}
      reset={reset}
      reload={reload}
    />,
  );

  expect(screen.getByText(enMessages.common.errorGeneric)).toBeInTheDocument();
  await userEvent.setup().click(
    screen.getByRole("button", { name: enMessages.common.retry }),
  );
  expect(reset).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
});
