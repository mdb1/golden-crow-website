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

function invitedBackofficeSignupResponse() {
  const body = {
    email: "federico0812+admin@gmail.com",
    eligible: true,
    viaAllowlist: false,
    viaRoleAssignment: true,
    canAccessBackoffice: true,
    canAccessPatientPortal: false,
    canAccessPGFlex: false,
    canAccessPublisherPortal: false,
    role: "institution_admin",
    accountExists: false,
    accountHasPassword: false,
    projectAccess: ["mydnamap"],
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

    expect(
      screen.getByRole("heading", { name: "Portal de pacientes" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continuar con Google" }),
    ).toBeTruthy();
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
    expect(
      screen.queryByRole("button", { name: "Iniciar con email" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Acceder al portal" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("shows the patient email as text and opens the security-key step from the mail link", async () => {
    const user = userEvent.setup();
    render(
      <LoginExperience
        surface="patient-portal"
        initialEmail="Patient@Example.com "
      />,
    );

    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByText("patient@example.com")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Continuar con Google" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Iniciar con email" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Acceder al portal" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Clave de seguridad")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cambiar email" }));

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("patient@example.com");
    expect(
      screen.getByRole("button", { name: "Continuar con Google" }),
    ).toBeTruthy();
  });
});

describe("PGFlex login", () => {
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

  it("uses the PGFlex logo and visible access-key step", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ...eligibilityResponse(),
      json: async () => ({
        email: "driver@example.com",
        eligible: true,
        accountExists: true,
        accountHasPassword: true,
      }),
      text: async () =>
        JSON.stringify({
          email: "driver@example.com",
          eligible: true,
          accountExists: true,
          accountHasPassword: true,
        }),
    } as unknown as Response);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");

    render(<LoginExperience surface="pgflex" />);

    expect(screen.getByRole("heading", { name: "PGFlex" })).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "PGFlex" }).getAttribute("src"),
    ).toBe("/pgflex_icon.png");
    expect(
      screen.getByRole("button", { name: "Continuar con Google" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
    expect(screen.queryByLabelText("Clave de seguridad")).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Idioma del login" }),
    ).toBeNull();
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");

    await user.type(screen.getByLabelText("Email"), "driver@example.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const accessKey = (await screen.findByLabelText(
      "Clave de acceso",
    )) as HTMLInputElement;
    expect(accessKey.type).toBe("text");
    expect(accessKey.getAttribute("aria-describedby")).toBe(
      "portal-access-key-notice",
    );
    expect(screen.getByRole("note").textContent).toContain(
      "Tu clave de acceso fue enviada por email. Si no la recibiste, pedi a un administrador que vuelva a enviartela.",
    );
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByLabelText("Contraseña")).toBeNull();
    expect(screen.queryByLabelText("Contrasena")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Acceder a PGFlex" }),
    ).toBeTruthy();
  });
});

describe("publisher portal login", () => {
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

  it("uses the visible access-key step for invited publishers", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");

    render(
      <LoginExperience
        surface="publisher-portal"
        initialEmail="Publisher@Example.com "
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Portal de publicadores" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByText("publisher@example.com")).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: "Idioma del login" }),
    ).toBeNull();
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");

    const accessKey = screen.getByLabelText(
      "Clave de acceso",
    ) as HTMLInputElement;
    expect(accessKey.type).toBe("text");
    expect(screen.getByRole("note").textContent).toContain(
      "Tu clave de acceso fue enviada por email. Si no la recibiste, pedi a un administrador que vuelva a enviartela.",
    );
    expect(
      screen.getByRole("button", { name: "Acceder al portal" }),
    ).toBeTruthy();
  });
});

describe("backoffice login", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    window.localStorage.clear();
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");
  });

  it("omits the feature explainer blocks from the brand panel", () => {
    render(<LoginExperience surface="backoffice" />);

    expect(screen.getByText("Golden Crow VS")).toBeTruthy();
    expect(
      screen.getByText("Gestiona todo desde un espacio de trabajo unificado."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "El dashboard te da herramientas para tratar con usuarios, roles, reportes, archivos, formularios, instituciones, medicos y pacientes con el contexto correcto siempre visible.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Usuario nuevo invitado?")).toBeTruthy();
    expect(screen.queryByText("Operaciones Golden Crow")).toBeNull();
    expect(screen.queryByText("Scoped control")).toBeNull();
    expect(screen.queryByText("Control acotado")).toBeNull();
    expect(screen.queryByText("Product aware")).toBeNull();
    expect(screen.queryByText("Contexto por producto")).toBeNull();
    expect(screen.queryByText("Traceable changes")).toBeNull();
    expect(screen.queryByText("Cambios trazables")).toBeNull();
  });

  it("shows only the short approval notice for invited new users", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(invitedBackofficeSignupResponse());

    render(<LoginExperience surface="backoffice" />);

    await user.type(
      screen.getByLabelText("Email"),
      "federico0812+admin@gmail.com",
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Acceso aprobado");
    expect(alert.textContent).toContain(
      "Este email invitado puede crear una cuenta de backoffice. Elegi un password para terminar.",
    );
    expect(screen.getAllByText("Acceso aprobado")).toHaveLength(1);
    expect(screen.getByLabelText("Nuevo password")).toBeTruthy();
    expect(
      screen.queryByText(
        /federico0812\+admin@gmail\.com fue aprobado mediante la asignacion de rol/i,
      ),
    ).toBeNull();
  });

  it("warns transport dispatchers to use the PGFlex login", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { forEach: jest.fn() },
      clone() {
        return this;
      },
      json: async () => ({
        email: "driver@example.com",
        eligible: false,
        viaAllowlist: false,
        viaRoleAssignment: true,
        canAccessBackoffice: false,
        canAccessPatientPortal: false,
        canAccessPGFlex: true,
        canAccessPublisherPortal: false,
        requiredSurface: "pgflex",
        role: "transport_dispatcher",
        accountExists: true,
        accountHasPassword: true,
        projectAccess: ["mydnamap"],
      }),
      text: async () =>
        JSON.stringify({
          email: "driver@example.com",
          eligible: false,
          requiredSurface: "pgflex",
          accountExists: true,
        }),
    } as unknown as Response);

    render(<LoginExperience surface="backoffice" />);

    await user.type(screen.getByLabelText("Email"), "driver@example.com");
    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Usá el login de PGFlex");
    expect(alert.textContent).toContain(
      "Esta cuenta tiene acceso a PGFlex y no puede iniciar sesión desde el login del backoffice.",
    );
    expect(
      screen
        .getByRole("link", { name: "Abrir login de PGFlex" })
        .getAttribute("href"),
    ).toBe("/pgflex/login");
  });

  it("warns Discover publishers to use the publisher portal login", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { forEach: jest.fn() },
      clone() {
        return this;
      },
      json: async () => ({
        email: "publisher@example.com",
        eligible: false,
        viaAllowlist: false,
        viaRoleAssignment: true,
        canAccessBackoffice: false,
        canAccessPatientPortal: false,
        canAccessPGFlex: false,
        canAccessPublisherPortal: true,
        requiredSurface: "publisher-portal",
        role: "organization_publisher",
        accountExists: true,
        accountHasPassword: true,
        projectAccess: ["mydnamap"],
      }),
      text: async () =>
        JSON.stringify({
          email: "publisher@example.com",
          eligible: false,
          requiredSurface: "publisher-portal",
          accountExists: true,
        }),
    } as unknown as Response);

    render(<LoginExperience surface="backoffice" />);

    await user.type(screen.getByLabelText("Email"), "publisher@example.com");
    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Usá el login del portal de publicadores",
    );
    expect(alert.textContent).toContain(
      "Esta cuenta tiene acceso al portal de publicadores y no puede iniciar sesión desde el login del backoffice.",
    );
    expect(
      screen
        .getByRole("link", {
          name: "Abrir login del portal de publicadores",
        })
        .getAttribute("href"),
    ).toBe("/publisher-portal/login");
  });
});
