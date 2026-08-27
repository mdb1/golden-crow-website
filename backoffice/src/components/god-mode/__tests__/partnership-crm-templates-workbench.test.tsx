/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  PartnershipCrmTemplateBrowser,
  PartnershipCrmTemplateWorkbench,
} from "@/components/god-mode/partnership-crm-templates-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type { PartnershipCrmTemplateRecord } from "@/lib/partnership-crm";

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

const template: PartnershipCrmTemplateRecord = {
  id: "tpl-1",
  schemaVersion: 1,
  name: "Lab outreach",
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
      "/admin/partnership-crm/templates?limit=20",
    );
    expect(screen.getByText("All categories")).toBeTruthy();
    expect(screen.getAllByText("Laboratory / Genomics").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByPlaceholderText("Category")).toBeNull();
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
      template: { ...template, category: "Laboratory / Genomics" },
    });

    renderWithProviders(<PartnershipCrmTemplateWorkbench mode="create" />);

    expect(screen.getAllByText("Laboratory / Genomics").length).toBeGreaterThan(
      0,
    );
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
      expect.objectContaining({ category: "Laboratory / Genomics" }),
    );
  });
});
