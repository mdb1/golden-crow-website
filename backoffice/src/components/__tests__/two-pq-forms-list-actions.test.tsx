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
) {
  render(
    <AppLanguageProvider initialLanguage="en">
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
      linkedBiopsyForm: "FORM-00002",
      linkedWithdrawalRequest: "FORM-00003",
      "2pq_case": "CASE-00025",
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
    expect(screen.getByLabelText("Study: Linked")).toHaveTextContent("1");
    expect(screen.getByLabelText("Study: Linked")).toHaveAttribute(
      "data-state",
      "linked",
    );
    expect(screen.getByLabelText("Biopsy: Linked")).toHaveTextContent("2");
    expect(screen.getByLabelText("Biopsy: Linked")).toHaveAttribute(
      "data-state",
      "linked",
    );
    expect(screen.getByLabelText("Withdrawal: Linked")).toHaveTextContent("3");
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
      screen.getByRole("link", { name: "Open 2PQ case CASE-00025" }),
    ).toHaveAttribute("href", "/2pq-dashboard/cases/CASE-00025");
    expect(
      screen.queryByRole("link", { name: "Complete biopsy form" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Complete withdrawal form" }),
    ).not.toBeInTheDocument();

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

  it("shows empty biopsy and withdrawal circles when those forms are absent", () => {
    renderList([form], "full_admin", "study_request_cojoined");

    expect(screen.getByLabelText("Study: Linked")).toBeInTheDocument();
    expect(screen.getByLabelText("Biopsy: Not linked")).toHaveTextContent("2");
    expect(screen.getByLabelText("Biopsy: Not linked")).toHaveAttribute(
      "data-state",
      "empty",
    );
    expect(screen.getByLabelText("Withdrawal: Not linked")).toHaveTextContent(
      "3",
    );
    expect(screen.getByLabelText("Withdrawal: Not linked")).toHaveAttribute(
      "data-state",
      "empty",
    );
    expect(
      screen.getByRole("link", { name: "Complete biopsy form" }),
    ).toHaveAttribute(
      "href",
      "/2pq-dashboard/forms/sample/new?studyRequestFormId=FORM-00001",
    );
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

    expect(screen.getByLabelText("Study: Linked")).toHaveAttribute(
      "data-state",
      "linked",
    );
    expect(screen.getByLabelText("Biopsy: Linked")).toHaveAttribute(
      "data-state",
      "linked",
    );
    expect(screen.getByLabelText("Withdrawal: Not linked")).toHaveAttribute(
      "data-state",
      "empty",
    );
    expect(
      screen.getByRole("link", { name: "Complete withdrawal form" }),
    ).toHaveAttribute(
      "href",
      "/2pq-dashboard/forms/withdrawal-request/new?studyRequestFormId=FORM-00001&caseId=CASE-00025",
    );
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
});
