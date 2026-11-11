/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import InformedConsentDetailPage from "@/app/(dashboard)/2pq-dashboard/consents/[consentId]/page";
import type {
  InformedConsentDetailPayload,
  InformedConsentStudyRequest,
} from "@/lib/informed-consents";
import { sdkFetch } from "@/lib/sdk-client";
import { sdkFetchServer } from "@/lib/sdk-server";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  ...jest.requireActual("next/navigation"),
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("@/components/header-unclutter", () => ({
  HeaderUnclutterButton: () => null,
  HeaderUnclutterScope: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

jest.mock("@/lib/sdk-server", () => ({ sdkFetchServer: jest.fn() }));

const uploadedAt = "2026-11-10T12:30:00.000Z";
const payload: InformedConsentDetailPayload = {
  record: {
    id: "CONS-REQUEST-1",
    collectionKey: "2pq-informed-consent",
    institutionId: "INST-1",
    doctorId: "DOC-1",
    patientId: "PAT-1",
    patientName: "Paciente de prueba",
    caseId: null,
    studyRequestFormId: "FORM-1",
    reviewStatus: "needs_review",
    file: { name: "consentimiento-firmado.pdf", type: "application/pdf", size: 3000 },
    createdAt: uploadedAt,
    updatedAt: uploadedAt,
    createdByEmail: "patient@example.com",
  },
  linkedCase: null,
  caseOptions: [],
};
const studyRequest: InformedConsentStudyRequest = {
  id: "FORM-1",
  patientId: payload.record.patientId,
  patientName: payload.record.patientName,
  patientEmail: payload.record.createdByEmail,
  institutionId: payload.record.institutionId,
  doctorId: payload.record.doctorId,
  canUpload: false,
  canApprove: true,
  canResend: false,
  consent: { id: payload.record.id, status: "needs_review", uploadedAt },
};
const consentPath = "/2pq/informed-consents/CONS-REQUEST-1";
const studyRequestPath = "/2pq/informed-consents/study-requests/FORM-1";
const fileHref = `/api/sdk${consentPath}/file`;
const approveName = "Aprobar consentimiento informado";

async function loadPage() {
  return InformedConsentDetailPage({
    params: Promise.resolve({ consentId: payload.record.id }),
  });
}

describe("2PQ consent detail approval", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("approves the exact submitted document from the detail screen", async () => {
    jest.mocked(sdkFetchServer)
      .mockResolvedValueOnce(payload)
      .mockResolvedValueOnce({ request: studyRequest });
    jest.mocked(sdkFetch).mockResolvedValue({
      request: {
        ...studyRequest,
        canApprove: false,
        consent: { ...studyRequest.consent, status: "ready" },
      },
    });

    render(await loadPage());

    expect(sdkFetchServer).toHaveBeenNthCalledWith(1, consentPath);
    expect(sdkFetchServer).toHaveBeenNthCalledWith(2, studyRequestPath);
    expect(screen.getByRole("link", { name: "Abrir archivo" })).toHaveAttribute("href", fileHref);
    expect(screen.getByTitle("Vista previa de consentimiento-firmado.pdf"))
      .toHaveAttribute("src", `${fileHref}?version=${encodeURIComponent(uploadedAt)}`);
    const approveButton = screen.getByRole("button", { name: approveName });
    expect(approveButton).toHaveClass("bg-emerald-700", "min-h-12");

    fireEvent.click(approveButton);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Confirmar aprobación",
    }));

    expect(await screen.findByText("Consentimiento listo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: approveName })).toBeNull();
    expect(sdkFetch).toHaveBeenCalledWith(`${studyRequestPath}/approve`, {
      method: "POST",
      body: JSON.stringify({ expectedUploadedAt: uploadedAt }),
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it.each([
    { ...studyRequest, id: "FORM-2" },
    { ...studyRequest, consent: { ...studyRequest.consent, id: "CONS-REQUEST-2" } },
  ])("does not offer approval for a mismatched study request or consent", async (request) => {
    jest.mocked(sdkFetchServer).mockResolvedValueOnce(payload).mockResolvedValueOnce({ request });

    render(await loadPage());

    expect(screen.queryByRole("button", { name: approveName })).toBeNull();
    expect(screen.getByTitle("Vista previa de consentimiento-firmado.pdf")).toHaveAttribute("src", fileHref);
  });

  it("keeps legacy consent files available without loading an approval request", async () => {
    jest.mocked(sdkFetchServer).mockResolvedValue({
      ...payload,
      record: { ...payload.record, studyRequestFormId: null, reviewStatus: undefined },
    });

    render(await loadPage());

    expect(sdkFetchServer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: approveName })).toBeNull();
    expect(screen.getByRole("button", { name: "Vincular caso" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir archivo" })).toHaveAttribute("href", fileHref);
  });
});
