/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQTreatmentStartForm } from "@/components/two-pq-treatment-start-form";
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
  institutionInformation: { address: "Av. Corrientes 123", city: "Buenos Aires" },
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

  it("defaults from the request and saves urgent plans without a case ID", async () => {
    renderForm();
    expect(screen.getByLabelText("Study type")).toHaveValue("pgtAFast");
    expect(screen.getByLabelText("Treatment start date")).toHaveValue("2026-11-25");
    expect(screen.getByLabelText("Pickup origin")).toHaveValue("Av. Corrientes 123, Buenos Aires");
    changeField("Estimated biopsy date", "2026-11-29");
    changeField("Estimated embryos to biopsy", "5");
    changeField("Pickup window start", "09:00");
    changeField("Pickup window end", "08:00");
    expect(screen.getByLabelText("Expected pickup date")).toHaveValue("2026-11-29");

    fireEvent.click(screen.getByRole("button", { name: "Review treatment plan" }));
    expect(screen.getByText("Pickup must end after it starts.")).toBeVisible();
    expect(sdkFetch).not.toHaveBeenCalled();

    changeField("Pickup window end", "11:00");
    fireEvent.click(screen.getByRole("button", { name: "Review treatment plan" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Sin observaciones");
    fireEvent.click(screen.getByRole("button", { name: "Save treatment plan" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(
      "/2pq-dashboard/forms?createdId=FORM-00055&createdType=treatment_start",
    ));
    const [path, init] = jest.mocked(sdkFetch).mock.calls[0]!;
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
        pickupOrigin: "Av. Corrientes 123, Buenos Aires",
        pickupDestination: expect.stringContaining("Humboldt 2433"),
        notes: "Sin observaciones",
      },
    });
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
        origin: "Group origin",
        destination: "Group destination",
        temperatureC: -20,
        canManage: true,
      },
    };
    const draft: TwoPQTreatmentStartDraftRecord = {
      id: "author-1",
      formType: "treatment_start",
      collectionKey: "2pq-form-drafts",
      currentStep: "treatmentStart",
      stepIndex: 0,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      state: {
        linkedStudyRequestFormId: request.id,
        groupWithTreatmentStartFormId: group.id,
        treatmentStart: { studyType: "pgtAStandard", estimatedEmbryoCount: 2, pickupDate: "2026-11-30" },
      },
    };
    renderForm(draft, group);

    expect(screen.getByLabelText("Group with a planned pickup")).toHaveValue(group.id);
    expect(screen.getByLabelText("Expected pickup date")).toHaveValue("2026-12-01");
    expect(screen.getByLabelText("Pickup window end")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Estimated embryos to biopsy")).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(sdkFetch).toHaveBeenCalledWith("/2pq/form-draft", expect.anything()));
    const [, init] = jest.mocked(sdkFetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      currentStep: "treatmentStart",
      state: {
        linkedStudyRequestFormId: request.id,
        groupWithTreatmentStartFormId: group.id,
        treatmentStart: { pickupDate: "2026-12-01", estimatedEmbryoCount: 2, notes: "Sin observaciones" },
      },
    });
  });
});
