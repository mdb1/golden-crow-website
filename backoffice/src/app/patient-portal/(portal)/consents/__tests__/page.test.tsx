/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PatientPortalConsentsPage from "@/app/patient-portal/(portal)/consents/page";
import type { InformedConsentStudyRequest } from "@/lib/informed-consents";
import { sdkFetch } from "@/lib/sdk-client";
import { sdkFetchServer } from "@/lib/sdk-server";

jest.mock("@/components/informed-consents-workbench", () => ({
  InformedConsentsWorkbench: () => <p>Historial de consentimientos</p>,
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
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
  canUpload: true,
  canApprove: false,
  canResend: false,
  consent: { id: null, status: "pending" },
};

describe("patient portal consent list page", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("links each request and paginates its consent status alongside consent history", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/2pq/informed-consents") return { records: [] };
      if (path === "/2pq/informed-consents/study-requests?limit=20") {
        return { requests: [request], nextCursor: "next-page" };
      }
      throw new Error(`Unexpected SDK path: ${path}`);
    });
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      requests: [
        {
          ...request,
          id: "FORM-102",
          consent: { id: "CONSENT-102", status: "needs_review" },
        },
        {
          ...request,
          id: "FORM-103",
          consent: { id: "CONSENT-103", status: "ready" },
        },
      ],
    });

    render(await PatientPortalConsentsPage());

    const list = screen.getByRole("region", { name: "Solicitudes de estudio" });
    expect(within(list).getByRole("link", { name: "Completar consentimiento" }))
      .toHaveAttribute("href", "/patient-portal/consents/new?studyRequestFormId=FORM-101");
    expect(within(list).getByText("Pendiente")).toBeVisible();
    expect(screen.getByText("Historial de consentimientos")).toBeVisible();

    await userEvent.click(within(list).getByRole("button", { name: "Cargar más solicitudes" }));

    expect(sdkFetch).toHaveBeenCalledWith(
      "/2pq/informed-consents/study-requests?cursor=next-page&limit=20",
    );
    expect(await within(list).findByText("Requiere revisión")).toBeVisible();
    expect(within(list).getByText("Listo")).toBeVisible();
    expect(within(list).getAllByRole("link", { name: "Ver consentimiento" }).map(
      (link) => link.getAttribute("href"),
    )).toEqual([
      "/api/sdk/2pq/informed-consents/CONSENT-102/file",
      "/api/sdk/2pq/informed-consents/CONSENT-103/file",
    ]);
    expect(within(list).queryByRole("link", { name: "Reemplazar consentimiento" })).not.toBeInTheDocument();
    expect(within(list).getAllByRole("link", { name: "Completar consentimiento" })).toHaveLength(1);
  });

  it("preserves the consent history if the request list is unavailable", async () => {
    jest.mocked(sdkFetchServer).mockImplementation(async (path) => {
      if (path === "/2pq/informed-consents") return { records: [] };
      throw new Error("study request list unavailable");
    });

    render(await PatientPortalConsentsPage());

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las solicitudes");
    expect(screen.getByText("Historial de consentimientos")).toBeVisible();
  });
});
