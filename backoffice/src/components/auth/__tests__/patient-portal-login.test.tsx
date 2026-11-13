/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server.node";
import { signIn } from "@/lib/session-client";
import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { LoginExperience } from "@/components/auth/login-experience";
import { LANGUAGE_STORAGE_KEY } from "@/lib/language";

const fetchMock = jest.fn();

jest.mock("firebase/auth", () => ({
  fetchSignInMethodsForEmail: jest.fn(),
  GoogleAuthProvider: class GoogleAuthProvider {
    addScope() {}
    setCustomParameters() {}
  },
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithCustomToken: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("@/lib/session-client", () => ({
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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { forEach: jest.fn() },
    clone() { return this; },
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
    jest.clearAllMocks();
    jest.mocked(signInWithEmailAndPassword).mockReset();
    jest.mocked(signInWithCustomToken).mockReset();
    jest.mocked(signIn).mockReset();
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("renders only the automatic access status in the initial server HTML", () => {
    const html = renderToStaticMarkup(
      <LoginExperience surface="publisher-portal" initialEmail="publisher@example.com" initialAccessKey="sample-key" />,
    );
    expect(html).toContain("Accediendo al portal…");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Acceder al portal");
    expect(html).not.toContain("sample-key");
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["Sample+code&42", "pgp1.normal-password"])("automatically uses publisher key %s exactly once without showing the form", async (key) => {
    jest.mocked(signInWithEmailAndPassword).mockImplementationOnce(() => new Promise<never>(() => {}));
    window.history.replaceState(null, "", `/publisher-portal/login?email=publisher%2Bapp%40example.com&accessKey=${encodeURIComponent(key)}&callbackUrl=%2Fpublisher-portal%2Fapp%2Fnew`);
    const view = <StrictMode><LoginExperience surface="publisher-portal" initialEmail="Publisher+app@Example.com " initialAccessKey={key} /></StrictMode>;
    const { rerender } = render(view);
    expect(screen.getByRole("status").textContent).toBe("Accediendo al portal…");
    expect(screen.queryByLabelText("Clave de acceso")).toBeNull();
    expect(screen.queryByRole("button", { name: "Acceder al portal" })).toBeNull();
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), "publisher+app@example.com", key);
    expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(new URL(window.location.href).searchParams.has("accessKey")).toBe(false);
    expect(new URL(window.location.href).searchParams.get("email")).toBe("publisher+app@example.com");
    expect(new URL(window.location.href).searchParams.get("callbackUrl")).toBe("/publisher-portal/app/new");
    rerender(view);
    expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
  });

  it("automatically exchanges a publisher code and completes the usual session handoff", async () => {
    const key = `pgp1.${"a".repeat(300)}.signature`;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ customToken: "firebase-custom-token" }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ context: { projectAccess: ["mydnamap"] } }))
      .mockResolvedValueOnce(jsonResponse({ state: { needsCompletion: false } }));
    jest.mocked(signInWithCustomToken).mockResolvedValueOnce({ user: {
      getIdToken: async () => "firebase-id-token",
      email: "publisher@example.com",
      displayName: "Publisher",
    } } as never);
    jest.mocked(signIn).mockResolvedValueOnce({ ok: true, status: 200, error: null, url: null });
    jest.spyOn(console, "error").mockImplementation(() => {}); // jsdom cannot perform the final navigation.
    window.history.replaceState(null, "", `/publisher-portal/login?email=publisher%40example.com&accessKey=${encodeURIComponent(key)}&callbackUrl=%2Fpublisher-portal%2Fapp%2Fnew`);
    render(<LoginExperience surface="publisher-portal" initialEmail="publisher@example.com" initialAccessKey={key} />);
    expect(screen.queryByRole("button", { name: "Acceder al portal" })).toBeNull();
    await waitFor(() => expect(signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), "firebase-custom-token"));
    expect(fetchMock).toHaveBeenCalledWith("/api/sdk/publisher-portal/access-code", expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "publisher@example.com", accessKey: key }) }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({ idToken: "firebase-id-token", accessSurface: "publisher-portal", project: "mydnamap", redirect: false })));
    expect(fetchMock).toHaveBeenCalledWith("/api/sdk/auth/login", expect.objectContaining({ body: JSON.stringify({ idToken: "firebase-id-token", surface: "publisher-portal" }) }));
    expect(screen.getByRole("status").textContent).toBe("Accediendo al portal…");
    expect(screen.queryByLabelText("Clave de acceso")).toBeNull();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(new URL(window.location.href).searchParams.has("accessKey")).toBe(false);
    expect(new URL(window.location.href).searchParams.get("callbackUrl")).toBe("/publisher-portal/app/new");
  });

  it("shows the form after an expired link and allows a manual retry without repeating the automatic attempt", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Invalid code" }, 401));
    const view = <LoginExperience surface="publisher-portal" initialEmail="publisher@example.com" initialAccessKey={`pgp1.${"a".repeat(300)}.invalid`} />;
    const { rerender } = render(view);
    await waitFor(() => expect(screen.getByText("No pudimos usar este enlace de acceso")).toBeTruthy());
    expect(screen.queryByRole("status")).toBeNull();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    rerender(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    jest.mocked(signInWithEmailAndPassword).mockRejectedValueOnce({ code: "auth/network-request-failed" });
    await user.clear(screen.getByLabelText("Clave de acceso"));
    await user.type(screen.getByLabelText("Clave de acceso"), "usual-key");
    await user.click(screen.getByRole("button", { name: "Acceder al portal" }));
    await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), "publisher@example.com", "usual-key"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns to the form if the server rejects the authenticated publisher session", async () => {
    jest.mocked(signInWithEmailAndPassword).mockResolvedValueOnce({ user: {
      getIdToken: async () => "firebase-id-token",
      email: "publisher@example.com",
    } } as never);
    jest.mocked(signOut).mockResolvedValueOnce();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Publisher access denied" }, 403));
    render(<LoginExperience surface="publisher-portal" initialEmail="publisher@example.com" initialAccessKey="usual-key" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acceder al portal" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
  });

  it.each(["backoffice", "patient-portal", "pgflex"] as const)("does not prefill publisher keys on the %s authentication surface", (surface) => {
    render(<LoginExperience surface={surface} initialEmail="publisher@example.com" initialAccessKey="publisher-only-key" />);
    for (const input of document.querySelectorAll("input")) expect(input.value).not.toBe("publisher-only-key");
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a key without its recipient email and clears a prefilled key when changing account", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<LoginExperience surface="publisher-portal" initialAccessKey="publisher-key" />);
    expect(screen.queryByLabelText("Clave de acceso")).toBeNull();
    unmount();
    jest.mocked(signInWithEmailAndPassword).mockRejectedValueOnce({ code: "auth/network-request-failed" });
    render(<LoginExperience surface="publisher-portal" initialEmail="publisher@example.com" initialAccessKey="publisher-key" />);
    await user.click(await screen.findByRole("button", { name: "Cambiar email" }));
    expect(screen.queryByLabelText("Clave de acceso")).toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("publisher@example.com");
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

  it("offers Google sign-in when the publisher account has no password provider", async () => {
    const user = userEvent.setup();
    const body = {
      email: "publisher@example.com",
      eligible: true,
      accountExists: true,
      accountHasGoogle: true,
      accountHasPassword: false,
      signInProviders: ["google.com"],
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { forEach: jest.fn() },
      clone() {
        return this;
      },
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response);
    jest.mocked(signInWithEmailAndPassword).mockRejectedValueOnce({
      code: "auth/invalid-credential",
    });
    jest.mocked(signOut).mockResolvedValueOnce();
    jest.mocked(signInWithPopup).mockRejectedValueOnce({
      code: "auth/popup-closed-by-user",
    });

    render(
      <LoginExperience
        surface="publisher-portal"
        initialEmail="publisher@example.com"
      />,
    );

    await user.type(screen.getByLabelText("Clave de acceso"), "invalid-key");
    await user.click(screen.getByRole("button", { name: "Acceder al portal" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Esta cuenta usa inicio con Google");
    expect(alert.textContent).toContain(
      "Se encontro un usuario con ese email, pero no tiene password registrado.",
    );

    const googleAction = screen.getByRole("button", {
      name: "Continuar con Google",
    });
    await user.click(googleAction);

    await waitFor(() => expect(signInWithPopup).toHaveBeenCalledTimes(1));
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
