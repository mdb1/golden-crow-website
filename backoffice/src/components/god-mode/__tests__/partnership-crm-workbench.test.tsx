/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PartnershipCrmWorkbench } from "@/components/god-mode/partnership-crm-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  PartnershipCrmOrganizationRecord,
  PartnershipCrmProfessionalRecord,
  PartnershipCrmTemplateRecord,
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
  is_favorite: false,
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
  is_favorite: false,
  normalizedName: "dra ada genome",
};

const emailTemplates: PartnershipCrmTemplateRecord[] = [
  {
    id: "tpl-1",
    schemaVersion: 1,
    name: "Lab intro",
    audience: "organizations",
    category: "org_genetic_testing_laboratories",
    subject: "First {{organization_name}}",
    body: "Body one for {{contact_name}}",
    status: "active",
    notes: "",
    is_favorite: false,
    normalizedName: "lab intro",
  },
  {
    id: "tpl-2",
    schemaVersion: 1,
    name: "Lab follow-up",
    audience: "organizations",
    category: "org_genetic_testing_laboratories",
    subject: "Second {{organization_name}}",
    body: "Body two for {{contact_name}}",
    status: "active",
    notes: "",
    is_favorite: false,
    normalizedName: "lab follow up",
  },
];

const recommendedEmailTemplate: PartnershipCrmTemplateRecord = {
  id: "tpl-recommended",
  schemaVersion: 1,
  name: "Recommended lab",
  audience: "organizations",
  category: "org_genomics_laboratories",
  subject: "Recommended {{organization_name}}",
  body: "Recommended body for {{contact_name}}",
  status: "active",
  notes: "",
  is_favorite: false,
  normalizedName: "recommended lab",
};

const otherCategoryEmailTemplate: PartnershipCrmTemplateRecord = {
  id: "tpl-other-category",
  schemaVersion: 1,
  name: "Other category",
  audience: "organizations",
  category: "org_fertility_clinics",
  subject: "Other category {{organization_name}}",
  body: "Other category body for {{contact_name}}",
  status: "active",
  notes: "",
  is_favorite: false,
  normalizedName: "other category",
};

const crossAudienceEmailTemplate: PartnershipCrmTemplateRecord = {
  id: "tpl-cross-audience",
  schemaVersion: 1,
  name: "Universal professional",
  audience: "professionals",
  category: "pro_other",
  subject: "Universal {{organization_name}}",
  body: "Universal body for {{contact_name}}",
  status: "active",
  notes: "",
  is_favorite: false,
  normalizedName: "universal professional",
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

function mockElementScrollIntoView() {
  const elementPrototype = Element.prototype as {
    scrollIntoView?: Element["scrollIntoView"];
  };
  const originalScrollIntoView = elementPrototype.scrollIntoView;
  const scrollIntoView = jest.fn();

  Object.defineProperty(elementPrototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });

  return {
    scrollIntoView,
    restore: () => {
      if (originalScrollIntoView) {
        Object.defineProperty(elementPrototype, "scrollIntoView", {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete elementPrototype.scrollIntoView;
      }
    },
  };
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

      if (String(path).startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
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

  it("shows favorite CRM organizations first with a yellow star cell", async () => {
    const favoriteOrganization: PartnershipCrmOrganizationRecord = {
      ...organization,
      id: "org-favorite",
      name: "Favorite Genetics",
      is_favorite: true,
      normalizedName: "favorite genetics",
    };

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      return {
        organizations: [organization, favoriteOrganization],
        nextCursor: undefined,
      };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByText("Favorite Genetics")).toBeTruthy();
    });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Favorite Genetics")).toBeTruthy();
    expect(within(rows[0]).getByRole("img", { name: "Favorite" })).toBeTruthy();
  });

  it("marks contacted and replied CRM rows in the favorite signal cell", async () => {
    const contactedOrganization: PartnershipCrmOrganizationRecord = {
      ...organization,
      id: "org-contacted",
      name: "Contacted Genetics",
      status: "contacted",
      normalizedName: "contacted genetics",
    };
    const repliedOrganization: PartnershipCrmOrganizationRecord = {
      ...organization,
      id: "org-replied",
      name: "Replied Genetics",
      status: "replied",
      normalizedName: "replied genetics",
    };

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }

      return {
        organizations: [contactedOrganization, repliedOrganization],
        nextCursor: undefined,
      };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByText("Contacted Genetics")).toBeTruthy();
      expect(screen.getByText("Replied Genetics")).toBeTruthy();
    });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const contactedRow = rows.find((row) =>
      within(row).queryByText("Contacted Genetics"),
    );
    const repliedRow = rows.find((row) =>
      within(row).queryByText("Replied Genetics"),
    );

    expect(contactedRow).toBeTruthy();
    expect(repliedRow).toBeTruthy();

    const sentSignal = within(contactedRow as HTMLElement).getByRole("img", {
      name: "Email sent",
    });
    expect(sentSignal.closest("[data-slot='table-cell']")?.className).toContain(
      "bg-amber-50",
    );

    const replySignal = within(repliedRow as HTMLElement).getByRole("img", {
      name: "Reply received",
    });
    expect(replySignal.closest("[data-slot='table-cell']")?.className).toContain(
      "bg-emerald-50",
    );
  });

  it("deletes multiple selected organizations from the list", async () => {
    const user = userEvent.setup();
    const batchOrganizations: PartnershipCrmOrganizationRecord[] = [
      organization,
      {
        ...organization,
        id: "org-2",
        name: "Batch Delete Genetics",
        contactEmail: "batch@example.org",
        normalizedName: "batch delete genetics",
      },
      {
        ...organization,
        id: "org-3",
        name: "Keep Me Genetics",
        contactEmail: "keep@example.org",
        normalizedName: "keep me genetics",
      },
    ];
    const deletedIds = new Set<string>();

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (init?.method === "DELETE") {
        const deletedId = decodeURIComponent(stringPath.split("/").pop() ?? "");
        deletedIds.add(deletedId);
        return { deleted: true, organizationId: deletedId };
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      return {
        organizations: batchOrganizations.filter(
          (entry) => !deletedIds.has(entry.id),
        ),
        nextCursor: undefined,
      };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByText("Batch Delete Genetics")).toBeTruthy();
    });

    await user.click(screen.getByLabelText("Select Delete Me Genomics"));
    await user.click(screen.getByLabelText("Select Batch Delete Genetics"));

    expect(screen.queryByRole("button", { name: "Send Email" })).toBeNull();
    expect(screen.getByText("2 organizations selected")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete selected CRM organizations",
    });
    expect(within(dialog).getByText("Delete Me Genomics")).toBeTruthy();
    expect(within(dialog).getByText("Batch Delete Genetics")).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByText("Delete Me Genomics")).toBeNull();
      expect(screen.queryByText("Batch Delete Genetics")).toBeNull();
      expect(screen.getByText("Keep Me Genetics")).toBeTruthy();
    });
    expect(routerRefresh).toHaveBeenCalledTimes(1);
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations/org-1",
      { method: "DELETE" },
    );
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations/org-2",
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

  it("moves the selected CRM row with up and down arrow keys", async () => {
    const user = userEvent.setup();
    const { scrollIntoView, restore } = mockElementScrollIntoView();
    const visibleOrganizations: PartnershipCrmOrganizationRecord[] = [
      {
        ...organization,
        id: "org-keyboard-1",
        name: "First Keyboard Genetics",
        normalizedName: "first keyboard genetics",
      },
      {
        ...organization,
        id: "org-keyboard-2",
        name: "Second Keyboard Genetics",
        normalizedName: "second keyboard genetics",
      },
      {
        ...organization,
        id: "org-keyboard-3",
        name: "Third Keyboard Genetics",
        normalizedName: "third keyboard genetics",
      },
    ];

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }

      return {
        organizations: visibleOrganizations,
        nextCursor: undefined,
      };
    });

    try {
      renderWorkbench();

      await waitFor(() => {
        expect(screen.getByText("First Keyboard Genetics")).toBeTruthy();
        expect(screen.getByText("Second Keyboard Genetics")).toBeTruthy();
        expect(screen.getByText("Third Keyboard Genetics")).toBeTruthy();
      });

      await user.click(screen.getByText("First Keyboard Genetics"));
      await waitFor(() => {
        expect(screen.getAllByText("First Keyboard Genetics")).toHaveLength(2);
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "nearest",
          inline: "nearest",
        });
      });
      scrollIntoView.mockClear();

      fireEvent.keyDown(window, { key: "ArrowDown" });
      await waitFor(() => {
        expect(screen.getAllByText("Second Keyboard Genetics")).toHaveLength(2);
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "nearest",
          inline: "nearest",
        });
      });
      expect(screen.getAllByText("First Keyboard Genetics")).toHaveLength(1);
      scrollIntoView.mockClear();

      fireEvent.keyDown(window, { key: "ArrowDown" });
      await waitFor(() => {
        expect(screen.getAllByText("Third Keyboard Genetics")).toHaveLength(2);
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "nearest",
          inline: "nearest",
        });
      });
      expect(screen.getAllByText("Second Keyboard Genetics")).toHaveLength(1);
      scrollIntoView.mockClear();

      fireEvent.keyDown(window, { key: "ArrowUp" });
      await waitFor(() => {
        expect(screen.getAllByText("Second Keyboard Genetics")).toHaveLength(2);
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "nearest",
          inline: "nearest",
        });
      });
      expect(screen.getAllByText("Third Keyboard Genetics")).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it("opens the CRM email composer with Enter when the detail panel is open", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send Email" })).toBeTruthy();
    });

    fireEvent.keyDown(window, { key: "Enter" });

    expect(
      await screen.findByRole("dialog", { name: "Send CRM email" }),
    ).toBeTruthy();
  });

  it("shows a keyboard-adjustable CRM detail panel separator", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    expect(
      screen.queryByRole("separator", { name: "Resize CRM detail panel" }),
    ).toBeNull();

    await user.click(screen.getByText("Delete Me Genomics"));

    const separator = await screen.findByRole("separator", {
      name: "Resize CRM detail panel",
    });
    expect(screen.getByTestId("crm-split-pane").className).toContain(
      "overflow-hidden",
    );
    expect(screen.getByTestId("crm-list-panel").className).toContain(
      "overflow-y-auto",
    );
    expect(screen.getByTestId("crm-list-panel").className).toContain(
      "overscroll-auto",
    );
    expect(screen.getByTestId("crm-list-panel").className).not.toContain(
      "overscroll-contain",
    );
    expect(screen.getByTestId("crm-detail-panel").className).toContain(
      "overflow-y-auto",
    );
    expect(screen.getByTestId("crm-detail-panel").className).toContain(
      "overscroll-auto",
    );
    expect(screen.getByTestId("crm-detail-panel").className).not.toContain(
      "overscroll-contain",
    );
    expect(separator.className).toContain("self-stretch");
    expect(separator.getAttribute("aria-valuenow")).toBe("50");

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator.getAttribute("aria-valuenow")).toBe("54");

    fireEvent.keyDown(separator, { key: "End" });
    expect(separator.getAttribute("aria-valuenow")).toBe("67");

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator.getAttribute("aria-valuenow")).toBe("33");
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

  it("opens a global modal with sent CRM emails and plantilla metadata", async () => {
    const user = userEvent.setup();

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return {
          emails: [
            {
              id: "email-1",
              targetKind: "organizations",
              targetId: "org-1",
              targetName: "Genome Lab",
              from: "federico@goldencrowvs.com",
              to: "ada@genomelab.example",
              subject: "Pocket Genes + Genome Lab",
              body: "Hola Ada,\n\nTe escribo sobre Pocket Genes.",
              sentAt: "2026-09-01T12:00:00.000Z",
              createdByEmail: "owner@example.org",
              templateId: "tpl-1",
              templateName: "Lab outreach",
            },
          ],
          nextCursor: undefined,
        };
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }

      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "All emails sent" }));

    const dialog = await screen.findByRole("dialog", {
      name: "All emails sent",
    });
    await waitFor(() => {
      expect(
        within(dialog).getByText("Pocket Genes + Genome Lab"),
      ).toBeTruthy();
    });

    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/sent-email-log?limit=20",
    );
    expect(within(dialog).getByText("Lab outreach")).toBeTruthy();
    expect(within(dialog).getByText("Genome Lab")).toBeTruthy();
    expect(within(dialog).getByText("ada@genomelab.example")).toBeTruthy();
    expect(
      within(dialog).getByText(/Te escribo sobre Pocket Genes/),
    ).toBeTruthy();
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
    expect(within(dialog).queryByText("Preview")).toBeNull();
    expect(within(dialog).queryByText("Draft")).toBeNull();

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

  it("cycles CRM email templates with footer arrows and keyboard arrows", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: emailTemplates, nextCursor: undefined };
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
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
    await user.click(screen.getByRole("button", { name: "Send Email" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(dialog);
    });
    expect(document.activeElement).not.toBe(
      within(dialog).getByDisplayValue("federico@goldencrowvs.com"),
    );

    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("First Delete Me Genomics");
    });
    expect(
      (within(dialog).getByLabelText("Message") as HTMLTextAreaElement).value,
    ).toBe("Body one for Ada");

    await user.click(
      within(dialog).getByRole("button", { name: "Next template" }),
    );
    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("Second Delete Me Genomics");
    });
    expect(
      (within(dialog).getByLabelText("Message") as HTMLTextAreaElement).value,
    ).toBe("Body two for Ada");

    fireEvent.keyDown(dialog, { key: "ArrowUp" });
    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("First Delete Me Genomics");
    });

    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("Second Delete Me Genomics");
    });

    fireEvent.keyDown(dialog, { key: "Enter" });
    await waitFor(() => {
      expect(within(dialog).getByText("Ready to send")).toBeTruthy();
    });
  });

  it("recommends matching templates while allowing any active template selection", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        if (stringPath.includes("cursor=")) {
          return {
            templates: [crossAudienceEmailTemplate],
            nextCursor: undefined,
          };
        }

        return {
          templates: [otherCategoryEmailTemplate, recommendedEmailTemplate],
          nextCursor: "2026-09-01T12:00:00.000Z",
        };
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
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
    await user.click(screen.getByRole("button", { name: "Send Email" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });

    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("Recommended Delete Me Genomics");
    });
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/templates?status=active&limit=50",
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Load more templates" }),
    );
    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        expect.stringContaining("cursor=2026-09-01T12%3A00%3A00.000Z"),
      );
    });

    await user.click(within(dialog).getByRole("combobox"));

    expect(await screen.findByText("Recommended templates")).toBeTruthy();
    expect(screen.getByText("Other templates")).toBeTruthy();

    await user.click(
      await screen.findByRole("option", { name: "Universal professional" }),
    );

    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("Universal Delete Me Genomics");
    });
    expect(
      (within(dialog).getByLabelText("Message") as HTMLTextAreaElement).value,
    ).toBe("Universal body for Ada");
  });

  it("overwrites and favorites the selected CRM email template from the composer", async () => {
    const user = userEvent.setup();
    let savedTemplates: PartnershipCrmTemplateRecord[] = [
      {
        ...recommendedEmailTemplate,
        is_favorite: false,
      },
      emailTemplates[1],
    ];
    const updatePayloads: unknown[] = [];

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath.startsWith("/admin/partnership-crm/templates/") &&
        init?.method === "DELETE"
      ) {
        const templateId = decodeURIComponent(
          stringPath.split("/").at(-1) ?? "",
        );
        savedTemplates = savedTemplates.filter(
          (template) => template.id !== templateId,
        );

        return { deleted: true, templateId };
      }

      if (
        stringPath.startsWith("/admin/partnership-crm/templates/") &&
        init?.method === "PUT"
      ) {
        const payload = JSON.parse(String(init.body));
        updatePayloads.push(payload);
        const templateId = decodeURIComponent(
          stringPath.split("/").at(-1) ?? "",
        );
        savedTemplates = savedTemplates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                ...payload,
                id: template.id,
                schemaVersion: template.schemaVersion,
              }
            : template,
        );

        return {
          template:
            savedTemplates.find((template) => template.id === templateId) ??
            savedTemplates[0],
        };
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: savedTemplates, nextCursor: undefined };
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
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
    await user.click(screen.getByRole("button", { name: "Send Email" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    const messageInput = await within(dialog).findByLabelText("Message");

    fireEvent.change(messageInput, {
      target: {
        value: "Reusable edited template body for Delete Me Genomics.",
      },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Overwrite template" }),
    );

    await waitFor(() => {
      expect(updatePayloads).toHaveLength(1);
    });
    await waitFor(() => {
      expect(within(dialog).getByText("Template overwritten.")).toBeTruthy();
    });
    expect(updatePayloads[0]).toEqual(
      expect.objectContaining({
        name: "Recommended lab",
        subject: "Recommended {{organization_name}}",
        body: "Reusable edited template body for {{organization_name}}.",
        is_favorite: false,
      }),
    );
    expect(routerRefresh).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Mark as favorite" }),
    );

    await waitFor(() => {
      expect(updatePayloads).toHaveLength(2);
    });
    expect(updatePayloads[1]).toEqual(
      expect.objectContaining({
        body: "Reusable edited template body for {{organization_name}}.",
        is_favorite: true,
      }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Unmark as favorite" }),
      ).toHaveProperty("disabled", false);
      expect(
        within(dialog).getByText("Template marked as favorite."),
      ).toBeTruthy();
    });
    expect(routerRefresh).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Unmark as favorite" }),
    );

    await waitFor(() => {
      expect(updatePayloads).toHaveLength(3);
    });
    expect(updatePayloads[2]).toEqual(
      expect.objectContaining({
        body: "Reusable edited template body for {{organization_name}}.",
        is_favorite: false,
      }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Mark as favorite" }),
      ).toHaveProperty("disabled", false);
    });
    expect(routerRefresh).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Lab follow-up" }),
    );

    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("Second Delete Me Genomics");
    });

    await user.click(
      within(dialog).getByRole("button", { name: "Delete template" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Template deleted.")).toBeTruthy();
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("Recommended Delete Me Genomics");
    });
    expect(savedTemplates.map((template) => template.id)).toEqual([
      "tpl-recommended",
    ]);
    expect(routerRefresh).not.toHaveBeenCalled();
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
    expect(
      screen.getByRole("button", { name: "Add Professional" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit CRM professional",
    });
    const fieldValue = (label: string) =>
      (
        within(dialog).getByLabelText(label) as
          HTMLInputElement | HTMLTextAreaElement
      ).value;

    expect(fieldValue("Primary affiliation")).toBe("Genome Lab");
    expect(fieldValue("Potential Pocket Genes editor fit")).toBe(
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

  it("shows cumulative funnel status metrics from all records matching the filters", async () => {
    const visibleNewRows = Array.from({ length: 50 }, (_, index) => ({
      ...organization,
      id: `org-visible-${index + 1}`,
      name: `Genome Page Row ${index + 1}`,
      normalizedName: `genome page row ${index + 1}`,
      status: "new" as const,
    }));

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }

      return {
        organizations: visibleNewRows,
        nextCursor: "cursor-2",
        statusCounts: {
          new: 241,
          contacted: 5,
          replied: 0,
          meeting: 2,
          partner: 0,
          no_response: 0,
          not_interested: 0,
          not_a_fit: 0,
        },
      };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByText("Genome Page Row 1")).toBeTruthy();
    });

    expect(
      within(screen.getByRole("button", { name: /New\s+248/ })).getByText(
        "248",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Contacted\s+7/ })).getByText(
        "7",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Replied\s+2/ })).getByText(
        "2",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Meeting\s+2/ })).getByText(
        "2",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Partner\s+0/ })).getByText(
        "0",
      ),
    ).toBeTruthy();
  });

  it("opens visual filters and applies selected pie-slice filters together", async () => {
    const user = userEvent.setup();
    const listPaths: string[] = [];

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/templates")) {
        return { templates: [], nextCursor: undefined };
      }

      if (
        stringPath.startsWith(
          "/admin/partnership-crm/organizations/visual-filters",
        )
      ) {
        return {
          targetKind: "organizations",
          facets: {
            status: {
              key: "status",
              total: 16,
              buckets: [
                { value: "new", count: 8 },
                { value: "partner", count: 1 },
                { value: "meeting", count: 2 },
                { value: "no_response", count: 1 },
                { value: "contacted", count: 2 },
                { value: "replied", count: 2 },
              ],
            },
            category: {
              key: "category",
              total: 21,
              buckets: [
                { value: "org_genomics_laboratories", count: 7 },
                { value: "org_genetic_testing_laboratories", count: 5 },
                { value: "org_molecular_diagnostics_laboratories", count: 4 },
                { value: "org_reproductive_genetics_laboratories", count: 2 },
                { value: "__no_category__", count: 1 },
                { value: "org_prenatal_genetics_laboratories", count: 1 },
                { value: "org_nipt_providers", count: 1 },
              ],
            },
            country: {
              key: "country",
              total: 10,
              buckets: [
                { value: "__no_country__", count: 4 },
                { value: "AR", count: 6 },
              ],
            },
            linkedInState: {
              key: "linkedInState",
              total: 10,
              buckets: [
                { value: "missing_linkedin", count: 1 },
                { value: "has_linkedin", count: 9 },
              ],
            },
          },
        };
      }

      if (stringPath.startsWith("/admin/partnership-crm/organizations")) {
        listPaths.push(stringPath);
      }

      return {
        organizations: [organization],
        nextCursor: undefined,
        statusCounts: {
          new: 8,
          contacted: 2,
          replied: 0,
          meeting: 0,
          partner: 0,
          no_response: 0,
          not_interested: 0,
          not_a_fit: 0,
        },
      };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByText("Delete Me Genomics")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Visual filters" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Visual filters",
    });
    await waitFor(() => {
      expect(within(dialog).getByText("Status")).toBeTruthy();
      expect(within(dialog).getByText("CRM Contacted")).toBeTruthy();
      expect(within(dialog).getByText("Genomics Laboratory")).toBeTruthy();
      expect(within(dialog).getByText("No country")).toBeTruthy();
    });
    const statusSection = within(dialog)
      .getByText("Status")
      .closest("section");
    expect(statusSection).toBeTruthy();
    expect(within(statusSection as HTMLElement).queryByText("CRM No Response"))
      .toBeNull();
    const statusPieSegments = within(statusSection as HTMLElement).getAllByRole(
      "button",
      {
        name: /^Select visual filter from pie: Status -/,
      },
    );
    expect(statusPieSegments[0].getAttribute("fill")).toBe("var(--chart-1)");
    expect(statusPieSegments[0].getAttribute("stroke")).toBe(
      "var(--background)",
    );
    expect(statusPieSegments[0].getAttribute("vector-effect")).toBe(
      "non-scaling-stroke",
    );
    expect(statusPieSegments).toHaveLength(6);
    expect(statusPieSegments[5].getAttribute("fill")).toBe(
      "color-mix(in srgb, var(--chart-1) 74%, var(--foreground))",
    );
    expect(
      statusPieSegments.map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Select visual filter from pie: Status - CRM New",
      "Select visual filter from pie: Status - CRM Meeting",
      "Select visual filter from pie: Status - CRM Contacted",
      "Select visual filter from pie: Status - CRM Replied",
      "Select visual filter from pie: Status - CRM Partner",
      "Select visual filter from pie: Status - CRM No Response",
    ]);
    expect(
      within(statusSection as HTMLElement)
        .getAllByRole("button", {
          name: /^Select visual filter from legend: Status -/,
        })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Select visual filter from legend: Status - CRM New",
      "Select visual filter from legend: Status - CRM Meeting",
      "Select visual filter from legend: Status - CRM Contacted",
      "Select visual filter from legend: Status - CRM Replied",
      "Select visual filter from legend: Status - CRM Partner",
    ]);
    expect(
      within(statusSection as HTMLElement).queryByRole("button", {
        name: "Select visual filter from legend: Status - CRM No Response",
      }),
    ).toBeNull();

    const selectedStatusBlock = within(
      statusSection as HTMLElement,
    ).getByRole("group", {
      name: "Selected segment: Status",
    });
    await user.click(
      within(statusSection as HTMLElement).getByRole("button", {
        name: "See more",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Select visual filter from legend: Status - CRM No Response",
      }),
    );
    expect(within(selectedStatusBlock).getByText("CRM No Response")).toBeTruthy();

    const categorySection = within(dialog)
      .getByText("Category")
      .closest("section");
    expect(categorySection).toBeTruthy();
    const categoryPieSegments = within(
      categorySection as HTMLElement,
    ).getAllByRole("button", {
      name: /^Select visual filter from pie: Category -/,
    });
    expect(categoryPieSegments).toHaveLength(7);
    expect(
      categoryPieSegments.map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Select visual filter from pie: Category - Genomics Laboratory",
      "Select visual filter from pie: Category - Genetic Testing Laboratory",
      "Select visual filter from pie: Category - Molecular Diagnostics Laboratory",
      "Select visual filter from pie: Category - Reproductive Genetics Laboratory",
      "Select visual filter from pie: Category - No category",
      "Select visual filter from pie: Category - Prenatal Genetics Laboratory",
      "Select visual filter from pie: Category - NIPT Provider",
    ]);
    expect(
      within(categorySection as HTMLElement)
        .getAllByRole("button", {
          name: /^Select visual filter from legend: Category -/,
        })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Select visual filter from legend: Category - Genomics Laboratory",
      "Select visual filter from legend: Category - Genetic Testing Laboratory",
      "Select visual filter from legend: Category - Molecular Diagnostics Laboratory",
      "Select visual filter from legend: Category - Reproductive Genetics Laboratory",
      "Select visual filter from legend: Category - No category",
    ]);
    await user.click(
      within(categorySection as HTMLElement).getByRole("button", {
        name: "See more",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Select visual filter from legend: Category - Prenatal Genetics Laboratory",
      }),
    );
    const selectedCategoryBlock = within(
      categorySection as HTMLElement,
    ).getByRole("group", {
      name: "Selected segment: Category",
    });
    expect(
      within(selectedCategoryBlock).getByText("Prenatal Genetics Laboratory"),
    ).toBeTruthy();

    const countrySection = within(dialog).getByText("Country").closest("section");
    expect(countrySection).toBeTruthy();
    expect(
      within(countrySection as HTMLElement)
        .getAllByRole("button", {
          name: /^Select visual filter from legend: Country -/,
        })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Select visual filter from legend: Country - Argentina (AR)",
      "Select visual filter from legend: Country - No country",
    ]);

    const linkedInSection = within(dialog)
      .getByText("LinkedIn availability")
      .closest("section");
    expect(linkedInSection).toBeTruthy();
    expect(
      within(linkedInSection as HTMLElement)
        .getAllByRole("button", {
          name: /^Select visual filter from legend: LinkedIn availability -/,
        })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Select visual filter from legend: LinkedIn availability - Has LinkedIn",
      "Select visual filter from legend: LinkedIn availability - Missing LinkedIn",
    ]);

    await user.click(
      within(dialog).getByRole("button", {
        name: "Select visual filter from pie: Status - CRM Contacted",
      }),
    );

    expect(within(selectedStatusBlock).getByText("CRM Contacted")).toBeTruthy();
    expect(
      within(statusSection as HTMLElement)
        .getByRole("button", {
          name: "Select visual filter from pie: Status - CRM Contacted",
        })
        .getAttribute("stroke"),
    ).toBe("var(--foreground)");
    expect(statusPieSegments[0].getAttribute("class")).toContain("opacity-55");
    expect(
      screen.getByRole("dialog", { name: "Visual filters" }),
    ).toBeTruthy();
    expect(listPaths).not.toContain(
      "/admin/partnership-crm/organizations?limit=50&status=contacted",
    );

    const clearAllFiltersButton = within(dialog).getByRole("button", {
      name: "Clear all filters",
    });
    await user.click(clearAllFiltersButton);
    expect(
      within(selectedStatusBlock).getByText("No segment selected"),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Apply" }),
    ).toHaveProperty("disabled", true);
    expect(
      within(statusSection as HTMLElement)
        .getByRole("button", {
          name: "Select visual filter from pie: Status - CRM Contacted",
        })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(listPaths).not.toContain(
      "/admin/partnership-crm/organizations?limit=50&status=contacted",
    );

    await user.click(
      within(dialog).getByRole("button", {
        name: "Select visual filter from pie: Status - CRM Contacted",
      }),
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Select visual filter from legend: Category - No category",
      }),
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Select visual filter from legend: LinkedIn availability - Missing LinkedIn",
      }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Visual filters" }),
      ).toBeNull();
    });
    await waitFor(() => {
      expect(listPaths).toContain(
        "/admin/partnership-crm/organizations?limit=50&status=contacted&category=__no_category__&linkedInState=missing_linkedin",
      );
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
      "name,category,website,country,contact_name,email,linkedin,status,is_favorite,notes",
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
          rowNumber === 1 ? "true" : "false",
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
    expect(crmImportSession()).toEqual(
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
      expect(
        within(dialog).getByText("Skipped during interactive review."),
      ).toBeTruthy();
    });
    expect(crmImportCalls()).toHaveLength(1);
    expect(crmImportSession()).toEqual(
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
    expect(crmImportSession()).toEqual(
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
      expect(
        within(dialog).getByRole("button", { name: "Pause" }),
      ).toBeTruthy();
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
    expect(crmImportSession()).toEqual(
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
    expect(crmImportSession()).toEqual(
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

    await user.click(
      within(dialog).getByRole("button", { name: "Import all" }),
    );

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
    expect(crmImportSession()).toEqual(
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
      "Header row: name,category,website,country,status,is_favorite,contact_name,email,linkedin,last_contact_at,notes",
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
      '"org_genetic_testing_laboratories,org_genomics_laboratories"',
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
    expect(within(dialog).getAllByText("email_route").length).toBeGreaterThan(
      0,
    );
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
      "Header row: name,category,title,primary_affiliation,potential_pocket_genes_editor_fit,email_route,linkedin_route,research_basis,website,country,status,is_favorite,email,linkedin,last_contact_at,notes",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "last_contact_at: Optional. Use a complete ISO datetime with an explicit timezone. Accepted: 2026-08-25T17:29:00.000Z or 2026-08-25T14:29:00-03:00.",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Example CSV",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      '"pro_reproductive_specialists,pro_fertility_specialists"',
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Rejected: 2026-08-25 and 2026-08-25T14:29:00 because they do not include timezone.",
    );
  });
});
