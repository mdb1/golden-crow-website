/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { MyAccountWorkbench } from "@/components/my-account-workbench";
import type { MyAccountRecord } from "@/lib/admin-areas";

jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn(),
  sendEmailVerification: jest.fn(),
}));

jest.mock("@/lib/firebase", () => ({
  auth: { currentUser: null },
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

jest.mock("@/components/header-unclutter", () => ({
  HeaderUnclutterButton: () => null,
}));

const account: MyAccountRecord = {
  context: {
    email: "patient@example.com",
    uid: "patient-uid",
    role: "patient",
    institutionId: "INST-00006",
    doctorId: "DOC-00012",
    patientId: "PAT-00009",
    isBootstrap: false,
    canAccessBackoffice: false,
    canAccessPatientPortal: true,
    project: "mydnamap",
    projectAccess: ["mydnamap"],
  },
  role: {
    email: "patient@example.com",
    role: "patient",
    institutionId: "INST-00006",
    doctorId: "DOC-00012",
    patientId: "PAT-00009",
    isActive: true,
    canAccessPatientPortal: true,
    displayName: "Test Patient",
    institutionName: "ISIDRO HEALTH",
    doctorName: "Isidro Medico Panchi",
    patientName: "Federico Paciento Tres",
    createdAt: "2026-08-12T15:59:00.000Z",
    updatedAt: "2026-08-12T15:59:00.000Z",
  },
  capabilities: ["role:patient"],
  auth: {
    uid: "patient-uid",
    email: "patient@example.com",
    emailVerified: true,
    disabled: false,
    displayName: "Test Patient",
    customClaims: { role: "patient" },
    providerData: [],
    metadata: {
      creationTime: "2026-08-12T16:08:00.000Z",
      lastSignInTime: "2026-08-12T16:08:00.000Z",
      lastRefreshTime: "2026-08-12T16:08:00.000Z",
    },
    tokensValidAfterTime: "2026-08-12T16:08:00.000Z",
  },
  profile: {
    username: "test-patient",
    fullName: "Test Patient",
    onboardingCompleted: true,
    needsCompletion: false,
    docs: {
      profile: true,
      publicProfile: true,
      communityUser: true,
      reportOwner: true,
    },
  },
};

const diagnosticSections = [
  "Access & Permissions",
  "Firebase Identity",
  "Sign-In Providers",
  "Profile Documents",
  "Custom Claims",
];

describe("MyAccountWorkbench diagnostics", () => {
  it("omits administrative diagnostics for the patient portal", () => {
    render(
      <MyAccountWorkbench initialAccount={account} showDiagnostics={false} />,
    );

    expect(
      screen.getByRole("heading", { name: "Datos del perfil" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Email y verificación" }),
    ).toBeTruthy();
    expect(screen.getByText("Paciente")).toBeTruthy();
    expect(screen.getByText("Acceso activo")).toBeTruthy();
    expect(screen.getAllByText("Email verificado").length).toBeGreaterThan(0);
    expect(screen.getByText("Institución")).toBeTruthy();
    expect(screen.getByText("ISIDRO HEALTH")).toBeTruthy();
    expect(screen.getByText("Médico")).toBeTruthy();
    expect(screen.getByText("Isidro Medico Panchi")).toBeTruthy();
    expect(screen.getByText("Nombre de usuario")).toBeTruthy();
    expect(screen.getByText("Último inicio de sesión")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Guardar perfil" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Validar email" }),
    ).toBeTruthy();
    expect(screen.queryByText("Current project")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();
    expect(screen.queryByText("Firebase account enabled")).toBeNull();
    expect(screen.queryByText("Alcance")).toBeNull();
    expect(screen.queryByText("Federico Paciento Tres")).toBeNull();
    expect(
      screen.queryByText(
        "ISIDRO HEALTH / Isidro Medico Panchi / Federico Paciento Tres",
      ),
    ).toBeNull();

    for (const section of diagnosticSections) {
      expect(screen.queryByRole("heading", { name: section })).toBeNull();
    }
  });

  it("keeps administrative diagnostics in the backoffice by default", () => {
    render(<MyAccountWorkbench initialAccount={account} />);

    expect(screen.getByText("Current project")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.getByText("Firebase account enabled")).toBeTruthy();

    for (const section of diagnosticSections) {
      expect(screen.getByRole("heading", { name: section })).toBeTruthy();
    }
  });
});
