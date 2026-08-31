/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PatientWorkbench } from "@/components/areas/patient-workbench";
import type {
  AdminContextRecord,
  DoctorListItem,
  InstitutionRecord,
  PatientDetailRecord,
} from "@/lib/admin-areas";
import { sdkFetch } from "@/lib/sdk-client";

const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

jest.mock("@/components/header-unclutter", () => ({
  HeaderUnclutterButton: () => null,
}));

const context: AdminContextRecord = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

const institution: InstitutionRecord = {
  id: "INST-00001",
  code: "INST",
  name: "Institution",
  createdAt: "2026-08-12T12:00:00.000Z",
  updatedAt: "2026-08-12T12:00:00.000Z",
};

const doctor: DoctorListItem = {
  id: "DOC-00001",
  institutionId: institution.id,
  authEmail: "doctor@example.com",
  fullName: "Doctor Name",
  status: "active",
  patientCount: 1,
  createdAt: "2026-08-12T12:00:00.000Z",
  updatedAt: "2026-08-12T12:00:00.000Z",
};

function detail(options: {
  accessGranted: boolean;
  credentialAvailable: boolean;
  hasAccessedPortal?: boolean;
  hasInformedConsent?: boolean;
}): PatientDetailRecord {
  return {
    patient: {
      id: "PAT-00001",
      institutionId: institution.id,
      institutionName: institution.name,
      doctorId: doctor.id,
      doctorName: doctor.fullName,
      email: "patient@example.com",
      fullName: "Patient Name",
      status: "active",
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
    },
    institution,
    doctor,
    roleRecord: options.accessGranted
      ? {
          email: "patient@example.com",
          role: "patient",
          institutionId: institution.id,
          doctorId: doctor.id,
          patientId: "PAT-00001",
          isActive: true,
          canAccessPatientPortal: true,
          createdAt: "2026-08-12T12:00:00.000Z",
          updatedAt: "2026-08-12T12:00:00.000Z",
        }
      : null,
    portalAccessCredential: {
      available: options.credentialAvailable,
      canReveal: true,
    },
    portalActivity: {
      hasAccessedPortal: options.hasAccessedPortal ?? false,
      hasInformedConsent: options.hasInformedConsent ?? false,
    },
  };
}

function renderWorkbench(
  patientDetail: PatientDetailRecord,
  contextOverride?: Partial<AdminContextRecord>,
) {
  return render(
    <AppLanguageProvider initialLanguage="en">
      <AdminContextProvider value={{ ...context, ...contextOverride }}>
        <PatientWorkbench
          detail={patientDetail}
          institutions={[institution]}
          doctors={[doctor]}
        />
      </AdminContextProvider>
    </AppLanguageProvider>,
  );
}

describe("PatientWorkbench portal credentials", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reveals an existing temporary password only after the scoped request", async () => {
    const user = userEvent.setup();
    (sdkFetch as jest.Mock).mockResolvedValue({
      temporaryPassword: "ABCDEFGH",
    });
    renderWorkbench(detail({ accessGranted: true, credentialAvailable: true }));

    const password = screen.getByLabelText(
      "Temporary password",
    ) as HTMLInputElement;
    expect(password.value).toBe("********");

    await user.click(screen.getByRole("button", { name: "Reveal" }));

    expect(sdkFetch).toHaveBeenCalledWith(
      "/areas/patients/PAT-00001/patient-portal-access/temporary-password",
    );
    expect(password.value).toBe("ABCDEFGH");
    expect(screen.getByRole("button", { name: "Hide" })).toBeTruthy();
  });

  it("shows read-only portal and consent activity", () => {
    renderWorkbench(
      detail({
        accessGranted: true,
        credentialAvailable: true,
        hasAccessedPortal: true,
        hasInformedConsent: false,
      }),
    );

    const portalAccess = screen.getByRole("checkbox", {
      name: "Patient has accessed the patient portal",
    });
    const informedConsent = screen.getByRole("checkbox", {
      name: "Patient has uploaded an informed consent",
    });
    expect((portalAccess as HTMLButtonElement).disabled).toBe(true);
    expect(portalAccess.getAttribute("data-state")).toBe("checked");
    expect((informedConsent as HTMLButtonElement).disabled).toBe(true);
    expect(informedConsent.getAttribute("data-state")).toBe("unchecked");
  });

  it("copies an existing temporary password without revealing the field", async () => {
    const user = userEvent.setup();
    (sdkFetch as jest.Mock).mockResolvedValue({
      temporaryPassword: "ABCDEFGH",
    });
    renderWorkbench(detail({ accessGranted: true, credentialAvailable: true }));

    const password = screen.getByLabelText(
      "Temporary password",
    ) as HTMLInputElement;
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(sdkFetch).toHaveBeenCalledWith(
      "/areas/patients/PAT-00001/patient-portal-access/temporary-password",
    );
    expect(await navigator.clipboard.readText()).toBe("ABCDEFGH");
    expect(password.value).toBe("********");
    expect(screen.getByText("Temporary password copied.")).toBeTruthy();
  });

  it("shows the generated password immediately after granting access", async () => {
    const user = userEvent.setup();
    (sdkFetch as jest.Mock).mockResolvedValue({
      role: {},
      temporaryPassword: "QWERTYUI",
    });
    renderWorkbench(detail({ accessGranted: false, credentialAvailable: false }));

    await user.click(
      screen.getByRole("button", { name: "Give access to the patient portal" }),
    );

    expect(
      (screen.getByLabelText("Temporary password") as HTMLInputElement).value,
    ).toBe("QWERTYUI");
    expect(screen.getByRole("button", { name: "Hide" })).toBeTruthy();
  });

  it("lets the allowlisted admin send the consent email after portal access exists", async () => {
    const user = userEvent.setup();
    (sdkFetch as jest.Mock).mockResolvedValue({ email: "patient@example.com" });
    renderWorkbench(
      detail({ accessGranted: true, credentialAvailable: true }),
      { email: "dopazoh+admin@gmail.com" },
    );

    await user.click(screen.getByRole("button", { name: "Send consent email" }));

    expect(sdkFetch).toHaveBeenCalledWith("/2pq/informed-consents/email", {
      method: "POST",
      body: JSON.stringify({ patientId: "PAT-00001" }),
    });
    expect(screen.getByText("Consent email sent.")).toBeTruthy();
  });
});
