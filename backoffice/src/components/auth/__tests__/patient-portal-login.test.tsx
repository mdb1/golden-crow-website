/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginExperience } from "@/components/auth/login-experience";
import { LANGUAGE_STORAGE_KEY } from "@/lib/language";

const fetchMock = jest.fn();

jest.mock("firebase/auth", () => ({
  fetchSignInMethodsForEmail: jest.fn(),
  GoogleAuthProvider: class GoogleAuthProvider {
    setCustomParameters() {}
  },
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
}));

jest.mock("@/lib/firebase", () => ({
  auth: {
    app: {
      options: {
        authDomain: "example.firebaseapp.com",
        projectId: "example",
      },
    },
  },
}));

function eligibilityResponse() {
  const body = {
    email: "patient@example.com",
    eligible: true,
    accountExists: true,
    accountHasPassword: true,
  };

  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { forEach: jest.fn() },
    clone() {
      return this;
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("patient portal login", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    window.localStorage.clear();
  });

  it("uses Spanish even when the backoffice preference is English", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");

    render(<LoginExperience surface="patient-portal" />);

    expect(screen.getByRole("heading", { name: "Portal de pacientes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
  });

  it("shows the temporary-password email notice below the password field", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(eligibilityResponse());
    render(<LoginExperience surface="patient-portal" />);

    await user.type(screen.getByLabelText("Email"), "patient@example.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const password = await screen.findByLabelText("Contrasena");
    const notice = screen.getByRole("note");
    expect(password.getAttribute("aria-describedby")).toBe(notice.id);
    expect(notice.textContent).toContain(
      "Tu contrasena temporal fue enviada por email. Si no la recibiste, pedi a tu medico que vuelva a enviartela."
    );
  });
});
