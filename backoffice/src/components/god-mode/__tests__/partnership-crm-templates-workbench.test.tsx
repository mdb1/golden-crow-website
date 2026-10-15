/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
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
  mergePlantillasUsage,
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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function installDefaultUsageResponse() {
  const mock = jest.mocked(sdkFetch);
  const currentImplementation = mock.getMockImplementation();
  mock.mockImplementation(async (path, init) => {
    const result = currentImplementation
      ? await currentImplementation(path, init)
      : undefined;
    const usage = {
      surface: "plantillas" as const,
      used: 1,
      limit: 100,
      percentage: 1,
      remaining: 99,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      locked: false,
    };
    if (
      path === "/admin/partnership-crm/daily-usage/page-load" &&
      (!result || typeof result !== "object" || !("usage" in result))
    ) {
      return { usage };
    }
    if (result && typeof result === "object" && !("usage" in result)) {
      return { ...result, usage };
    }
    return result;
  });
}

function renderWithProviders(
  children: ReactNode,
  client = createTestQueryClient(),
) {
  installDefaultUsageResponse();
  return render(
    <QueryClientProvider client={client}>
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        {children}
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

async function renderLoadedBrowser(client = createTestQueryClient()) {
  const rendered = renderWithProviders(<PartnershipCrmTemplateBrowser />, client);
  const loadButton = await screen.findByRole("button", {
    name: "Load 10 templates",
  });
  await waitFor(() => expect(loadButton.hasAttribute("disabled")).toBe(false));
  await userEvent.setup().click(loadButton);
  return rendered;
}

function duplicateTemplateFixture(): PartnershipCrmTemplateRecord {
  return {
    ...template,
    id: "tpl-existing",
    name: "Duplicate intro",
    category: "org_genetic_testing_laboratories",
    subject: "Old subject",
    body: "Old body",
    notes: "Old note",
    is_favorite: false,
    normalizedName: "duplicate intro",
  };
}

function mockDuplicateTemplateImport(
  existingTemplate: PartnershipCrmTemplateRecord,
) {
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    const stringPath = String(path);
    if (
      stringPath === "/admin/partnership-crm/templates/import" &&
      init?.method === "POST"
    ) {
      const body = JSON.parse(String(init.body)) as PartnershipCrmTemplateInput;
      return {
        action: "updated",
        template: {
          ...existingTemplate,
          ...body,
          id: existingTemplate.id,
        },
      };
    }

    return {
      templates: [existingTemplate],
      nextCursor: undefined,
    };
  });
}

function duplicateTemplateCsv() {
  return [
    "name,category,subject,body,status,is_favorite,notes",
    '"Duplicate intro","org_genetic_testing_laboratories","New subject","New body","active","true","New note"',
  ].join("\n");
}

function templateMutationCalls(method: "POST" | "PUT") {
  return jest
    .mocked(sdkFetch)
    .mock.calls.filter(
      ([path, init]) =>
        String(path).startsWith("/admin/partnership-crm/templates") &&
        init?.method === method,
    );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("PartnershipCrmTemplateBrowser", () => {
  it("keeps same-window usage monotonic and only lowers it after reset", () => {
    const current = {
      surface: "plantillas" as const,
      used: 100,
      limit: 100,
      percentage: 100,
      remaining: 0,
      resetAt: "2026-10-15T07:00:00.000Z",
      locked: true,
    };
    const stale = {
      ...current,
      used: 99,
      percentage: 99,
      remaining: 1,
      locked: false,
    };
    const nextDay = {
      ...stale,
      used: 1,
      percentage: 1,
      remaining: 99,
      resetAt: "2026-10-16T07:00:00.000Z",
    };

    expect(mergePlantillasUsage(current, stale)).toEqual(current);
    expect(mergePlantillasUsage(current, nextDay)).toEqual(nextDay);

    expect(
      mergePlantillasUsage(
        {
          ...current,
          used: 99,
          percentage: 99,
          remaining: 1,
          locked: true,
        },
        {
          ...stale,
          used: 98,
          percentage: 98,
          remaining: 2,
          locked: true,
        },
      ),
    ).toEqual(
      expect.objectContaining({
        used: 99,
        percentage: 99,
        remaining: 1,
        locked: false,
      }),
    );
  });

  beforeEach(() => {
    jest.mocked(sdkFetch).mockReset();
    routerPush.mockClear();
    routerRefresh.mockClear();
    window.sessionStorage.clear();
  });

  it("loads only daily usage on mount and waits for an explicit filter apply", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: "2026-10-16T07:00:00.000Z",
            locked: false,
          },
        };
      }
      return {
        templates: [template],
        nextCursor: undefined,
        partial: true,
        scanned: 10,
        asOf: "2026-10-15T12:00:00.000Z",
        usage: {
          surface: "plantillas",
          used: 2,
          limit: 100,
          percentage: 2,
          remaining: 98,
          resetAt: "2026-10-16T07:00:00.000Z",
          locked: false,
        },
      };
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await screen.findByText("1 / 100 · 1%");
    expect(sdkFetch).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByPlaceholderText("Search templates..."), {
      target: { value: "laboratory" },
    });
    expect(sdkFetch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Load templates" }));
    await screen.findByText("Lab outreach");
    expect(
      screen.getByTestId("plantillas-bounded-result-note").textContent,
    ).toContain("Approximate bounded sample: 10 records checked");

    const listCall = jest
      .mocked(sdkFetch)
      .mock.calls.find(([path]) =>
        String(path).startsWith("/admin/partnership-crm/templates?"),
      );
    expect(listCall?.[0]).toContain("query=laboratory");
    const headers = new Headers(listCall?.[1]?.headers);
    expect(headers.get("X-CRM-Usage-Surface")).toBe("plantillas");
    expect(headers.get("X-CRM-Usage-Event-ID")).toBeTruthy();
  });

  it("derives the lock from 100-percent usage even when the payload says unlocked", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      usage: {
        surface: "plantillas",
        used: 100,
        limit: 100,
        percentage: 100,
        remaining: 0,
        resetAt: "2026-10-16T07:00:00.000Z",
        locked: false,
      },
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    const progress = await screen.findByRole("progressbar", {
      name: "Plantillas daily usage",
    });
    await waitFor(() => expect(progress.getAttribute("aria-valuenow")).toBe("100"));
    expect(screen.getByRole("button", { name: "Load templates" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Import CSV" }).hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText(
        "Daily limit reached. Fresh Plantillas data and actions are unavailable until reset.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Plantillas data and actions are unavailable because its daily limit has been reached.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/cached and read-only/i)).toBeNull();
    expect(sdkFetch).toHaveBeenCalledTimes(1);
  });

  it("does not trust a locked flag below the daily limit", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      usage: {
        surface: "plantillas",
        used: 99,
        limit: 100,
        percentage: 99,
        remaining: 1,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        locked: true,
      },
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await screen.findByText("99 / 100 · 99%");
    expect(
      screen
        .getByRole("button", { name: "Load 10 templates" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.queryByText(/cached and read-only/i)).toBeNull();
  });

  it("uses the authoritative usage payload from a 429 response", async () => {
    const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const quotaError = Object.assign(new Error("Daily limit reached"), {
      status: 429,
      details: `Request: POST /admin/partnership-crm/daily-usage/page-load\n\nResponse JSON:\n${JSON.stringify(
        {
          error: "Daily limit reached",
          usage: {
            surface: "plantillas",
            used: 100,
            limit: 100,
            percentage: 100,
            remaining: 0,
            resetAt,
            locked: true,
          },
        },
        null,
        2,
      )}`,
    });
    jest.mocked(sdkFetch).mockRejectedValue(quotaError);

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    const progress = await screen.findByRole("progressbar", {
      name: "Plantillas daily usage",
    });
    await waitFor(() =>
      expect(progress.getAttribute("aria-valuenow")).toBe("100"),
    );
    expect(
      screen.getByText(
        "Plantillas data and actions are unavailable because its daily limit has been reached.",
      ),
    ).toBeTruthy();
    expect(
      JSON.parse(
        window.sessionStorage.getItem(
          "golden-crow-plantillas-daily-usage-v1",
        ) ?? "null",
      ),
    ).toEqual(expect.objectContaining({ resetAt, locked: true }));
  });

  it("fails closed when a later action cannot verify quota usage until an explicit retry", async () => {
    const user = userEvent.setup();
    const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    jest
      .mocked(sdkFetch)
      .mockResolvedValueOnce({
        usage: {
          surface: "plantillas",
          used: 1,
          limit: 100,
          percentage: 1,
          remaining: 99,
          resetAt,
          locked: false,
        },
      })
      .mockRejectedValueOnce(new Error("CRM usage tracking unavailable"))
      .mockResolvedValueOnce({
        usage: {
          surface: "plantillas",
          used: 1,
          limit: 100,
          percentage: 1,
          remaining: 99,
          resetAt,
          locked: false,
        },
      });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);
    const loadButton = await screen.findByRole("button", {
      name: "Load 10 templates",
    });
    await waitFor(() => expect(loadButton.hasAttribute("disabled")).toBe(false));
    await user.click(loadButton);

    await waitFor(() => expect(loadButton.hasAttribute("disabled")).toBe(true));
    expect(
      screen.getByRole("button", { name: "Refresh" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Import CSV" }).hasAttribute("disabled"),
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Retry verification" }),
    );
    await waitFor(() => expect(loadButton.hasAttribute("disabled")).toBe(false));
    expect(sdkFetch).toHaveBeenCalledTimes(3);
    const firstHeaders = new Headers(
      jest.mocked(sdkFetch).mock.calls[0]?.[1]?.headers,
    );
    const retryHeaders = new Headers(
      jest.mocked(sdkFetch).mock.calls[2]?.[1]?.headers,
    );
    expect(retryHeaders.get("X-CRM-Usage-Event-ID")).toBe(
      firstHeaders.get("X-CRM-Usage-Event-ID"),
    );
  });

  it("fails closed when page-load verification returns malformed usage", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      usage: { surface: "plantillas" },
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    expect(
      await screen.findByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Load 10 templates" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(sdkFetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed when usage has no strictly future reset window", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      usage: {
        surface: "plantillas",
        used: 1,
        limit: 100,
        percentage: 1,
        remaining: 99,
        resetAt: new Date(Date.now() - 1).toISOString(),
        locked: false,
      },
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    expect(
      await screen.findByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Load 10 templates" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("rejects a fractional or non-100 daily usage contract", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      usage: {
        surface: "plantillas",
        used: 1.5,
        limit: 1000,
        percentage: 0,
        remaining: 998.5,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        locked: false,
      },
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    expect(
      await screen.findByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Refresh" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("rejects remaining usage above the daily limit", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      usage: {
        surface: "plantillas",
        used: 1,
        limit: 100,
        percentage: 1,
        remaining: 101,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        locked: false,
      },
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    expect(
      await screen.findByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Refresh" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("fails closed after an action response returns malformed usage", async () => {
    const user = userEvent.setup();
    const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    jest
      .mocked(sdkFetch)
      .mockResolvedValueOnce({
        usage: {
          surface: "plantillas",
          used: 1,
          limit: 100,
          percentage: 1,
          remaining: 99,
          resetAt,
          locked: false,
        },
      })
      .mockResolvedValueOnce({
        templates: [],
        nextCursor: undefined,
        usage: { surface: "plantillas" },
      });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);
    const loadButton = await screen.findByRole("button", {
      name: "Load 10 templates",
    });
    await waitFor(() => expect(loadButton.hasAttribute("disabled")).toBe(false));
    await user.click(loadButton);

    expect(
      await screen.findByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Refresh" })
          .hasAttribute("disabled"),
      ).toBe(true),
    );
    expect(sdkFetch).toHaveBeenCalledTimes(2);
  });

  it("fails closed when an action error carries malformed usage", async () => {
    const user = userEvent.setup();
    const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const malformedUsageError = Object.assign(new Error("Backend unavailable"), {
      status: 500,
      details:
        'Response JSON:\n{"usage":{"surface":"plantillas","used":"bad"}}',
    });
    jest
      .mocked(sdkFetch)
      .mockResolvedValueOnce({
        usage: {
          surface: "plantillas",
          used: 1,
          limit: 100,
          percentage: 1,
          remaining: 99,
          resetAt,
          locked: false,
        },
      })
      .mockRejectedValueOnce(malformedUsageError);

    renderWithProviders(<PartnershipCrmTemplateBrowser />);
    const loadButton = await screen.findByRole("button", {
      name: "Load 10 templates",
    });
    await waitFor(() => expect(loadButton.hasAttribute("disabled")).toBe(false));
    await user.click(loadButton);

    expect(
      await screen.findByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Refresh" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(sdkFetch).toHaveBeenCalledTimes(2);
  });

  it("offers manual verification after a 429 without a reset timestamp", async () => {
    const rateLimitError = Object.assign(new Error("Quota exceeded"), {
      status: 429,
    });
    jest.mocked(sdkFetch).mockRejectedValueOnce(rateLimitError);

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    expect(
      await screen.findByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Load 10 templates" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("rechecks the server when a stored lock has no valid future reset", async () => {
    window.sessionStorage.setItem(
      "golden-crow-plantillas-daily-usage-v1",
      JSON.stringify({
        surface: "plantillas",
        used: 100,
        limit: 100,
        percentage: 100,
        remaining: 0,
        resetAt: "",
        locked: true,
      }),
    );
    jest.mocked(sdkFetch).mockResolvedValue({
      usage: {
        surface: "plantillas",
        used: 1,
        limit: 100,
        percentage: 1,
        remaining: 99,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        locked: false,
      },
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await screen.findByText("1 / 100 · 1%");
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/daily-usage/page-load",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.queryByText(/cached and read-only/i)).toBeNull();
  });

  it("re-verifies a valid in-tab lock just after reset with a fresh event id", async () => {
    jest.useFakeTimers();
    try {
      const now = new Date("2026-10-15T10:00:00.000Z");
      const resetAt = new Date(now.getTime() + 1000).toISOString();
      jest.setSystemTime(now);
      window.sessionStorage.setItem(
        "golden-crow-plantillas-daily-usage-v1",
        JSON.stringify({
          surface: "plantillas",
          used: 100,
          limit: 100,
          percentage: 100,
          remaining: 0,
          resetAt,
          locked: true,
        }),
      );
      jest.mocked(sdkFetch).mockResolvedValue({
        usage: {
          surface: "plantillas",
          used: 1,
          limit: 100,
          percentage: 1,
          remaining: 99,
          resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          locked: false,
        },
      });

      renderWithProviders(<PartnershipCrmTemplateBrowser />);
      expect(sdkFetch).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(2001);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(sdkFetch).toHaveBeenCalledTimes(1);
      const [path, init] = jest.mocked(sdkFetch).mock.calls[0];
      expect(path).toBe("/admin/partnership-crm/daily-usage/page-load");
      const eventId = new Headers(init?.headers).get(
        "X-CRM-Usage-Event-ID",
      );
      expect(eventId).toBeTruthy();
      expect(JSON.parse(String(init?.body))).toEqual({
        surface: "plantillas",
        eventId,
      });
      expect(screen.getByText("1 / 100 · 1%")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Load templates" }).hasAttribute(
          "disabled",
        ),
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("stays fail-closed and retries reset verification after backoff", async () => {
    jest.useFakeTimers();
    try {
      const now = new Date("2026-10-15T10:00:00.000Z");
      jest.setSystemTime(now);
      window.sessionStorage.setItem(
        "golden-crow-plantillas-daily-usage-v1",
        JSON.stringify({
          surface: "plantillas",
          used: 100,
          limit: 100,
          percentage: 100,
          remaining: 0,
          resetAt: new Date(now.getTime() + 1000).toISOString(),
          locked: true,
        }),
      );
      jest
        .mocked(sdkFetch)
        .mockRejectedValueOnce(new Error("usage unavailable"))
        .mockResolvedValueOnce({
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: new Date(
              now.getTime() + 24 * 60 * 60 * 1000,
            ).toISOString(),
            locked: false,
          },
        });

      renderWithProviders(<PartnershipCrmTemplateBrowser />);

      await act(async () => {
        jest.advanceTimersByTime(2001);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(sdkFetch).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText(
          "Plantillas data and actions are unavailable because its daily limit has been reached.",
        ),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Load templates" }).hasAttribute(
          "disabled",
        ),
      ).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(5 * 60 * 1000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(sdkFetch).toHaveBeenCalledTimes(2);
      expect(screen.getByText("1 / 100 · 1%")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Load templates" }).hasAttribute(
          "disabled",
        ),
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("reuses one event id when reset verification needs a backoff retry", async () => {
    jest.useFakeTimers();
    try {
      const now = new Date("2026-10-15T10:00:00.000Z");
      const resetAt = new Date(now.getTime() + 1000).toISOString();
      jest.setSystemTime(now);
      const lockedUsage = {
        surface: "plantillas" as const,
        used: 100,
        limit: 100,
        percentage: 100,
        remaining: 0,
        resetAt,
        locked: true,
      };
      window.sessionStorage.setItem(
        "golden-crow-plantillas-daily-usage-v1",
        JSON.stringify(lockedUsage),
      );
      jest
        .mocked(sdkFetch)
        .mockResolvedValueOnce({ usage: lockedUsage })
        .mockResolvedValueOnce({
          usage: {
            ...lockedUsage,
            used: 1,
            percentage: 1,
            remaining: 99,
            resetAt: new Date(
              now.getTime() + 24 * 60 * 60 * 1000,
            ).toISOString(),
            locked: false,
          },
        });

      renderWithProviders(<PartnershipCrmTemplateBrowser />);
      await act(async () => {
        jest.advanceTimersByTime(2001);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(sdkFetch).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: "Load templates" }).hasAttribute(
          "disabled",
        ),
      ).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(5 * 60 * 1000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(sdkFetch).toHaveBeenCalledTimes(2);
      const eventIds = jest.mocked(sdkFetch).mock.calls.map(([, init]) =>
        new Headers(init?.headers).get("X-CRM-Usage-Event-ID"),
      );
      expect(eventIds[0]).toBeTruthy();
      expect(eventIds[1]).toBeTruthy();
      expect(eventIds[1]).toBe(eventIds[0]);
      expect(screen.getByText("1 / 100 · 1%")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps a locked cached summary honest and does not request details", async () => {
    const user = userEvent.setup();
    const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    window.sessionStorage.setItem(
      "golden-crow-plantillas-daily-usage-v1",
      JSON.stringify({
        surface: "plantillas",
        used: 100,
        limit: 100,
        percentage: 100,
        remaining: 0,
        resetAt,
        locked: true,
      }),
    );
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: {
          templates: [{ ...template, body: "", notes: "" }],
          partial: true,
          scanned: 10,
          asOf: new Date().toISOString(),
        },
      }),
    );

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await user.click(await screen.findByText("Lab outreach"));
    const panel = await screen.findByTestId("template-summary-only-panel");
    expect(
      screen.getByText(
        "Daily limit reached. Cached data remains available until reset.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/cached and read-only/i)).toBeTruthy();
    expect(
      within(panel).getByText(
        "The cached summary does not include the message, notes, or fit score. Details can be loaded after the daily reset.",
      ),
    ).toBeTruthy();
    expect(
      within(panel)
        .getByRole("button", { name: "Available after daily reset" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(within(panel).queryByText("No message yet.")).toBeNull();
    expect(within(panel).queryByText("Template fit")).toBeNull();
    expect(sdkFetch).not.toHaveBeenCalled();
  });

  it("labels cached details as unavailable while usage verification is pending", async () => {
    const user = userEvent.setup();
    const verification = deferred<{
      usage: {
        surface: "plantillas";
        used: number;
        limit: number;
        percentage: number;
        remaining: number;
        resetAt: string;
        locked: boolean;
      };
    }>();
    jest.mocked(sdkFetch).mockReturnValueOnce(verification.promise);
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: { templates: [{ ...template, body: "", notes: "" }] },
      }),
    );

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await user.click(await screen.findByText("Lab outreach"));
    const panel = await screen.findByTestId("template-summary-only-panel");
    expect(
      within(panel).getByText(
        "The cached summary does not include the message, notes, or fit score. Details are unavailable while daily usage is being verified.",
      ),
    ).toBeTruthy();
    expect(
      within(panel)
        .getByRole("button", { name: "Verifying usage..." })
        .hasAttribute("disabled"),
    ).toBe(true);

    await act(async () => {
      verification.resolve({
        usage: {
          surface: "plantillas",
          used: 1,
          limit: 100,
          percentage: 1,
          remaining: 99,
          resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          locked: false,
        },
      });
      await verification.promise;
    });
  });

  it("offers retry verification for cached details after usage verification fails", async () => {
    const user = userEvent.setup();
    jest
      .mocked(sdkFetch)
      .mockRejectedValueOnce(new Error("usage unavailable"));
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: { templates: [{ ...template, body: "", notes: "" }] },
      }),
    );

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await screen.findByRole("button", { name: "Retry verification" });
    await user.click(screen.getByText("Lab outreach"));
    const panel = await screen.findByTestId("template-summary-only-panel");
    expect(
      within(panel).getByText(
        "The cached summary does not include the message, notes, or fit score. Details are unavailable because daily usage could not be verified. Retry verification to continue.",
      ),
    ).toBeTruthy();
    expect(
      within(panel).getByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    expect(
      within(panel).queryByText(
        "The cached summary does not include the message, notes, or fit score. Details can be loaded after the daily reset.",
      ),
    ).toBeNull();
  });

  it("evicts a cached summary with an invalid timestamp", async () => {
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: "not-a-date",
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: { templates: [{ ...template, body: "", notes: "" }] },
      }),
    );

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await screen.findByText("1 / 100 · 1%");
    expect(screen.queryByText("Lab outreach")).toBeNull();
    expect(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ),
    ).toBeNull();
  });

  it("evicts a cached summary dated in the future", async () => {
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: { templates: [{ ...template, body: "", notes: "" }] },
      }),
    );

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await screen.findByText("1 / 100 · 1%");
    expect(screen.queryByText("Lab outreach")).toBeNull();
    expect(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ),
    ).toBeNull();
  });

  it.each([
    [
      "filters",
      {
        filters: {
          query: "",
          audience: "everyone",
          status: "all",
          category: "",
        },
        page: { templates: [{ ...template, body: "", notes: "" }] },
      },
    ],
    [
      "next cursor",
      {
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: {
          templates: [{ ...template, body: "", notes: "" }],
          nextCursor: 42,
        },
      },
    ],
    [
      "template summary row",
      {
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: { templates: [null] },
      },
    ],
  ])("evicts cached summaries with malformed %s", async (_label, cached) => {
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        ...cached,
      }),
    );

    renderWithProviders(<PartnershipCrmTemplateBrowser />);

    await screen.findByText("1 / 100 · 1%");
    expect(screen.queryByText("Lab outreach")).toBeNull();
    expect(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ),
    ).toBeNull();
  });

  it("describes an empty partial page as a bounded sample", async () => {
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: "2026-10-16T07:00:00.000Z",
            locked: false,
          },
        };
      }
      return {
        templates: [],
        nextCursor: "next-page",
        partial: true,
        scanned: 10,
        asOf: "2026-10-15T12:00:00.000Z",
      };
    });

    await renderLoadedBrowser();

    expect(
      await screen.findByText("No matches in this bounded sample."),
    ).toBeTruthy();
    expect(screen.queryByText("No templates found.")).toBeNull();
    expect(
      screen.getByTestId("plantillas-bounded-result-note").textContent,
    ).toContain("10 records checked");
  });

  it("uses the normalized CRM category picker and displays canonical categories", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      templates: [template],
      nextCursor: undefined,
    });

    await renderLoadedBrowser();

    await waitFor(() => {
      expect(screen.getByText("Lab outreach")).toBeTruthy();
    });

    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/templates?limit=10&audience=organizations",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(screen.getByText("All categories")).toBeTruthy();
    expect(screen.getByText("Genetic Testing Laboratory")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Category")).toBeNull();
  });

  it("shows favorite templates first with a cyan star cell", async () => {
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

    await renderLoadedBrowser();

    await waitFor(() => {
      expect(screen.getByText("Favorite outreach")).toBeTruthy();
    });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Favorite outreach")).toBeTruthy();
    const favoriteSignal = within(rows[0]).getByRole("img", {
      name: "Favorite",
    });
    expect(favoriteSignal.querySelector("svg")?.className.baseVal).toContain(
      "fill-cyan-400",
    );
    expect(
      favoriteSignal.closest("[data-slot='table-cell']")?.className,
    ).toContain("bg-cyan-50");
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

    await renderLoadedBrowser();

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

  it("clears a stale page when a bulk delete outcome becomes ambiguous", async () => {
    const user = userEvent.setup();
    const secondTemplate: PartnershipCrmTemplateRecord = {
      ...template,
      id: "tpl-2",
      name: "Foundation outreach",
      normalizedName: "foundation outreach",
    };

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath.endsWith("/tpl-1") && init?.method === "DELETE") {
        return { deleted: true, templateId: "tpl-1" };
      }
      if (stringPath.endsWith("/tpl-2") && init?.method === "DELETE") {
        throw new Error("quota reached during delete");
      }
      return { templates: [template, secondTemplate], nextCursor: undefined };
    });

    await renderLoadedBrowser();
    await user.click(
      await screen.findByRole("checkbox", {
        name: "Select all visible templates",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete selected templates",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );

    expect(
      await screen.findByText("Bulk delete stopped after a partial failure."),
    ).toBeTruthy();
    expect(screen.getByText("The failing template outcome is unknown.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Lab outreach")).toBeNull());
    expect(screen.queryByText("Foundation outreach")).toBeNull();
    expect(screen.getByRole("button", { name: "Load 10 templates" })).toBeTruthy();
  });

  it("marks multiple selected templates as favorite and not favorite", async () => {
    const user = userEvent.setup();
    const client = createTestQueryClient();
    const crmEmailTemplateCache = {
      pages: [{ templates: [template], nextCursor: undefined }],
      pageParams: [undefined],
    };
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
        stringPath.endsWith("/favorite") &&
        init?.method === "PATCH"
      ) {
        const templateId = decodeURIComponent(
          stringPath.split("/").at(-2) ?? "",
        );
        const body = JSON.parse(String(init.body)) as {
          is_favorite: boolean;
        };
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

    client.setQueryData(
      ["god-mode-partnership-crm-templates", "active"],
      crmEmailTemplateCache,
    );
    await renderLoadedBrowser(client);

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
        .mock.calls.filter(([, init]) => init?.method === "PATCH");
      expect(putCalls).toHaveLength(2);
      for (const [path, init] of putCalls) {
        expect(path).toMatch(/\/favorite$/);
        expect(JSON.parse(String(init?.body))).toEqual({ is_favorite: true });
      }
    });

    await user.click(
      screen.getByRole("button", { name: "Mark selected as not favorite" }),
    );

    await waitFor(() => {
      const putCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(([, init]) => init?.method === "PATCH");
      expect(putCalls).toHaveLength(4);
      for (const [, init] of putCalls.slice(-2)) {
        expect(JSON.parse(String(init?.body))).toEqual({ is_favorite: false });
      }
    });

    expect(
      client.getQueryData(["god-mode-partnership-crm-templates", "active"]),
    ).toBe(crmEmailTemplateCache);
    expect(
      screen.queryByText("Unable to update selected templates."),
    ).toBeNull();
  });

  it("clears a stale page when a bulk favorite outcome becomes ambiguous", async () => {
    const user = userEvent.setup();
    const secondTemplate: PartnershipCrmTemplateRecord = {
      ...template,
      id: "tpl-2",
      name: "Foundation outreach",
      normalizedName: "foundation outreach",
    };

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath.endsWith("/tpl-1/favorite") && init?.method === "PATCH") {
        return { template: { ...template, is_favorite: true } };
      }
      if (stringPath.endsWith("/tpl-2/favorite") && init?.method === "PATCH") {
        throw new Error("quota reached during favorite update");
      }
      return { templates: [template, secondTemplate], nextCursor: undefined };
    });

    await renderLoadedBrowser();
    await user.click(
      await screen.findByRole("checkbox", {
        name: "Select all visible templates",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Mark selected as favorite" }),
    );

    expect(
      await screen.findByText(
        "Bulk favorite update stopped after a partial failure.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("The failing template outcome is unknown.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Lab outreach")).toBeNull());
    expect(screen.queryByText("Foundation outreach")).toBeNull();
    expect(screen.getByRole("button", { name: "Load 10 templates" })).toBeTruthy();
  });

  it.each([
    [
      "a route-level 429",
      () =>
        Object.assign(new Error("Daily limit reached"), {
          status: 429,
          details: `Response JSON:\n${JSON.stringify({
            code: "CRM_DAILY_LIMIT_REACHED",
            usage: {
              surface: "plantillas",
              used: 100,
              limit: 100,
              percentage: 100,
              remaining: 0,
              resetAt: new Date(
                Date.now() + 24 * 60 * 60 * 1000,
              ).toISOString(),
              locked: true,
            },
          })}`,
        }),
    ],
    [
      "a route-level usage 503",
      () =>
        Object.assign(new Error("Usage unavailable"), {
          status: 503,
          details:
            'Response JSON:\n{"code":"CRM_USAGE_UNAVAILABLE","error":"Usage unavailable"}',
        }),
    ],
  ])("keeps cached templates when favorite is not executed by %s", async (_label, makeError) => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: { templates: [{ ...template, body: "", notes: "" }] },
      }),
    );
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ).toISOString(),
            locked: false,
          },
        };
      }
      if (String(path).endsWith("/tpl-1/favorite") && init?.method === "PATCH") {
        throw makeError();
      }
      throw new Error(`Unexpected request: ${String(path)}`);
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);
    await screen.findByText("1 / 100 · 1%");
    await user.click(
      screen.getByRole("checkbox", { name: "Select all visible templates" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Mark selected as favorite" }),
    );

    expect(await screen.findByText("The failing template was not sent.")).toBeTruthy();
    expect(screen.queryByText("The failing template outcome is unknown.")).toBeNull();
    expect(screen.getByText("Lab outreach")).toBeTruthy();
    expect(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ),
    ).not.toBeNull();
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            String(path).endsWith("/favorite") && init?.method === "PATCH",
        ),
    ).toHaveLength(1);
  });

  it("patches cached summaries without renewing the list-load TTL", async () => {
    const user = userEvent.setup();
    const originalSavedAt = new Date(
      Date.now() - 12 * 60 * 60 * 1000,
    ).toISOString();
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: originalSavedAt,
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: {
          templates: [{ ...template, body: "", notes: "" }],
          partial: true,
          scanned: 10,
          asOf: originalSavedAt,
        },
      }),
    );
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            locked: false,
          },
        };
      }
      if (
        path === "/admin/partnership-crm/templates/tpl-1/favorite" &&
        init?.method === "PATCH"
      ) {
        return { template: { ...template, is_favorite: true } };
      }
      throw new Error(`Unexpected request: ${String(path)}`);
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);
    await user.click(
      await screen.findByRole("checkbox", {
        name: "Select all visible templates",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Mark selected as favorite" }),
    );
    await screen.findByText("Selected templates marked as favorite.");

    const cached = JSON.parse(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ) ?? "null",
    ) as {
      savedAt: string;
      page: { templates: PartnershipCrmTemplateRecord[] };
    };
    expect(cached.savedAt).toBe(originalSavedAt);
    expect(cached.page.templates).toEqual([
      expect.objectContaining({
        id: "tpl-1",
        is_favorite: true,
        body: "",
        notes: "",
      }),
    ]);
  });

  it("preserves the oldest cache timestamp when loading another bounded page", async () => {
    const user = userEvent.setup();
    const originalSavedAt = new Date(
      Date.now() - 60 * 60 * 1000,
    ).toISOString();
    const originalAsOf = "2026-10-15T10:00:00.000Z";
    const secondTemplate: PartnershipCrmTemplateRecord = {
      ...template,
      id: "tpl-2",
      name: "Second bounded page",
      normalizedName: "second bounded page",
    };
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: originalSavedAt,
        filters: {
          query: "",
          audience: "organizations",
          status: "all",
          category: "",
        },
        page: {
          templates: [{ ...template, body: "", notes: "" }],
          nextCursor: "cursor-2",
          partial: false,
          scanned: 10,
          asOf: originalAsOf,
        },
      }),
    );
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            locked: false,
          },
        };
      }
      expect(String(path)).toContain("cursor=cursor-2");
      return {
        templates: [secondTemplate],
        nextCursor: undefined,
        partial: false,
        scanned: 1,
        asOf: "2026-10-15T13:00:00.000Z",
      };
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />);
    await user.click(await screen.findByRole("button", { name: "See 10 more" }));
    await screen.findByText("Second bounded page");

    const cached = JSON.parse(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ) ?? "null",
    ) as {
      savedAt: string;
      page: { asOf?: string; templates: PartnershipCrmTemplateRecord[] };
    };
    expect(cached.savedAt).toBe(originalSavedAt);
    expect(cached.page.asOf).toBe(originalAsOf);
    expect(cached.page.templates.map((entry) => entry.id)).toEqual([
      "tpl-1",
      "tpl-2",
    ]);
  });

  it("removes a quick-updated row that no longer matches applied filters", async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const originalSavedAt = new Date().toISOString();
    queryClient.setQueryData(
      ["god-mode-partnership-crm-templates", "active", "organizations"],
      {
        pages: [{ templates: [{ ...template, body: "", notes: "" }] }],
        pageParams: [""],
      },
    );
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({
        savedAt: originalSavedAt,
        filters: {
          query: "",
          audience: "organizations",
          status: "active",
          category: "",
        },
        page: {
          templates: [{ ...template, body: "", notes: "" }],
          asOf: originalSavedAt,
        },
      }),
    );
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            locked: false,
          },
        };
      }
      if (path === "/admin/partnership-crm/templates/tpl-1" && !init?.method) {
        return { template };
      }
      if (
        path === "/admin/partnership-crm/templates/tpl-1" &&
        init?.method === "PUT"
      ) {
        return { template: { ...template, status: "inactive" } };
      }
      throw new Error(`Unexpected request: ${String(path)}`);
    });

    renderWithProviders(<PartnershipCrmTemplateBrowser />, queryClient);
    await user.click(await screen.findByText("Lab outreach"));
    const panel = await screen.findByTestId("template-preview-panel");
    const [statusSelect] = within(panel).getAllByRole("combobox");
    await user.click(statusSelect);
    await user.click(await screen.findByRole("option", { name: "Template Inactive" }));
    await screen.findByText("Template saved.");

    await waitFor(() => {
      expect(screen.queryByTestId("template-preview-panel")).toBeNull();
    });
    const cached = JSON.parse(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ) ?? "null",
    ) as { page: { templates: PartnershipCrmTemplateRecord[] } };
    expect(cached.page.templates).toEqual([]);
    expect(
      (
        queryClient.getQueryData<{
          pages: Array<{ templates: PartnershipCrmTemplateRecord[] }>;
        }>([
          "god-mode-partnership-crm-templates",
          "active",
          "organizations",
        ])
      )?.pages[0]?.templates,
    ).toEqual([]);
  });

  it("opens a right preview panel, orders preview content, and supports panel actions", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath === "/admin/partnership-crm/templates/tpl-1/favorite" &&
        init?.method === "PATCH"
      ) {
        const body = JSON.parse(String(init.body)) as {
          is_favorite: boolean;
        };

        return {
          template: {
            ...template,
            id: template.id,
            is_favorite: Boolean(body.is_favorite),
          },
        };
      }

      if (
        stringPath === "/admin/partnership-crm/templates/tpl-1" &&
        !init?.method
      ) {
        return { template };
      }

      return {
        templates: [template],
        nextCursor: undefined,
      };
    });

    await renderLoadedBrowser();

    await waitFor(() => {
      expect(screen.getByText("Lab outreach")).toBeTruthy();
    });

    await user.click(screen.getByText("Lab outreach"));

    const panel = await screen.findByTestId("template-preview-panel");
    await waitFor(() => {
      const detailCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            path === "/admin/partnership-crm/templates/tpl-1" &&
            !init?.method,
        );
      expect(detailCalls).toHaveLength(1);
    });
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
    const previewSubject = within(panel).getByTestId(
      "template-preview-panel-subject",
    );
    expect(previewSubject.className).toContain("line-clamp-2");
    expect(previewSubject.className).toContain("break-words");
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
        "/admin/partnership-crm/templates/tpl-1/favorite",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    const [, init] = jest
      .mocked(sdkFetch)
      .mock.calls.find(
        ([path, requestInit]) =>
          path === "/admin/partnership-crm/templates/tpl-1/favorite" &&
          requestInit?.method === "PATCH",
      )!;
    expect(JSON.parse(String(init?.body))).toEqual({ is_favorite: true });

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

  it("loads rapid row selections independently and never copies notes across rows", async () => {
    const user = userEvent.setup();
    const summaryA: PartnershipCrmTemplateRecord = {
      ...template,
      id: "tpl-a",
      name: "Template A",
      body: "",
      notes: "",
      normalizedName: "template a",
    };
    const summaryB: PartnershipCrmTemplateRecord = {
      ...template,
      id: "tpl-b",
      name: "Template B",
      body: "",
      notes: "",
      normalizedName: "template b",
    };
    const detailA = deferred<{ template: PartnershipCrmTemplateRecord }>();
    const detailB = deferred<{ template: PartnershipCrmTemplateRecord }>();

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            locked: false,
          },
        };
      }
      if (path === "/admin/partnership-crm/templates/tpl-a") {
        return detailA.promise;
      }
      if (path === "/admin/partnership-crm/templates/tpl-b") {
        return detailB.promise;
      }
      return { templates: [summaryA, summaryB], nextCursor: undefined };
    });

    await renderLoadedBrowser();
    await user.click(await screen.findByText("Template A"));
    await user.click(screen.getByText("Template B"));

    await waitFor(() => {
      const detailCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(([path]) =>
          String(path).match(/\/admin\/partnership-crm\/templates\/tpl-[ab]$/),
        );
      expect(detailCalls).toHaveLength(2);
    });

    await act(async () => {
      detailA.resolve({
        template: { ...summaryA, body: "Body A", notes: "Notes from A" },
      });
      await Promise.resolve();
    });
    expect(screen.getByTestId("template-summary-only-panel")).toBeTruthy();
    expect(screen.queryByDisplayValue("Notes from A")).toBeNull();

    await act(async () => {
      detailB.resolve({
        template: { ...summaryB, body: "Body B", notes: "Notes from B" },
      });
      await Promise.resolve();
    });
    const panel = await screen.findByTestId("template-preview-panel");
    expect(
      within(panel).getByTestId("template-preview-panel-title").textContent,
    ).toContain("Template B");
    expect(
      (within(panel).getByLabelText("Notes") as HTMLTextAreaElement).value,
    ).toBe("Notes from B");
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

    await renderLoadedBrowser();

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
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      ["god-mode-partnership-crm-templates", "active", "organizations"],
      {
        pages: [{ templates: [{ ...template, body: "", notes: "" }] }],
        pageParams: [""],
      },
    );
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (
        path === "/admin/partnership-crm/templates/import" &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(
          String(init.body),
        ) as PartnershipCrmTemplateInput;
        return {
          action: "created",
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

    await renderLoadedBrowser(queryClient);

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates?limit=10&audience=organizations",
        expect.objectContaining({ headers: expect.any(Headers) }),
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

    expect(
      within(dialog).queryByTestId("template-import-current-row"),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Process row" }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", {
        name: "Process next 5 rows",
      }),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", {
        name: "Evaluate one by one",
      }),
    );

    const currentRow = within(dialog).getByTestId(
      "template-import-current-row",
    );
    expect(within(currentRow).getByText("Lab intro")).toBeTruthy();
    expect(within(currentRow).getByText("Organizacion Ejemplo")).toBeTruthy();
    expect(within(currentRow).getByText("Contacto")).toBeTruthy();
    expect(within(currentRow).getByText("{{organization_name}}")).toBeTruthy();
    expect(within(currentRow).getByText("{{contact_name}}")).toBeTruthy();
    expect(
      within(currentRow).queryByRole("button", {
        name: "Evaluate one by one",
      }),
    ).toBeNull();
    expect(
      within(currentRow).getByRole("button", {
        name: "Process next 5 rows",
      }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(
        within(dialog)
          .getByRole("button", { name: "Process row" })
          .getAttribute("disabled"),
      ).toBeNull();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Process row",
      }),
    );

    await waitFor(() => {
      const postCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            path === "/admin/partnership-crm/templates/import" &&
            init?.method === "POST",
        );
      expect(postCalls).toHaveLength(1);
      expect(within(dialog).getByText("Row 2 of 2")).toBeTruthy();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Process next 5 rows",
      }),
    );

    await waitFor(() => {
      const postCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            path === "/admin/partnership-crm/templates/import" &&
            init?.method === "POST",
        );
      expect(postCalls).toHaveLength(2);
    });

    const postBodies = jest
      .mocked(sdkFetch)
      .mock.calls.filter(
        ([path, init]) =>
          path === "/admin/partnership-crm/templates/import" &&
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
      within(dialog).queryByRole("button", { name: "Process row" }),
    ).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    const cachedAfterImport = JSON.parse(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ) ?? "null",
    ) as { page?: { templates?: PartnershipCrmTemplateRecord[] } } | null;
    expect(cachedAfterImport?.page?.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "created-Lab intro" }),
        expect.objectContaining({ id: "created-Foundation intro" }),
      ]),
    );
    expect(
      queryClient.getQueryData([
        "god-mode-partnership-crm-templates",
        "active",
        "organizations",
      ]),
    ).toBeUndefined();
  });

  it("keeps the completed import when the next row is locally blocked at the limit", async () => {
    const user = userEvent.setup();
    const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    let importCalls = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 98,
            limit: 100,
            percentage: 98,
            remaining: 2,
            resetAt,
            locked: false,
          },
        };
      }
      if (
        String(path).startsWith("/admin/partnership-crm/templates?") &&
        !init?.method
      ) {
        return {
          templates: [template],
          nextCursor: undefined,
          usage: {
            surface: "plantillas",
            used: 99,
            limit: 100,
            percentage: 99,
            remaining: 1,
            resetAt,
            locked: false,
          },
        };
      }
      if (
        path === "/admin/partnership-crm/templates/import" &&
        init?.method === "POST"
      ) {
        importCalls += 1;
        if (importCalls > 1) {
          throw new Error("second import must not reach sdkFetch");
        }
        const body = JSON.parse(String(init.body)) as PartnershipCrmTemplateInput;
        return {
          action: "created",
          template: { ...template, ...body, id: "created-first-row" },
          usage: {
            surface: "plantillas",
            used: 100,
            limit: 100,
            percentage: 100,
            remaining: 0,
            resetAt,
            locked: false,
          },
        };
      }
      throw new Error(`Unexpected request: ${String(path)}`);
    });

    await renderLoadedBrowser();
    await screen.findByText("99 / 100 · 99%");
    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = [
      "name,category,subject,body,status,is_favorite,notes",
      '"First known import","org_genetic_testing_laboratories","First","First body","active","false",""',
      '"Blocked import","org_genetic_testing_laboratories","Second","Second body","active","false",""',
    ].join("\n");
    const file = new File([csv], "limit-plantillas.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await user.click(
      within(dialog).getByRole("button", { name: "Process next 5 rows" }),
    );

    expect(
      await within(dialog).findByText(
        "This template was not sent because the daily limit was reached or usage could not be verified.",
      ),
    ).toBeTruthy();
    expect(importCalls).toBe(1);
    expect(within(dialog).getAllByText("Blocked import").length).toBeGreaterThan(0);
    const cached = JSON.parse(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ) ?? "null",
    ) as { page?: { templates?: PartnershipCrmTemplateRecord[] } } | null;
    expect(cached?.page?.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "created-first-row" }),
      ]),
    );
    expect(
      cached?.page?.templates?.find((entry) => entry.id === "tpl-1"),
    ).toBeTruthy();
  });

  it("does not scan the template corpus when a CSV is selected", async () => {
    const user = userEvent.setup();
    const existingTemplate = duplicateTemplateFixture();
    mockDuplicateTemplateImport(existingTemplate);

    await renderLoadedBrowser();

    await user.click(await screen.findByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = duplicateTemplateCsv();
    const file = new File([csv], "duplicate-plantillas.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    const callsBeforeFileSelection = jest.mocked(sdkFetch).mock.calls.length;
    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(
        within(dialog)
          .getByRole("button", { name: "Process next 5 rows" })
          .getAttribute("disabled"),
      ).toBeNull();
    });
    expect(sdkFetch).toHaveBeenCalledTimes(callsBeforeFileSelection);
    expect(within(dialog).queryByText("Possible duplicate")).toBeNull();

    await user.click(
      within(dialog).getByRole("button", {
        name: "Evaluate one by one",
      }),
    );

    expect(within(dialog).queryByText("Possible duplicate")).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Process row" }),
    ).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", { name: "Process row" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Template import finished")).toBeTruthy();
    });
    const updatedMetric = within(dialog).getByText("Updated").parentElement;
    expect(updatedMetric?.textContent).toContain("1");

    const postCall = templateMutationCalls("POST")[0];
    expect(postCall).toBeTruthy();
    expect(postCall?.[0]).toBe("/admin/partnership-crm/templates/import");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual(
      expect.objectContaining({
        name: "Duplicate intro",
        subject: "New subject",
        body: "New body",
        notes: "New note",
        is_favorite: true,
      }),
    );
    expect(templateMutationCalls("PUT")).toHaveLength(0);
  });

  it("does not flag a duplicate when only the subject matches and the template name is unrelated", async () => {
    const user = userEvent.setup();
    const existingTemplate: PartnershipCrmTemplateRecord = {
      ...template,
      id: "tpl-fertility-community",
      name: "Fertility clinic - Community visibility",
      category: "org_fertility_clinics",
      subject: "Pocket Genes + {{organization_name}}",
      body: "Existing fertility clinic template",
      notes: "Existing note",
      normalizedName: "fertility clinic community visibility",
    };

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (
        path === "/admin/partnership-crm/templates/import" &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(
          String(init.body),
        ) as PartnershipCrmTemplateInput;
        return {
          action: "created",
          template: {
            ...template,
            ...body,
            id: "created-b1",
            updatedAt: "2026-09-10T12:00:00.000Z",
          },
        };
      }

      return {
        templates: [existingTemplate],
        nextCursor: undefined,
      };
    });

    await renderLoadedBrowser();

    await user.click(await screen.findByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = [
      "name,category,subject,body,status,is_favorite,notes",
      '"B1","org_genetic_testing_laboratories","Pocket Genes + {{organization_name}}","New lab template","active","true","New note"',
    ].join("\n");
    const file = new File([csv], "subject-only-match.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(
        within(dialog)
          .getByRole("button", { name: "Evaluate one by one" })
          .getAttribute("disabled"),
      ).toBeNull();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Evaluate one by one",
      }),
    );

    const currentRow = within(dialog).getByTestId(
      "template-import-current-row",
    );
    expect(within(currentRow).getByText("B1")).toBeTruthy();
    expect(within(dialog).queryByText("Possible duplicate")).toBeNull();
    expect(
      within(dialog).queryByRole("button", {
        name: "Overwrite subject and body",
      }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Process row" }),
    ).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", { name: "Process row" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Template import finished")).toBeTruthy();
    });
    expect(templateMutationCalls("POST")).toHaveLength(1);
    expect(templateMutationCalls("PUT")).toHaveLength(0);
  });

  it("does not flag coded templates with different leading codes as duplicates", async () => {
    const user = userEvent.setup();
    const existingTemplate: PartnershipCrmTemplateRecord = {
      ...template,
      id: "tpl-a01",
      name: "A01 - Clinica de fertilidad - Comunidad y visibilidad",
      category: "org_genetic_testing_laboratories",
      subject: "Pocket Genes + {{organization_name}}",
      body: "Existing fertility clinic template",
      notes: "Existing note",
      normalizedName: "a01 clinica de fertilidad comunidad y visibilidad",
    };

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (
        path === "/admin/partnership-crm/templates/import" &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(
          String(init.body),
        ) as PartnershipCrmTemplateInput;
        return {
          action: "created",
          template: {
            ...template,
            ...body,
            id: "created-c1",
            updatedAt: "2026-09-10T12:00:00.000Z",
          },
        };
      }

      return {
        templates: [existingTemplate],
        nextCursor: undefined,
      };
    });

    await renderLoadedBrowser();

    await user.click(await screen.findByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = [
      "name,category,subject,body,status,is_favorite,notes",
      '"C1 - Laboratorio de pruebas geneticas - Presentacion institucional","org_genetic_testing_laboratories","Pocket Genes + {{organization_name}}","New lab template","active","true","New note"',
    ].join("\n");
    const file = new File([csv], "coded-subject-match.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(
        within(dialog)
          .getByRole("button", { name: "Evaluate one by one" })
          .getAttribute("disabled"),
      ).toBeNull();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Evaluate one by one",
      }),
    );

    const currentRow = within(dialog).getByTestId(
      "template-import-current-row",
    );
    expect(
      within(currentRow).getByText(
        "C1 - Laboratorio de pruebas geneticas - Presentacion institucional",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText("Possible duplicate")).toBeNull();
    expect(
      within(dialog).queryByRole("button", {
        name: "Overwrite subject and body",
      }),
    ).toBeNull();

    await user.click(
      within(dialog).getByRole("button", { name: "Process row" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Template import finished")).toBeTruthy();
    });
    expect(templateMutationCalls("POST")).toHaveLength(1);
    expect(templateMutationCalls("PUT")).toHaveLength(0);
  });

  it("imports all duplicate template rows by updating existing templates", async () => {
    const user = userEvent.setup();
    const existingTemplate = duplicateTemplateFixture();
    mockDuplicateTemplateImport(existingTemplate);

    await renderLoadedBrowser();

    await user.click(await screen.findByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = duplicateTemplateCsv();
    const file = new File([csv], "duplicate-plantillas.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(
        within(dialog)
          .getByRole("button", { name: "Process next 5 rows" })
          .getAttribute("disabled"),
      ).toBeNull();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Process next 5 rows",
      }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Template import finished")).toBeTruthy();
    });
    expect(templateMutationCalls("POST")).toHaveLength(1);
    expect(templateMutationCalls("PUT")).toHaveLength(0);
  });

  it("imports all remaining duplicate template rows by updating existing templates", async () => {
    const user = userEvent.setup();
    const existingTemplate = duplicateTemplateFixture();
    mockDuplicateTemplateImport(existingTemplate);

    await renderLoadedBrowser();

    await user.click(await screen.findByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = duplicateTemplateCsv();
    const file = new File([csv], "duplicate-plantillas.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(dialog).getByLabelText("CSV file"), file);

    await waitFor(() => {
      expect(
        within(dialog)
          .getByRole("button", { name: "Evaluate one by one" })
          .getAttribute("disabled"),
      ).toBeNull();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Evaluate one by one",
      }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", {
          name: "Process next 5 rows",
        }),
      ).toBeTruthy();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Process next 5 rows",
      }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Template import finished")).toBeTruthy();
    });
    expect(templateMutationCalls("POST")).toHaveLength(1);
    expect(templateMutationCalls("PUT")).toHaveLength(0);
  });

  it("does not render raw template CSV contents and caps visible preview rows", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValue({
      templates: [],
      nextCursor: undefined,
    });

    await renderLoadedBrowser();

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

    await renderLoadedBrowser();

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates?limit=10&audience=organizations",
        expect.objectContaining({ headers: expect.any(Headers) }),
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
      within(dialog).getByText(
        "Each deliberate Process row request sends exactly one row. The server decides whether to create or update it.",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/Possible duplicates/)).toBeNull();
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

    await renderLoadedBrowser();

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/templates?limit=10&audience=organizations",
        expect.objectContaining({ headers: expect.any(Headers) }),
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
    window.sessionStorage.clear();
  });

  it("opens the template preview in a modal instead of rendering it beside the editor", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockResolvedValue({
      template,
    });

    renderWithProviders(
      <PartnershipCrmTemplateWorkbench mode="edit" templateId={template.id} />,
    );

    const loadButton = await screen.findByRole("button", {
      name: "Load template",
    });
    await waitFor(() => expect(loadButton.hasAttribute("disabled")).toBe(false));
    await user.click(loadButton);

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
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      ["god-mode-partnership-crm-templates", "active", "organizations"],
      { pages: [{ templates: [] }], pageParams: [""] },
    );
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({ savedAt: new Date().toISOString() }),
    );
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            locked: false,
          },
        };
      }
      return {
        template: {
          ...template,
          category: "org_genetic_testing_laboratories",
        },
      };
    });

    renderWithProviders(
      <PartnershipCrmTemplateWorkbench mode="create" />,
      queryClient,
    );

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
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(saveButton);

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
    expect(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ),
    ).toBeNull();
    expect(
      queryClient.getQueryData([
        "god-mode-partnership-crm-templates",
        "active",
        "organizations",
      ]),
    ).toBeUndefined();
  });

  it("clears the summary cache after deleting a standalone template", async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      ["god-mode-partnership-crm-templates", "active", "organizations"],
      {
        pages: [{ templates: [{ ...template, body: "", notes: "" }] }],
        pageParams: [""],
      },
    );
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      JSON.stringify({ savedAt: new Date().toISOString() }),
    );
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        return {
          usage: {
            surface: "plantillas",
            used: 1,
            limit: 100,
            percentage: 1,
            remaining: 99,
            resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            locked: false,
          },
        };
      }
      if (
        path === "/admin/partnership-crm/templates/tpl-1" &&
        init?.method === "DELETE"
      ) {
        return { deleted: true, templateId: "tpl-1" };
      }
      return { template };
    });

    renderWithProviders(
      <PartnershipCrmTemplateWorkbench mode="edit" templateId="tpl-1" />,
      queryClient,
    );
    const loadButton = await screen.findByRole("button", {
      name: "Load template",
    });
    await waitFor(() => expect(loadButton.hasAttribute("disabled")).toBe(false));
    await user.click(loadButton);
    await screen.findByDisplayValue("Lab outreach");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete template",
    });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/god-mode/plantillas"));
    expect(
      window.sessionStorage.getItem(
        "golden-crow-plantillas-summary-cache-v1",
      ),
    ).toBeNull();
    expect(
      queryClient.getQueryData([
        "god-mode-partnership-crm-templates",
        "active",
        "organizations",
      ]),
    ).toBeUndefined();
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
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(saveButton);

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
