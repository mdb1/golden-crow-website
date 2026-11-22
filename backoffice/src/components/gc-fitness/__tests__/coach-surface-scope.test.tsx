/**
 * @jest-environment jsdom
 */

// coach-surface-scope.test.tsx — golden-crow-website#535: the 40 px touch
// minimum applies to the coach screens only; admin (#534) and desktop keep the
// shared Button sizes untouched.

import fs from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";

const mockPath = { current: "/gc-fitness/clients" };
jest.mock("next/navigation", () => ({ usePathname: () => mockPath.current }));

import { CoachSurfaceScope, isCoachSurface } from "../coach-surface-scope";

it("coach routes yes; admin and non-gc-fitness routes no", () => {
  expect(isCoachSurface("/gc-fitness/dashboard")).toBe(true);
  expect(isCoachSurface("/gc-fitness/clients/abc/pagos")).toBe(true);
  expect(isCoachSurface("/gc-fitness/admin")).toBe(false);
  expect(isCoachSurface("/gc-fitness/admin/coaches")).toBe(false);
  expect(isCoachSurface("/gc-fitness/administrador")).toBe(true);
  expect(isCoachSurface("/dashboard")).toBe(false);
  expect(isCoachSurface(null)).toBe(false);
});

it("marks <body> on a coach page and clears it on admin / unmount", () => {
  mockPath.current = "/gc-fitness/clients";
  const { rerender, unmount } = render(<CoachSurfaceScope />);
  expect(document.body.hasAttribute("data-coach-surface")).toBe(true);
  mockPath.current = "/gc-fitness/admin/coaches";
  rerender(<CoachSurfaceScope />);
  expect(document.body.hasAttribute("data-coach-surface")).toBe(false);
  mockPath.current = "/gc-fitness/chat";
  rerender(<CoachSurfaceScope />);
  expect(document.body.hasAttribute("data-coach-surface")).toBe(true);
  unmount();
  expect(document.body.hasAttribute("data-coach-surface")).toBe(false);
});

it("the CSS rule is scoped to coarse pointers AND the coach surface", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "..", "..", "app", "globals.css"), "utf8");
  const block = css.slice(css.indexOf("@media (pointer: coarse) {\n  body[data-coach-surface]"));
  expect(block).toContain('body[data-coach-surface] [data-slot="button"]');
  expect(block).toContain("min-height: 2.5rem");
});
