/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import PatientPortalNewConsentPage from "@/app/patient-portal/(portal)/consents/new/page";
import type { InformedConsentStudyRequest } from "@/lib/informed-consents";
import { sdkFetchServer } from "@/lib/sdk-server";

const mockPatientConsentUploadWizard = jest.fn(
  (_props: Record<string, unknown>) => <div data-testid="consent-wizard" />,
);

jest.mock("@/components/patient-consent-upload-wizard", () => ({
  PatientConsentUploadWizard: (props: Record<string, unknown>) =>
    mockPatientConsentUploadWizard(props),
}));

jest.mock("@/lib/sdk-server", () => ({
  sdkFetchServer: jest.fn(),
}));

const request: InformedConsentStudyRequest = {
  id: "FORM-101",
  patientId: "PAT-101",
  patientName: "Ada Paciente",
  patientEmail: "ada@example.com",
  institutionId: "INST-101",
  doctorId: "DOC-101",
  doctorName: "Dra. Lucía Méndez",
  doctorLicenseNumber: "MN 101",
  canUpload: true,
  canApprove: false,
  canResend: false,
  consent: { id: null, status: "pending" },
};

const account = { role: { patientMedicalRecordNumber: " 31.234.567 " } };
const requestPath = "/2pq/informed-consents/study-requests/FORM-101";
const draftPath = "/2pq/informed-consents/draft?studyRequestFormId=FORM-101";

async function openRequest() {
  render(await PatientPortalNewConsentPage({
    searchParams: Promise.resolve({ studyRequestFormId: request.id }),
  }));
}

describe("patient portal new consent page", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("directs the patient to select a request before opening the wizard", async () => {
    render(await PatientPortalNewConsentPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "Volver a consentimientos" }))
      .toHaveAttribute("href", "/patient-portal/consents");
    expect(sdkFetchServer).not.toHaveBeenCalled();
  });

  it("loads the authorized request before opening its scoped draft", async () => {
    const draft = {
      studyRequestFormId: request.id,
      patientId: request.patientId,
      revision: 2,
    };
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === requestPath) return { request };
      if (path === draftPath) return { draft };
      if (path === "/auth/my-account") return { account };
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    await openRequest();

    expect(sdkFetchServer).toHaveBeenNthCalledWith(1, requestPath);
    expect(sdkFetchServer).toHaveBeenCalledWith(draftPath);
    expect(mockPatientConsentUploadWizard).toHaveBeenCalledWith({
      initialStudyRequest: request,
      initialPatientName: request.patientName,
      initialPatientDocument: "31.234.567",
      initialDraft: draft,
    });
  });

  it("starts with a blank document when the account has no stored number", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === requestPath) return { request };
      if (path === draftPath) return { draft: null };
      if (path === "/auth/my-account") return { account: { role: {} } };
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    await openRequest();

    expect(mockPatientConsentUploadWizard).toHaveBeenCalledWith(expect.objectContaining({
      initialPatientDocument: "",
      initialDraft: null,
    }));
  });

  it("keeps a draft from a different request out of the wizard", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === requestPath) return { request };
      if (path === draftPath) {
        return { draft: { studyRequestFormId: "FORM-202", patientId: request.patientId } };
      }
      if (path === "/auth/my-account") return { account };
      throw new Error(`Unexpected SDK path: ${path}`);
    });

    await openRequest();

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo recuperar el borrador");
    expect(screen.getByRole("link", { name: "Reintentar" }))
      .toHaveAttribute("href", "/patient-portal/consents/new?studyRequestFormId=FORM-101");
    expect(mockPatientConsentUploadWizard).not.toHaveBeenCalled();
  });

  it("does not retrieve a draft for a request that is unavailable to the patient", async () => {
    jest.mocked(sdkFetchServer).mockRejectedValueOnce(new Error("not found"));

    await openRequest();

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo abrir esta solicitud");
    expect(sdkFetchServer).toHaveBeenCalledTimes(1);
    expect(mockPatientConsentUploadWizard).not.toHaveBeenCalled();
  });

  it.each([
    ["needs_review", "Requiere revisión"],
    ["ready", "Listo"],
  ] as const)("opens a %s consent read-only even when the SDK allows upload", async (status, label) => {
    jest.mocked(sdkFetchServer).mockResolvedValueOnce({
      request: {
        ...request,
        consent: { id: "CONSENT-101", status },
      },
    });

    await openRequest();

    expect(screen.getByText(`Consentimiento informado · ${label}`)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver consentimiento" }))
      .toHaveAttribute("href", "/api/sdk/2pq/informed-consents/CONSENT-101/file");
    expect(screen.queryByRole("link", { name: "Reemplazar consentimiento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Completar consentimiento" })).not.toBeInTheDocument();
    expect(sdkFetchServer).toHaveBeenCalledTimes(1);
    expect(sdkFetchServer).toHaveBeenCalledWith(requestPath);
    expect(mockPatientConsentUploadWizard).not.toHaveBeenCalled();
  });
});
