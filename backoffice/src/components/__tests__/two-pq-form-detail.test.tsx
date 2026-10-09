/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQFormDetail } from "@/components/two-pq-form-detail";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";

const mockRefresh = jest.fn();
const mockSdkFetch = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: (...args: unknown[]) => mockSdkFetch(...args),
}));

const sampleForm: TwoPQFormRecord = {
  id: "FORM-00053",
  formType: "sample",
  collectionKey: "2pq_forms",
  institutionId: "institution-1",
  doctorId: "doctor-1",
  selectedPatientId: "patient-1",
  selectedRequestingDoctorId: "doctor-1",
  patientName: "Sample Patient",
  linkedStudyRequestFormId: "FORM-00052",
  linkedCaseId: "CASE-00025",
  linkedSamplingIds: ["SAMP-00113"],
  patientInformation: {
    patientId: "patient-1",
    fullName: "Sample Patient",
  },
  requestedTest: {},
  sampleInformation: {
    requestingDoctorFullName: "Sample Doctor",
  },
  caseInformation: {
    caseLabel: "BEHXXX",
  },
  samplingInformation: [
    {
      id: "SAMP-00113",
      sampleId: "BEH001",
    },
  ],
  createdAt: "2026-10-08T12:00:00.000Z",
  updatedAt: "2026-10-08T12:00:00.000Z",
};

const studyRequestForm: TwoPQFormRecord = {
  id: "FORM-00047",
  formType: "study_request",
  collectionKey: "2pq_forms",
  institutionId: "institution-1",
  doctorId: "doctor-1",
  selectedPatientId: "patient-1",
  patientName: "Study Patient",
  linkedBiopsyForm: "FORM-00053",
  patientInformation: {
    patientId: "patient-1",
    fullName: "Study Patient",
  },
  requestedTest: {},
  createdAt: "2026-10-08T12:00:00.000Z",
  updatedAt: "2026-10-08T12:00:00.000Z",
};

const withdrawalForm: TwoPQFormRecord = {
  id: "FORM-00052",
  formType: "withdrawal_request",
  collectionKey: "2pq_forms",
  institutionId: "institution-1",
  doctorId: "doctor-1",
  institutionName: "Example clinic",
  linkedCaseIds: ["CASE-00025"],
  patientInformation: {},
  requestedTest: {},
  withdrawalCases: [
    {
      id: "CASE-00025",
      caseLabel: "BEHXXX",
      reportCode: "BEHXXX",
      previousCaseStatus: "processing",
      caseStatus: "awaiting_pick_up",
      linkedStudyRequest: "FORM-00047",
      linkedBiopsyForm: "FORM-00053",
    },
  ],
  createdAt: "2026-10-08T12:00:00.000Z",
  updatedAt: "2026-10-08T12:00:00.000Z",
};

describe("TwoPQFormDetail", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockSdkFetch.mockReset();
  });

  it("renders the linked records, patient, and doctor panels after all sample form details", () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={sampleForm} />
      </AppLanguageProvider>,
    );

    const biopsyRows = screen.getByRole("heading", { name: "Biopsy rows" });
    const linkedRecords = screen.getByRole("heading", {
      name: "2PQ Case and sampling records",
    });
    const patient = screen.getByRole("heading", {
      name: "Sample Patient",
      level: 2,
    });
    const doctor = screen.getByRole("heading", { name: "Sample Doctor" });

    expect(
      biopsyRows.compareDocumentPosition(linkedRecords) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      linkedRecords.compareDocumentPosition(patient) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      patient.compareDocumentPosition(doctor) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the single linked biopsy form and can remove the bidirectional link", async () => {
    const user = userEvent.setup();
    mockSdkFetch.mockResolvedValue({
      form: { ...studyRequestForm, linkedBiopsyForm: null },
    });

    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={studyRequestForm} />
      </AppLanguageProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Linked biopsy form" }),
    ).toBeInTheDocument();
    expect(screen.getByText("FORM-00053")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove link" }));

    await waitFor(() =>
      expect(mockSdkFetch).toHaveBeenCalledWith(
        "/2pq/forms/FORM-00047/linked-biopsy-form",
        {
          method: "PATCH",
          body: JSON.stringify({ linkedBiopsyForm: null }),
        },
      ),
    );
    expect(
      await screen.findByText("No biopsy form is linked yet."),
    ).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows each withdrawal report code with its study request and biopsy links", () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={withdrawalForm} />
      </AppLanguageProvider>,
    );

    expect(screen.getByText("BEHXXX")).toBeInTheDocument();
    expect(screen.getByText("FORM-00047")).toBeInTheDocument();
    expect(screen.getByText("FORM-00053")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Open/i })).toHaveLength(3);
    expect(
      document.querySelector('a[href="/2pq-dashboard/forms/FORM-00047"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('a[href="/2pq-dashboard/forms/FORM-00053"]'),
    ).toBeInTheDocument();
  });
});
