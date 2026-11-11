/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CaseConsentTraceabilityCard,
  ConsentCaseTraceabilityCard,
} from "@/components/consent-case-traceability";
import type {
  CaseConsentTraceabilityPayload,
  InformedConsentDetailPayload,
} from "@/lib/informed-consents";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const record = {
  id: "CONS-00001",
  collectionKey: "2pq-informed-consent" as const,
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
  patientId: "PAT-00001",
  patientName: "Paciente Uno",
  caseId: "CASE-00001",
  file: {
    name: "consentimiento.pdf",
    type: "application/pdf",
    size: 1200,
  },
  createdAt: "2026-10-15T12:00:00.000Z",
  updatedAt: "2026-10-15T12:00:00.000Z",
  createdByEmail: "patient@example.com",
};

const caseOption = {
  id: "CASE-00001",
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
  patientId: "PAT-00001",
  patientName: "Paciente Uno",
  caseLabel: "Caso ABC",
  caseStatus: "created",
  informedConsentId: "CONS-00001",
  createdAt: "2026-10-14T12:00:00.000Z",
  updatedAt: "2026-10-15T12:00:00.000Z",
};

const consentPayload: InformedConsentDetailPayload = {
  record,
  linkedCase: caseOption,
  caseOptions: [caseOption],
};

const casePayload: CaseConsentTraceabilityPayload = {
  case: caseOption,
  linkedConsent: record,
  consentOptions: [record],
};

describe("consent and 2PQ case traceability", () => {
  beforeEach(() => {
    jest.mocked(sdkFetch).mockReset();
  });

  it("shows the case backlink and removes both sides through the link endpoint", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      ...consentPayload,
      record: { ...record, caseId: null },
      linkedCase: null,
    });

    render(<ConsentCaseTraceabilityCard initialPayload={consentPayload} />);

    expect(
      screen.getByRole("heading", { name: "Trazabilidad del caso 2PQ" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Abrir caso/ })).toHaveAttribute(
      "href",
      "/2pq-dashboard/cases/CASE-00001",
    );

    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/2pq/informed-consents/CONS-00001/case",
        {
          method: "PATCH",
          body: JSON.stringify({ caseId: null }),
        },
      ),
    );
  });

  it("shows the consent backlink on a case and preserves the reciprocal remove flow", async () => {
    jest
      .mocked(sdkFetch)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ...casePayload,
        case: { ...caseOption, informedConsentId: null },
        linkedConsent: null,
      });

    render(
      <CaseConsentTraceabilityCard
        initialPayload={casePayload}
        canManage
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Trazabilidad del consentimiento informado",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Abrir consentimiento/ }),
    ).toHaveAttribute("href", "/2pq-dashboard/consents/CONS-00001");

    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenNthCalledWith(
        1,
        "/2pq/informed-consents/CONS-00001/case",
        {
          method: "PATCH",
          body: JSON.stringify({ caseId: null }),
        },
      ),
    );
    await waitFor(() =>
      expect(sdkFetch).toHaveBeenNthCalledWith(
        2,
        "/2pq/cases/CASE-00001/informed-consent",
      ),
    );
  });

  it("links a consent to its study request before the case exists", () => {
    render(
      <ConsentCaseTraceabilityCard initialPayload={{
        record: { ...record, caseId: null, studyRequestFormId: "FORM-00001" },
        linkedCase: null,
        caseOptions: [caseOption],
      }} />,
    );

    expect(screen.getByRole("link", { name: /Abrir solicitud de estudio/ })).toHaveAttribute(
      "href", "/2pq-dashboard/forms/FORM-00001#informed-consent",
    );
    expect(screen.getByText("La solicitud aún no tiene un caso 2PQ.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Vincular caso" })).toBeNull();
  });

  it.each([
    { status: "ready" as const, label: "Consentimiento listo", background: "bg-emerald-50/90", border: "border-emerald-300/90", otherBackground: "bg-orange-50/90" },
    { status: "needs_review" as const, label: "Consentimiento por revisar", background: "bg-orange-50/90", border: "border-orange-300/90", otherBackground: "bg-emerald-50/90" },
  ])("keeps request-linked consent actions and reflects $status", ({ status, label, background, border, otherBackground }) => {
    render(
      <CaseConsentTraceabilityCard
        initialPayload={{
          ...casePayload,
          case: { ...caseOption, linkedStudyRequestFormId: "FORM-00001" },
          linkedConsent: { ...record, studyRequestFormId: "FORM-00001", reviewStatus: status },
        }}
        canManage
      />,
    );

    expect(screen.getByRole("link", { name: /Abrir solicitud de estudio/ })).toHaveAttribute(
      "href", "/2pq-dashboard/forms/FORM-00001#informed-consent",
    );
    const section = screen.getByRole("heading", { name: "Trazabilidad del consentimiento informado" }).closest("section");
    expect(section).toHaveClass(background, border);
    expect(section).not.toHaveClass(otherBackground);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cambiar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quitar" })).toBeNull();
  });
});
