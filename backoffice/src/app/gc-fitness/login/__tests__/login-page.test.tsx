/** @jest-environment jsdom */
// login-page.test.tsx — #510 + #497.
//
// The login route refuses non-coaches with a `code`; the page must turn it into
// copy the person can act on (not the route's English debug string), and the
// brand / helper text that used to be hardcoded is translated.

jest.mock("firebase/auth", () => ({
  GoogleAuthProvider: jest.fn(),
  getRedirectResult: jest.fn(async () => null),
  signInWithPopup: jest.fn(async () => ({ user: { getIdToken: async () => "id-tok" } })),
  signInWithRedirect: jest.fn(),
}));
jest.mock("@/lib/firebase/gc-fitness-client", () => ({ getGCFitnessAuth: () => ({}) }));

import { fireEvent, render, screen } from "@testing-library/react";

import GCFitnessLoginPage from "@/app/gc-fitness/login/page";
import en from "../../../../../messages/en.json";

function respond(status: number, body: unknown) {
  // jsdom has no `Response`; the page only reads ok/json().
  global.fetch = jest.fn(async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;
}

describe("GC Fitness login page", () => {
  it("renders the translated brand and helper (no hardcoded copy)", () => {
    render(<GCFitnessLoginPage />);
    expect(screen.getByText(en.login.brand)).toBeInTheDocument();
    expect(screen.getByText(en.login.authorizedOnly)).toBeInTheDocument();
  });

  it.each([
    ["not-a-coach", en.login.errors.notACoach],
    ["coach-disabled", en.login.errors.coachDisabled],
    ["client", en.login.errors.client],
  ])("403 with code %s shows the translated refusal", async (code, copy) => {
    respond(403, { error: "debug text", code });
    render(<GCFitnessLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: en.login.googleCta }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByText("debug text")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/gc-fitness/login",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer id-tok" }) }),
    );
  });
});
