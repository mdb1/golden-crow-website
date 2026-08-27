/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
      "name,category,subject,body,status,notes",
      '"Lab intro","lab","Pocket Genes + {{organization_name}}","Hola {{contact_name}}\\nMensaje","active","First"',
      '"Foundation intro","fundacion","Pocket Genes para {{organization_name}}","Hola {{contact_name}}","inactive","Second"',
    ].join("\n");
    const file = new File([csv], "plantillas.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(within(dialog).queryByLabelText("CSV contents")).toBeNull();
      expect(within(dialog).getByText("CSV parsed")).toBeTruthy();
      expect(within(dialog).getByText("Lab intro")).toBeTruthy();
      expect(within(dialog).getByText("Foundation intro")).toBeTruthy();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Import 2 templates",
      }),
    );

    await waitFor(() => {
      const postCalls = jest.mocked(sdkFetch).mock.calls.filter(
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
        notes: "First",
      }),
      expect.objectContaining({
        name: "Foundation intro",
        audience: "organizations",
        category: "org_rare_disease_foundations",
        status: "inactive",
        notes: "Second",
      }),
    ]);
    await waitFor(() => {
      expect(within(dialog).getByText("Template import finished")).toBeTruthy();
    });
    expect(
      within(dialog).queryByRole("button", { name: "Import 2 templates" }),
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
      "name,category,subject,body,status,notes",
      ...Array.from({ length: 55 }, (_, index) => {
        const row = index + 1;
        return [
          `"Template ${row}"`,
          '"org_genetic_testing_laboratories"',
          `"Subject ${row}"`,
          `"Body ${row}"`,
          '"active"',
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
    expect(within(dialog).getByText("active")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Template imports create valid rows one by one; invalid rows are skipped and completed rows are not reverted.",
      ),
    ).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Copied" }),
      ).toBeTruthy();
    });
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Header row: name,audience,category,subject,body,status,notes",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Rules for CRM template CSV imports.",
    );
  });
});

describe("PartnershipCrmTemplateWorkbench", () => {
  beforeEach(() => {
    jest.mocked(sdkFetch).mockReset();
    routerPush.mockClear();
    routerRefresh.mockClear();
  });

  it("saves new templates with a canonical category from the picker", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValue({
      template: { ...template, category: "org_genetic_testing_laboratories" },
    });

    renderWithProviders(<PartnershipCrmTemplateWorkbench mode="create" />);

    expect(
      screen.getAllByText("Genetic Testing Laboratory").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByPlaceholderText("Category")).toBeNull();

    await user.type(screen.getByLabelText("Template name"), "Lab outreach");
    await user.type(
      screen.getByLabelText("Subject"),
      "Pocket Genes + {{organization_name}}",
    );
    await user.type(screen.getByLabelText("Message"), "Hola {{contact_name}}");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const [, init] = jest
      .mocked(sdkFetch)
      .mock.calls.find(([path]) => path === "/admin/partnership-crm/templates")!;
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        category: "org_genetic_testing_laboratories",
        audience: "organizations",
      }),
    );
  });

  it("saves professional templates with professional audience and categories", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValue({
      template: {
        ...template,
        audience: "professionals",
        category: "pro_clinical_geneticists",
      },
    });

    renderWithProviders(<PartnershipCrmTemplateWorkbench mode="create" />);

    await user.click(screen.getByRole("tab", { name: /Professionals/ }));
    expect(
      screen.getAllByText("Clinical Geneticist").length,
    ).toBeGreaterThan(0);

    await user.type(
      screen.getByLabelText("Template name"),
      "Professional outreach",
    );
    await user.type(
      screen.getByLabelText("Subject"),
      "Pocket Genes + ",
    );
    await user.paste("{{professional_name}}");
    await user.click(screen.getByLabelText("Message"));
    await user.paste("Hola {{first_name}}");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const [, init] = jest
      .mocked(sdkFetch)
      .mock.calls.find(([path]) => path === "/admin/partnership-crm/templates")!;
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        audience: "professionals",
      }),
    );
  });
});
