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
import type { ReactNode } from "react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  PartnershipCrmTemplateBrowser,
  PartnershipCrmTemplateWorkbench,
} from "@/components/god-mode/partnership-crm-templates-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  PartnershipCrmTemplateInput,
  PartnershipCrmTemplateRecord,
} from "@/lib/partnership-crm";

const routerPush = jest.fn();
const routerRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

jest.setTimeout(15000);

const template: PartnershipCrmTemplateRecord = {
  id: "tpl-1",
  schemaVersion: 1,
  name: "Lab outreach",
  audience: "organizations",
  category: "lab",
  subject: "Pocket Genes + {{organization_name}}",
  body: "Hola {{contact_name}}",
  status: "active",
  notes: "Primary lab template.",
  is_favorite: false,
  normalizedName: "lab outreach",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

function renderWithProviders(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        {children}
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("PartnershipCrmTemplateBrowser", () => {
  beforeEach(() => {
    jest.mocked(sdkFetch).mockReset();
    routerPush.mockClear();
    routerRefresh.mockClear();
  });

  it("uses the normalized CRM category picker and displays canonical categories", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      templates: [template],
      nextCursor: undefined,
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Lab outreach")).toBeTruthy();
    });

    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/templates?limit=20&audience=organizations",
    );
    expect(screen.getByText("All categories")).toBeTruthy();
    expect(screen.getByText("Genetic Testing Laboratory")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Category")).toBeNull();
  });

  it("shows favorite templates first with a yellow star cell", async () => {
    const favoriteTemplate: PartnershipCrmTemplateRecord = {
      ...template,
      id: "tpl-favorite",
      name: "Favorite outreach",
      is_favorite: true,
      normalizedName: "favorite outreach",
    };

    jest.mocked(sdkFetch).mockResolvedValue({
      templates: [template, favoriteTemplate],
      nextCursor: undefined,
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Favorite outreach")).toBeTruthy();
    });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Favorite outreach")).toBeTruthy();
    expect(within(rows[0]).getByRole("img", { name: "Favorite" })).toBeTruthy();
  });

  it("selects and deletes multiple templates from the list", async () => {
    const user = userEvent.setup();
    const secondTemplate: PartnershipCrmTemplateRecord = {
      ...template,
      id: "tpl-2",
      name: "Foundation outreach",
      subject: "Pocket Genes para {{organization_name}}",
      normalizedName: "foundation outreach",
    };

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath.startsWith("/admin/partnership-crm/templates/") &&
        init?.method === "DELETE"
      ) {
        return {
          deleted: true,
          templateId: stringPath.split("/").at(-1),
        };
      }

      return {
        templates: [template, secondTemplate],
        nextCursor: undefined,
      };
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Foundation outreach")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("checkbox", { name: "Select all visible templates" }),
    );
    expect(screen.getByText("2 templates selected")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    const deleteDialog = await screen.findByRole("dialog", {
      name: "Delete selected templates",
    });
    expect(within(deleteDialog).getByText("Lab outreach")).toBeTruthy();
    expect(within(deleteDialog).getByText("Foundation outreach")).toBeTruthy();

    await user.click(
      within(deleteDialog).getByRole("button", { name: "Delete selected" }),
    );

    await waitFor(() => {
      const deleteCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(([, init]) => init?.method === "DELETE");
      expect(deleteCalls).toHaveLength(2);
    });

    expect(jest.mocked(sdkFetch)).toHaveBeenCalledWith(
      "/admin/partnership-crm/templates/tpl-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(jest.mocked(sdkFetch)).toHaveBeenCalledWith(
      "/admin/partnership-crm/templates/tpl-2",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("marks multiple selected templates as favorite and not favorite", async () => {
    const user = userEvent.setup();
    let templates: PartnershipCrmTemplateRecord[] = [
      template,
      {
        ...template,
        id: "tpl-2",
        name: "Foundation outreach",
        subject: "Pocket Genes para {{organization_name}}",
        normalizedName: "foundation outreach",
      },
    ];

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath.startsWith("/admin/partnership-crm/templates/") &&
        init?.method === "PUT"
      ) {
        const templateId = decodeURIComponent(
          stringPath.split("/").pop() ?? "",
        );
        const body = JSON.parse(
          String(init.body),
        ) as PartnershipCrmTemplateInput;
        const currentTemplate = templates.find(
          (entry) => entry.id === templateId,
        );

        if (!currentTemplate) {
          throw new Error("Missing test template");
        }

        const updatedTemplate = {
          ...currentTemplate,
          ...body,
          id: currentTemplate.id,
          is_favorite: Boolean(body.is_favorite),
        };
        templates = templates.map((entry) =>
          entry.id === templateId ? updatedTemplate : entry,
        );

        return { template: updatedTemplate };
      }

      return {
        templates,
        nextCursor: undefined,
      };
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Foundation outreach")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("checkbox", { name: "Select all visible templates" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Mark selected as favorite" }),
    );

    await waitFor(() => {
      const putCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(([, init]) => init?.method === "PUT");
      expect(putCalls).toHaveLength(2);
      for (const [, init] of putCalls) {
        expect(JSON.parse(String(init?.body))).toEqual(
          expect.objectContaining({ is_favorite: true }),
        );
      }
    });

    await user.click(
      screen.getByRole("button", { name: "Mark selected as not favorite" }),
    );

    await waitFor(() => {
      const putCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(([, init]) => init?.method === "PUT");
      expect(putCalls).toHaveLength(4);
      for (const [, init] of putCalls.slice(-2)) {
        expect(JSON.parse(String(init?.body))).toEqual(
          expect.objectContaining({ is_favorite: false }),
        );
      }
    });
  });

  it("opens a right preview panel, orders preview content, and supports panel actions", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath === "/admin/partnership-crm/templates/tpl-1" &&
        init?.method === "PUT"
      ) {
        const body = JSON.parse(
          String(init.body),
        ) as PartnershipCrmTemplateInput;

        return {
          template: {
            ...template,
            ...body,
            id: template.id,
            is_favorite: Boolean(body.is_favorite),
          },
        };
      }

      return {
        templates: [template],
        nextCursor: undefined,
      };
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Lab outreach")).toBeTruthy();
    });

    await user.click(screen.getByText("Lab outreach"));

    const panel = await screen.findByTestId("template-preview-panel");
    const separator = await screen.findByRole("separator", {
      name: "Resize template preview panel",
    });
    expect(screen.getByTestId("crm-template-split-pane").className).toContain(
      "overflow-hidden",
    );
    expect(separator.className).toContain("self-stretch");
    expect(separator.getAttribute("aria-valuenow")).toBe("50");

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator.getAttribute("aria-valuenow")).toBe("54");

    fireEvent.keyDown(separator, { key: "End" });
    expect(separator.getAttribute("aria-valuenow")).toBe("67");

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator.getAttribute("aria-valuenow")).toBe("33");

    const panelText = panel.textContent ?? "";
    expect(panelText.indexOf("Preview")).toBeLessThan(
      panelText.indexOf("Template fit"),
    );
    expect(panelText.indexOf("Variables")).toBeGreaterThan(
      panelText.indexOf("Template fit"),
    );
    expect(within(panel).getByText("Template fit")).toBeTruthy();
    expect(within(panel).getByText("Variables")).toBeTruthy();
    expect(within(panel).getByText("Hola Contacto")).toBeTruthy();
    const variablesBlock = within(panel).getByTestId(
      "template-preview-variables",
    );
    expect(
      within(variablesBlock).getByText("{{organization_name}}"),
    ).toBeTruthy();
    expect(within(variablesBlock).getByText("{{contact_name}}")).toBeTruthy();
    expect(within(variablesBlock).queryByText("{{website}}")).toBeNull();
    expect(
      within(variablesBlock).queryByText("{{website_sentence}}"),
    ).toBeNull();
    expect(within(variablesBlock).queryByText("Not used")).toBeNull();
    const panelTitle = within(panel).getByTestId(
      "template-preview-panel-title",
    );
    expect(panelTitle.className).toContain("line-clamp-2");
    expect(panelTitle.className).toContain("break-words");
    const actionGroup = within(panel).getByTestId(
      "template-preview-panel-actions",
    );
    expect(actionGroup.className).toContain("min-w-max");
    expect(actionGroup.className).toContain("shrink-0");
    expect(actionGroup.className).toContain("flex-col");
    expect(actionGroup.className).toContain("self-stretch");
    const actionRow = within(panel).getByTestId(
      "template-preview-panel-action-row",
    );
    expect(actionRow.className).toContain("flex-nowrap");
    expect(actionRow.className).toContain("whitespace-nowrap");
    expect(
      within(actionRow).getByRole("button", { name: "Mark as favorite" }),
    ).toBeTruthy();
    expect(within(actionRow).getByRole("link", { name: "Edit" })).toBeTruthy();
    expect(
      within(actionRow).getByRole("button", { name: "Delete" }),
    ).toBeTruthy();
    expect(
      within(actionRow).getByRole("button", { name: "Hide details" }),
    ).toBeTruthy();
    expect(within(actionGroup).queryByText("Template Active")).toBeNull();
    const tagsBlock = within(panel).getByTestId("template-preview-panel-tags");
    expect(within(tagsBlock).getByText("Template Active")).toBeTruthy();
    expect(within(tagsBlock).getByText("Organizations")).toBeTruthy();
    expect(within(tagsBlock).queryByText("Favorite")).toBeNull();
    expect(within(panel).queryByLabelText("Favorite")).toBeNull();
    expect(
      within(panel)
        .getByRole("link", { name: "Edit text" })
        .getAttribute("href"),
    ).toBe("/god-mode/plantillas/tpl-1");

    await user.click(
      within(panel).getByRole("button", { name: "Mark as favorite" }),
    );

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates/tpl-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const [, init] = jest
      .mocked(sdkFetch)
      .mock.calls.find(
        ([path, requestInit]) =>
          path === "/admin/partnership-crm/templates/tpl-1" &&
          requestInit?.method === "PUT",
      )!;
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        subject: template.subject,
        body: template.body,
        is_favorite: true,
      }),
    );

    await user.click(within(panel).getByRole("button", { name: "Delete" }));
    const deleteDialog = await screen.findByRole("dialog", {
      name: "Delete template",
    });
    await user.click(
      within(deleteDialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates/tpl-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("shows an empty state when the selected template does not use variables", async () => {
    const user = userEvent.setup();
    const staticTemplate: PartnershipCrmTemplateRecord = {
      ...template,
      subject: "Pocket Genes invitation",
      body: "Hola, queremos compartirte una invitacion.",
    };

    jest.mocked(sdkFetch).mockResolvedValue({
      templates: [staticTemplate],
      nextCursor: undefined,
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Lab outreach")).toBeTruthy();
    });

    await user.click(screen.getByText("Lab outreach"));

    const panel = await screen.findByTestId("template-preview-panel");
    const variablesBlock = within(panel).getByTestId(
      "template-preview-variables",
    );

    expect(
      within(variablesBlock).getByText("No variables used in this message."),
    ).toBeTruthy();
    expect(within(variablesBlock).queryByRole("table")).toBeNull();
    expect(within(variablesBlock).queryByText("Not used")).toBeNull();
    expect(
      within(variablesBlock).queryByText("{{organization_name}}"),
    ).toBeNull();
  });

  it("previews and imports templates from CSV", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (
        path === "/admin/partnership-crm/templates" &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(
          String(init.body),
        ) as PartnershipCrmTemplateInput;
        return {
          template: {
            ...template,
            ...body,
            id: `created-${body.name}`,
          },
        };
      }

      return {
        templates: [],
        nextCursor: undefined,
      };
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates?limit=20&audience=organizations",
      );
    });

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = [
      "name,category,subject,body,status,is_favorite,notes",
      '"Lab intro","lab","Pocket Genes + {{organization_name}}","Hola {{contact_name}}\\nMensaje","active","true","First"',
      '"Foundation intro","fundacion","Pocket Genes para {{organization_name}}","Hola {{contact_name}}","inactive","false","Second"',
    ].join("\n");
    const file = new File([csv], "plantillas.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(within(dialog).queryByLabelText("CSV contents")).toBeNull();
      expect(within(dialog).getByText("CSV parsed")).toBeTruthy();
      expect(within(dialog).getAllByText("Lab intro").length).toBeGreaterThan(
        0,
      );
      expect(within(dialog).getByText("Foundation intro")).toBeTruthy();
    });

    const currentRow = within(dialog).getByTestId(
      "template-import-current-row",
    );
    expect(within(currentRow).getByText("Lab intro")).toBeTruthy();
    expect(within(currentRow).getByText("Organizacion Ejemplo")).toBeTruthy();
    expect(within(currentRow).getByText("Contacto")).toBeTruthy();
    expect(within(currentRow).getByText("{{organization_name}}")).toBeTruthy();
    expect(within(currentRow).getByText("{{contact_name}}")).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", {
        name: "Add row",
      }),
    );

    await waitFor(() => {
      const postCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            path === "/admin/partnership-crm/templates" &&
            init?.method === "POST",
        );
      expect(postCalls).toHaveLength(1);
      expect(within(dialog).getByText("Row 2 of 2")).toBeTruthy();
    });

    await user.click(
      within(dialog).getAllByRole("button", {
        name: "Import remaining in sequence",
      })[0],
    );

    await waitFor(() => {
      const postCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            path === "/admin/partnership-crm/templates" &&
            init?.method === "POST",
        );
      expect(postCalls).toHaveLength(2);
    });

    const postBodies = jest
      .mocked(sdkFetch)
      .mock.calls.filter(
        ([path, init]) =>
          path === "/admin/partnership-crm/templates" &&
          init?.method === "POST",
      )
      .map(([, init]) =>
        JSON.parse(String(init?.body)),
      ) as PartnershipCrmTemplateInput[];

    expect(postBodies).toEqual([
      expect.objectContaining({
        name: "Lab intro",
        audience: "organizations",
        category: "org_genetic_testing_laboratories",
        subject: "Pocket Genes + {{organization_name}}",
        body: "Hola {{contact_name}}\nMensaje",
        status: "active",
        is_favorite: true,
        notes: "First",
      }),
      expect.objectContaining({
        name: "Foundation intro",
        audience: "organizations",
        category: "org_rare_disease_foundations",
        status: "inactive",
        is_favorite: false,
        notes: "Second",
      }),
    ]);
    await waitFor(() => {
      expect(within(dialog).getByText("Template import finished")).toBeTruthy();
    });
    expect(
      within(dialog).queryByRole("button", { name: "Add row" }),
    ).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("does not render raw template CSV contents and caps visible preview rows", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValue({
      templates: [],
      nextCursor: undefined,
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = [
      "name,category,subject,body,status,is_favorite,notes",
      ...Array.from({ length: 55 }, (_, index) => {
        const row = index + 1;
        return [
          `"Template ${row}"`,
          '"org_genetic_testing_laboratories"',
          `"Subject ${row}"`,
          `"Body ${row}"`,
          '"active"',
          '""',
          '""',
        ].join(",");
      }),
    ].join("\n");
    const file = new File([csv], "many-plantillas.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(within(dialog).queryByLabelText("CSV contents")).toBeNull();
      expect(within(dialog).getByText("CSV parsed")).toBeTruthy();
      expect(
        within(dialog).getByText("Showing first 50 of 55 parsed rows."),
      ).toBeTruthy();
    });
    expect(within(dialog).getByText("Template 50")).toBeTruthy();
    expect(within(dialog).queryByText("Template 51")).toBeNull();
  });

  it("opens template CSV import rules with canonical CRM options", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValue({
      templates: [],
      nextCursor: undefined,
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates?limit=20&audience=organizations",
      );
    });

    await user.click(screen.getByRole("button", { name: "Import rules" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Import rules",
    });

    expect(
      within(dialog).getByText("Rules for CRM template CSV imports."),
    ).toBeTruthy();
    expect(within(dialog).getByText("Required columns")).toBeTruthy();
    expect(within(dialog).getAllByText("name").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("subject").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("body").length).toBeGreaterThan(0);
    expect(
      within(dialog).getByText("org_genetic_testing_laboratories"),
    ).toBeTruthy();
    expect(within(dialog).getAllByText("active").length).toBeGreaterThan(0);
    expect(
      within(dialog).getByText(
        "Template imports create valid rows one by one; invalid rows are skipped and completed rows are not reverted.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Organization template body rules"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Invite the organization contact/),
    ).toBeTruthy();
    expect(
      within(dialog).getAllByText(
        /Te comparto nuestro link para que puedas conocer la propuesta/,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(dialog).getByText("Organization template writing style"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Explain the invitation fully/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Organization template review rules"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        /An organization template is editorially complete/,
      ),
    ).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Copied" }),
      ).toBeTruthy();
    });
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Header row: name,audience,category,subject,body,status,is_favorite,notes",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Rules for CRM template CSV imports.",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Example CSV",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Template variables",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Variables are not mandatory, but they make CRM outreach safer to reuse and score better in plantillas.",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Template category accepts one value only. Multiple categories are not saved as a list.",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Template body and notes can use literal \\n for line breaks.",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Organization template body rules",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "An organization template is editorially complete only when it preserves the approved closing",
    );
  });

  it("shows professional template import rules with the approved closing and review standards", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValue({
      templates: [],
      nextCursor: undefined,
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates?limit=20&audience=organizations",
      );
    });

    await user.click(screen.getByRole("tab", { name: "Professionals" }));
    await user.click(screen.getByRole("button", { name: "Import rules" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Import rules",
    });

    expect(
      within(dialog).getByText("Professional template body rules"),
    ).toBeTruthy();
    expect(within(dialog).getByText("Purpose")).toBeTruthy();
    expect(
      within(dialog).getByText(/Invite the recipient to discover the proposal/),
    ).toBeTruthy();
    expect(within(dialog).getByText("Approved mandatory closing")).toBeTruthy();
    expect(
      within(dialog).getAllByText(
        /Te comparto nuestro link para que puedas conocer la propuesta/,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(dialog).getByText("Professional template writing style"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Warm, professional Argentine Spanish/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Professional template review rules"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/CSV validity alone does not establish/),
    ).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Copied" }),
      ).toBeTruthy();
    });
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Professional template body rules",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Te comparto nuestro link para que puedas conocer la propuesta y sumarte a la red:",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "A template is editorially complete only when it preserves the approved closing",
    );
  });
});

describe("PartnershipCrmTemplateWorkbench", () => {
  beforeEach(() => {
    jest.mocked(sdkFetch).mockReset();
    routerPush.mockClear();
    routerRefresh.mockClear();
  });

  it("opens the template preview in a modal instead of rendering it beside the editor", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValue({
      template,
    });

    renderWithProviders(
      <PartnershipCrmTemplateWorkbench mode="edit" templateId={template.id} />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Lab outreach")).toBeTruthy();
    });

    expect(screen.queryByText("Preview sample")).toBeNull();
    expect(screen.queryByText("Hola Contacto")).toBeNull();

    await user.click(screen.getByRole("button", { name: "View preview" }));

    const dialog = await screen.findByRole("dialog", { name: "Preview" });
    expect(within(dialog).getByText("Preview sample")).toBeTruthy();
    expect(
      within(dialog).getByText("Pocket Genes + Organizacion Ejemplo"),
    ).toBeTruthy();
    expect(within(dialog).getByText("Hola Contacto")).toBeTruthy();
  });

  it("saves new templates with a canonical category from the picker", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      template: { ...template, category: "org_genetic_testing_laboratories" },
    });

    renderWithProviders(<PartnershipCrmTemplateWorkbench mode="create" />);

    expect(
      screen.getAllByText("Genetic Testing Laboratory").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByPlaceholderText("Category")).toBeNull();

    fireEvent.change(screen.getByLabelText("Template name"), {
      target: { value: "Lab outreach" },
    });
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Pocket Genes + {{organization_name}}" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Hola {{contact_name}}" },
    });
    fireEvent.click(screen.getByLabelText("Favorite"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const [, init] = jest
      .mocked(sdkFetch)
      .mock.calls.find(
        ([path]) => path === "/admin/partnership-crm/templates",
      )!;
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        category: "org_genetic_testing_laboratories",
        audience: "organizations",
        is_favorite: true,
      }),
    );
  });

  it("saves professional templates with professional audience and categories", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      template: {
        ...template,
        audience: "professionals",
        category: "pro_clinical_geneticists",
      },
    });

    renderWithProviders(<PartnershipCrmTemplateWorkbench mode="create" />);

    fireEvent.click(screen.getByRole("tab", { name: /Professionals/ }));
    expect(screen.getAllByText("Clinical Geneticist").length).toBeGreaterThan(
      0,
    );

    fireEvent.change(screen.getByLabelText("Template name"), {
      target: { value: "Professional outreach" },
    });
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Pocket Genes + {{professional_name}}" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Hola {{first_name}}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const [, init] = jest
      .mocked(sdkFetch)
      .mock.calls.find(
        ([path]) => path === "/admin/partnership-crm/templates",
      )!;
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        audience: "professionals",
      }),
    );
  });
});
