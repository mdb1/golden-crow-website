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
  affiliation: "Genome Lab",
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
    expect(screen.getAllByText("ada@genomelab.example").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole("button", { name: "Add Professional" })).toBeTruthy();
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

      return { organizations: [], nextCursor: undefined };
    });
  });

  it("previews and imports a large CSV in persisted chunks", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = [
      "name,category,website,country,contact_name,email,linkedin,status,notes",
      ...Array.from({ length: 205 }, (_, index) => {
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

    const file = new File([csv], "large-crm-import.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(screen.getAllByText("Ready to import").length).toBeGreaterThan(0);
    });
    const previewCalls = jest
      .mocked(sdkFetch)
      .mock.calls.filter(
        ([path]) => path === "/admin/partnership-crm/import-preview",
      );
    expect(previewCalls).toHaveLength(3);
    expect(
      previewCalls.map(([, init]) => {
        const body = JSON.parse(String(init?.body)) as {
          organizations: unknown[];
        };
        return body.organizations.length;
      }),
    ).toEqual([100, 100, 5]);
    expect(
      JSON.parse(
        window.localStorage.getItem(
          "golden-crow:partnership-crm-import-session:v1",
        ) ?? "{}",
      ),
    ).toEqual(expect.objectContaining({ previewedRows: 205, status: "ready" }));

    await user.click(
      within(dialog).getByRole("button", { name: /Import 205 rows/ }),
    );

    await waitFor(() => {
      expect(screen.getAllByText("Import completed").length).toBeGreaterThan(0);
    });
    const importCalls = jest
      .mocked(sdkFetch)
      .mock.calls.filter(([path]) => path === "/admin/partnership-crm/import");
    expect(importCalls).toHaveLength(3);
    expect(
      importCalls.map(([, init]) => {
        const body = JSON.parse(String(init?.body)) as {
          organizations: unknown[];
        };
        return body.organizations.length;
      }),
    ).toEqual([100, 100, 5]);
    expect(
      JSON.parse(
        window.localStorage.getItem(
          "golden-crow:partnership-crm-import-session:v1",
        ) ?? "{}",
      ),
    ).toEqual(
      expect.objectContaining({
        nextImportIndex: 205,
        status: "completed",
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
        "CRM target imports preview and commit in 100-row chunks with a browser checkpoint.",
      ),
    ).toBeTruthy();
  });
});
