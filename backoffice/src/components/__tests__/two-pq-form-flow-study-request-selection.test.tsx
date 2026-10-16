/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  buildInitialState,
  StudyRequestSelectionTable,
  TwoPQFormFlow,
} from "@/components/two-pq-form-flow";
import type {
  AdminContextRecord,
  DoctorListItem,
  InstitutionListItem,
} from "@/lib/admin-areas";
import type { TwoPQListItem } from "@/lib/two-pq-areas";
import type {
  TwoPQFormDraftRecord,
  TwoPQFormRecord,
} from "@/lib/two-pq-forms";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn().mockResolvedValue({ draft: null }),
}));

const adminContext: AdminContextRecord = {
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

const institution: InstitutionListItem = {
  id: "INST-1",
  code: "INST",
  name: "Clínica Norte",
  address: "Av. Corrientes 123",
  city: "Almagro",
  state: "Capital Federal",
  country: "Argentina",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  doctorCount: 1,
  patientCount: 1,
  institutionAdminCount: 0,
  administrativeOperatorCount: 0,
  laboratoryStaffCount: 0,
};

const doctor: DoctorListItem = {
  id: "DOC-1",
  institutionId: "INST-1",
  authEmail: "doctor@clinic.test",
  fullName: "Dra. Lucía Campos",
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  patientCount: 1,
};

const studyRequest: TwoPQFormRecord = {
  id: "FORM-00047",
  formType: "study_request",
  collectionKey: "2pq_forms",
  institutionId: "INST-1",
  institutionName: "Clínica Norte",
  doctorId: doctor.id,
  patientName: "Ana Paciente",
  patientEmail: "ana@example.test",
  requestedTestName: "PGT A standard",
  linkedBiopsyForm: null,
  patientInformation: {
    fullName: "Ana Paciente",
    email: "ana@example.test",
    medicalRecordNumber: "30111222",
  },
  requestedTest: { pgtAStandard: "si" },
  createdAt: "2026-10-02T12:00:00.000Z",
  updatedAt: "2026-10-02T12:00:00.000Z",
};

const caseRecord = {
  id: "CASE-00025",
  areaKey: "cases",
  collectionKey: "2pq_case",
  institutionId: institution.id,
  institutionName: institution.name,
  doctorId: doctor.id,
  patientId: "PAT-1",
  caseLabel: "ABCXXX",
  three_letter_code: "ABC",
  caseStatus: "processing",
  createdAt: "2026-10-02T12:00:00.000Z",
  updatedAt: "2026-10-02T12:00:00.000Z",
  canReplace: true,
  canUpdate: true,
  canDelete: true,
} as TwoPQListItem;

function renderFlow(flow: ReactNode) {
  return render(
    <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
      <AdminContextProvider value={adminContext}>
        {flow}
      </AdminContextProvider>
    </AppLanguageProvider>,
  );
}

describe("StudyRequestSelectionTable", () => {
  it("shows an actionable empty state instead of an empty picker", () => {
    render(
      <StudyRequestSelectionTable
        forms={[]}
        doctors={[]}
        selectedFormId=""
        onSelect={jest.fn()}
        language="en"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No unlinked study requests" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "There are no study request forms available for a new biopsy. Create one or unlink an existing study request before continuing.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review study requests" }),
    ).toHaveAttribute(
      "href",
      "/2pq-dashboard/forms?formType=study_request",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders rich study request information in a selectable table row", () => {
    const onSelect = jest.fn();
    render(
      <StudyRequestSelectionTable
        forms={[studyRequest]}
        doctors={[doctor]}
        selectedFormId=""
        onSelect={onSelect}
        language="en"
      />,
    );

    expect(
      screen.getByRole("table", { name: "Available study requests" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Paciente")).toBeInTheDocument();
    expect(screen.getByText("ana@example.test")).toBeInTheDocument();
    expect(screen.getByText("DNI 30111222")).toBeInTheDocument();
    expect(screen.getByText("PGT A standard")).toBeInTheDocument();
    expect(screen.getByText("Clínica Norte")).toBeInTheDocument();
    expect(screen.getByText("Dra. Lucía Campos")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select study request FORM-00047",
      }),
    );

    expect(onSelect).toHaveBeenCalledWith("FORM-00047");
  });

  it("allows the selected checkbox to clear the single selection", () => {
    const onSelect = jest.fn();
    render(
      <StudyRequestSelectionTable
        forms={[studyRequest]}
        doctors={[doctor]}
        selectedFormId="FORM-00047"
        onSelect={onSelect}
        language="en"
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select study request FORM-00047",
      }),
    );

    expect(onSelect).toHaveBeenCalledWith("");
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("initializes the biopsy wizard with a query-selected study request", () => {
    renderFlow(
      <TwoPQFormFlow
        formType="sample"
        institutions={[institution]}
        doctors={[doctor]}
        patients={[]}
        studyRequestForms={[studyRequest]}
        initialLinkedStudyRequestFormId={studyRequest.id}
      />,
    );

    expect(
      screen.getByRole("checkbox", {
        name: `Select study request ${studyRequest.id}`,
      }),
    ).toBeChecked();
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("initializes the withdrawal wizard with a query-selected 2PQ case", () => {
    renderFlow(
      <TwoPQFormFlow
        formType="withdrawal_request"
        institutions={[institution]}
        doctors={[doctor]}
        patients={[]}
        cases={[caseRecord]}
        initialWithdrawalCaseId={caseRecord.id}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "1 box requested for pick up" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ABC")).toBeInTheDocument();
  });

  it("shows the requested tests, explicit consent labels, deadline, and PGT-SR-only karyotype", async () => {
    const user = userEvent.setup();
    const draft = {
      id: "admin-uid",
      formType: "study_request",
      collectionKey: "2pq-form-drafts",
      currentStep: "requestedTest",
      stepIndex: 2,
      state: buildInitialState(institution.id, doctor.id),
      createdAt: "2026-10-16T12:00:00.000Z",
      updatedAt: "2026-10-16T12:00:00.000Z",
    } as TwoPQFormDraftRecord;

    renderFlow(
      <TwoPQFormFlow
        formType="study_request"
        institutions={[institution]}
        doctors={[doctor]}
        patients={[]}
        initialDraft={draft}
      />,
    );

    const requestedTestPicker = screen.getByRole("combobox");
    await user.click(requestedTestPicker);
    expect(
      screen.getByRole("option", { name: "Ultra-fast PGT (<8hs)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("option", { name: "Fast PGT (24-72hs)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("option", { name: "Standard PGT (>15 days)" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("option", { name: "Fast PGT (24-72hs)" }),
    );

    expect(
      screen.getByText(
        "Would you like to receive information about mosaicism?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Would you like to receive information about the sex of the embryo(s)?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Maximum result delivery date"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Do you want to attach a karyotype?"),
    ).not.toBeInTheDocument();

    await user.click(requestedTestPicker);
    await user.click(
      screen.getByRole("option", { name: "PGT SR (>15 days)" }),
    );
    expect(
      screen.getByText("Do you want to attach a karyotype?"),
    ).toBeInTheDocument();
  });
});
