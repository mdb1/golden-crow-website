/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQFormsList } from "@/components/two-pq-forms-list";
import type { AdminContextRecord } from "@/lib/admin-areas";
import type { TwoPQFormRecord } from "@/lib/two-pq-forms";
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

function renderList(forms: TwoPQFormRecord[] = [form]) {
  render(
    <AppLanguageProvider initialLanguage="en">
      <AdminContextProvider value={adminContext}>
        <TwoPQFormsList forms={forms} allowMutations />
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
    await user.click(
      screen.getByRole("button", { name: "Archive form" }),
    );

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/2pq/forms/FORM-00001/archive",
        { method: "PATCH" },
      ),
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
});
