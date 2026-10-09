/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { StudyRequestSelectionTable } from "@/components/two-pq-form-flow";
import type { DoctorListItem } from "@/lib/admin-areas";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";

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
});
