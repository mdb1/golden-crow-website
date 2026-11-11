/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQFormsList } from "@/components/two-pq-forms-list";
import type { AdminContextRecord, AdminRole } from "@/lib/admin-areas";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";
import type { TwoPQFormsTypeFilter } from "@/lib/two-pq-forms";
import { sdkFetch } from "@/lib/sdk-client";

const mockRefresh = jest.fn();
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    replace: mockReplace,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
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

const form: TwoPQFormRecord = {
  id: "FORM-00001",
  formType: "study_request",
  collectionKey: "2pq_forms",
  institutionId: "INST-00001",
  doctorId: "DOC-00001",
  selectedPatientId: "PAT-00001",
  patientName: "Ada Patient",
  patientEmail: "ada@example.com",
  requestedTestName: "PGT-A",
  patientInformation: {},
  requestedTest: {},
  createdAt: "2026-09-29T12:00:00.000Z",
  updatedAt: "2026-09-29T12:00:00.000Z",
};

function renderList(
  forms: TwoPQFormRecord[] = [form],
  role: AdminRole = "full_admin",
  initialFormType: TwoPQFormsTypeFilter | null = "study_request",
  language: "en" | "es" = "en",
) {
  render(
    <AppLanguageProvider forcedLanguage={language}>
      <AdminContextProvider
        value={{
          ...adminContext,
          role,
          institutionId: role === "full_admin" ? undefined : "INST-00001",
          doctorId: role === "institution_doctor" ? "DOC-00001" : undefined,
        }}
      >
        <TwoPQFormsList
          forms={forms}
          allowMutations
          {...(initialFormType
            ? {
                initialFilters: {
                  includeArchived: false,
                  formType: initialFormType,
                  search: "",
                  createdFrom: "",
                  createdTo: "",
                  order: "newest" as const,
                },
              }
            : {})}
        />
      </AdminContextProvider>
    </AppLanguageProvider>,
  );
}

describe("TwoPQFormsList actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows Archive beside Delete for a full admin and archives the row", async () => {
    const user = userEvent.setup();
    const archivedForm = {
      ...form,
      archivedAt: "2026-09-29T13:00:00.000Z",
      archivedByEmail: adminContext.email,
      archivedByUid: adminContext.uid,
    };
    (sdkFetch as jest.Mock).mockResolvedValue({ form: archivedForm });
    renderList();

    const row = screen.getByText(form.id).closest("article");
    expect(row).not.toBeNull();
    const deleteButton = within(row!).getByRole("button", { name: "Delete" });
    const archiveButton = within(row!).getByRole("button", { name: "Archive" });
    expect(deleteButton.parentElement).toBe(archiveButton.parentElement);

    await user.click(archiveButton);
    await user.click(screen.getByRole("button", { name: "Archive form" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith("/2pq/forms/FORM-00001/archive", {
        method: "PATCH",
      }),
    );
    expect(screen.queryByText(form.id)).not.toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not offer Archive again for an archived row", () => {
    renderList([
      {
        ...form,
        archivedAt: "2026-09-29T13:00:00.000Z",
      },
    ]);

    const row = screen.getByText(form.id).closest("article");
    expect(row).not.toBeNull();
    expect(
      within(row!).queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
    expect(
      within(row!).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("offers archive and preserves a study request with a signed consent", () => {
    renderList([{ ...form, informedConsentId: "CONS-00001" }]);

    expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it.each([
    "institution_doctor",
    "institution_operator",
    "institution_laboratory_staff",
  ] as const)("does not offer Archive to %s", (role) => {
    renderList([form], role);

    const row = screen.getByText(form.id).closest("article");
    expect(row).not.toBeNull();
    expect(
      within(row!).queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
    expect(
      within(row!).getByRole("link", { name: "Open" }),
    ).toBeInTheDocument();
  });

  it("keeps Archive available to institution administrators", () => {
    renderList([form], "institution_admin");

    const row = screen.getByText(form.id).closest("article");
    expect(row).not.toBeNull();
    expect(
      within(row!).getByRole("button", { name: "Archive" }),
    ).toBeInTheDocument();
  });

  it("uses the co-joined study view by default and links every populated step", async () => {
    const user = userEvent.setup();
    const coJoinedForm = {
      ...form,
      linkedTreatmentStartFormId: "FORM-00004",
      linkedBiopsyForm: "FORM-00002",
      linkedWithdrawalRequest: "FORM-00003",
      "2pq_case": "CASE-00025",
      linkedCaseLabel: "KIMXXX",
    };
    (sdkFetch as jest.Mock).mockResolvedValue({
      forms: [coJoinedForm],
      nextCursor: null,
      hasMore: false,
    });

    renderList([coJoinedForm], "full_admin", null);

    expect(
      screen.getByRole("combobox", { name: "Form type" }),
    ).toHaveTextContent("Study request (Co-joined)");
    expect(
      screen.getByLabelText("Co-joined form sequence"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Study request", { selector: '[data-slot="badge"]' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Request: Linked")).toHaveTextContent("1");
    expect(screen.getByLabelText("Request: Linked")).toHaveAttribute(
      "data-state",
      "linked",
    );
    expect(screen.getByLabelText("Treatment start: Linked")).toHaveTextContent("2");
    expect(screen.getByLabelText("Treatment start: Linked")).toHaveAttribute(
      "href",
      "/2pq-dashboard/forms/FORM-00004",
    );
    expect(screen.getByLabelText("Biopsy: Linked")).toHaveTextContent("3");
    expect(screen.getByLabelText("Biopsy: Linked")).toHaveAttribute(
      "data-state",
      "linked",
    );
    expect(screen.getByLabelText("Withdrawal: Linked")).toHaveTextContent("4");
    expect(screen.getByLabelText("Withdrawal: Linked")).toHaveAttribute(
      "data-state",
      "linked",
    );
    expect(
      document.querySelector('a[href="/2pq-dashboard/forms/FORM-00002"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('a[href="/2pq-dashboard/forms/FORM-00003"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open 2PQ case KIMXXX" }),
    ).toHaveAttribute("href", "/2pq-dashboard/cases/CASE-00025");
    const linkedCaseCell = screen.getByRole("link", {
      name: "Open 2PQ case KIMXXX",
    });
    expect(linkedCaseCell).toHaveTextContent("Saved");
    expect(linkedCaseCell).toHaveTextContent("KIMXXX");
    expect(linkedCaseCell).not.toHaveTextContent("CASE-00025");
    expect(linkedCaseCell).toHaveClass("border-emerald-200/90");
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/2pq/forms?limit=20&formType=study_request",
      ),
    );
    expect(mockReplace).toHaveBeenCalledWith(
      "/2pq-dashboard/forms?formType=study_request_cojoined",
      { scroll: false },
    );
  });

  it("opens a prefilled treatment start before offering the biopsy", () => {
    renderList([{ ...form, requiresTreatmentStart: true }], "full_admin", "study_request_cojoined");

    expect(screen.getByLabelText("Request: Linked")).toBeInTheDocument();
    expect(screen.getByLabelText("Treatment start: Not linked")).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "Complete Treatment start" })).toHaveAttribute(
      "href",
      "/2pq-dashboard/forms/treatment-start/new?linkedStudyRequestFormId=FORM-00001",
    );
    expect(screen.getByLabelText("Biopsy: Not linked")).toHaveTextContent("3");
    expect(screen.getByLabelText("Biopsy: Not linked")).toHaveAttribute(
      "data-state",
      "empty",
    );
    expect(screen.getByLabelText("Withdrawal: Not linked")).toHaveTextContent(
      "4",
    );
    expect(screen.getByLabelText("Withdrawal: Not linked")).toHaveAttribute(
      "data-state",
      "empty",
    );
    expect(screen.queryByRole("link", { name: "Complete Biopsy" })).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Withdrawal: Not linked")).queryByRole(
        "link",
      ),
    ).not.toBeInTheDocument();
  });

  it("opens the prefilled biopsy after treatment planning is saved", () => {
    renderList(
      [{
        ...form,
        requestedTest: { pgtAUltraFast: true },
        requiresTreatmentStart: true,
        linkedTreatmentStartFormId: "FORM-00004",
        consent: { id: "CONS-00001", status: "ready" },
        treatmentStart: {
          studyType: "pgtAFast",
          treatmentDate: "2026-11-25",
          estimatedBiopsyDate: "2026-11-29",
          estimatedEmbryoCount: 5,
          pickupDate: "2026-11-30",
          pickupWindowStart: "09:00",
          pickupWindowEnd: "11:00",
          pickupOrigin: "Clínica Norte",
          pickupDestination: "Laboratorio 2PQ",
          temperatureC: -20,
          notes: "Sin observaciones",
        },
      }],
      "full_admin",
      "study_request_cojoined",
    );

    expect(screen.getByRole("link", { name: "Request: Linked" })).toHaveClass("bg-amber-700");
    const treatmentStep = screen.getByRole("link", { name: "Treatment start: Linked" });
    expect(treatmentStep).toHaveClass("bg-amber-700");
    expect(treatmentStep).toHaveAttribute(
      "href",
      "/2pq-dashboard/forms/FORM-00004",
    );
    expect(screen.getByRole("link", { name: "Complete Biopsy" })).toHaveAttribute(
      "href",
      "/2pq-dashboard/forms/sample/new?studyRequestFormId=FORM-00001",
    );
    expect(screen.queryByRole("link", { name: "Review consent" })).not.toBeInTheDocument();
  });

  it.each([
    ["Ultra-fast PGT", "bg-red-700"],
    ["Fast PGT", "bg-amber-700"],
    ["Standard PGT", "bg-emerald-600"],
    ["PGT SR", "bg-emerald-600"],
  ])("colors the linked steps for a saved %s request", (requestedTestName, color) => {
    renderList([{
      ...form,
      requestedTestName,
      linkedBiopsyForm: "FORM-00002",
      linkedWithdrawalRequest: "FORM-00003",
    }], "full_admin", "study_request_cojoined");

    for (const step of ["Request", "Biopsy", "Withdrawal"]) {
      expect(screen.getByRole("link", { name: `${step}: Linked` })).toHaveClass(color);
    }
    expect(screen.getByLabelText("Treatment start: Not linked")).toHaveClass("bg-slate-200");
  });

  it.each([undefined, "FORM-00004"])("links straight to the consent with treatment plan %s", (linkedTreatmentStartFormId) => {
    const consentId = "CONS-REQUEST-00001";
    renderList(
      [{ ...form, linkedTreatmentStartFormId, consent: { id: consentId, status: "needs_review" } }],
      "full_admin",
      "study_request_cojoined",
      "es",
    );

    const status = screen.getByText("Consentimiento por revisar");
    const reviewLink = screen.getByRole("link", { name: "Revisar consentimiento" });
    expect(reviewLink).toHaveAttribute("href", `/2pq-dashboard/consents/${consentId}`);
    expect(reviewLink).toHaveAttribute("data-size", "lg");
    expect(reviewLink.parentElement).toBe(status.parentElement);
    expect(screen.queryByRole("link", { name: "Completar Biopsia" })).not.toBeInTheDocument();
  });

  it("places the consent review link beside the saved case", () => {
    renderList([{
      ...form,
      "2pq_case": "CASE-00001",
      linkedCaseLabel: "KIMXXX",
      consent: { id: "CONS-00001", status: "needs_review" },
    }], "full_admin", "study_request_cojoined");

    const savedCaseLink = screen.getByRole("link", { name: "Open 2PQ case KIMXXX" });
    const reviewLink = screen.getByRole("link", { name: "Review consent" });
    expect(reviewLink).toHaveAttribute("href", "/2pq-dashboard/consents/CONS-00001");
    expect(reviewLink.parentElement).toBe(savedCaseLink.parentElement);
  });

  it("offers doctors the consent review link only for their own study requests", () => {
    renderList(
      [
        {
          ...form,
          linkedTreatmentStartFormId: "FORM-00004",
          consent: { id: "CONS-00001", status: "needs_review" },
        },
        {
          ...form,
          id: "FORM-00002",
          doctorId: "DOC-00002",
          linkedTreatmentStartFormId: "FORM-00005",
          consent: { id: "CONS-00002", status: "needs_review" },
        },
      ],
      "institution_doctor",
      "study_request_cojoined",
    );

    expect(screen.getAllByText("Consent needs review")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Review consent" }))
      .toHaveAttribute("href", "/2pq-dashboard/consents/CONS-00001");
  });

  it("keeps the request consent panel accessible when treatment is planned and consent is pending", () => {
    renderList(
      [{ ...form, linkedTreatmentStartFormId: "FORM-00004", consent: { id: null, status: "pending" } }],
      "full_admin",
      "study_request_cojoined",
    );

    expect(screen.getByText("Consent pending")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review consent" })).toHaveAttribute(
      "href", `/2pq-dashboard/forms/${form.id}#informed-consent`,
    );
    expect(screen.queryByRole("link", { name: "Complete Biopsy" })).not.toBeInTheDocument();
  });

  it("links a study and biopsy row to a prefilled withdrawal form", () => {
    renderList(
      [
        {
          ...form,
          linkedBiopsyForm: "FORM-00002",
          linkedWithdrawalRequest: null,
          "2pq_case": "CASE-00025",
        },
      ],
      "full_admin",
      "study_request_cojoined",
    );

    expect(screen.getByLabelText("Request: Linked")).toHaveAttribute(
      "data-state",
      "linked",
    );
    expect(screen.getByLabelText("Biopsy: Linked")).toHaveAttribute(
      "data-state",
      "linked",
    );
    expect(screen.queryByRole("link", { name: "Complete Treatment start" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Withdrawal: Not linked")).toHaveAttribute(
      "data-state",
      "empty",
    );
    const withdrawalSegment = screen.getByLabelText("Withdrawal: Not linked");
    const withdrawalAction = within(withdrawalSegment).getByRole("link", {
      name: "Complete Withdrawal",
    });
    expect(withdrawalAction).toHaveTextContent(/^Complete$/);
    expect(withdrawalAction).toHaveAttribute(
      "href",
      "/2pq-dashboard/forms/withdrawal-request/new?studyRequestFormId=FORM-00001&caseId=CASE-00025",
    );
  });

  it("links stage four to managed pickup confirmation instead of a second withdrawal", () => {
    renderList([{
      ...form,
      linkedTreatmentStartFormId: "FORM-00004",
      linkedBiopsyForm: "FORM-00002",
      transportEventId: "pickup-1",
      pickup: {
        id: "pickup-1", status: "confirmed", expectedCaseCount: 1, readyCaseCount: 1,
        pickupDate: "2026-11-30", pickupWindowStart: "09:00", pickupWindowEnd: "11:00",
        origin: "Clinic", destination: "Lab", temperatureC: 4, canManage: false,
      },
    }], "full_admin", "study_request_cojoined");

    expect(screen.getByRole("link", { name: "Withdrawal: Confirmed pickup" })).toHaveAttribute(
      "href", "/2pq-dashboard/forms/FORM-00002#pickup-confirmation",
    );
    expect(screen.queryByRole("link", { name: "Complete Withdrawal" })).not.toBeInTheDocument();
  });

  it.each(["study_request", "all"] as const)(
    "never shows the co-joined sequence for the %s filter",
    (formType) => {
      renderList([form], "full_admin", formType);

      expect(
        screen.queryByLabelText("Co-joined form sequence"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText("Study request", { selector: '[data-slot="badge"]' }),
      ).toBeInTheDocument();
    },
  );

  it("keeps patient, institution and treatment filters when loading the next result page", async () => {
    const user = userEvent.setup();
    const urgentForm = {
      ...form,
      institutionName: "Clínica Norte",
      requestedTest: { pgtAUltraFast: true },
      estimatedTreatmentDate: "2026-12-06",
    };
    (sdkFetch as jest.Mock)
      .mockResolvedValueOnce({ forms: [urgentForm], nextCursor: "FORM-00001", hasMore: true })
      .mockResolvedValueOnce({ forms: [{ ...urgentForm, id: "FORM-00002", patientName: "Ada Second" }], nextCursor: null, hasMore: false });
    renderList();

    await user.type(screen.getByLabelText("Search by patient"), "Ada");
    await user.type(screen.getByLabelText("Institution"), "Clínica Norte");
    await user.type(screen.getByLabelText("Estimated treatment from"), "2026-12-06");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(await screen.findByText("Ultra-fast PGT", { selector: '[data-slot="badge"]' })).toHaveClass("bg-red-100");
    expect(screen.getByText(/Estimated treatment date:/)).toHaveTextContent("12/06/2026");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Ada Second")).toBeInTheDocument();

    const first = new URL((sdkFetch as jest.Mock).mock.calls[0][0], "https://test.local");
    const next = new URL((sdkFetch as jest.Mock).mock.calls[1][0], "https://test.local");
    expect(Object.fromEntries(first.searchParams)).toMatchObject({ search: "Ada", institution: "Clínica Norte", treatmentFrom: "2026-12-06" });
    expect(Object.fromEntries(next.searchParams)).toEqual({ ...Object.fromEntries(first.searchParams), cursor: "FORM-00001" });
  });
});
