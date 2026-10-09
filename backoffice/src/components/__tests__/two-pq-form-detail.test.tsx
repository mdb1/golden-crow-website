/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQFormDetail } from "@/components/two-pq-form-detail";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
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

const linkedCase: TwoPQListItem = {
  id: "CASE-00024",
  areaKey: "cases",
  collectionKey: "2pq_case",
  institutionId: "institution-1",
  doctorId: "doctor-1",
  patientId: "patient-1",
  three_letter_code: "KIM",
  caseLabel: "KIMXXX",
  caseStatus: "entered",
  caseType: "PGT-A",
  priority: "normal",
  createdAt: "2026-10-08T12:00:00.000Z",
  updatedAt: "2026-10-08T12:00:00.000Z",
  canReplace: true,
  canUpdate: true,
  canDelete: true,
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

  it("renders every interactive sample panel after all document details", () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={sampleForm} />
      </AppLanguageProvider>,
    );

    const biopsyRows = screen.getByRole("heading", { name: "Biopsy rows" });
    const linkedStudyRequest = screen.getByRole("heading", {
      name: "Linked study request form",
    });
    const linkedWithdrawalRequest = screen.getByRole("heading", {
      name: "Linked withdrawal request",
    });
    const linkedRecords = screen.getByRole("heading", {
      name: "2PQ Case and sampling records",
    });
    const patient = screen.getByRole("heading", {
      name: "Sample Patient",
      level: 2,
    });
    const doctor = screen.getByRole("heading", { name: "Sample Doctor" });

    expect(
      biopsyRows.compareDocumentPosition(linkedStudyRequest) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      linkedStudyRequest.compareDocumentPosition(linkedWithdrawalRequest) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      linkedWithdrawalRequest.compareDocumentPosition(linkedRecords) &
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

  it("renders every interactive study-request panel after all document details", () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={studyRequestForm} />
      </AppLanguageProvider>,
    );

    const institutionInformation = screen.getByRole("heading", {
      name: "Institution information",
    });
    const linkedBiopsy = screen.getByRole("heading", {
      name: "Linked biopsy form",
    });
    const linkedCase = screen.getByRole("heading", {
      name: "Linked 2PQ case",
    });
    const linkedWithdrawal = screen.getByRole("heading", {
      name: "Linked withdrawal request",
    });
    const patient = screen.getByRole("heading", {
      name: "Study Patient",
      level: 2,
    });

    expect(
      institutionInformation.compareDocumentPosition(linkedBiopsy) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      linkedBiopsy.compareDocumentPosition(linkedCase) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      linkedCase.compareDocumentPosition(linkedWithdrawal) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      linkedWithdrawal.compareDocumentPosition(patient) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders withdrawal case links after the form document details", () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={withdrawalForm} />
      </AppLanguageProvider>,
    );

    const withdrawalDetails = screen.getByRole("heading", {
      name: "Withdrawal request",
    });
    const linkedCases = screen.getByRole("heading", {
      name: "2PQ cases awaiting pick up",
    });

    expect(
      withdrawalDetails.compareDocumentPosition(linkedCases) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("always shows manual study and withdrawal relationship blocks for an unlinked biopsy", () => {
    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail
          form={{
            ...sampleForm,
            linkedStudyRequestFormId: null,
            studyRequestForm: null,
            withdrawalRequest: null,
            studyRequestLinkState: "none",
            withdrawalLinkState: "none",
          }}
        />
      </AppLanguageProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Linked study request form" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No study request is stored on this biopsy form."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Linked withdrawal request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No withdrawal request is stored on this biopsy form."),
    ).toBeInTheDocument();
  });

  it("can manually select a study request from an unlinked biopsy", async () => {
    const user = userEvent.setup();
    const unlinkedBiopsy: TwoPQFormRecord = {
      ...sampleForm,
      linkedStudyRequestFormId: null,
      studyRequestForm: null,
      studyRequestLinkState: "none",
    };
    mockSdkFetch
      .mockResolvedValueOnce({ forms: [studyRequestForm] })
      .mockResolvedValueOnce({
        form: {
          ...unlinkedBiopsy,
          linkedStudyRequestFormId: "FORM-00047",
          studyRequestForm: "FORM-00047",
          studyRequestLinkState: "cohesive",
        },
      });

    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={unlinkedBiopsy} />
      </AppLanguageProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Choose study request" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Link study request" }),
    );

    await waitFor(() =>
      expect(mockSdkFetch).toHaveBeenLastCalledWith(
        "/2pq/forms/FORM-00053/linked-study-request",
        {
          method: "PATCH",
          body: JSON.stringify({ studyRequestForm: "FORM-00047" }),
        },
      ),
    );
    expect(await screen.findByText("FORM-00047")).toBeInTheDocument();
  });

  it("can manually select a withdrawal request from an unlinked biopsy", async () => {
    const user = userEvent.setup();
    const withdrawalCandidate: TwoPQFormRecord = {
      ...withdrawalForm,
      id: "FORM-00060",
    };
    mockSdkFetch
      .mockResolvedValueOnce({ forms: [withdrawalCandidate] })
      .mockResolvedValueOnce({
        form: {
          ...sampleForm,
          withdrawalRequest: "FORM-00060",
          withdrawalLinkState: "cohesive",
        },
      });

    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail
          form={{
            ...sampleForm,
            withdrawalRequest: null,
            withdrawalLinkState: "none",
          }}
        />
      </AppLanguageProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Choose withdrawal request" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Link withdrawal request" }),
    );

    await waitFor(() =>
      expect(mockSdkFetch).toHaveBeenLastCalledWith(
        "/2pq/forms/FORM-00053/biopsy-withdrawal-request",
        {
          method: "PATCH",
          body: JSON.stringify({ withdrawalRequest: "FORM-00060" }),
        },
      ),
    );
    expect(await screen.findByText("FORM-00060")).toBeInTheDocument();
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
      await screen.findByText("No biopsy form is stored in linkedBiopsyForm."),
    ).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("can choose, open, and remove the single linked 2PQ case", async () => {
    const user = userEvent.setup();
    const candidate = {
      id: "CASE-00025",
      institutionId: "institution-1",
      doctorId: "doctor-1",
      patientId: "patient-1",
      linkedStudyRequestFormId: null,
      three_letter_code: "BEH",
      caseLabel: "BEHXXX",
      caseStatus: "entered",
      caseType: "PGT-A",
      priority: "normal",
      requestedAt: "2026-10-08T12:00:00.000Z",
      createdAt: "2026-10-08T12:00:00.000Z",
      updatedAt: "2026-10-08T12:00:00.000Z",
    };
    mockSdkFetch
      .mockResolvedValueOnce({ cases: [candidate] })
      .mockResolvedValueOnce({
        form: { ...studyRequestForm, "2pq_case": "CASE-00025" },
      })
      .mockResolvedValueOnce({
        form: { ...studyRequestForm, "2pq_case": null },
      });

    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail
          form={{ ...studyRequestForm, "2pq_case": null }}
        />
      </AppLanguageProvider>,
    );

    const heading = screen.getByRole("heading", { name: "Linked 2PQ case" });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("No 2PQ case is linked yet."),
    ).toBeInTheDocument();

    await user.click(
      within(section as HTMLElement).getAllByRole("button", {
        name: "Choose 2PQ case",
      })[0]!,
    );
    expect(await screen.findByText("BEHXXX")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Link 2PQ case" }));

    await waitFor(() =>
      expect(mockSdkFetch).toHaveBeenNthCalledWith(
        2,
        "/2pq/forms/FORM-00047/linked-2pq-case",
        {
          method: "PATCH",
          body: JSON.stringify({ "2pq_case": "CASE-00025" }),
        },
      ),
    );
    expect(
      within(section as HTMLElement).getByRole("link", { name: "Open" }),
    ).toHaveAttribute("href", "/2pq-dashboard/cases/CASE-00025");
    expect(
      within(section as HTMLElement).getByText("BEHXXX"),
    ).toBeInTheDocument();
    expect(
      within(section as HTMLElement).queryByText("CASE-00025"),
    ).not.toBeInTheDocument();

    await user.click(
      within(section as HTMLElement).getByRole("button", {
        name: "Remove link",
      }),
    );
    await waitFor(() =>
      expect(mockSdkFetch).toHaveBeenNthCalledWith(
        3,
        "/2pq/forms/FORM-00047/linked-2pq-case",
        {
          method: "PATCH",
          body: JSON.stringify({ "2pq_case": null }),
        },
      ),
    );
    expect(
      await within(section as HTMLElement).findByText(
        "No 2PQ case is linked yet.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the saved linked case with its case label and emerald treatment", () => {
    render(
      <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
        <TwoPQFormDetail
          form={{ ...studyRequestForm, "2pq_case": linkedCase.id }}
          linkedCase={linkedCase}
        />
      </AppLanguageProvider>,
    );

    const section = screen
      .getByRole("heading", { name: "Caso 2PQ vinculado" })
      .closest("section");
    expect(section).not.toBeNull();
    const savedLabel = within(section as HTMLElement).getByText("Guardado");
    const savedCell = savedLabel.closest("div.rounded-2xl");

    expect(savedCell).toHaveClass(
      "border-emerald-200/90",
      "dark:bg-emerald-950/24",
    );
    expect(
      within(section as HTMLElement).getByText("KIMXXX"),
    ).toBeInTheDocument();
    expect(
      within(section as HTMLElement).queryByText("CASE-00024"),
    ).not.toBeInTheDocument();
  });

  it("separates a suggested reverse link from the stored link and repairs it", async () => {
    const user = userEvent.setup();
    const mismatchedStudyRequest: TwoPQFormRecord = {
      ...studyRequestForm,
      linkedBiopsyForm: null,
      suggestedBiopsyForm: "FORM-00053",
      biopsyLinkState: "missing_study_property",
    };
    mockSdkFetch.mockResolvedValue({
      form: {
        ...studyRequestForm,
        linkedBiopsyForm: "FORM-00053",
        suggestedBiopsyForm: null,
        biopsyLinkState: "cohesive",
      },
    });

    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={mismatchedStudyRequest} />
      </AppLanguageProvider>,
    );

    expect(screen.getByText("Biopsy link mismatch")).toBeInTheDocument();
    expect(screen.getByText("Suggested biopsy form")).toBeInTheDocument();
    expect(
      screen.getByText("No biopsy form is stored in linkedBiopsyForm."),
    ).toBeInTheDocument();
    expect(screen.getByText("FORM-00053")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Repair bilateral link" }),
    );

    await waitFor(() =>
      expect(mockSdkFetch).toHaveBeenCalledWith(
        "/2pq/forms/FORM-00047/linked-biopsy-form",
        {
          method: "PATCH",
          body: JSON.stringify({ linkedBiopsyForm: "FORM-00053" }),
        },
      ),
    );
    expect(
      await screen.findByText("Stored in the study request"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Suggested biopsy form")).not.toBeInTheDocument();
    expect(screen.queryByText("Biopsy link mismatch")).not.toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("repairs a suggested withdrawal request and clearly stores the actual link", async () => {
    const user = userEvent.setup();
    const mismatchedStudyRequest: TwoPQFormRecord = {
      ...studyRequestForm,
      linkedWithdrawalRequest: null,
      suggestedWithdrawalRequest: "FORM-00052",
      withdrawalLinkState: "missing_study_property",
    };
    mockSdkFetch.mockResolvedValue({
      form: {
        ...mismatchedStudyRequest,
        linkedWithdrawalRequest: "FORM-00052",
        suggestedWithdrawalRequest: null,
        withdrawalLinkState: "cohesive",
      },
    });

    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={mismatchedStudyRequest} />
      </AppLanguageProvider>,
    );

    expect(screen.getByText("Withdrawal link mismatch")).toBeInTheDocument();
    expect(
      screen.getByText("Suggested withdrawal request"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Repair withdrawal links" }),
    );

    await waitFor(() =>
      expect(mockSdkFetch).toHaveBeenCalledWith(
        "/2pq/forms/FORM-00047/linked-withdrawal-request",
        {
          method: "PATCH",
          body: JSON.stringify({ linkedWithdrawalRequest: "FORM-00052" }),
        },
      ),
    );
    expect(
      screen.queryByText("Suggested withdrawal request"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Withdrawal link mismatch"),
    ).not.toBeInTheDocument();
  });

  it("can unlink the withdrawal request from its dedicated block", async () => {
    const user = userEvent.setup();
    const linkedStudyRequest: TwoPQFormRecord = {
      ...studyRequestForm,
      linkedWithdrawalRequest: "FORM-00052",
      suggestedWithdrawalRequest: null,
      withdrawalLinkState: "cohesive",
    };
    mockSdkFetch.mockResolvedValue({
      form: {
        ...linkedStudyRequest,
        linkedWithdrawalRequest: null,
        withdrawalLinkState: "none",
      },
    });

    render(
      <AppLanguageProvider initialLanguage="en">
        <TwoPQFormDetail form={linkedStudyRequest} />
      </AppLanguageProvider>,
    );

    const heading = screen.getByRole("heading", {
      name: "Linked withdrawal request",
    });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    await user.click(
      within(section as HTMLElement).getByRole("button", {
        name: "Remove link",
      }),
    );

    await waitFor(() =>
      expect(mockSdkFetch).toHaveBeenCalledWith(
        "/2pq/forms/FORM-00047/linked-withdrawal-request",
        {
          method: "PATCH",
          body: JSON.stringify({ linkedWithdrawalRequest: null }),
        },
      ),
    );
    expect(
      await within(section as HTMLElement).findByText(
        "No withdrawal request is stored in linkedWithdrawalRequest.",
      ),
    ).toBeInTheDocument();
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
