/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PartnershipCrmWorkbench } from "@/components/god-mode/partnership-crm-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  PartnershipCrmOrganizationRecord,
  PartnershipCrmProfessionalRecord,
} from "@/lib/partnership-crm";

const routerRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const organization: PartnershipCrmOrganizationRecord = {
  id: "org-1",
  schemaVersion: 1,
  name: "Delete Me Genomics",
  category: "Laboratory / Genomics",
  website: "https://delete.example",
  websiteDomain: "delete.example",
  country: "Argentina",
  status: "new",
  contactName: "Ada",
  contactEmail: "ada@example.org",
  contactLinkedIn: "",
  lastContactAt: "2026-08-01T12:00:00.000Z",
  notes: "Temporary CRM row.",
  normalizedName: "delete me genomics",
  updatedByEmail: "owner@example.org",
};

const professional: PartnershipCrmProfessionalRecord = {
  id: "pro-1",
  schemaVersion: 1,
  name: "Dra. Ada Genome",
  category: "pro_clinical_geneticists",
  title: "Genetista clinica",
  primaryAffiliation: "Genome Lab",
  potentialPocketGenesEditorFit:
    "Clinical genetics, genetic testing, result interpretation and patient education.",
  emailRoute:
    "Publicly listed professional or official institutional contact address.",
  linkedInRoute: "Official LinkedIn page of the affiliated organization.",
  researchBasis:
    "Existing verified Pocket Genes partnership dataset, affiliation website and LinkedIn record.",
  website: "https://ada.example",
  websiteDomain: "ada.example",
  country: "Argentina",
  status: "new",
  email: "ada@genomelab.example",
  linkedIn: "https://linkedin.com/in/ada",
  lastContactAt: "2026-08-02T12:00:00.000Z",
  notes: "Professional CRM row.",
  normalizedName: "dra ada genome",
};

function renderWorkbench() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        <PartnershipCrmWorkbench />
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("PartnershipCrmWorkbench delete flow", () => {
  beforeEach(() => {
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    window.localStorage.clear();
    let deleted = false;

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return { deleted: true, organizationId: "org-1" };
      }

      if (String(path).includes("/activities")) {
        return { activities: [] };
      }

      return {
        organizations: deleted ? [] : [organization],
        nextCursor: undefined,
      };
    });
  });

  it("closes the confirmation dialog, removes the row, and refreshes after delete", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));
    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(2);
    });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete CRM organization")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryAllByText("Delete Me Genomics")).toHaveLength(0);
    });
    expect(routerRefresh).toHaveBeenCalledTimes(1);
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations/org-1",
      { method: "DELETE" },
    );
  });

  it("keeps contact name, email, and last-contact metadata in separate fact cards", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));

    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations?limit=50",
    );
    expect(screen.getByText("All categories")).toBeTruthy();
    expect(screen.getAllByText("Genomics Laboratory").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("All countries")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Category")).toBeNull();
    expect(screen.queryByPlaceholderText("Country")).toBeNull();

    const primaryContactCard =
      screen.getByText("Primary contact").parentElement;
    const mailCard = screen.getByText("Mail").parentElement;
    const lastContactCard = screen
      .getAllByText("Last Contact")
      .find((element) => element.tagName !== "TH")?.parentElement;

    expect(primaryContactCard).toBeTruthy();
    expect(mailCard).toBeTruthy();
    expect(lastContactCard).toBeTruthy();
    expect(
      within(primaryContactCard as HTMLElement).getByText("Ada"),
    ).toBeTruthy();
    expect(
      within(primaryContactCard as HTMLElement).queryByText("ada@example.org"),
    ).toBeNull();
    expect(
      within(mailCard as HTMLElement).getByText("ada@example.org"),
    ).toBeTruthy();
    expect(screen.queryByText("owner@example.org")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit CRM organization",
    });
    expect(
      within(dialog).getByRole("button", {
        name: /Organization categories/,
      }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: /Choose countries/ }),
    ).toBeTruthy();
  });

  it("hides details and clears selection until a row is manually selected", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    expect(screen.queryByRole("button", { name: "Send Email" })).toBeNull();

    await user.click(screen.getByText("Delete Me Genomics"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send Email" })).toBeTruthy();
    });
    expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Hide details" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Send Email" })).toBeNull();
    });
    expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);

    await user.click(screen.getByText("Delete Me Genomics"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send Email" })).toBeTruthy();
    });
  });

  it("places the send email CTA below the selected record notes", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));

    const notesHeading = screen
      .getAllByText("Notes")
      .find((element) => element.tagName !== "TH");
    const sendButton = screen.getByRole("button", { name: "Send Email" });

    expect(notesHeading).toBeTruthy();
    expect(
      notesHeading!.compareDocumentPosition(sendButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(sendButton.className).toContain("w-full");
  });

  it("shows the email preview as a locked full-width review step", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    await user.type(within(dialog).getByLabelText("Subject"), "CRM follow-up");
    await user.type(
      within(dialog).getByLabelText("Message"),
      "Hola Ada,\n\nQueria escribirte directamente sobre Pocket Genes.",
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Preview email" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Ready to send")).toBeTruthy();
    });
    expect(within(dialog).queryByLabelText("Subject")).toBeNull();
    expect(within(dialog).queryByLabelText("Message")).toBeNull();
    expect(within(dialog).queryByText("Template")).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Preview email" }),
    ).toBeNull();

    const previewPanel = within(dialog)
      .getByText("Ready to send")
      .closest("aside");
    expect(previewPanel?.className).toContain("w-full");
    expect(
      within(dialog).getByRole("button", { name: "Send email" }).className,
    ).toContain("bg-blue-600");
  });

  it("switches to the professionals CRM collection and professional fields", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }
      if (stringPath.startsWith("/admin/partnership-crm/professionals")) {
        return { professionals: [professional], nextCursor: undefined };
      }
      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("tab", { name: /Professionals/ }));

    await waitFor(() => {
      expect(screen.getAllByText("Dra. Ada Genome")).toHaveLength(1);
    });
    await user.click(screen.getByText("Dra. Ada Genome"));

    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/professionals?limit=50",
    );
    expect(screen.getByText("Clinical Geneticist")).toBeTruthy();
    expect(screen.getByText("Role / specialty")).toBeTruthy();
    expect(screen.getByText("Genetista clinica")).toBeTruthy();
    expect(screen.getByText("Primary affiliation")).toBeTruthy();
    expect(screen.getByText("Genome Lab")).toBeTruthy();
    expect(
      screen.getByText(
        "Clinical genetics, genetic testing, result interpretation and patient education.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Email route")).toBeTruthy();
    expect(screen.getByText("LinkedIn route")).toBeTruthy();
    expect(screen.getByText("Research basis")).toBeTruthy();
    expect(screen.getAllByText("ada@genomelab.example").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole("button", { name: "Add Professional" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit CRM professional",
    });
    const fieldValue = (label: string) =>
      (
        within(dialog).getByLabelText(label) as
          | HTMLInputElement
          | HTMLTextAreaElement
      ).value;

    expect(
      fieldValue("Primary affiliation"),
    ).toBe("Genome Lab");
    expect(
      fieldValue("Potential Pocket Genes editor fit"),
    ).toBe(
      "Clinical genetics, genetic testing, result interpretation and patient education.",
    );
    expect(fieldValue("Email route")).toBe(
      "Publicly listed professional or official institutional contact address.",
    );
    expect(fieldValue("LinkedIn route")).toBe(
      "Official LinkedIn page of the affiliated organization.",
    );
    expect(fieldValue("Research basis")).toBe(
      "Existing verified Pocket Genes partnership dataset, affiliation website and LinkedIn record.",
    );
  });

  it("renders the activity log as a single timeline list", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return {
          activities: [
            {
              id: "activity-1",
              type: "email",
              title: "CRM email sent",
              body: "Hola Ada",
              occurredAt: "2026-08-03T12:00:00.000Z",
              createdByEmail: "federico@goldencrowvs.com",
              metadata: {
                subject: "Pocket Genes + Delete Me Genomics",
                to: "ada@example.org",
              },
            },
          ],
          nextCursor: undefined,
        };
      }

      return {
        organizations: [organization],
        nextCursor: undefined,
      };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));

    await user.click(screen.getByRole("button", { name: /Activity log/ }));

    await waitFor(() => {
      expect(screen.getByText("CRM email sent")).toBeTruthy();
    });

    const section = screen.getByText("Activity log").closest("section");
    const activityRow = section?.querySelector("article");
    const descendants = Array.from(
      section?.querySelectorAll("div,article") ?? [],
    );

    expect(activityRow?.className).toContain("lg:flex-row");
    expect(activityRow?.className).not.toContain("rounded-xl");
    expect(
      descendants.some((element) =>
        String(element.className).includes("xl:grid-cols-2"),
      ),
    ).toBe(false);
  });
});

describe("PartnershipCrmWorkbench list pager", () => {
  beforeEach(() => {
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    window.localStorage.clear();

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }

      if (stringPath === "/admin/partnership-crm/organizations?limit=50") {
        return {
          organizations: [
            { ...organization, id: "org-page-1", name: "Genome Page 1" },
          ],
          nextCursor: "cursor-2",
        };
      }

      if (
        stringPath ===
        "/admin/partnership-crm/organizations?limit=50&cursor=cursor-2"
      ) {
        return {
          organizations: [
            { ...organization, id: "org-page-2", name: "Genome Page 2" },
          ],
          nextCursor: undefined,
        };
      }

      return { organizations: [], nextCursor: undefined };
    });
  });

  it("shows visible count, page count, and previous/next controls as a right-aligned pager", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByText("Genome Page 1")).toBeTruthy();
    });

    const pager = screen.getByText("1 visible").parentElement;
    expect(pager?.className).toContain("justify-end");
    expect(screen.getByText("Page 1 of 2+")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous" })).toHaveProperty(
      "disabled",
      true,
    );

    const nextButton = screen.getByRole("button", { name: "Next page" });
    expect(nextButton).toHaveProperty("disabled", false);

    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText("Genome Page 2")).toBeTruthy();
    });
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("button", { name: "Next page" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations?limit=50&cursor=cursor-2",
    );
  });
});

describe("PartnershipCrmWorkbench import flow", () => {
  beforeEach(() => {
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    window.localStorage.clear();

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath === "/admin/partnership-crm/import-preview") {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{
            rowId: string;
            name?: string;
            category?: string;
            website?: string;
            country?: string;
            status?: string;
            contactName?: string;
            contactEmail?: string;
            contactLinkedIn?: string;
            notes?: string;
          }>;
        };
        return {
          rows: body.organizations.map((row) => ({
            rowId: row.rowId,
            organization: {
              name: row.name ?? "",
              category: row.category ?? "",
              website: row.website ?? "",
              country: row.country ?? "",
              status: "new",
              contactName: row.contactName ?? "",
              contactEmail: row.contactEmail ?? "",
              contactLinkedIn: row.contactLinkedIn ?? "",
              lastContactAt: null,
              notes: row.notes ?? "",
            },
            valid: Boolean(row.name),
            errors: row.name ? [] : ["Organization name is required."],
            missingEmail: !row.contactEmail,
            duplicateCandidates: [],
          })),
          summary: {
            total: body.organizations.length,
            valid: body.organizations.length,
            invalid: 0,
            missingEmail: 0,
            duplicates: 0,
          },
        };
      }

      if (stringPath === "/admin/partnership-crm/import") {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ rowId: string }>;
        };
        return {
          results: body.organizations.map((row, index) => ({
            rowId: row.rowId,
            action: "created",
            organizationId: `imported-${index}`,
          })),
          summary: {
            total: body.organizations.length,
            created: body.organizations.length,
            updated: 0,
            skipped: 0,
            invalid: 0,
          },
        };
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }

      if (stringPath.startsWith("/admin/partnership-crm/professionals")) {
        return { professionals: [professional], nextCursor: undefined };
      }

      return { organizations: [], nextCursor: undefined };
    });
  });

  function crmCsv(rowCount: number) {
    return [
      "name,category,website,country,contact_name,email,linkedin,status,notes",
      ...Array.from({ length: rowCount }, (_, index) => {
        const rowNumber = index + 1;
        return [
          `Genome Lab ${rowNumber}`,
          "Laboratory / Genomics",
          `lab-${rowNumber}.example`,
          "Argentina",
          `Ada ${rowNumber}`,
          `ada-${rowNumber}@example.org`,
          "",
          "New",
          "Batch import",
        ].join(",");
      }),
    ].join("\n");
  }

  function crmImportSession() {
    return JSON.parse(
      window.localStorage.getItem(
        "golden-crow:partnership-crm-import-session:v1",
      ) ?? "{}",
    );
  }

  function crmPreviewCalls() {
    return jest
      .mocked(sdkFetch)
      .mock.calls.filter(
        ([path]) => path === "/admin/partnership-crm/import-preview",
      );
  }

  function crmImportCalls() {
    return jest
      .mocked(sdkFetch)
      .mock.calls.filter(([path]) => path === "/admin/partnership-crm/import");
  }

  it("loads a CSV and imports selected rows from interactive cards", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("tablist", { name: "CRM target" }),
    ).toBeTruthy();
    const csv = crmCsv(3);

    const file = new File([csv], "interactive-crm-import.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(screen.getAllByText("CSV loaded").length).toBeGreaterThan(0);
    });
    expect(within(dialog).queryByLabelText("CSV file")).toBeNull();
    expect(
      within(dialog).queryByRole("tablist", { name: "CRM target" }),
    ).toBeNull();
    expect(crmPreviewCalls()).toHaveLength(0);
    expect(
      crmImportSession(),
    ).toEqual(
      expect.objectContaining({
        mode: "setup",
        previewedRows: 0,
        totalRows: 3,
        status: "ready",
        chunkSize: 1,
      }),
    );

    await user.click(
      within(dialog).getByRole("button", {
        name: "Start interactive download",
      }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Row 1 of 3")).toBeTruthy();
    });
    expect(within(dialog).getByText("Genome Lab 1")).toBeTruthy();
    expect(crmPreviewCalls()).toHaveLength(1);
    expect(
      JSON.parse(String(crmPreviewCalls()[0]?.[1]?.body)).organizations,
    ).toEqual([expect.objectContaining({ rowId: "row-1" })]);

    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(within(dialog).getByText("Row 2 of 3")).toBeTruthy();
    });
    expect(crmImportCalls()).toHaveLength(1);
    expect(
      JSON.parse(String(crmImportCalls()[0]?.[1]?.body)).organizations,
    ).toEqual([
      expect.objectContaining({
        rowId: "row-1",
        duplicateAction: "import",
      }),
    ]);
    expect(crmPreviewCalls()).toHaveLength(2);

    await user.click(within(dialog).getByRole("button", { name: "Skip row" }));
    await waitFor(() => {
      expect(within(dialog).getByText("Skipped during interactive review.")).toBeTruthy();
    });
    expect(crmImportCalls()).toHaveLength(1);
    expect(
      crmImportSession(),
    ).toEqual(
      expect.objectContaining({
        mode: "interactive",
        nextImportIndex: 2,
        importSummary: expect.objectContaining({ created: 1, skipped: 1 }),
      }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Next row" }));
    await waitFor(() => {
      expect(within(dialog).getByText("Row 3 of 3")).toBeTruthy();
    });
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(within(dialog).getByText("CRM import finished")).toBeTruthy();
    });
    expect(within(dialog).queryByLabelText("CSV file")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeTruthy();
    expect(
      crmImportSession(),
    ).toEqual(
      expect.objectContaining({
        nextImportIndex: 3,
        status: "completed",
        importSummary: expect.objectContaining({ created: 2, skipped: 1 }),
      }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("requires discarding the checkpoint before choosing a new CRM target or CSV file", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = crmCsv(2);
    const file = new File([csv], "locked-crm-import.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);
    await waitFor(() => {
      expect(within(dialog).getByText("CSV loaded")).toBeTruthy();
    });

    expect(within(dialog).queryByLabelText("CSV file")).toBeNull();
    expect(
      within(dialog).queryByRole("tablist", { name: "CRM target" }),
    ).toBeNull();

    await user.click(
      within(dialog).getByRole("button", { name: "Discard checkpoint" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByLabelText("CSV file")).toBeTruthy();
    });
    expect(
      within(dialog).getByRole("tablist", { name: "CRM target" }),
    ).toBeTruthy();
  });

  it("imports remaining interactive rows sequentially and can pause between rows", async () => {
    const user = userEvent.setup();
    let releaseFirstImport: (() => void) | undefined;
    let markFirstImportStarted: (() => void) | undefined;
    let importAttemptCount = 0;
    const firstImportStarted = new Promise<void>((resolve) => {
      markFirstImportStarted = resolve;
    });

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath === "/admin/partnership-crm/import-preview") {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{
            rowId: string;
            name?: string;
            category?: string;
            website?: string;
            country?: string;
            status?: string;
            contactName?: string;
            contactEmail?: string;
            contactLinkedIn?: string;
            notes?: string;
          }>;
        };
        return {
          rows: body.organizations.map((row) => ({
            rowId: row.rowId,
            organization: {
              name: row.name ?? "",
              category: row.category ?? "",
              website: row.website ?? "",
              country: row.country ?? "",
              status: "new",
              contactName: row.contactName ?? "",
              contactEmail: row.contactEmail ?? "",
              contactLinkedIn: row.contactLinkedIn ?? "",
              lastContactAt: null,
              notes: row.notes ?? "",
            },
            valid: true,
            errors: [],
            missingEmail: false,
            duplicateCandidates: [],
          })),
          summary: {
            total: body.organizations.length,
            valid: body.organizations.length,
            invalid: 0,
            missingEmail: 0,
            duplicates: 0,
          },
        };
      }

      if (stringPath === "/admin/partnership-crm/import") {
        importAttemptCount += 1;
        if (importAttemptCount === 1) {
          markFirstImportStarted?.();
          await new Promise<void>((resolve) => {
            releaseFirstImport = resolve;
          });
        }

        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ rowId: string }>;
        };
        return {
          results: body.organizations.map((row, index) => ({
            rowId: row.rowId,
            action: "created",
            organizationId: `imported-${importAttemptCount}-${index}`,
          })),
          summary: {
            total: body.organizations.length,
            created: body.organizations.length,
            updated: 0,
            skipped: 0,
            invalid: 0,
          },
        };
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }

      if (stringPath.startsWith("/admin/partnership-crm/professionals")) {
        return { professionals: [professional], nextCursor: undefined };
      }

      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = crmCsv(3);
    const file = new File([csv], "automatic-crm-import.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);
    await waitFor(() => {
      expect(within(dialog).getByText("CSV loaded")).toBeTruthy();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Start interactive download",
      }),
    );
    await waitFor(() => {
      expect(within(dialog).getByText("Row 1 of 3")).toBeTruthy();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Import remaining in sequence",
      }),
    );
    await firstImportStarted;
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Pause" })).toBeTruthy();
    });

    await user.click(within(dialog).getByRole("button", { name: "Pause" }));
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", {
          name: "Import remaining in sequence",
        }),
      ).toBeTruthy();
    });

    releaseFirstImport?.();
    await waitFor(() => {
      expect(within(dialog).getByText("Row 2 of 3")).toBeTruthy();
    });
    expect(crmImportCalls()).toHaveLength(1);
    expect(
      crmImportSession(),
    ).toEqual(
      expect.objectContaining({
        mode: "interactive",
        nextImportIndex: 1,
        status: "ready",
      }),
    );

    await user.click(
      within(dialog).getByRole("button", {
        name: "Import remaining in sequence",
      }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("CRM import finished")).toBeTruthy();
    });
    expect(crmPreviewCalls()).toHaveLength(3);
    expect(crmImportCalls()).toHaveLength(3);
    expect(
      crmImportSession(),
    ).toEqual(
      expect.objectContaining({
        mode: "interactive",
        nextImportIndex: 3,
        status: "completed",
        importSummary: expect.objectContaining({ created: 3 }),
      }),
    );
  });

  it("shows a copyable row-level diagnostic log when interactive import fails", async () => {
    const user = userEvent.setup();
    const requestError = Object.assign(new Error("Bad Request"), {
      status: 400,
      method: "POST",
      path: "/admin/partnership-crm/import",
      details: [
        "Request: POST /admin/partnership-crm/import",
        "Status: 400 Bad Request",
        'Response JSON:\n{"error":"Invalid category key","field":"category"}',
      ].join("\n\n"),
    });

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath === "/admin/partnership-crm/import-preview") {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{
            rowId: string;
            name?: string;
            category?: string;
            website?: string;
            country?: string;
            status?: string;
            contactName?: string;
            contactEmail?: string;
            contactLinkedIn?: string;
            notes?: string;
          }>;
        };
        return {
          rows: body.organizations.map((row) => ({
            rowId: row.rowId,
            organization: {
              name: row.name ?? "",
              category: row.category ?? "",
              website: row.website ?? "",
              country: row.country ?? "",
              status: "new",
              contactName: row.contactName ?? "",
              contactEmail: row.contactEmail ?? "",
              contactLinkedIn: row.contactLinkedIn ?? "",
              lastContactAt: null,
              notes: row.notes ?? "",
            },
            valid: true,
            errors: [],
            missingEmail: false,
            duplicateCandidates: [],
          })),
          summary: {
            total: body.organizations.length,
            valid: body.organizations.length,
            invalid: 0,
            missingEmail: 0,
            duplicates: 0,
          },
        };
      }

      if (stringPath === "/admin/partnership-crm/import") {
        throw requestError;
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }

      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = crmCsv(1);
    const file = new File([csv], "broken-crm-import.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);
    await waitFor(() => {
      expect(within(dialog).getByText("CSV loaded")).toBeTruthy();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Start interactive download",
      }),
    );
    await waitFor(() => {
      expect(within(dialog).getByText("Row 1 of 1")).toBeTruthy();
    });

    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(within(dialog).getByText("Import failed")).toBeTruthy();
    });
    expect(
      within(dialog).getByText(/Row 1 of 1 failed while committing the row/),
    ).toBeTruthy();
    expect(within(dialog).getByText("Rows already committed")).toBeTruthy();
    expect(within(dialog).getAllByText("0 / 1").length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole("button", { name: "Show log" }));

    const logBlock = dialog.querySelector("pre");
    expect(logBlock?.textContent).toContain("Parsed CSV row");
    expect(logBlock?.textContent).toContain("Genome Lab 1");
    expect(logBlock?.textContent).toContain("Invalid category key");
    expect(logBlock?.textContent).toContain("Request payload");

    await user.click(within(dialog).getByRole("button", { name: "Copy log" }));
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Copied" }),
      ).toBeTruthy();
    });
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Import error log",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Genome Lab 1",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Invalid category key",
    );
  });

  it("imports all rows sequentially while accepting every valid row", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = crmCsv(4);
    const file = new File([csv], "all-crm-import.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);
    await waitFor(() => {
      expect(screen.getAllByText("CSV loaded").length).toBeGreaterThan(0);
    });

    await user.click(within(dialog).getByRole("button", { name: "Import all" }));

    await waitFor(() => {
      expect(within(dialog).getByText("CRM import finished")).toBeTruthy();
    });
    expect(within(dialog).queryByLabelText("CSV file")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeTruthy();

    expect(crmPreviewCalls()).toHaveLength(4);
    expect(
      crmPreviewCalls().map(([, init]) => {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ rowId: string }>;
        };
        return body.organizations.map((row) => row.rowId);
      }),
    ).toEqual([["row-1"], ["row-2"], ["row-3"], ["row-4"]]);
    expect(crmImportCalls()).toHaveLength(4);
    expect(
      crmImportCalls().map(([, init]) => {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ rowId: string; duplicateAction: string }>;
        };
        return body.organizations;
      }),
    ).toEqual([
      [expect.objectContaining({ rowId: "row-1", duplicateAction: "import" })],
      [expect.objectContaining({ rowId: "row-2", duplicateAction: "import" })],
      [expect.objectContaining({ rowId: "row-3", duplicateAction: "import" })],
      [expect.objectContaining({ rowId: "row-4", duplicateAction: "import" })],
    ]);
    expect(
      crmImportSession(),
    ).toEqual(
      expect.objectContaining({
        mode: "all",
        previewedRows: 4,
        nextImportIndex: 4,
        status: "completed",
        importSummary: expect.objectContaining({ created: 4 }),
      }),
    );
  });

  it("opens CSV import rules with canonical CRM options", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import rules" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Import rules",
    });

    expect(
      within(dialog).getByText("Rules for CRM organization CSV imports."),
    ).toBeTruthy();
    expect(within(dialog).getByText("Required columns")).toBeTruthy();
    expect(within(dialog).getAllByText("name").length).toBeGreaterThan(0);
    expect(
      within(dialog).getByText("org_genetic_testing_laboratories"),
    ).toBeTruthy();
    expect(within(dialog).getByText("AR")).toBeTruthy();
    expect(within(dialog).getByText("new")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "CRM target imports preview and commit one row at a time with a browser checkpoint.",
      ),
    ).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Copied" }),
      ).toBeTruthy();
    });
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Header row: name,category,website,country,status,contact_name,email,linkedin,last_contact_at,notes",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "org_genetic_testing_laboratories",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "last_contact_at: Optional. Use a complete ISO datetime with an explicit timezone. Accepted: 2026-08-25T17:29:00.000Z or 2026-08-25T14:29:00-03:00.",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Example CSV",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "\"org_genetic_testing_laboratories,org_genomics_laboratories\"",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Cells with multiple category or country keys must be quoted",
    );
  });

  it("shows professional CSV import rules with outreach research columns", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("tab", { name: /Professionals/ }));
    await user.click(screen.getByRole("button", { name: "Import rules" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Import rules",
    });

    expect(
      within(dialog).getByText("Rules for CRM professional CSV imports."),
    ).toBeTruthy();
    expect(
      within(dialog).getAllByText("primary_affiliation").length,
    ).toBeGreaterThan(0);
    expect(
      within(dialog).getAllByText("potential_pocket_genes_editor_fit").length,
    ).toBeGreaterThan(0);
    expect(
      within(dialog).getAllByText("email_route").length,
    ).toBeGreaterThan(0);
    expect(
      within(dialog).getAllByText("linkedin_route").length,
    ).toBeGreaterThan(0);
    expect(
      within(dialog).getAllByText("research_basis").length,
    ).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Copied" }),
      ).toBeTruthy();
    });
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Header row: name,category,title,primary_affiliation,potential_pocket_genes_editor_fit,email_route,linkedin_route,research_basis,website,country,status,email,linkedin,last_contact_at,notes",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "last_contact_at: Optional. Use a complete ISO datetime with an explicit timezone. Accepted: 2026-08-25T17:29:00.000Z or 2026-08-25T14:29:00-03:00.",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Example CSV",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "\"pro_reproductive_specialists,pro_fertility_specialists\"",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Rejected: 2026-08-25 and 2026-08-25T14:29:00 because they do not include timezone.",
    );
  });
});
