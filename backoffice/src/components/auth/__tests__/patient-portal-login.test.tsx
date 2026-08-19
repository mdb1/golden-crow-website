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

  it("shows the security-key email notice below the visible key field", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(eligibilityResponse());
    render(<LoginExperience surface="patient-portal" />);

    await user.type(screen.getByLabelText("Email"), "patient@example.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const password = (await screen.findByLabelText(
      "Clave de seguridad",
    )) as HTMLInputElement;
    const notice = screen.getByRole("note");
    expect(password.type).toBe("text");
    expect(password.getAttribute("aria-describedby")).toBe(notice.id);
    expect(notice.textContent).toContain(
      "Tu clave de seguridad fue enviada por email. Si no la recibiste, pedi a tu medico que vuelva a enviartela.",
    );
    expect(
      screen.queryByRole("button", { name: "Continuar con Google" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Iniciar con email" })).toBeNull();
    expect(screen.getByRole("button", { name: "Acceder al portal" })).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("shows the patient email as text and opens the security-key step from the mail link", async () => {
    const user = userEvent.setup();
    render(
      <LoginExperience
        surface="patient-portal"
        initialEmail="Patient@Example.com "
      />
    );

    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByText("patient@example.com")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continuar con Google" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Iniciar con email" })).toBeNull();
    expect(screen.getByRole("button", { name: "Acceder al portal" })).toBeTruthy();
    expect(screen.getByLabelText("Clave de seguridad")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cambiar email" }));

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("patient@example.com");
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeTruthy();
  });
});

describe("backoffice login", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it("omits the feature explainer blocks from the brand panel", () => {
    render(<LoginExperience surface="backoffice" />);

    expect(screen.getByText("Operaciones Golden Crow")).toBeTruthy();
    expect(screen.getByText("Usuario nuevo invitado?")).toBeTruthy();
    expect(screen.queryByText("Scoped control")).toBeNull();
    expect(screen.queryByText("Control acotado")).toBeNull();
    expect(screen.queryByText("Product aware")).toBeNull();
    expect(screen.queryByText("Contexto por producto")).toBeNull();
    expect(screen.queryByText("Traceable changes")).toBeNull();
    expect(screen.queryByText("Cambios trazables")).toBeNull();
  });
});
