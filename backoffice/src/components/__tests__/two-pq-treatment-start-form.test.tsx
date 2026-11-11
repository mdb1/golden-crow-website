/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQTreatmentStartForm } from "@/components/two-pq-treatment-start-form";
import { PGFLEX_2PQ_DESTINATION } from "@/lib/pgflex-logistics";
import { sdkFetch } from "@/lib/sdk-client";
import type { TwoPQFormRecord, TwoPQPickupSummary, TwoPQTreatmentStartDraftRecord } from "@/lib/two-pq-forms";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));
jest.mock("@/lib/sdk-client", () => ({ sdkFetch: jest.fn() }));

const request: TwoPQFormRecord = {
  id: "FORM-00054",
  formType: "study_request",
  collectionKey: "2pq_forms",
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
  patientName: "Ana Paciente",
  institutionName: "Clínica Norte",
  estimatedTreatmentDate: "2026-11-25",
  patientInformation: { fullName: "Ana Paciente" },
  institutionInformation: { address: "Av. Corrientes 123", city: "Palermo", state: "Capital Federal" },
  requestedTest: { pgtAFast: "si" },
  createdAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
};

function renderForm(
  initialDraft: TwoPQTreatmentStartDraftRecord | null = null,
  initialPickupGroup: (TwoPQFormRecord & { pickup: TwoPQPickupSummary }) | null = null,
) {
  render(
    <AppLanguageProvider initialLanguage="en">
      <TwoPQTreatmentStartForm
        initialRequestsPage={{ forms: [request], hasMore: false, nextCursor: null }}
        initialDraft={initialDraft}
        initialStudyRequestId={request.id}
        unavailableStudyRequest={false}
        initialPickupGroup={initialPickupGroup}
        unavailablePickupGroup={false}
      />
    </AppLanguageProvider>,
  );
}

function changeField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("treatment start form", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(sdkFetch).mockResolvedValue({ form: { id: "FORM-00055" } });
  });

  it("checkpoints the four steps and sends an urgent plan after the paper preview", async () => {
    renderForm();
    expect(screen.getByRole("table", { name: "Available study requests" })).toHaveTextContent(request.patientName!);
    expect(screen.queryByLabelText("Treatment start date")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByLabelText("Study type")).toHaveTextContent("Fast PGT");
    expect(screen.getByLabelText("Treatment start date")).toHaveValue("2026-11-25");
    changeField("Estimated biopsy date", "2026-11-29");
    changeField("Estimated embryos to biopsy", "5");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("Address")).toHaveValue("Av. Corrientes 123");
    expect(screen.getByLabelText("Neighborhood / Locality")).toHaveValue("Palermo");
    expect(screen.getByLabelText("Province / District")).toHaveTextContent("Capital Federal");
    expect(screen.getByLabelText("Country")).toHaveValue("Argentina");
    expect(screen.getByLabelText("Country")).toBeDisabled();
    expect(screen.getByText(PGFLEX_2PQ_DESTINATION)).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Pickup destination" })).not.toBeInTheDocument();
    changeField("Pickup window start", "09:00");
    changeField("Pickup window end", "08:00");
    expect(screen.getByLabelText("Expected pickup date")).toHaveValue("2026-11-29");
    expect(screen.getByLabelText("Expected pickup date")).toHaveAttribute("readonly");

    fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));
    expect(screen.getByText("Pickup must end after it starts.")).toBeVisible();
    expect(sdkFetch).toHaveBeenCalledTimes(2);

    changeField("Pickup window end", "11:00");
    changeField("Neighborhood / Locality", "");
    fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));
    expect(screen.getByText("Address and neighborhood/locality must each have at least 3 characters.")).toBeVisible();
    changeField("Neighborhood / Locality", "Palermo");
    fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));
    expect(await screen.findByRole("heading", { name: "Treatment start form preview" })).toBeVisible();
    expect(screen.getByText("Sin observaciones")).toBeVisible();
    expect(screen.getByText(PGFLEX_2PQ_DESTINATION)).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save treatment plan" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(
      "/2pq-dashboard/forms?createdId=FORM-00055&createdType=treatment_start",
    ));
    const [path, init] = jest.mocked(sdkFetch).mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(path).toBe("/2pq/forms");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      formType: "treatment_start",
      linkedStudyRequestFormId: request.id,
      treatmentStart: {
        studyType: "pgtAFast",
        treatmentDate: "2026-11-25",
        estimatedBiopsyDate: "2026-11-29",
        estimatedEmbryoCount: 5,
        pickupDate: "2026-11-29",
        pickupWindowStart: "09:00",
        pickupWindowEnd: "11:00",
        pickupOrigin: "Av. Corrientes 123, Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
        pickupDestination: PGFLEX_2PQ_DESTINATION,
        notes: "Sin observaciones",
      },
    });
    expect(jest.mocked(sdkFetch).mock.calls.filter(([, options]) => options?.method === "PUT")
      .map(([, options]) => JSON.parse(String(options?.body)).currentStep)).toEqual([
      "treatmentStart", "plannedTransport", "preview",
    ]);
  });

  it("flags a revised study type in planning and preview and clears the warning when reverted", async () => {
    const user = userEvent.setup();
    const originalTest = "Fast PGT (24-72hs)";
    const revisedTest = "Ultra-fast PGT (<8hs)";
    const warningText = "Study type changed from the request.";
    renderForm();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const studyType = await screen.findByRole("combobox", { name: "Study type" });
    expect(studyType).toHaveTextContent(originalTest);
    expect(screen.queryByText(warningText)).not.toBeInTheDocument();

    await user.click(studyType);
    await user.click(screen.getByRole("option", { name: revisedTest }));
    const warning = screen.getByRole("status");
    expect(within(warning).getByText(warningText)).toBeVisible();
    expect(warning).toHaveClass("bg-amber-50");
    expect(warning).toHaveTextContent(originalTest);
    expect(warning).toHaveTextContent(revisedTest);

    await user.click(studyType);
    await user.click(screen.getByRole("option", { name: originalTest }));
    expect(screen.queryByText(warningText)).not.toBeInTheDocument();

    await user.click(studyType);
    await user.click(screen.getByRole("option", { name: revisedTest }));
    changeField("Estimated biopsy date", "2026-11-29");
    changeField("Estimated embryos to biopsy", "5");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByLabelText("Pickup window start");
    changeField("Pickup window start", "09:00");
    changeField("Pickup window end", "11:00");
    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(await screen.findByRole("heading", { name: "Treatment start form preview" })).toBeVisible();
    const previewWarning = screen.getByRole("status");
    expect(within(previewWarning).getByText(warningText)).toBeVisible();
    expect(previewWarning).toHaveTextContent(originalTest);
    expect(previewWarning).toHaveTextContent(revisedTest);
  });

  it("restores a grouped frozen draft with the pickup group's current schedule", async () => {
    const group: TwoPQFormRecord & { pickup: TwoPQPickupSummary } = {
      ...request,
      id: "FORM-00050",
      formType: "treatment_start",
      pickup: {
        id: "pickup-1",
        status: "planned",
        expectedCaseCount: 1,
        readyCaseCount: 0,
        pickupDate: "2026-12-01",
        pickupWindowStart: "10:00",
        pickupWindowEnd: "12:00",
        origin: "Av. Corrientes 123, Palermo, Ciudad Autónoma de Buenos Aires, Argentina",
        destination: PGFLEX_2PQ_DESTINATION,
        temperatureC: -20,
        canManage: true,
      },
    };
    const draft: TwoPQTreatmentStartDraftRecord = {
      id: "author-1",
      formType: "treatment_start",
      collectionKey: "2pq-form-drafts",
      currentStep: "plannedTransport",
      stepIndex: 2,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      state: {
        linkedStudyRequestFormId: request.id,
        groupWithTreatmentStartFormId: group.id,
        treatmentStart: {
          studyType: "pgtAStandard", treatmentDate: "2026-11-25", estimatedBiopsyDate: "2026-11-29",
          estimatedEmbryoCount: 2, pickupDate: "2026-11-30", pickupDestination: "Old destination",
        },
      },
    };
    renderForm(draft, group);

    expect(screen.getByLabelText("Group with a planned pickup")).toHaveTextContent(group.id);
    expect(screen.getByLabelText("Expected pickup date")).toHaveValue("2026-12-01");
    expect(screen.getByLabelText("Pickup window end")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Address")).toBeDisabled();
    expect(screen.getByText(PGFLEX_2PQ_DESTINATION)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(sdkFetch).toHaveBeenCalledWith("/2pq/form-draft", expect.anything()));
    const [, init] = jest.mocked(sdkFetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      currentStep: "plannedTransport",
      state: {
        linkedStudyRequestFormId: request.id,
        groupWithTreatmentStartFormId: group.id,
        treatmentStart: { pickupDate: "2026-12-01", estimatedEmbryoCount: 2, notes: "Sin observaciones" },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByLabelText("Estimated embryos to biopsy")).toHaveValue(2);
  });

  it("opens an old single-step draft on treatment planning", () => {
    renderForm({
      id: "author-1",
      formType: "treatment_start",
      collectionKey: "2pq-form-drafts",
      currentStep: "treatmentStart",
      stepIndex: 0,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      state: {
        linkedStudyRequestFormId: request.id,
        treatmentStart: { estimatedEmbryoCount: 2 },
      },
    });

    expect(screen.getByRole("button", { name: "2 Treatment schedule" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByLabelText("Estimated embryos to biopsy")).toHaveValue(2);
  });
});
