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
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  mergeCrmDailyUsage,
  PartnershipCrmWorkbench,
} from "@/components/god-mode/partnership-crm-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  PartnershipCrmOrganizationRecord,
  PartnershipCrmProfessionalRecord,
  PartnershipCrmSnapshot,
  PartnershipCrmTemplateRecord,
} from "@/lib/partnership-crm";

jest.setTimeout(60000);

const routerRefresh = jest.fn();
const approvedCrmEmailClosing = [
  "Te comparto nuestro link para que puedas conocer la propuesta y sumarte a la red:",
  "",
  "https://goldencrowvs.com/pocket-genes/join-us/",
  "",
  "Quedamos a la espera de tu respuesta.",
  "",
  "Saludos,",
  "Federico",
].join("\n");

function withApprovedCrmEmailClosing(body: string) {
  return `${body}\n\n${approvedCrmEmailClosing}`;
}

function withApprovedCrmEmailClosingHtml(body: string) {
  return `${body}<br><br>${approvedCrmEmailClosing.replace(/\n/g, "<br>")}`;
}

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

const indexedCrmSnapshot: PartnershipCrmSnapshot = {
  schemaVersion: 1,
  refreshState: "ready",
  canRefreshToday: true,
  nextRefreshAt: "2026-10-16T03:00:00.000Z",
  generationId: "crm-snapshot-2026-10-15",
  lastRefreshAttemptDate: "2026-10-15",
  lastRefreshAttemptAt: "2026-10-15T10:00:00.000Z",
  lastFullRefreshAt: "2026-10-15T10:00:00.000Z",
  lastIncrementalUpdateAt: "2026-10-15T11:00:00.000Z",
  sourceReadCount: 248,
  totals: {
    all: 248,
    organizations: 241,
    professionals: 7,
  },
  targets: {
    organizations: {
      targetKind: "organizations",
      facets: {
        status: {
          key: "status",
          total: 241,
          buckets: [
            { value: "new", count: 229 },
            { value: "contacted", count: 5 },
            { value: "replied", count: 3 },
            { value: "meeting", count: 2 },
            { value: "partner", count: 2 },
          ],
        },
        category: {
          key: "category",
          total: 241,
          buckets: [
            { value: "org_genetic_testing_laboratories", count: 241 },
          ],
        },
        country: {
          key: "country",
          total: 241,
          buckets: [{ value: "AR", count: 241 }],
        },
        linkedInState: {
          key: "linkedInState",
          total: 241,
          buckets: [{ value: "missing_linkedin", count: 241 }],
        },
      },
    },
    professionals: {
      targetKind: "professionals",
      facets: {
        status: {
          key: "status",
          total: 7,
          buckets: [{ value: "new", count: 7 }],
        },
        category: {
          key: "category",
          total: 7,
          buckets: [{ value: "pro_clinical_geneticists", count: 7 }],
        },
        country: {
          key: "country",
          total: 7,
          buckets: [{ value: "AR", count: 7 }],
        },
        linkedInState: {
          key: "linkedInState",
          total: 7,
          buckets: [{ value: "has_linkedin", count: 7 }],
        },
      },
    },
  },
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

function crmSummaryCacheKey(
  filters = {
    query: "",
    status: "all",
    category: "",
    country: "",
    linkedInState: "all",
  },
) {
  return `golden-crow:partnership-crm:summary:v3:organizations:${encodeURIComponent(
    JSON.stringify({ filters, cursor: "" }),
  )}`;
}

const crmDailyUsageCacheKey =
  "golden-crow:partnership-crm:daily-usage:crm:v2";

function cacheCrmDailyUsage({
  used,
  resetAt,
  confirmedAt = new Date(Date.now() - 1000).toISOString(),
}: {
  used: number;
  resetAt: string;
  confirmedAt?: string;
}) {
  window.localStorage.setItem(
    crmDailyUsageCacheKey,
    JSON.stringify({
      usage: {
        surface: "crm",
        used,
        limit: 100,
        percentage: used,
        remaining: 100 - used,
        resetAt,
        locked: used >= 100,
      },
      confirmedAt,
    }),
  );
}

function renderWorkbench(
  language: "en" | "es" = "en",
  options: {
    autoLoad?: boolean;
    authoritativeUsageMock?: boolean;
    injectActionUsage?: boolean;
  } = {},
) {
  const currentImplementation = jest.mocked(sdkFetch).getMockImplementation();
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (
      path === "/admin/partnership-crm/daily-usage/page-load" &&
      !options.authoritativeUsageMock
    ) {
      return {
        usage: {
          surface: "crm",
          used: 1,
          limit: 100,
          percentage: 1,
          remaining: 99,
          resetAt: "2026-10-16T07:00:00.000Z",
          locked: false,
        },
      };
    }
    const result = currentImplementation
      ? await currentImplementation(path, init)
      : undefined;
    if (
      path === "/admin/partnership-crm/daily-usage/page-load" &&
      (!result || typeof result !== "object" || !("usage" in result))
    ) {
      return {
        usage: {
          surface: "crm",
          used: 1,
          limit: 100,
          percentage: 1,
          remaining: 99,
          resetAt: "2026-10-16T07:00:00.000Z",
          locked: false,
        },
      };
    }
    if (
      options.injectActionUsage !== false &&
      String(path).startsWith("/admin/partnership-crm/") &&
      !String(path).startsWith("/admin/partnership-crm/snapshot") &&
      result &&
      typeof result === "object" &&
      !("usage" in result)
    ) {
      return {
        ...result,
        usage: {
          surface: "crm",
          used: 2,
          limit: 100,
          percentage: 2,
          remaining: 98,
          resetAt: "2026-10-16T07:00:00.000Z",
          locked: false,
        },
      };
    }
    return result;
  });

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const view = render(
    <QueryClientProvider client={client}>
      <AppLanguageProvider initialLanguage={language} forcedLanguage={language}>
        <PartnershipCrmWorkbench />
      </AppLanguageProvider>
    </QueryClientProvider>,
  );

  if (options.autoLoad !== false) {
    let attempts = 0;
    const clickWhenVerified = () => {
      const button = screen.getByTestId("crm-explicit-load");
      if ((button as HTMLButtonElement).disabled && attempts < 50) {
        attempts += 1;
        window.setTimeout(clickWhenVerified, 1);
        return;
      }
      if (!(button as HTMLButtonElement).disabled) {
        fireEvent.click(button);
      }
    };
    window.setTimeout(clickWhenVerified, 0);
  }

  return { ...view, client };
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

// The fixtures below carry fixed quota timestamps (resetAt 2026-10-16T07:00Z,
// asOf 2026-10-15T12:00Z). With the real clock they expired at 07:00Z on
// 2026-10-16 and every test failed closed on a "stale" daily quota — 72 reds
// on main with no code change. Pin ONLY Date to the day the fixtures describe;
// timers stay real so userEvent/waitFor keep working. Tests that need fake
// timers still call jest.useFakeTimers() themselves.
const FIXTURE_NOW = new Date("2026-10-15T12:00:00.000Z");
beforeEach(() => {
  jest.useFakeTimers({
    now: FIXTURE_NOW,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
});
afterEach(() => {
  jest.useRealTimers();
});

describe("PartnershipCrmWorkbench delete flow", () => {
  beforeEach(() => {
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  it("loads no CRM data until the operator explicitly applies or loads", async () => {
    const user = userEvent.setup();
    renderWorkbench("en", { autoLoad: false });

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledTimes(1);
    });
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/daily-usage/page-load",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );

    await user.type(
      screen.getByPlaceholderText("Name prefix or exact contact email"),
      "genome",
    );
    expect(sdkFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("crm-server-filter-note").textContent).toContain(
      "Category and country match the primary stored value by prefix",
    );

    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/organizations?limit=20&query=genome",
        expect.objectContaining({ headers: expect.any(Headers) }),
      );
    });
  });

  it("sends a professional email search to the server only after Apply", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (String(path).startsWith("/admin/partnership-crm/professionals?")) {
        return { professionals: [professional], nextCursor: undefined };
      }
      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench("en", { autoLoad: false });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply filters" })).toHaveProperty(
        "disabled",
        false,
      );
    });
    await user.click(screen.getByRole("tab", { name: "Professionals" }));
    await user.type(
      screen.getByPlaceholderText("Name prefix or exact email"),
      "ada@genomelab.example",
    );

    expect(sdkFetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/professionals?limit=20&query=ada%40genomelab.example",
        expect.objectContaining({ headers: expect.any(Headers) }),
      );
    });
  });

  it("preserves hydrated cache expiry until a deliberate fresh load", async () => {
    const user = userEvent.setup();
    const cacheKey = crmSummaryCacheKey();
    const originalExpiry = Date.now() + 60_000;
    window.sessionStorage.setItem(
      cacheKey,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        expiresAt: originalExpiry,
        page: { organizations: [organization], nextCursor: undefined },
      }),
    );

    renderWorkbench("en", { autoLoad: false });
    await screen.findByText("Delete Me Genomics");
    await waitFor(() => {
      expect(
        JSON.parse(window.sessionStorage.getItem(cacheKey) ?? "{}").expiresAt,
      ).toBe(originalExpiry);
    });

    await user.click(screen.getByTestId("crm-explicit-load"));
    await waitFor(() => {
      expect(
        JSON.parse(window.sessionStorage.getItem(cacheKey) ?? "{}").expiresAt,
      ).toBeGreaterThan(originalExpiry);
    });
  });

  it("does not hydrate obsolete ten-row summary caches", async () => {
    const obsoleteKey = crmSummaryCacheKey().replace(
      ":summary:v3:",
      ":summary:v2:",
    );
    window.sessionStorage.setItem(
      obsoleteKey,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        expiresAt: Date.now() + 60_000,
        page: { organizations: [organization], nextCursor: undefined },
      }),
    );

    renderWorkbench("en", { autoLoad: false });
    await screen.findByRole("progressbar", {
      name: "CRM daily action budget",
    });

    expect(screen.queryByText("Delete Me Genomics")).toBeNull();
  });

  it.each([
    [
      "missing expiry",
      () =>
        JSON.stringify({
          cachedAt: new Date().toISOString(),
          page: { organizations: [organization] },
        }),
    ],
    [
      "non-number expiry",
      () =>
        JSON.stringify({
          cachedAt: new Date().toISOString(),
          expiresAt: "tomorrow",
          page: { organizations: [organization] },
        }),
    ],
    [
      "non-finite expiry",
      () =>
        `{"cachedAt":${JSON.stringify(new Date().toISOString())},"expiresAt":1e999,"page":${JSON.stringify(
          { organizations: [organization] },
        )}}`,
    ],
    [
      "expired entry",
      () =>
        JSON.stringify({
          cachedAt: new Date().toISOString(),
          expiresAt: Date.now() - 1,
          page: { organizations: [organization] },
        }),
    ],
    [
      "future cache origin",
      () =>
        JSON.stringify({
          cachedAt: new Date(Date.now() + 60_000).toISOString(),
          expiresAt: Date.now() + 120_000,
          page: { organizations: [organization] },
        }),
    ],
    [
      "expiry beyond the configured TTL",
      () => {
        const cachedAt = Date.now();
        return JSON.stringify({
          cachedAt: new Date(cachedAt).toISOString(),
          expiresAt: cachedAt + 24 * 60 * 60_000 + 1,
          page: { organizations: [organization] },
        });
      },
    ],
    [
      "malformed page",
      () =>
        JSON.stringify({
          cachedAt: new Date().toISOString(),
          expiresAt: Date.now() + 60_000,
          page: { organizations: "not-an-array" },
        }),
    ],
  ])("evicts a CRM summary cache with %s", async (_label, buildRaw) => {
    const cacheKey = crmSummaryCacheKey();
    window.sessionStorage.setItem(cacheKey, buildRaw());

    renderWorkbench("en", { autoLoad: false });
    await screen.findByRole("progressbar", {
      name: "CRM daily action budget",
    });

    expect(screen.queryByText("Delete Me Genomics")).toBeNull();
    expect(window.sessionStorage.getItem(cacheKey)).toBeNull();
  });

  it("keeps created full records in detail cache without growing the loaded page", async () => {
    const user = userEvent.setup();
    const createdOrganization = {
      ...organization,
      id: "org-created",
      name: "Created Genetics",
      notes: "Long private creation notes",
    };
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (
        path === "/admin/partnership-crm/organizations" &&
        init?.method === "POST"
      ) {
        return { organization: createdOrganization };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    const { client } = renderWorkbench();
    await screen.findByText("Delete Me Genomics");
    await user.click(screen.getByRole("button", { name: "Add Organization" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add CRM organization",
    });
    await user.type(
      within(dialog).getByLabelText("Organization name"),
      "Created Genetics",
    );
    await user.type(
      within(dialog).getByLabelText("Notes"),
      "Long private creation notes",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Add CRM organization" }),
      ).toBeNull();
    });
    const currentPage = client.getQueryData<{
      organizations: PartnershipCrmOrganizationRecord[];
    }>([
      "god-mode-partnership-crm-organizations",
      "organizations",
      {
        query: "",
        status: "all",
        category: "",
        country: "",
        linkedInState: "all",
      },
      undefined,
    ]);
    expect(
      currentPage?.organizations.find((entry) => entry.id === "org-created")
        ?.notes,
    ).toBeUndefined();
    expect(currentPage?.organizations.map((entry) => entry.id)).toEqual([
      "org-1",
    ]);
    expect(
      client.getQueryData<{ organization: PartnershipCrmOrganizationRecord }>([
        "god-mode-partnership-crm-organizations",
        "detail",
        "organizations",
        "org-created",
      ])?.organization.notes,
    ).toBe("Long private creation notes");
  });

  it("locks fresh CRM actions when the daily counter reaches 100", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      usage: {
        surface: "crm",
        used: 100,
        limit: 100,
        percentage: 100,
        remaining: 0,
        resetAt: "2026-10-16T07:00:00.000Z",
        locked: true,
      },
    });

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });

    const progress = await screen.findByRole("progressbar", {
      name: "CRM daily action budget",
    });
    await waitFor(() => {
      expect(progress.getAttribute("aria-valuenow")).toBe("100");
    });
    expect(screen.getByText("Daily limit reached")).toBeTruthy();
    expect(screen.getByText("Fresh CRM data unavailable")).toBeTruthy();
    expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("button", { name: "Add Organization" }),
    ).toHaveProperty("disabled", true);
  });

  it("hard-locks at 100 percent even when response metadata says unlocked", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      usage: {
        surface: "crm",
        used: 100,
        limit: 100,
        percentage: 100,
        remaining: 0,
        resetAt: "2026-10-16T07:00:00.000Z",
        locked: false,
      },
    });

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });

    await waitFor(() => {
      expect(screen.getByText("Daily limit reached")).toBeTruthy();
      expect(
        screen
          .getByRole("progressbar", { name: "CRM daily action budget" })
          .getAttribute("aria-valuenow"),
      ).toBe("100");
      expect(screen.getByText("100 / 100 · 100%")).toBeTruthy();
      expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
        "disabled",
        true,
      );
    });
  });

  it("fails closed when quota usage is fractional", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      usage: {
        surface: "crm",
        used: 1.5,
        limit: 100,
        percentage: 1.5,
        remaining: 98.5,
        resetAt: "2026-10-16T07:00:00.000Z",
        locked: false,
      },
    });

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });

    expect(
      await screen.findByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("does not let a late lower usage response unlock the same quota window", () => {
    const lockedUsage = mergeCrmDailyUsage(null, {
      surface: "crm",
      used: 100,
      limit: 100,
      percentage: 100,
      remaining: 0,
      resetAt: "2026-10-16T07:00:00.000Z",
      locked: true,
    });

    expect(
      mergeCrmDailyUsage(lockedUsage, {
        surface: "crm",
        used: 99,
        limit: 100,
        percentage: 99,
        remaining: 1,
        resetAt: "2026-10-16T07:00:00.000Z",
        locked: false,
      }),
    ).toEqual(expect.objectContaining({ used: 100, locked: true }));
    expect(
      mergeCrmDailyUsage(lockedUsage, {
        surface: "crm",
        used: 1,
        limit: 100,
        percentage: 1,
        remaining: 99,
        resetAt: "2026-10-17T07:00:00.000Z",
        locked: false,
      }),
    ).toEqual(expect.objectContaining({ used: 1, locked: false }));
  });

  it("fails closed after an ambiguous mutation error without discarding the draft", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (
        path === "/admin/partnership-crm/organizations" &&
        init?.method === "POST"
      ) {
        throw new Error("Network response was ambiguous");
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    const { client } = renderWorkbench();
    await screen.findByText("Delete Me Genomics");
    const staleSummaryKey =
      "golden-crow:partnership-crm:summary:v3:ambiguous-create";
    window.sessionStorage.setItem(staleSummaryKey, "stale");
    await user.click(screen.getByRole("button", { name: "Add Organization" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add CRM organization",
    });
    const nameInput = within(dialog).getByLabelText("Organization name");
    await user.type(nameInput, "Unsent Genetics");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/organizations",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(nameInput.closest("fieldset")).toHaveProperty("disabled", true);
    });
    expect(
      screen.getByRole("button", {
        name: "Retry verification",
        hidden: true,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "Add CRM organization" }),
    ).toBeTruthy();
    expect((nameInput as HTMLInputElement).value).toBe("Unsent Genetics");
    expect(nameInput.closest("fieldset")).toHaveProperty("disabled", true);
    expect(
      within(dialog).getByRole("button", { name: "Save changes" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
      "disabled",
      true,
    );
    expect(window.sessionStorage.getItem(staleSummaryKey)).toBeNull();
    expect(
      client.getQueryData([
        "god-mode-partnership-crm-organizations",
        "organizations",
        {
          query: "",
          status: "all",
          category: "",
          country: "",
          linkedInState: "all",
        },
        undefined,
      ]),
    ).toBeUndefined();
    expect(screen.getByText("Data changed. Refresh when ready.")).toBeTruthy();
  });

  it("clears exact detail after an ambiguous target mutation", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (String(path).endsWith("/favorite") && init?.method === "PATCH") {
        throw new Error("Favorite response was lost");
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    const { client } = renderWorkbench();
    const detailKey = [
      "god-mode-partnership-crm-organizations",
      "detail",
      "organizations",
      "org-1",
    ];
    client.setQueryData(detailKey, { organization });
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(
      within(screen.getByTestId("crm-detail-panel")).getByRole("button", {
        name: "Mark as favorite",
      }),
    );

    expect(
      await screen.findByText("Unable to update CRM favorite."),
    ).toBeTruthy();
    expect(client.getQueryData(detailKey)).toBeUndefined();
    expect(screen.getByText("Data changed. Refresh when ready.")).toBeTruthy();
  });

  it("does not replay a failed template read after quota verification recovers", async () => {
    const user = userEvent.setup();
    let templateReads = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        templateReads += 1;
        if (templateReads === 1) {
          throw new Error("Template read failed ambiguously");
        }
        return {
          templates: [recommendedEmailTemplate],
          nextCursor: undefined,
        };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    await waitFor(() => {
      expect(templateReads).toBe(1);
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry verification",
        hidden: true,
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
        "disabled",
        false,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(templateReads).toBe(1);
    expect(screen.getByRole("dialog", { name: "Send CRM email" })).toBe(dialog);
    expect(
      within(dialog).getByText("Unable to load email templates."),
    ).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", { name: "Retry templates" }),
    );
    await waitFor(() => {
      expect(templateReads).toBe(2);
      expect(
        within(dialog).queryByText("Unable to load email templates."),
      ).toBeNull();
    });
  });

  it("retries only the failed next template page", async () => {
    const user = userEvent.setup();
    const templatePaths: string[] = [];
    let nextPageAttempts = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        templatePaths.push(stringPath);
        if (stringPath.includes("cursor=template-cursor-2")) {
          nextPageAttempts += 1;
          if (nextPageAttempts === 1) {
            throw new Error("Next template page failed ambiguously");
          }
          return {
            templates: [otherCategoryEmailTemplate],
            nextCursor: undefined,
          };
        }
        return {
          templates: [recommendedEmailTemplate],
          nextCursor: "template-cursor-2",
        };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    await user.click(
      await within(dialog).findByRole("button", {
        name: "Load more templates",
      }),
    );
    expect(
      await within(dialog).findByText("Unable to load email templates."),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry verification",
        hidden: true,
      }),
    );
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Retry templates" }),
      ).toHaveProperty("disabled", false);
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Retry templates" }),
    );

    await waitFor(() => {
      expect(
        within(dialog).queryByText("Unable to load email templates."),
      ).toBeNull();
    });
    expect(
      templatePaths.filter((path) => !path.includes("cursor=")),
    ).toHaveLength(1);
    expect(
      templatePaths.filter((path) => path.includes("cursor=template-cursor-2")),
    ).toHaveLength(2);
  });

  it("shows a failed lazy detail read and retries it only after explicit clicks", async () => {
    const user = userEvent.setup();
    let detailReads = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/organizations/org-1") {
        detailReads += 1;
        if (detailReads === 1) {
          throw new Error("Detail read failed ambiguously");
        }
        return { organization };
      }
      return {
        organizations: [{ ...organization, notes: "" }],
        nextCursor: undefined,
      };
    });

    renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));

    const detailPanel = await screen.findByTestId("crm-detail-panel");
    expect(
      await within(detailPanel).findByText("Unable to load CRM detail."),
    ).toBeTruthy();
    expect(detailReads).toBe(1);
    expect(
      within(detailPanel).getByRole("button", { name: "Retry detail" }),
    ).toHaveProperty("disabled", true);

    await user.click(
      screen.getByRole("button", {
        name: "Retry verification",
        hidden: true,
      }),
    );
    await waitFor(() => {
      expect(
        within(detailPanel).getByRole("button", { name: "Retry detail" }),
      ).toHaveProperty("disabled", false);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(detailReads).toBe(1);

    await user.click(
      within(detailPanel).getByRole("button", { name: "Retry detail" }),
    );
    await waitFor(() => {
      expect(detailReads).toBe(2);
      expect(
        within(detailPanel).queryByText("Unable to load CRM detail."),
      ).toBeNull();
    });
  });

  it("keeps a cached server count visible and fail-closed when verification fails", async () => {
    const resetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    cacheCrmDailyUsage({ used: 17, resetAt });
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        throw new Error("Usage service unavailable");
      }
      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });

    await screen.findByRole("button", { name: "Retry verification" });
    expect(screen.getByText("17 / 100 · 17%")).toBeTruthy();
    expect(screen.getByText(/Last confirmed server count/)).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar", { name: "CRM daily action budget" })
        .getAttribute("aria-valuenow"),
    ).toBe("17");
    expect(screen.queryByText("0 / 100 · 0%")).toBeNull();
    expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("does not regress a confirmed count from an older cross-tab cache update", async () => {
    const resetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const confirmedAt = new Date(Date.now() - 1000).toISOString();
    cacheCrmDailyUsage({ used: 17, resetAt, confirmedAt });
    jest.mocked(sdkFetch).mockRejectedValueOnce(
      new Error("Usage service unavailable"),
    );

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });
    await screen.findByRole("button", { name: "Retry verification" });

    const olderSnapshot = JSON.stringify({
      usage: {
        surface: "crm",
        used: 9,
        limit: 100,
        percentage: 9,
        remaining: 91,
        resetAt,
        locked: false,
      },
      confirmedAt: new Date(Date.now() - 5000).toISOString(),
    });
    window.localStorage.setItem(crmDailyUsageCacheKey, olderSnapshot);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: crmDailyUsageCacheKey,
          newValue: olderSnapshot,
        }),
      );
    });

    expect(screen.getByText("17 / 100 · 17%")).toBeTruthy();
    expect(
      JSON.parse(
        window.localStorage.getItem(crmDailyUsageCacheKey) ?? "null",
      ).usage.used,
    ).toBe(17);
  });

  it("replaces a stale cached count when an explicit refresh returns a newer window", async () => {
    const user = userEvent.setup();
    const resetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const nextResetAt = new Date(
      Date.parse(resetAt) + 24 * 60 * 60 * 1000,
    ).toISOString();
    cacheCrmDailyUsage({ used: 17, resetAt });
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        throw new Error("Usage service unavailable");
      }
      if (path === "/admin/partnership-crm/daily-usage?surface=crm") {
        return {
          usage: {
            surface: "crm",
            used: 3,
            limit: 100,
            percentage: 3,
            remaining: 97,
            resetAt: nextResetAt,
            locked: false,
          },
        };
      }
      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });
    await screen.findByRole("button", { name: "Retry verification" });
    await user.click(screen.getByRole("button", { name: "Verify usage" }));

    await screen.findByText("3 / 100 · 3%");
    expect(screen.getByText(/Server-confirmed action count/)).toBeTruthy();
    expect(jest.mocked(sdkFetch).mock.calls.at(-1)).toEqual([
      "/admin/partnership-crm/daily-usage?surface=crm",
      { cache: "no-store" },
    ]);
  });

  it("fails closed until daily usage can be authoritatively verified", async () => {
    const user = userEvent.setup();
    let verificationAttempts = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (
        path === "/admin/partnership-crm/daily-usage/page-load" ||
        path === "/admin/partnership-crm/daily-usage?surface=crm"
      ) {
        verificationAttempts += 1;
        if (verificationAttempts === 1) {
          throw new Error("Usage service unavailable");
        }
        return {
          usage: {
            surface: "crm",
            used: 2,
            limit: 100,
            percentage: 2,
            remaining: 98,
            resetAt: "2026-10-16T07:00:00.000Z",
            locked: false,
          },
        };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });

    const retry = await screen.findByRole("button", {
      name: "Retry verification",
    });
    expect(screen.getByText("Fresh CRM data unavailable")).toBeTruthy();
    expect(
      screen.getByText(
        "CRM usage verification failed. No CRM data is loaded, and fresh actions remain disabled.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("button", { name: "Add Organization" }),
    ).toHaveProperty("disabled", true);
    const progress = screen.getByRole("progressbar", {
      name: "CRM daily action budget",
    });
    expect(progress.getAttribute("aria-valuenow")).toBeNull();
    expect(screen.getAllByText("Usage unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 / 100 · 0%")).toBeNull();

    fireEvent.click(screen.getByTestId("crm-explicit-load"));
    expect(verificationAttempts).toBe(1);

    await user.click(retry);
    await waitFor(() => {
      expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
        "disabled",
        false,
      );
    });
    expect(verificationAttempts).toBe(2);
    expect(jest.mocked(sdkFetch).mock.calls.at(-1)).toEqual([
      "/admin/partnership-crm/daily-usage?surface=crm",
      { cache: "no-store" },
    ]);
  });

  it("honestly identifies cached read-only data when verification fails", async () => {
    const cacheKey = crmSummaryCacheKey();
    window.sessionStorage.setItem(
      cacheKey,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        expiresAt: Date.now() + 60_000,
        page: {
          organizations: [{ ...organization, notes: "" }],
          nextCursor: undefined,
        },
      }),
    );
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        throw new Error("Usage service unavailable");
      }
      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });

    expect(await screen.findByText("Delete Me Genomics")).toBeTruthy();
    expect(await screen.findByText("Cached read-only mode")).toBeTruthy();
    expect(
      screen.getByText(
        "CRM usage verification failed. Cached data is still available, but fresh actions remain disabled.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("fails closed when page-load verification returns invalid usage", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      usage: {
        surface: "crm",
        used: 1,
        limit: 100,
        percentage: 1,
        remaining: 99,
        resetAt: "not-a-date",
        locked: false,
      },
    });

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });

    expect(
      await screen.findByRole("button", { name: "Retry verification" }),
    ).toBeTruthy();
    expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("does not auto-retry an initial usage verification failure", async () => {
    jest.useFakeTimers();
    let verificationAttempts = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        verificationAttempts += 1;
        throw new Error("Usage service unavailable");
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    try {
      renderWorkbench("en", {
        autoLoad: false,
        authoritativeUsageMock: true,
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(verificationAttempts).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(30 * 60_000);
        await Promise.resolve();
      });
      expect(verificationAttempts).toBe(1);
      expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
        "disabled",
        true,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("refreshes the locked counter after reset without consuming an action", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    let pageLoads = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        pageLoads += 1;
        return {
          usage: {
            surface: "crm",
            used: 100,
            limit: 100,
            percentage: 100,
            remaining: 0,
            resetAt: "2026-10-15T12:00:01.000Z",
            locked: true,
          },
        };
      }
      if (path === "/admin/partnership-crm/daily-usage?surface=crm") {
        return {
          usage: {
            surface: "crm",
            used: 0,
            limit: 100,
            percentage: 0,
            remaining: 100,
            resetAt: "2026-10-16T07:00:00.000Z",
            locked: false,
          },
        };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    try {
      renderWorkbench("en", {
        autoLoad: false,
        authoritativeUsageMock: true,
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(pageLoads).toBe(1);
      expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
        "disabled",
        true,
      );

      await act(async () => {
        jest.advanceTimersByTime(2001);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(pageLoads).toBe(1);
      expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
        "disabled",
        false,
      );
      expect(jest.mocked(sdkFetch).mock.calls[1]).toEqual([
        "/admin/partnership-crm/daily-usage?surface=crm",
        { cache: "no-store" },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not poll after a reset refresh failure", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    let pageLoads = 0;
    let snapshots = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/daily-usage/page-load") {
        pageLoads += 1;
        return {
          usage: {
            surface: "crm",
            used: 100,
            limit: 100,
            percentage: 100,
            remaining: 0,
            resetAt: "2026-10-15T12:00:01.000Z",
            locked: true,
          },
        };
      }
      if (path === "/admin/partnership-crm/daily-usage?surface=crm") {
        snapshots += 1;
        if (snapshots === 1) {
          throw new Error("Temporary verification failure");
        }
        return {
          usage: {
            surface: "crm",
            used: 0,
            limit: 100,
            percentage: 0,
            remaining: 100,
            resetAt: "2026-10-16T07:00:00.000Z",
            locked: false,
          },
        };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    try {
      renderWorkbench("en", {
        autoLoad: false,
        authoritativeUsageMock: true,
      });
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        jest.advanceTimersByTime(2001);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(pageLoads).toBe(1);
      expect(snapshots).toBe(1);
      expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
        "disabled",
        true,
      );

      await act(async () => {
        jest.advanceTimersByTime(59_999);
        await Promise.resolve();
      });
      expect(pageLoads).toBe(1);
      expect(snapshots).toBe(1);
      fireEvent.click(
        screen.getByRole("button", { name: "Retry verification" }),
      );
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(snapshots).toBe(2);
      expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
        "disabled",
        false,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("closes the confirmation dialog and removes the row without refreshing", async () => {
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
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations/org-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.any(Headers),
      }),
    );
  });

  it("does not auto-select or detail-read another target after deletion", async () => {
    const user = userEvent.setup();
    const remainingSummary = {
      ...organization,
      id: "org-2",
      name: "Remaining Summary",
      contactEmail: "remaining@example.org",
      notes: "",
    };
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (init?.method === "DELETE") {
        return { deleted: true, organizationId: organization.id };
      }
      if (path === "/admin/partnership-crm/organizations/org-2") {
        return {
          organization: {
            ...remainingSummary,
            notes: "Full remaining detail",
          },
        };
      }
      return {
        organizations: [organization, remainingSummary],
        nextCursor: undefined,
      };
    });

    renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByText("Delete Me Genomics")).toBeNull();
    });
    expect(screen.getByText("Remaining Summary")).toBeTruthy();
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            path === "/admin/partnership-crm/organizations/org-2" &&
            !init?.method,
        ),
    ).toHaveLength(0);
  });

  it("shows favorite CRM organizations first with a cyan star cell", async () => {
    const favoriteOrganization: PartnershipCrmOrganizationRecord = {
      ...organization,
      id: "org-favorite",
      name: "Favorite Genetics",
      is_favorite: true,
      status: "contacted",
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
    const favoriteSignal = within(rows[0]).getByRole("img", {
      name: "Favorite",
    });
    expect(favoriteSignal.querySelector("svg")?.className.baseVal).toContain(
      "fill-cyan-400",
    );
    expect(
      favoriteSignal.closest("[data-slot='table-cell']")?.className,
    ).toContain("bg-cyan-50");
    expect(
      within(rows[0]).getByRole("img", { name: "Email sent" }).className,
    ).toContain("text-orange-600");
  });

  it("uses distinct CRM colors for contacted, replied, and partner", async () => {
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
    const partnerOrganization: PartnershipCrmOrganizationRecord = {
      ...organization,
      id: "org-partner",
      name: "Partner Genetics",
      status: "partner",
      normalizedName: "partner genetics",
    };

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }

      return {
        organizations: [
          contactedOrganization,
          repliedOrganization,
          partnerOrganization,
        ],
        nextCursor: undefined,
      };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByText("Contacted Genetics")).toBeTruthy();
      expect(screen.getByText("Replied Genetics")).toBeTruthy();
      expect(screen.getByText("Partner Genetics")).toBeTruthy();
    });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const contactedRow = rows.find((row) =>
      within(row).queryByText("Contacted Genetics"),
    );
    const repliedRow = rows.find((row) =>
      within(row).queryByText("Replied Genetics"),
    );
    const partnerRow = rows.find((row) =>
      within(row).queryByText("Partner Genetics"),
    );

    expect(contactedRow).toBeTruthy();
    expect(repliedRow).toBeTruthy();
    expect(partnerRow).toBeTruthy();

    const sentSignal = within(contactedRow as HTMLElement).getByRole("img", {
      name: "Email sent",
    });
    expect(sentSignal.closest("[data-slot='table-cell']")?.className).toContain(
      "bg-orange-50",
    );
    expect(sentSignal.className).toContain("text-orange-600");
    expect(
      within(contactedRow as HTMLElement).getByText("CRM Contacted").className,
    ).toContain("bg-orange-50");

    const replySignal = within(repliedRow as HTMLElement).getByRole("img", {
      name: "Reply received",
    });
    expect(
      replySignal.closest("[data-slot='table-cell']")?.className,
    ).toContain("bg-emerald-50");

    const partnerBadge = within(partnerRow as HTMLElement).getByText(
      "CRM Partner",
    );
    expect(partnerBadge.className).toContain("bg-indigo-700");
    expect(partnerBadge.className).not.toContain("success");

    const partnerPipelineCard = screen.getByRole("button", {
      name: /Partner\s+1/,
    });
    expect(partnerPipelineCard.className).toContain("bg-indigo-100");
    expect(partnerPipelineCard.className).not.toContain("teal");
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
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations/org-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.any(Headers),
      }),
    );
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations/org-2",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.any(Headers),
      }),
    );
  });

  it("marks selected organizations as favorite and evicts other cached list pages", async () => {
    const user = userEvent.setup();
    let batchOrganizations: PartnershipCrmOrganizationRecord[] = [
      organization,
      {
        ...organization,
        id: "org-2",
        name: "Batch Favorite Genetics",
        contactEmail: "batch-favorite@example.org",
        normalizedName: "batch favorite genetics",
      },
    ];

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (init?.method === "PATCH" && stringPath.endsWith("/favorite")) {
        const pathParts = stringPath.split("/");
        const targetId = decodeURIComponent(
          pathParts[pathParts.length - 2] ?? "",
        );
        const body = JSON.parse(String(init.body));
        const updated = batchOrganizations.find(
          (entry) => entry.id === targetId,
        );

        if (!updated) {
          throw new Error("Missing test organization");
        }

        const nextOrganization = {
          ...updated,
          is_favorite: Boolean(body.is_favorite),
        };
        batchOrganizations = batchOrganizations.map((entry) =>
          entry.id === targetId ? nextOrganization : entry,
        );

        return { organization: nextOrganization };
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      return {
        organizations: batchOrganizations,
        nextCursor: undefined,
      };
    });

    const { client } = renderWorkbench();

    await waitFor(() => {
      expect(screen.getByText("Batch Favorite Genetics")).toBeTruthy();
    });

    await user.click(screen.getByLabelText("Select Delete Me Genomics"));
    await user.click(screen.getByLabelText("Select Batch Favorite Genetics"));

    await user.click(
      screen.getByRole("button", { name: "Mark selected as favorite" }),
    );

    await waitFor(() => {
      const favoriteCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            init?.method === "PATCH" && String(path).endsWith("/favorite"),
        );
      expect(favoriteCalls).toHaveLength(2);
      for (const [, init] of favoriteCalls) {
        expect(JSON.parse(String(init?.body))).toEqual(
          expect.objectContaining({ is_favorite: true }),
        );
      }
    });

    const unrelatedFilters = {
      query: "unrelated",
      status: "all",
      category: "",
      country: "",
      linkedInState: "all",
    };
    const unrelatedOrganization = {
      ...organization,
      id: "org-unrelated",
      name: "Unrelated cached page",
    };
    client.setQueryData(
      [
        "god-mode-partnership-crm-organizations",
        "organizations",
        unrelatedFilters,
        undefined,
      ],
      { organizations: [unrelatedOrganization], nextCursor: undefined },
    );

    await user.click(
      screen.getByRole("button", { name: "Mark selected as not favorite" }),
    );

    await waitFor(() => {
      const favoriteCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            init?.method === "PATCH" && String(path).endsWith("/favorite"),
        );
      expect(favoriteCalls).toHaveLength(4);
      for (const [, init] of favoriteCalls.slice(-2)) {
        expect(JSON.parse(String(init?.body))).toEqual(
          expect.objectContaining({ is_favorite: false }),
        );
      }
    });
    expect(
      client.getQueryData<{
        organizations: PartnershipCrmOrganizationRecord[];
      }>([
        "god-mode-partnership-crm-organizations",
        "organizations",
        unrelatedFilters,
        undefined,
      ]),
    ).toBeUndefined();
  });

  it("keeps the successful prefix when a sequential bulk delete later fails", async () => {
    const user = userEvent.setup();
    const batchOrganizations = [
      organization,
      {
        ...organization,
        id: "org-2",
        name: "Second delete target",
        contactEmail: "second@example.org",
      },
    ];
    let deleteAttempts = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (init?.method === "DELETE") {
        deleteAttempts += 1;
        if (deleteAttempts === 2) {
          throw new Error("Second delete failed");
        }
        return { deleted: true, organizationId: "org-1" };
      }
      return { organizations: batchOrganizations, nextCursor: undefined };
    });

    renderWorkbench();
    await screen.findByText("Second delete target");
    await user.click(screen.getByLabelText("Select Delete Me Genomics"));
    await user.click(screen.getByLabelText("Select Second delete target"));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete selected CRM organizations",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Deleted 1 of 2. The failing request outcome is unknown.",
        ),
      ).toBeTruthy();
    });
    expect(deleteAttempts).toBe(2);
    expect(screen.queryByText("Delete Me Genomics")).toBeNull();
    expect(screen.queryByText("Second delete target")).toBeNull();
    expect(
      screen.getByText(
        "No CRM data loaded. Use Load results when you deliberately want fresh data.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Data changed. Refresh when ready.")).toBeTruthy();
  });

  it("stops a sequential mutation after a successful response omits usage", async () => {
    const user = userEvent.setup();
    const secondOrganization = {
      ...organization,
      id: "org-2",
      name: "Second quota target",
      contactEmail: "second-quota@example.org",
    };
    let deleteAttempts = 0;
    jest.mocked(sdkFetch).mockImplementation(async (_path, init) => {
      if (init?.method === "DELETE") {
        deleteAttempts += 1;
        return { deleted: true, organizationId: organization.id };
      }
      return {
        organizations: [organization, secondOrganization],
        nextCursor: undefined,
        usage: {
          surface: "crm",
          used: 2,
          limit: 100,
          percentage: 2,
          remaining: 98,
          resetAt: "2026-10-16T07:00:00.000Z",
          locked: false,
        },
      };
    });

    renderWorkbench("en", { injectActionUsage: false });
    await screen.findByText("Second quota target");
    await user.click(screen.getByLabelText("Select Delete Me Genomics"));
    await user.click(screen.getByLabelText("Select Second quota target"));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete selected CRM organizations",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );

    await waitFor(() => {
      expect(deleteAttempts).toBe(1);
      expect(
        screen.getByText(
          "Deleted 1 of 2. The next request was not sent. Verify CRM usage or wait for the daily reset before resuming.",
        ),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Delete Me Genomics")).toBeNull();
    expect(screen.getByText("Second quota target")).toBeTruthy();
    expect(screen.getByTestId("crm-explicit-load")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("preserves loaded and durable caches when quota middleware denies a mutation", async () => {
    const user = userEvent.setup();
    const quotaUsage = {
      surface: "crm",
      used: 100,
      limit: 100,
      percentage: 100,
      remaining: 0,
      resetAt: "2026-10-16T07:00:00.000Z",
      locked: true,
    } as const;
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (init?.method === "DELETE") {
        throw Object.assign(
          new Error("The CRM daily usage limit has been reached."),
          {
            status: 429,
            method: "DELETE",
            path: String(path),
            details: [
              `Request: DELETE ${String(path)}`,
              "Status: 429 Too Many Requests",
              `Response JSON:\n${JSON.stringify({
                error: "The CRM daily usage limit has been reached.",
                code: "CRM_DAILY_LIMIT_REACHED",
                usage: quotaUsage,
              })}`,
            ].join("\n\n"),
          },
        );
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();
    await screen.findByText("Delete Me Genomics");
    const cacheKey = crmSummaryCacheKey();
    expect(window.sessionStorage.getItem(cacheKey)).not.toBeNull();

    await user.click(screen.getByLabelText("Select Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete selected CRM organizations",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Deleted 0 of 1. The next request was not sent. Verify CRM usage or wait for the daily reset before resuming.",
        ),
      ).toBeTruthy();
    });
    expect(screen.getByText("Delete Me Genomics")).toBeTruthy();
    expect(window.sessionStorage.getItem(cacheKey)).not.toBeNull();
    expect(screen.queryByText("Data changed. Refresh when ready.")).toBeNull();
    expect(screen.getByText("Daily limit reached")).toBeTruthy();
  });

  it("keeps exact successful favorite detail while clearing ambiguous summary pages", async () => {
    const user = userEvent.setup();
    const secondOrganization = {
      ...organization,
      id: "org-2",
      name: "Second favorite target",
      contactEmail: "favorite-second@example.org",
    };
    let favoriteAttempts = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      if (init?.method === "PATCH" && String(path).endsWith("/favorite")) {
        favoriteAttempts += 1;
        if (favoriteAttempts === 2) {
          throw new Error("Second favorite failed");
        }
        return { organization: { ...organization, is_favorite: true } };
      }
      return {
        organizations: [organization, secondOrganization],
        nextCursor: undefined,
      };
    });

    const { client } = renderWorkbench();
    await screen.findByText("Second favorite target");
    window.sessionStorage.setItem(
      "golden-crow:partnership-crm:summary:v3:stale-filter-a",
      "stale-a",
    );
    window.sessionStorage.setItem(
      "golden-crow:partnership-crm:summary:v3:stale-cursor-b",
      "stale-b",
    );
    await user.click(screen.getByLabelText("Select Delete Me Genomics"));
    await user.click(screen.getByLabelText("Select Second favorite target"));
    await user.click(
      screen.getByRole("button", { name: "Mark selected as favorite" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Updated 1 of 2. The failing request outcome is unknown.",
        ),
      ).toBeTruthy();
    });
    expect(favoriteAttempts).toBe(2);
    expect(
      window.sessionStorage.getItem(
        "golden-crow:partnership-crm:summary:v3:stale-filter-a",
      ),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(
        "golden-crow:partnership-crm:summary:v3:stale-cursor-b",
      ),
    ).toBeNull();
    const currentPage = client.getQueryData<{
      organizations: PartnershipCrmOrganizationRecord[];
    }>([
      "god-mode-partnership-crm-organizations",
      "organizations",
      {
        query: "",
        status: "all",
        category: "",
        country: "",
        linkedInState: "all",
      },
      undefined,
    ]);
    expect(currentPage).toBeUndefined();
    expect(screen.getByText("Data changed. Refresh when ready.")).toBeTruthy();
    expect(
      client.getQueryData<{ organization: PartnershipCrmOrganizationRecord }>([
        "god-mode-partnership-crm-organizations",
        "detail",
        "organizations",
        "org-1",
      ])?.organization.notes,
    ).toBe("Temporary CRM row.");
  });

  it("keeps contact name, email, and last-contact metadata in separate fact cards", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));

    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations?limit=20",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(screen.getAllByText("All categories").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Genomics Laboratory").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("All countries").length).toBeGreaterThan(0);
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

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
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
      expect(scrollIntoView).not.toHaveBeenCalledWith({
        block: "center",
        inline: "nearest",
      });
      scrollIntoView.mockClear();

      fireEvent.keyDown(window, { key: "ArrowDown" });
      await waitFor(() => {
        expect(screen.getAllByText("Second Keyboard Genetics")).toHaveLength(2);
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "nearest",
          inline: "nearest",
        });
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "center",
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
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "center",
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
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "center",
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

  it("shows the current status and opens an explicit status picker", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));

    const detailPanel = await screen.findByTestId("crm-detail-panel");
    expect(detailPanel.className).toContain("min-w-0");
    const factsGrid = within(detailPanel).getByTestId("crm-organization-facts");
    expect(factsGrid.className).toContain("@md:grid-cols-2");
    expect(factsGrid.className).not.toContain("sm:grid-cols-2");
    const actionGroup = within(detailPanel).getByTestId(
      "crm-detail-panel-actions",
    );
    expect(actionGroup.className).toContain("min-w-max");
    expect(actionGroup.className).toContain("shrink-0");
    expect(actionGroup.className).toContain("flex-nowrap");
    expect(actionGroup.className).toContain("whitespace-nowrap");
    expect(within(actionGroup).getAllByRole("button")).toHaveLength(4);
    expect(
      within(actionGroup).getByRole("button", { name: "Mark as favorite" }),
    ).toBeTruthy();
    expect(
      within(actionGroup).getByRole("button", { name: "Edit" }),
    ).toBeTruthy();
    expect(
      within(actionGroup).getByRole("button", { name: "Delete" }),
    ).toBeTruthy();
    expect(
      within(actionGroup).getByRole("button", { name: "Hide details" }),
    ).toBeTruthy();
    expect(within(actionGroup).queryByText("CRM New")).toBeNull();
    const tagsBlock = within(detailPanel).getByTestId("crm-detail-panel-tags");
    expect(within(tagsBlock).queryByText("CRM New")).toBeNull();
    expect(within(tagsBlock).getByText("Genomics Laboratory")).toBeTruthy();
    expect(within(detailPanel).queryByText("Favorite")).toBeNull();
    expect(within(detailPanel).queryByText("Pipeline")).toBeNull();

    const statusBlock = within(detailPanel).getByTestId("crm-current-status");
    expect(within(statusBlock).getByText("Current status")).toBeTruthy();
    expect(within(statusBlock).getByText("CRM New")).toBeTruthy();
    const currentStatusValue = within(statusBlock).getByTestId(
      "crm-current-status-value",
    );
    expect(currentStatusValue.getAttribute("data-status")).toBe("new");
    expect(currentStatusValue.className).toContain("border-sky-300");
    expect(currentStatusValue.className).toContain("bg-sky-100/90");
    expect(
      within(statusBlock)
        .getByTestId("crm-current-status-icon")
        .getAttribute("aria-hidden"),
    ).toBe("true");
    const changeStatusButton = within(statusBlock).getByRole("button", {
      name: "Change status",
    });
    expect(changeStatusButton.className).toContain("bg-blue-600");
    expect(changeStatusButton.className).toContain("text-white");
    expect(changeStatusButton.className).toContain("hover:bg-blue-700");

    await user.click(changeStatusButton);

    const dialog = await screen.findByRole("dialog", {
      name: "Change status",
    });
    expect(within(dialog).getByText(organization.name)).toBeTruthy();
    expect(within(dialog).getAllByRole("radio")).toHaveLength(8);
    const statusOptions = within(dialog).getByRole("radiogroup", {
      name: "CRM status options",
    });
    expect(statusOptions.className).toContain("flex");
    expect(statusOptions.className).toContain("flex-col");
    expect(statusOptions.className).not.toContain("grid-cols");
    const currentStatusRadio = within(dialog).getByRole("radio", {
      name: "CRM New",
    });
    expect(currentStatusRadio.getAttribute("aria-checked")).toBe("true");
    expect(
      currentStatusRadio
        .closest("label")
        ?.contains(within(dialog).getByTestId("crm-selected-status-check")),
    ).toBe(true);
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Save",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(currentStatusRadio.getAttribute("tabindex")).toBe("0");
    const contactedStatusRadio = within(dialog).getByRole("radio", {
      name: "CRM Contacted",
    });
    expect(contactedStatusRadio.getAttribute("tabindex")).toBe("-1");

    await user.click(contactedStatusRadio);
    expect(contactedStatusRadio.getAttribute("aria-checked")).toBe("true");
    expect(
      contactedStatusRadio
        .closest("label")
        ?.contains(within(dialog).getByTestId("crm-selected-status-check")),
    ).toBe(true);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Change status" })).toBeNull();
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });

  it("uses the requested Spanish wording in the detail status block", async () => {
    const user = userEvent.setup();
    renderWorkbench("es");

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));

    const detailPanel = await screen.findByTestId("crm-detail-panel");
    const statusBlock = within(detailPanel).getByTestId("crm-current-status");
    expect(within(statusBlock).getByText("Estado actual")).toBeTruthy();
    expect(within(statusBlock).getByText("Nuevo")).toBeTruthy();
    const currentStatusValue = within(statusBlock).getByTestId(
      "crm-current-status-value",
    );
    expect(currentStatusValue.getAttribute("data-status")).toBe("new");
    expect(currentStatusValue.className).toContain("border-sky-300");
    expect(currentStatusValue.className).toContain("bg-sky-100/90");
    expect(
      within(statusBlock).getByTestId("crm-current-status-icon"),
    ).toBeTruthy();
    expect(within(detailPanel).queryByText("Pipeline")).toBeNull();
    expect(
      within(detailPanel).getByRole("button", { name: "Cambiar estado" }),
    ).toBeTruthy();
  });

  it("saves the new status only for the item that opened the picker", async () => {
    const user = userEvent.setup();
    const contactedOrganization: PartnershipCrmOrganizationRecord = {
      ...organization,
      id: "org-2",
      name: "Contacted Genetics",
      normalizedName: "contacted genetics",
      status: "contacted",
      contactEmail: "contacted@example.org",
    };
    let organizations = [organization, contactedOrganization];

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);

      if (
        stringPath === "/admin/partnership-crm/organizations/org-2/status" &&
        init?.method === "PATCH"
      ) {
        const body = JSON.parse(String(init.body));
        const current = organizations.find((entry) => entry.id === "org-2");
        const updated = { ...current, ...body };
        organizations = organizations.map((entry) =>
          entry.id === updated.id ? updated : entry,
        );
        return { organization: updated };
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: emailTemplates, nextCursor: undefined };
      }

      return { organizations, nextCursor: undefined };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByText(contactedOrganization.name)).toBeTruthy();
    });
    await user.click(screen.getByText(contactedOrganization.name));

    const detailPanel = await screen.findByTestId("crm-detail-panel");
    await user.click(
      within(detailPanel).getByRole("button", { name: "Change status" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Change status",
    });
    expect(
      within(dialog)
        .getByRole("radio", { name: "CRM Contacted" })
        .getAttribute("aria-checked"),
    ).toBe("true");

    await user.click(
      within(dialog).getByRole("radio", { name: "CRM Meeting" }),
    );
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/organizations/org-2/status",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    const patchCalls = jest
      .mocked(sdkFetch)
      .mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]?.[0]).toBe(
      "/admin/partnership-crm/organizations/org-2/status",
    );
    expect(JSON.parse(String(patchCalls[0]?.[1]?.body))).toEqual({
      status: "meeting",
    });
    expect(
      patchCalls.some(
        ([path]) =>
          path === "/admin/partnership-crm/organizations/org-1/status",
      ),
    ).toBe(false);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Change status" }),
      ).toBeNull();
      const updatedStatusBlock = within(
        screen.getByTestId("crm-current-status"),
      );
      expect(updatedStatusBlock.getByText("CRM Meeting")).toBeTruthy();
      const updatedStatusValue = updatedStatusBlock.getByTestId(
        "crm-current-status-value",
      );
      expect(updatedStatusValue.getAttribute("data-status")).toBe("meeting");
      expect(updatedStatusValue.className).toContain("border-violet-300");
      expect(updatedStatusValue.className).toContain("bg-violet-100/90");
    });
  });

  it("keeps the status picker open and exposes detailed server errors", async () => {
    const user = userEvent.setup();
    const responseDetails = [
      "PATCH /admin/partnership-crm/organizations/org-1/status",
      "Status: 400 Bad Request",
      'Response: {"message":"body/status Invalid option"}',
    ].join("\n");

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);

      if (
        stringPath === "/admin/partnership-crm/organizations/org-1/status" &&
        init?.method === "PATCH"
      ) {
        throw Object.assign(new Error("body/status Invalid option"), {
          details: responseDetails,
        });
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: emailTemplates, nextCursor: undefined };
      }

      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(await screen.findByText(organization.name));
    const detailPanel = await screen.findByTestId("crm-detail-panel");
    await user.click(
      within(detailPanel).getByRole("button", { name: "Change status" }),
    );

    const statusDialog = await screen.findByRole("dialog", {
      name: "Change status",
    });
    await user.click(
      within(statusDialog).getByRole("radio", { name: "CRM Meeting" }),
    );
    await user.click(
      within(statusDialog).getByRole("button", { name: "Save" }),
    );

    expect(
      await within(statusDialog).findByText("Unable to update CRM status."),
    ).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Change status" })).toBeTruthy();

    const inlineError = within(statusDialog).getByRole("alert");
    expect(inlineError.textContent).toContain(
      "PATCH /admin/partnership-crm/organizations/org-1/status",
    );
    expect(inlineError.textContent).toContain("Status: 400 Bad Request");
    expect(inlineError.textContent).toContain(
      'Response: {"message":"body/status Invalid option"}',
    );
  });

  it("toggles favorite from the CRM detail panel", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);

      if (
        stringPath === "/admin/partnership-crm/organizations/org-1/favorite" &&
        init?.method === "PATCH"
      ) {
        const body = JSON.parse(String(init.body));

        return {
          organization: {
            ...organization,
            ...body,
            id: organization.id,
          },
        };
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: emailTemplates, nextCursor: undefined };
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

    const detailPanel = await screen.findByTestId("crm-detail-panel");
    await user.click(
      within(detailPanel).getByRole("button", { name: "Mark as favorite" }),
    );

    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/organizations/org-1/favorite",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    const [, init] = jest
      .mocked(sdkFetch)
      .mock.calls.find(
        ([path, requestInit]) =>
          path === "/admin/partnership-crm/organizations/org-1/favorite" &&
          requestInit?.method === "PATCH",
      )!;
    expect(JSON.parse(String(init?.body))).toEqual({ is_favorite: true });
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
      "xl:flex-col",
    );
    expect(screen.getByTestId("crm-list-panel").className).not.toContain(
      "overflow-y-auto",
    );
    expect(screen.getByTestId("crm-target-table-scroll").className).toContain(
      "flex-1",
    );
    expect(screen.getByTestId("crm-target-table-scroll").className).toContain(
      "overflow-y-auto",
    );
    expect(screen.getByTestId("crm-target-table-scroll").className).toContain(
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

  it("places the send email CTA above the secondary more information block", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));

    const sendButton = screen.getByRole("button", { name: "Send Email" });
    const moreInformationHeading = screen.getByText("More information");
    const notesHeading = screen
      .getAllByText("Notes")
      .find((element) => element.tagName !== "TH");

    expect(moreInformationHeading).toBeTruthy();
    expect(notesHeading).toBeTruthy();
    expect(
      sendButton.compareDocumentPosition(moreInformationHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      moreInformationHeading.compareDocumentPosition(notesHeading!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(sendButton.className).toContain("w-full");
  });

  it("renders structured JSON notes in the CRM detail panel", async () => {
    const user = userEvent.setup();
    const structuredNotes = JSON.stringify({
      instagram: "https://www.instagram.com/adnsalta/",
      sources:
        "https://alkemy.com.ar/ ; https://alkemy.com.ar/resultados-online/ ; https://www.instagram.com/p/DHD1lbruq6M/ ; https://www.instagram.com/p/DaVOddFiD2Z/",
      services: "NIPT listed as a purchasable service.",
    });

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }
      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }

      return {
        organizations: [{ ...organization, notes: structuredNotes }],
        nextCursor: undefined,
      };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));

    const notesDocument = screen.getByTestId("crm-structured-notes-document");
    expect(notesDocument.tagName).toBe("DL");
    expect(notesDocument.className).toContain("border-y");
    expect(screen.getAllByTestId("crm-structured-notes-row")).toHaveLength(3);
    expect(screen.getByText("Instagram")).toBeTruthy();
    const instagramLink = screen.getByRole("link", {
      name: "https://www.instagram.com/adnsalta/",
    });
    expect(instagramLink.getAttribute("href")).toBe(
      "https://www.instagram.com/adnsalta/",
    );
    expect(instagramLink.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Sources")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "https://alkemy.com.ar/" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "https://alkemy.com.ar/resultados-online/",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "https://www.instagram.com/p/DHD1lbruq6M/",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "https://www.instagram.com/p/DaVOddFiD2Z/",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Services")).toBeTruthy();
    expect(
      screen.getByText("NIPT listed as a purchasable service."),
    ).toBeTruthy();
  });

  it("renders non-JSON CRM notes as plain readable text in the detail panel", async () => {
    const user = userEvent.setup();
    const plainNotes = [
      "Reviewed: 2026-09-12.",
      "Instagram: https://www.instagram.com/genosargentina/",
      "Services: NIPT/fetal DNA screening; carrier screening.",
    ].join("\n");

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }
      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }

      return {
        organizations: [{ ...organization, notes: plainNotes }],
        nextCursor: undefined,
      };
    });

    renderWorkbench();

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));

    expect(screen.queryByTestId("crm-structured-notes-document")).toBeNull();
    const plainNotesDocument = screen.getByTestId("crm-plain-notes-document");
    expect(plainNotesDocument.textContent).toContain("Reviewed: 2026-09-12.");
    expect(plainNotesDocument.textContent).toContain(
      "Services: NIPT/fetal DNA screening; carrier screening.",
    );
    const instagramLink = within(plainNotesDocument).getByRole("link", {
      name: "https://www.instagram.com/genosargentina/",
    });
    expect(instagramLink.getAttribute("href")).toBe(
      "https://www.instagram.com/genosargentina/",
    );
    expect(instagramLink.getAttribute("target")).toBe("_blank");
  });

  it("opens a global modal with sent CRM emails and plantilla metadata", async () => {
    const user = userEvent.setup();
    let releaseEmailDetail: (() => void) | undefined;
    const emailDetailPending = new Promise<void>((resolve) => {
      releaseEmailDetail = resolve;
    });

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath === "/admin/partnership-crm/sent-email-log/email-1") {
        await emailDetailPending;
        return {
          email: {
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
        };
      }
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
              body: "",
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

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
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
      "/admin/partnership-crm/sent-email-log?limit=10",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(within(dialog).getByText("Lab outreach")).toBeTruthy();
    expect(within(dialog).getByText("Genome Lab")).toBeTruthy();
    expect(within(dialog).getByText("ada@genomelab.example")).toBeTruthy();
    expect(
      within(dialog).queryByText(/Te escribo sobre Pocket Genes/),
    ).toBeNull();
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path]) => path === "/admin/partnership-crm/sent-email-log/email-1",
        ),
    ).toHaveLength(0);

    const viewMessageButton = within(dialog).getByRole("button", {
      name: "View message",
    });
    fireEvent.click(viewMessageButton);
    fireEvent.click(viewMessageButton);
    await waitFor(() => {
      expect(
        jest
          .mocked(sdkFetch)
          .mock.calls.filter(
            ([path]) =>
              path === "/admin/partnership-crm/sent-email-log/email-1",
          ),
      ).toHaveLength(1);
    });
    releaseEmailDetail?.();
    expect(
      await within(dialog).findByText(/Te escribo sobre Pocket Genes/),
    ).toBeTruthy();
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path]) => path === "/admin/partnership-crm/sent-email-log/email-1",
        ),
    ).toHaveLength(1);

    await user.click(
      within(dialog).getByRole("button", { name: "Hide message" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "View message" }),
    );
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path]) => path === "/admin/partnership-crm/sent-email-log/email-1",
        ),
    ).toHaveLength(1);
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
      withApprovedCrmEmailClosing(
        "Hola Ada,\n\nQueria escribirte directamente sobre Pocket Genes.",
      ),
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
    const keepEditingButton = within(dialog).getByRole("button", {
      name: "Keep editing",
    });
    const sendEmailButton = within(dialog).getByRole("button", {
      name: "Send email",
    });
    expect(
      keepEditingButton.compareDocumentPosition(sendEmailButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(sendEmailButton.className).toContain("bg-blue-600");

    await user.click(keepEditingButton);

    await waitFor(() => {
      expect(within(dialog).queryByText("Ready to send")).toBeNull();
    });
    expect(
      (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
    ).toBe("CRM follow-up");
    expect(within(dialog).getByLabelText("Message").textContent).toContain(
      "Queria escribirte directamente sobre Pocket Genes.",
    );
  });

  it("allows CRM email preview without requiring a fixed closing", async () => {
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
    const messageEditor = within(dialog).getByLabelText("Message");
    messageEditor.innerHTML =
      "Hola Ada,\n\nQueria escribirte directamente sobre Pocket Genes.";
    fireEvent.input(messageEditor);

    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Preview email" }),
      ).toHaveProperty("disabled", false);
    });
  });

  it("keeps bold and italic CRM email formatting in preview and send payload", async () => {
    const user = userEvent.setup();
    let sentPayload: Record<string, unknown> | null = null;

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [recommendedEmailTemplate], nextCursor: undefined };
      }

      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }

      if (
        stringPath === "/admin/partnership-crm/organizations/org-1/email" &&
        init?.method === "POST"
      ) {
        sentPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
        return {
          organization: { ...organization, status: "contacted" },
          activity: {
            id: "activity-1",
            type: "email",
            title: "Email sent",
            body: String(sentPayload.text),
          },
          sentEmailLog: {
            id: "email-1",
            targetKind: "organizations",
            targetId: organization.id,
            targetName: organization.name,
            from: "federico@goldencrowvs.com",
            to: String(sentPayload.to),
            subject: String(sentPayload.subject),
            body: String(sentPayload.text),
          },
        };
      }

      return {
        organizations: [organization],
        nextCursor: undefined,
      };
    });

    const { client } = renderWorkbench();
    client.setQueryData(
      ["god-mode-partnership-crm-activities", "organizations", "org-1"],
      {
        pages: [
          {
            activities: [
              {
                id: "activity-old",
                type: "note",
                title: "Previously loaded activity",
                body: "Previously loaded activity",
              },
            ],
            nextCursor: undefined,
          },
        ],
        pageParams: [""],
      },
    );
    client.setQueryData(["god-mode-partnership-crm-sent-email-log"], {
      pages: [
        {
          emails: [
            {
              id: "email-old",
              targetKind: "organizations",
              targetId: "org-1",
              targetName: organization.name,
              from: "federico@goldencrowvs.com",
              to: organization.contactEmail,
              subject: "Previously loaded email",
              body: "",
            },
          ],
          nextCursor: undefined,
        },
      ],
      pageParams: [""],
    });

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    const messageEditor = await within(dialog).findByLabelText("Message");

    expect(within(dialog).getByRole("button", { name: "Bold" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Italic" })).toBeTruthy();

    messageEditor.innerHTML = withApprovedCrmEmailClosing(
      "Hola <strong>muy importante</strong> y <em>curado</em> para {{contact_name}}.",
    );
    fireEvent.input(messageEditor);

    await user.click(
      within(dialog).getByRole("button", { name: "Preview email" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Ready to send")).toBeTruthy();
    });
    const boldText = within(dialog).getByText("muy importante");
    const italicText = within(dialog).getByText("curado");
    expect(boldText.tagName).toBe("STRONG");
    expect(italicText.tagName).toBe("EM");

    await user.click(
      within(dialog).getByRole("button", { name: "Send email" }),
    );

    await waitFor(() => {
      expect(sentPayload).not.toBeNull();
    });
    expect(sentPayload).toEqual(
      expect.objectContaining({
        text: withApprovedCrmEmailClosing(
          "Hola muy importante y curado para Ada.",
        ),
        html: withApprovedCrmEmailClosingHtml(
          "Hola <strong>muy importante</strong> y <em>curado</em> para Ada.",
        ),
      }),
    );
    expect(
      client
        .getQueryData<{
          pages: Array<{ activities: Array<{ id: string }> }>;
        }>(["god-mode-partnership-crm-activities", "organizations", "org-1"])
        ?.pages[0]?.activities.map((activity) => activity.id),
    ).toEqual(["activity-1", "activity-old"]);
    expect(
      client
        .getQueryData<{
          pages: Array<{ emails: Array<{ id: string }> }>;
        }>(["god-mode-partnership-crm-sent-email-log"])
        ?.pages[0]?.emails.map((email) => email.id),
    ).toEqual(["email-1", "email-old"]);
  });

  it("cycles CRM email templates with footer arrows and keyboard arrows", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return {
          templates: emailTemplates.map((template) => ({
            ...template,
            body: withApprovedCrmEmailClosing(template.body),
          })),
          nextCursor: undefined,
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
    const messageEditor = within(dialog).getByLabelText("Message");
    expect(messageEditor.textContent).toContain("Body one for Ada");
    expect(
      within(messageEditor).getByRole("img", { name: "Contact name" }),
    ).toBeTruthy();
    const variablesTable = within(dialog).getByRole("table");
    expect(within(variablesTable).getByText("{{contact_name}}")).toBeTruthy();
    expect(within(variablesTable).getByText("Ada")).toBeTruthy();
    expect(
      within(variablesTable).queryByText("{{organization_name}}"),
    ).toBeNull();

    await user.click(
      within(dialog).getByRole("button", { name: "Next template" }),
    );
    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("Second Delete Me Genomics");
    });
    expect(within(dialog).getByLabelText("Message").textContent).toContain(
      "Body two for Ada",
    );

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
    expect(dialog.textContent).toContain("Body two for Ada");
  });

  it("recommends matching templates while allowing any same-audience template selection", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
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
      "/admin/partnership-crm/email-templates?status=active&audience=organizations&limit=5",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Load more templates" }),
    );
    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        expect.stringContaining("cursor=2026-09-01T12%3A00%3A00.000Z"),
        expect.objectContaining({ headers: expect.any(Headers) }),
      );
    });

    await user.click(within(dialog).getByRole("combobox"));

    expect(await screen.findByText("Recommended templates")).toBeTruthy();
    expect(screen.getByText("Other templates")).toBeTruthy();
    expect(screen.queryByText("Universal professional")).toBeNull();

    await user.click(
      await screen.findByRole("option", { name: "Other category" }),
    );

    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("Other category Delete Me Genomics");
    });
    expect(within(dialog).getByLabelText("Message").textContent).toBe(
      "Other category body for Ada",
    );
  });

  it("shows professional editor fit lowercased without quotes or italics in CRM email", async () => {
    const user = userEvent.setup();
    let sentPayload: Record<string, unknown> | null = null;
    const fitTemplate: PartnershipCrmTemplateRecord = {
      ...recommendedEmailTemplate,
      id: "tpl-fit",
      name: "Professional fit intro",
      audience: "professionals",
      category: "pro_clinical_geneticists",
      subject: "Pocket Genes + {{professional_name}}",
      body: withApprovedCrmEmailClosing(
        "Por tu experiencia en {{potential_pocket_genes_editor_fit}} consideramos que Pocket Genes puede amplificar tu trabajo.",
      ),
    };

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath === "/admin/partnership-crm/professionals/pro-1/email" &&
        init?.method === "POST"
      ) {
        sentPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
        return {
          professional: { ...professional, status: "contacted" },
          activity: {
            id: "activity-1",
            type: "email",
            title: "Email sent",
            body: String(sentPayload.text),
          },
          sentEmailLog: {
            id: "email-1",
            targetKind: "professionals",
            targetId: professional.id,
            targetName: professional.name,
            from: "federico@goldencrowvs.com",
            to: String(sentPayload.to),
            subject: String(sentPayload.subject),
            body: String(sentPayload.text),
          },
        };
      }
      if (stringPath.startsWith("/admin/partnership-crm/professionals")) {
        return { professionals: [professional], nextCursor: undefined };
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return stringPath.includes("audience=professionals")
          ? { templates: [fitTemplate], nextCursor: undefined }
          : { templates: [recommendedEmailTemplate], nextCursor: undefined };
      }
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }
      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("tab", { name: /Professionals/ }));
    await user.click(screen.getByTestId("crm-explicit-load"));
    await waitFor(() => {
      expect(screen.getAllByText("Dra. Ada Genome")).toHaveLength(1);
    });
    await user.click(screen.getByText("Dra. Ada Genome"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    const messageEditor = await within(dialog).findByLabelText("Message");

    expect(messageEditor.textContent).toContain(
      "clinical genetics, genetic testing, result interpretation and patient education",
    );
    expect(messageEditor.textContent).not.toContain('"');
    expect(messageEditor.textContent).not.toContain(
      "{{potential_pocket_genes_editor_fit}}",
    );
    expect(
      within(messageEditor).getByRole("img", {
        name: "Potential Pocket Genes editor fit",
      }),
    ).toBeTruthy();
    expect(within(dialog).getByText("Variables")).toBeTruthy();
    const variablesTable = within(dialog).getByRole("table");
    expect(
      within(variablesTable).getByText("{{potential_pocket_genes_editor_fit}}"),
    ).toBeTruthy();
    expect(
      within(variablesTable).getByText(/clinical genetics, genetic testing/),
    ).toBeTruthy();
    expect(
      within(variablesTable).getByText("{{potential_pocket_genes_editor_fit}}")
        .className,
    ).toContain("emerald");
    expect(
      within(dialog).queryByRole("button", {
        name: "{{potential_pocket_genes_editor_fit}}",
      }),
    ).toBeNull();

    await user.click(
      within(dialog).getByRole("button", { name: "Preview email" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Ready to send")).toBeTruthy();
    });
    const renderedFit = within(dialog).getByText(
      /clinical genetics, genetic testing/,
    );
    expect(renderedFit.tagName).not.toBe("EM");
    expect(renderedFit.textContent).not.toContain('"');
    expect(dialog.querySelector("em")).toBeNull();

    await user.click(
      within(dialog).getByRole("button", { name: "Send email" }),
    );

    await waitFor(() => {
      expect(sentPayload).not.toBeNull();
    });
    expect(sentPayload).toEqual(
      expect.objectContaining({
        text: withApprovedCrmEmailClosing(
          "Por tu experiencia en clinical genetics, genetic testing, result interpretation and patient education consideramos que Pocket Genes puede amplificar tu trabajo.",
        ),
        html: withApprovedCrmEmailClosingHtml(
          "Por tu experiencia en clinical genetics, genetic testing, result interpretation and patient education consideramos que Pocket Genes puede amplificar tu trabajo.",
        ),
      }),
    );
  });

  it("splits long CRM variable editor pills into joined visual rows", async () => {
    const user = userEvent.setup();
    const longFit =
      "La creación y conducción de una organización argentina de diagnóstico genético y el desarrollo de iniciativas vinculadas con las pruebas genéticas";
    const longFitProfessional: PartnershipCrmProfessionalRecord = {
      ...professional,
      potentialPocketGenesEditorFit: longFit,
    };
    const fitTemplate: PartnershipCrmTemplateRecord = {
      ...recommendedEmailTemplate,
      id: "tpl-long-fit",
      name: "Long fit intro",
      audience: "professionals",
      category: "pro_clinical_geneticists",
      subject: "Pocket Genes + {{professional_name}}",
      body: "Por tu experiencia en {{potential_pocket_genes_editor_fit}}, pensamos que podría interesarte participar.",
    };

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/professionals")) {
        return { professionals: [longFitProfessional], nextCursor: undefined };
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [fitTemplate], nextCursor: undefined };
      }
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }
      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("tab", { name: /Professionals/ }));
    await user.click(screen.getByTestId("crm-explicit-load"));
    await waitFor(() => {
      expect(screen.getAllByText("Dra. Ada Genome")).toHaveLength(1);
    });
    await user.click(screen.getByText("Dra. Ada Genome"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    const messageEditor = await within(dialog).findByLabelText("Message");
    const variableNode = within(messageEditor).getByRole("img", {
      name: "Potential Pocket Genes editor fit",
    });
    const variableNodes = messageEditor.querySelectorAll(
      '[data-crm-variable-token="{{potential_pocket_genes_editor_fit}}"]',
    );
    const segments = variableNode.querySelectorAll(
      "[data-crm-variable-segment]",
    );

    expect(variableNodes).toHaveLength(1);
    expect(segments.length).toBeGreaterThan(1);
    expect(
      Array.from(segments)
        .map((segment) => segment.textContent)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    ).toContain(
      "la creación y conducción de una organización argentina de diagnóstico genético",
    );
    expect(
      within(dialog).getAllByText("{{potential_pocket_genes_editor_fit}}"),
    ).toHaveLength(1);
  });

  it("blocks CRM email preview when a used professional variable is empty", async () => {
    const user = userEvent.setup();
    const emptyFitProfessional: PartnershipCrmProfessionalRecord = {
      ...professional,
      potentialPocketGenesEditorFit: "",
    };
    const fitTemplate: PartnershipCrmTemplateRecord = {
      ...recommendedEmailTemplate,
      id: "tpl-fit-empty",
      name: "Professional fit intro",
      audience: "professionals",
      category: "pro_clinical_geneticists",
      subject: "Pocket Genes + {{professional_name}}",
      body: withApprovedCrmEmailClosing(
        "Por tu experiencia en {{potential_pocket_genes_editor_fit}} consideramos que Pocket Genes puede amplificar tu trabajo.",
      ),
    };

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.startsWith("/admin/partnership-crm/professionals")) {
        return {
          professionals: [emptyFitProfessional],
          nextCursor: undefined,
        };
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [fitTemplate], nextCursor: undefined };
      }
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }
      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        return { emails: [], nextCursor: undefined };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("tab", { name: /Professionals/ }));
    await user.click(screen.getByTestId("crm-explicit-load"));
    await waitFor(() => {
      expect(screen.getAllByText("Dra. Ada Genome")).toHaveLength(1);
    });
    await user.click(screen.getByText("Dra. Ada Genome"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });

    expect(
      await within(dialog).findByText(
        /Missing value for {{potential_pocket_genes_editor_fit}}/,
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Preview email" }),
    ).toHaveProperty("disabled", true);
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
    const favoritePayloads: unknown[] = [];

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath.startsWith("/admin/partnership-crm/email-templates/") &&
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
        stringPath.startsWith("/admin/partnership-crm/email-templates/") &&
        stringPath.endsWith("/favorite") &&
        init?.method === "PATCH"
      ) {
        const payload = JSON.parse(String(init.body));
        favoritePayloads.push(payload);
        const pathParts = stringPath.split("/");
        const templateId = decodeURIComponent(pathParts.at(-2) ?? "");
        savedTemplates = savedTemplates.map((template) =>
          template.id === templateId
            ? { ...template, is_favorite: Boolean(payload.is_favorite) }
            : template,
        );

        return {
          template:
            savedTemplates.find((template) => template.id === templateId) ??
            savedTemplates[0],
        };
      }

      if (
        stringPath.startsWith("/admin/partnership-crm/email-templates/") &&
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

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
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
    const preservedSummaryCacheKey =
      "golden-crow:partnership-crm:summary:v3:template-safe";
    const plantillasSummaryCacheKey = "golden-crow-plantillas-summary-cache-v1";
    window.sessionStorage.setItem(preservedSummaryCacheKey, "preserve-me");
    window.sessionStorage.setItem(plantillasSummaryCacheKey, "stale-template");

    await waitFor(() => {
      expect(screen.getAllByText("Delete Me Genomics")).toHaveLength(1);
    });
    await user.click(screen.getByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    const messageInput = await within(dialog).findByLabelText("Message");

    messageInput.textContent =
      "Reusable edited template body for Delete Me Genomics.";
    fireEvent.input(messageInput);
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
    expect(window.sessionStorage.getItem(plantillasSummaryCacheKey)).toBeNull();
    expect(routerRefresh).not.toHaveBeenCalled();

    window.sessionStorage.setItem(plantillasSummaryCacheKey, "stale-template");
    await user.click(
      within(dialog).getByRole("button", { name: "Mark as favorite" }),
    );

    await waitFor(() => {
      expect(favoritePayloads).toHaveLength(1);
    });
    expect(favoritePayloads[0]).toEqual({ is_favorite: true });
    expect(window.sessionStorage.getItem(plantillasSummaryCacheKey)).toBeNull();

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
      expect(favoritePayloads).toHaveLength(2);
    });
    expect(favoritePayloads[1]).toEqual({ is_favorite: false });

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

    window.sessionStorage.setItem(plantillasSummaryCacheKey, "stale-template");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete template" }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("Template deleted.")).toBeTruthy();
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("");
    });
    expect(window.sessionStorage.getItem(plantillasSummaryCacheKey)).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Load selected template" }),
    );
    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("Recommended Delete Me Genomics");
    });
    expect(savedTemplates.map((template) => template.id)).toEqual([
      "tpl-recommended",
    ]);
    expect(window.sessionStorage.getItem(preservedSummaryCacheKey)).toBe(
      "preserve-me",
    );
    expect(screen.queryByText("Data changed. Refresh when ready.")).toBeNull();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("does not load the next template body automatically after deleting one", async () => {
    const user = userEvent.setup();
    let summaries = emailTemplates.map((template) => ({
      ...template,
      body: "",
      notes: "",
    }));

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath.startsWith("/admin/partnership-crm/email-templates/") &&
        init?.method === "DELETE"
      ) {
        const templateId = decodeURIComponent(
          stringPath.split("/").at(-1) ?? "",
        );
        summaries = summaries.filter((template) => template.id !== templateId);
        return { deleted: true, templateId };
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates/")) {
        const templateId = decodeURIComponent(
          stringPath.split("/").at(-1) ?? "",
        );
        return {
          template: emailTemplates.find(
            (template) => template.id === templateId,
          ),
        };
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: summaries, nextCursor: undefined };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Lab intro" }));
    await waitFor(() => {
      expect(
        (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
      ).toBe("First Delete Me Genomics");
    });

    await user.click(
      within(dialog).getByRole("button", { name: "Delete template" }),
    );
    await within(dialog).findByText("Template deleted.");
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, init]) =>
            path === "/admin/partnership-crm/email-templates/tpl-2" &&
            !init?.method,
        ),
    ).toHaveLength(0);
    expect(
      (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
    ).toBe("");

    await user.click(
      within(dialog).getByRole("button", { name: "Load selected template" }),
    );
    await waitFor(() => {
      expect(sdkFetch).toHaveBeenCalledWith(
        "/admin/partnership-crm/email-templates/tpl-2",
        expect.objectContaining({ headers: expect.any(Headers) }),
      );
    });
  });

  it("clears template caches after an ambiguous composer mutation without refetching", async () => {
    const user = userEvent.setup();
    let templateListReads = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath ===
          "/admin/partnership-crm/email-templates/tpl-recommended" &&
        init?.method === "DELETE"
      ) {
        throw new Error("Template deletion response was lost");
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        templateListReads += 1;
        return {
          templates: [recommendedEmailTemplate],
          nextCursor: undefined,
        };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    const { client } = renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    await waitFor(() => {
      expect(templateListReads).toBe(1);
    });
    window.sessionStorage.setItem(
      "golden-crow-plantillas-summary-cache-v1",
      "stale-template",
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Delete template" }),
    );

    expect(
      await within(dialog).findByText("Unable to delete template."),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        /The template request outcome is unknown\. Reload templates deliberately before continuing\./,
      ),
    ).toBeTruthy();
    expect(
      window.sessionStorage.getItem("golden-crow-plantillas-summary-cache-v1"),
    ).toBeNull();
    expect(
      client
        .getQueriesData({
          queryKey: ["god-mode-partnership-crm-templates", "active"],
        })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(templateListReads).toBe(1);
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
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("tab", { name: /Professionals/ }));
    await user.click(screen.getByTestId("crm-explicit-load"));

    await waitFor(() => {
      expect(screen.getAllByText("Dra. Ada Genome")).toHaveLength(1);
    });
    await user.click(screen.getByText("Dra. Ada Genome"));

    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/professionals?limit=20",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(screen.getAllByText("Clinical Geneticist").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("Role / specialty")).toBeTruthy();
    expect(screen.getAllByText("Genetista clinica").length).toBeGreaterThan(0);
    expect(screen.getByText("Primary affiliation")).toBeTruthy();
    expect(screen.getAllByText("Genome Lab").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Clinical genetics, genetic testing, result interpretation and patient education.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Email route")).toBeTruthy();
    expect(screen.getByText("LinkedIn route")).toBeTruthy();
    expect(screen.getByText("Research basis")).toBeTruthy();
    expect(screen.getByText("More information")).toBeTruthy();
    expect(screen.queryByText("Variable fields")).toBeNull();
    expect(
      screen.queryByText("{{potential_pocket_genes_editor_fit}}"),
    ).toBeNull();
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

  it("clears the target activity cache after an ambiguous note write without refetching", async () => {
    const user = userEvent.setup();
    let activityReads = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities") && init?.method === "POST") {
        throw new Error("Activity response was lost");
      }
      if (stringPath.includes("/activities")) {
        activityReads += 1;
        return {
          activities: [
            {
              id: "activity-old",
              type: "note",
              title: "Previously loaded note",
              body: "Previously loaded note",
            },
          ],
          nextCursor: undefined,
        };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    const { client } = renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: /Activity log/ }));
    expect(await screen.findAllByText("Previously loaded note")).toHaveLength(
      2,
    );
    expect(activityReads).toBe(1);

    await user.type(
      screen.getByPlaceholderText("Add an activity note..."),
      "New ambiguous note",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Unable to add activity.")).toBeTruthy();
    expect(
      client.getQueryData([
        "god-mode-partnership-crm-activities",
        "organizations",
        "org-1",
      ]),
    ).toBeUndefined();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(activityReads).toBe(1);
  });

  it("refreshes only the first activity page after more pages were loaded", async () => {
    const user = userEvent.setup();
    const activityPaths: string[] = [];
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        activityPaths.push(stringPath);
        if (stringPath.includes("cursor=activity-cursor-2")) {
          return {
            activities: [
              {
                id: "activity-page-2",
                type: "note",
                title: "Second activity page",
                body: "Second activity page",
              },
            ],
            nextCursor: undefined,
          };
        }
        return {
          activities: [
            {
              id: "activity-page-1",
              type: "note",
              title: "First activity page",
              body: "First activity page",
            },
          ],
          nextCursor: "activity-cursor-2",
        };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: /Activity log/ }));
    await screen.findAllByText("First activity page");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findAllByText("Second activity page");

    const activityRefreshButton = screen
      .getAllByRole("button", { name: "Refresh" })
      .find((button) => button.getAttribute("aria-label") === "Refresh");
    expect(activityRefreshButton).toBeTruthy();
    await user.click(activityRefreshButton as HTMLButtonElement);
    await waitFor(() => {
      expect(activityPaths).toEqual([
        "/admin/partnership-crm/organizations/org-1/activities?limit=10",
        "/admin/partnership-crm/organizations/org-1/activities?limit=10&cursor=activity-cursor-2",
        "/admin/partnership-crm/organizations/org-1/activities?limit=10",
      ]);
    });
  });

  it("marks loaded activity stale after a successful favorite mutation", async () => {
    const user = userEvent.setup();
    let activityReads = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        activityReads += 1;
        return { activities: [], nextCursor: undefined };
      }
      if (stringPath.endsWith("/favorite") && init?.method === "PATCH") {
        return { organization: { ...organization, is_favorite: true } };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    const { client } = renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: /Activity log/ }));
    await waitFor(() => expect(activityReads).toBe(1));

    const detailPanel = screen.getByTestId("crm-detail-panel");
    await user.click(
      within(detailPanel).getByRole("button", { name: "Mark as favorite" }),
    );
    await waitFor(() => {
      expect(
        within(detailPanel).getByRole("button", {
          name: "Unmark as favorite",
        }),
      ).toBeTruthy();
    });
    expect(
      client.getQueryData([
        "god-mode-partnership-crm-activities",
        "organizations",
        "org-1",
      ]),
    ).toBeUndefined();
    expect(activityReads).toBe(1);
    expect(
      screen.getByText(
        "Activity data changed. Use Refresh to load the current log.",
      ),
    ).toBeTruthy();

    const activityRefreshButton = screen
      .getAllByRole("button", { name: "Refresh" })
      .find((button) => button.getAttribute("aria-label") === "Refresh");
    expect(activityRefreshButton).toBeTruthy();
    await user.click(activityRefreshButton as HTMLButtonElement);
    await waitFor(() => expect(activityReads).toBe(2));
    expect(
      screen.queryByText(
        "Activity data changed. Use Refresh to load the current log.",
      ),
    ).toBeNull();
  });

  it("clears dependent caches after an ambiguous email send without refetching", async () => {
    const user = userEvent.setup();
    let activityReads = 0;
    let sentLogReads = 0;
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (
        stringPath === "/admin/partnership-crm/organizations/org-1/email" &&
        init?.method === "POST"
      ) {
        throw new Error("Email response was lost");
      }
      if (stringPath.includes("/activities")) {
        activityReads += 1;
        return { activities: [], nextCursor: undefined };
      }
      if (stringPath.startsWith("/admin/partnership-crm/sent-email-log")) {
        sentLogReads += 1;
        return { emails: [], nextCursor: undefined };
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    const { client } = renderWorkbench();
    const activityKey = [
      "god-mode-partnership-crm-activities",
      "organizations",
      "org-1",
    ];
    const sentLogKey = ["god-mode-partnership-crm-sent-email-log"];
    const detailKey = [
      "god-mode-partnership-crm-organizations",
      "detail",
      "organizations",
      "org-1",
    ];
    client.setQueryData(activityKey, {
      pages: [{ activities: [], nextCursor: undefined }],
      pageParams: [""],
    });
    client.setQueryData(sentLogKey, {
      pages: [{ emails: [], nextCursor: undefined }],
      pageParams: [""],
    });
    client.setQueryData(detailKey, { organization });

    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: "Send Email" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Send CRM email",
    });
    await user.type(within(dialog).getByLabelText("Subject"), "Ambiguous send");
    await user.type(
      within(dialog).getByLabelText("Message"),
      "This request may commit before the response is lost.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Preview email" }),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: "Send email" }),
    );

    expect(await screen.findByText("Unable to send CRM email.")).toBeTruthy();
    expect(client.getQueryData(activityKey)).toBeUndefined();
    expect(client.getQueryData(sentLogKey)).toBeUndefined();
    expect(client.getQueryData(detailKey)).toBeUndefined();
    expect(activityReads).toBe(0);
    expect(sentLogReads).toBe(0);
    expect(screen.getByRole("dialog", { name: "Send CRM email" })).toBeTruthy();
  });

  it("requires another explicit expansion before reading a newly selected target activity", async () => {
    const user = userEvent.setup();
    const secondOrganization = {
      ...organization,
      id: "org-2",
      name: "Second Activity Target",
      contactEmail: "activity-two@example.org",
    };
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (String(path).includes("/activities")) {
        return { activities: [], nextCursor: undefined };
      }
      return {
        organizations: [organization, secondOrganization],
        nextCursor: undefined,
      };
    });

    renderWorkbench();
    await user.click(await screen.findByText("Delete Me Genomics"));
    await user.click(screen.getByRole("button", { name: /Activity log/ }));
    await waitFor(() => {
      expect(
        jest
          .mocked(sdkFetch)
          .mock.calls.some(([path]) =>
            String(path).includes("/organizations/org-1/activities"),
          ),
      ).toBe(true);
    });

    await user.click(screen.getByText("Second Activity Target"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.some(([path]) =>
          String(path).includes("/organizations/org-2/activities"),
        ),
    ).toBe(false);
    expect(
      screen
        .getByRole("button", { name: /Activity log/ })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
});

describe("PartnershipCrmWorkbench list pager", () => {
  beforeEach(() => {
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }

      if (stringPath === "/admin/partnership-crm/organizations?limit=20") {
        return {
          organizations: [
            { ...organization, id: "org-page-1", name: "Genome Page 1" },
          ],
          nextCursor: "cursor-2",
          partial: true,
          scanned: 11,
          asOf: "2026-10-15T12:00:00.000Z",
        };
      }

      if (
        stringPath ===
        "/admin/partnership-crm/organizations?limit=20&cursor=cursor-2"
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

  it("uses exact loaded-page status metrics before a snapshot is available", async () => {
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

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
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
      within(screen.getByRole("button", { name: /New\s+50/ })).getByText("50"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Contacted\s+0/ })).getByText(
        "0",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Replied\s+0/ })).getByText(
        "0",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Meeting\s+0/ })).getByText(
        "0",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Partner\s+0/ })).getByText(
        "0",
      ),
    ).toBeTruthy();
  });

  it("uses snapshot facets for pre-filters and exact status-card counts", async () => {
    const user = userEvent.setup();

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath === "/admin/partnership-crm/snapshot") {
        return { snapshot: indexedCrmSnapshot };
      }
      if (stringPath.includes("/activities")) {
        return { activities: [] };
      }
      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();
    await screen.findByText(organization.name);

    await user.click(
      screen.getByRole("button", { name: "Pre-filters and CRM index" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Pre-filters and CRM index",
    });
    const totalCard = within(dialog).getByText("All CRM items").parentElement;
    const organizationsCard = within(dialog).getByText("Organizations")
      .parentElement;
    const professionalsCard = within(dialog).getByText("Professionals")
      .parentElement;
    expect(totalCard).toBeTruthy();
    expect(organizationsCard).toBeTruthy();
    expect(professionalsCard).toBeTruthy();
    expect(within(totalCard as HTMLElement).getByText("248")).toBeTruthy();
    expect(
      within(organizationsCard as HTMLElement).getByText("241"),
    ).toBeTruthy();
    expect(
      within(professionalsCard as HTMLElement).getByText("7"),
    ).toBeTruthy();
    const statusSection = within(dialog).getByText("Status").closest("section");
    expect(statusSection).toBeTruthy();
    expect(
      within(statusSection as HTMLElement).getByRole("button", {
        name: "Select visual filter from pie: Status - CRM New",
      }),
    ).toBeTruthy();

    await user.keyboard("{Escape}");

    expect(
      await screen.findByRole("button", { name: /New\s+229/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Contacted\s+5/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Replied\s+3/ }),
    ).toBeTruthy();
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.find(
          ([path]) => path === "/admin/partnership-crm/snapshot",
        ),
    ).toEqual([
      "/admin/partnership-crm/snapshot",
      { cache: "no-store" },
    ]);
  });

  it("does not present an unbuilt failed pointer as an authoritative snapshot", async () => {
    const user = userEvent.setup();
    const failedPointer: PartnershipCrmSnapshot = {
      ...indexedCrmSnapshot,
      refreshState: "failed",
      canRefreshToday: false,
      generationId: undefined,
      lastFullRefreshAt: undefined,
      lastIncrementalUpdateAt: undefined,
      lastRefreshError: "Firestore read failed.",
      sourceReadCount: 0,
      totals: { all: 0, organizations: 0, professionals: 0 },
    };

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/snapshot") {
        return { snapshot: failedPointer };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();
    await screen.findByText(organization.name);
    await user.click(
      screen.getByRole("button", { name: "Pre-filters and CRM index" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Pre-filters and CRM index",
    });
    expect(within(dialog).getByText("Index not loaded yet")).toBeTruthy();
    expect(within(dialog).queryByText("All CRM items")).toBeNull();
    expect(
      within(dialog).queryByLabelText("CRM index snapshot"),
    ).toBeNull();
    expect(
      within(dialog).getByText(/The last full index refresh failed/)
        .textContent,
    ).toContain("Firestore read failed.");
    expect(
      within(dialog).getByText("Daily index refresh already used"),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Load index" }),
    ).toHaveProperty("disabled", true);

    await user.keyboard("{Escape}");
    expect(
      await screen.findByRole("button", { name: /New\s+1/ }),
    ).toBeTruthy();
  });

  it("allows a new refresh when a building marker is from a prior day", async () => {
    const user = userEvent.setup();
    const staleBuildingSnapshot: PartnershipCrmSnapshot = {
      ...indexedCrmSnapshot,
      refreshState: "building",
      canRefreshToday: true,
    };

    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (path === "/admin/partnership-crm/snapshot") {
        return { snapshot: staleBuildingSnapshot };
      }
      return { organizations: [organization], nextCursor: undefined };
    });

    renderWorkbench();
    await screen.findByText(organization.name);
    await user.click(
      screen.getByRole("button", { name: "Pre-filters and CRM index" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Pre-filters and CRM index",
    });
    expect(
      within(dialog).getByRole("button", { name: "Update index" }),
    ).toHaveProperty("disabled", false);
    expect(within(dialog).queryByText("Index refresh in progress")).toBeNull();
  });

  it("refetches a consulted snapshot after facet changes but not favorites or notes", async () => {
    const user = userEvent.setup();
    let snapshotReads = 0;
    let currentOrganization = { ...organization };

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath === "/admin/partnership-crm/snapshot") {
        snapshotReads += 1;
        return { snapshot: indexedCrmSnapshot };
      }
      if (
        stringPath === "/admin/partnership-crm/organizations/org-1/status" &&
        init?.method === "PATCH"
      ) {
        currentOrganization = {
          ...currentOrganization,
          status: "contacted",
        };
        return { organization: currentOrganization };
      }
      if (
        stringPath === "/admin/partnership-crm/organizations/org-1/favorite" &&
        init?.method === "PATCH"
      ) {
        currentOrganization = {
          ...currentOrganization,
          is_favorite: true,
        };
        return { organization: currentOrganization };
      }
      if (stringPath.endsWith("/activities") && init?.method === "POST") {
        return {
          activity: {
            id: "activity-note-1",
            type: "note",
            title: "Snapshot-neutral note",
            body: "Snapshot-neutral note",
          },
        };
      }
      if (stringPath.includes("/activities")) {
        return { activities: [], nextCursor: undefined };
      }
      return {
        organizations: [currentOrganization],
        nextCursor: undefined,
      };
    });

    renderWorkbench();
    await screen.findByText(organization.name);
    await user.click(
      screen.getByRole("button", { name: "Pre-filters and CRM index" }),
    );
    await waitFor(() => expect(snapshotReads).toBe(1));
    await user.keyboard("{Escape}");

    await user.click(screen.getByText(organization.name));
    const detailPanel = await screen.findByTestId("crm-detail-panel");
    await user.click(
      within(detailPanel).getByRole("button", { name: "Change status" }),
    );
    const statusDialog = await screen.findByRole("dialog", {
      name: "Change status",
    });
    await user.click(
      within(statusDialog).getByRole("radio", { name: "CRM Contacted" }),
    );
    await user.click(
      within(statusDialog).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(snapshotReads).toBe(2));

    await user.click(
      within(detailPanel).getByRole("button", { name: "Mark as favorite" }),
    );
    await within(detailPanel).findByRole("button", {
      name: "Unmark as favorite",
    });
    expect(snapshotReads).toBe(2);

    await user.click(
      screen.getByRole("button", { name: /Activity log/ }),
    );
    await user.type(
      screen.getByPlaceholderText("Add an activity note..."),
      "Snapshot-neutral note",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      await screen.findAllByText("Snapshot-neutral note"),
    ).toHaveLength(2);
    expect(snapshotReads).toBe(2);
  });

  it("loads and refreshes the snapshot outside the action quota after an explicit warning", async () => {
    const user = userEvent.setup();
    const lockedUsage = {
      surface: "crm",
      used: 100,
      limit: 100,
      percentage: 100,
      remaining: 0,
      resetAt: "2026-10-16T07:00:00.000Z",
      locked: true,
    };

    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath === "/admin/partnership-crm/daily-usage/page-load") {
        return { usage: lockedUsage };
      }
      if (stringPath === "/admin/partnership-crm/snapshot") {
        return { snapshot: null };
      }
      if (
        stringPath === "/admin/partnership-crm/snapshot/refresh" &&
        init?.method === "POST"
      ) {
        return { snapshot: indexedCrmSnapshot };
      }
      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench("en", {
      autoLoad: false,
      authoritativeUsageMock: true,
    });
    await screen.findByText("Daily limit reached");

    const preFiltersButton = screen.getByRole("button", {
      name: "Pre-filters and CRM index",
    });
    expect(preFiltersButton).toHaveProperty("disabled", false);
    await user.click(preFiltersButton);

    const dialog = await screen.findByRole("dialog", {
      name: "Pre-filters and CRM index",
    });
    const loadIndexButton = within(dialog).getByRole("button", {
      name: "Load index",
    });
    expect(loadIndexButton).toHaveProperty("disabled", false);
    await user.click(loadIndexButton);

    const warning = await screen.findByRole("alertdialog", {
      name: "CRM index refresh warning",
    });
    expect(warning.textContent).toContain(
      "may consume many Firestore reads",
    );
    expect(warning.textContent).toContain("only once per day");
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.some(
          ([path]) => path === "/admin/partnership-crm/snapshot/refresh",
        ),
    ).toBe(false);

    await user.click(
      within(warning).getByRole("button", { name: "Refresh CRM index" }),
    );

    await screen.findByText("CRM index updated.");
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.find(
          ([path]) => path === "/admin/partnership-crm/snapshot",
        ),
    ).toEqual([
      "/admin/partnership-crm/snapshot",
      { cache: "no-store" },
    ]);
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.find(
          ([path]) => path === "/admin/partnership-crm/snapshot/refresh",
        ),
    ).toEqual([
      "/admin/partnership-crm/snapshot/refresh",
      { method: "POST" },
    ]);
    expect(within(dialog).getByText("All CRM items")).toBeTruthy();
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
    expect(screen.getByTestId("crm-bounded-sample-note").textContent).toContain(
      "Server filtering reached its safe scan limit · 11 candidates checked",
    );
    expect(screen.getByRole("button", { name: "Previous" })).toHaveProperty(
      "disabled",
      true,
    );

    const nextButton = screen.getByRole("button", { name: "See 20 more" });
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
    expect(screen.getByRole("button", { name: "See 20 more" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(sdkFetch).toHaveBeenCalledWith(
      "/admin/partnership-crm/organizations?limit=20&cursor=cursor-2",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );

    const listCallCount = () =>
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(([path]) =>
          String(path).startsWith("/admin/partnership-crm/organizations?"),
        ).length;
    expect(listCallCount()).toBe(2);

    await user.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("Genome Page 1");
    await user.click(screen.getByRole("button", { name: "See 20 more" }));
    await screen.findByText("Genome Page 2");
    expect(listCallCount()).toBe(2);
  });

  it("allows cached page navigation after the action budget locks", async () => {
    const user = userEvent.setup();
    const resetAt = "2026-10-16T07:00:00.000Z";
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      const stringPath = String(path);
      if (stringPath === "/admin/partnership-crm/organizations?limit=20") {
        return {
          organizations: [
            { ...organization, id: "org-page-1", name: "Genome Page 1" },
          ],
          nextCursor: "cursor-2",
        };
      }
      if (
        stringPath ===
        "/admin/partnership-crm/organizations?limit=20&cursor=cursor-2"
      ) {
        return {
          organizations: [
            { ...organization, id: "org-page-2", name: "Genome Page 2" },
          ],
          usage: {
            surface: "crm",
            used: 100,
            limit: 100,
            percentage: 100,
            remaining: 0,
            resetAt,
            locked: true,
          },
        };
      }
      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench();
    await screen.findByText("Genome Page 1");
    await user.click(screen.getByRole("button", { name: "See 20 more" }));
    await screen.findByText("Genome Page 2");
    expect(screen.getByText("Daily limit reached")).toBeTruthy();

    const listCallCount = () =>
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(([path]) =>
          String(path).startsWith("/admin/partnership-crm/organizations?"),
        ).length;
    expect(listCallCount()).toBe(2);

    await user.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("Genome Page 1");
    await user.click(screen.getByRole("button", { name: "See 20 more" }));
    await screen.findByText("Genome Page 2");
    expect(listCallCount()).toBe(2);
  });

  it("describes an empty partial page as a server-filtered segment", async () => {
    jest.mocked(sdkFetch).mockImplementation(async (path) => {
      if (String(path).startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }
      return {
        organizations: [],
        nextCursor: "cursor-2",
        partial: true,
        scanned: 11,
        asOf: "2026-10-15T12:00:00.000Z",
      };
    });

    renderWorkbench();

    expect(
      await screen.findByText(
        "No matches were found in this server-filtered segment. Use See 20 more to continue the search.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("No CRM organizations found.")).toBeNull();
  });
});

describe("PartnershipCrmWorkbench import flow", () => {
  beforeEach(() => {
    routerRefresh.mockClear();
    jest.mocked(sdkFetch).mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();

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

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
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
    const summaryCacheKey =
      "golden-crow:partnership-crm:summary:v3:preview-safe";
    window.sessionStorage.setItem(summaryCacheKey, "preserve-during-preview");

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
    expect(window.sessionStorage.getItem(summaryCacheKey)).toBe(
      "preserve-during-preview",
    );
    expect(screen.queryByText("Data changed. Refresh when ready.")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(within(dialog).getByText("Row 2 of 3")).toBeTruthy();
    });
    expect(crmImportCalls()).toHaveLength(1);
    expect(window.sessionStorage.getItem(summaryCacheKey)).toBeNull();
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
      expect(within(dialog).getByText("Row 3 of 3")).toBeTruthy();
    });
    expect(within(dialog).getByText("Genome Lab 3")).toBeTruthy();
    expect(crmImportCalls()).toHaveLength(1);
    expect(crmImportSession()).toEqual(
      expect.objectContaining({
        mode: "interactive",
        activeRowIndex: 2,
        nextImportIndex: 2,
        importSummary: expect.objectContaining({ created: 1, skipped: 1 }),
      }),
    );

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

  it.each([
    {
      testName: "filling only missing fields",
      buttonName: "Compatibilizar sumando campos faltantes",
      duplicateAction: "fill_missing",
    },
    {
      testName: "replacing variable fields",
      buttonName: "Compatibilizar reemplazando variables",
      duplicateAction: "replace_variables",
    },
  ])("quick compatibilizes a duplicate by $testName", async (scenario) => {
    const user = userEvent.setup();

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
            contactName?: string;
            contactEmail?: string;
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
              contactLinkedIn: "",
              lastContactAt: null,
              notes: row.notes ?? "",
            },
            valid: true,
            errors: [],
            missingEmail: false,
            duplicateCandidates: [
              {
                id: "org-existing",
                name: "Genome Lab 1",
                website: "https://old.example.org",
                websiteDomain: "old.example.org",
                contactEmail: "old@example.org",
                status: "contacted",
              },
            ],
            duplicateOrganizationId: "org-existing",
          })),
          summary: {
            total: body.organizations.length,
            valid: body.organizations.length,
            invalid: 0,
            missingEmail: 0,
            duplicates: body.organizations.length,
          },
        };
      }

      if (stringPath === "/admin/partnership-crm/import") {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ rowId: string }>;
        };
        return {
          results: body.organizations.map((row) => ({
            rowId: row.rowId,
            action: "updated",
            organizationId: "org-existing",
          })),
          summary: {
            total: body.organizations.length,
            created: 0,
            updated: body.organizations.length,
            skipped: 0,
            invalid: 0,
          },
        };
      }

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }

      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = crmCsv(1);
    const file = new File([csv], `${scenario.duplicateAction}-crm-import.csv`, {
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
      expect(within(dialog).getByText("Possible duplicate")).toBeTruthy();
    });
    expect(
      within(dialog).getByRole("button", {
        name: "Compatibilizar reemplazando variables",
      }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", {
        name: "Compatibilizar sumando campos faltantes",
      }),
    ).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", {
        name: scenario.buttonName,
      }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("CRM import finished")).toBeTruthy();
    });
    expect(crmImportCalls()).toHaveLength(1);
    expect(
      JSON.parse(String(crmImportCalls()[0]?.[1]?.body)).organizations,
    ).toEqual([
      expect.objectContaining({
        rowId: "row-1",
        duplicateAction: scenario.duplicateAction,
        duplicateOrganizationId: "org-existing",
      }),
    ]);
  });

  it("opens a duplicate compatibility resolver and saves the selected merged payload", async () => {
    const user = userEvent.setup();
    const existingNotes = [
      "**Partnership fit: Mobile delivery for hereditary and prenatal genetic reports. Next step: Demo one of Genos' current reports in Pocket Genes and propose a small local pilot.**",
      "**Reviewed: 2026-09-12.**",
      "**Instagram: https://www.instagram.com/genosargentina/**",
    ].join("\n");
    const incomingNotes = JSON.stringify({
      instagram: "https://www.instagram.com/adnsalta/",
      services: "NIPT listed as a purchasable service.",
    });
    const existingOrganization: PartnershipCrmOrganizationRecord = {
      ...organization,
      id: "org-existing",
      name: "Genome Lab 1",
      category: "org_genetic_testing_laboratories",
      website: "",
      websiteDomain: "",
      country: "AR",
      status: "contacted",
      contactName: "",
      contactEmail: "old@example.org",
      contactLinkedIn: "",
      lastContactAt: null,
      notes: existingNotes,
      normalizedName: "genome lab 1",
    };

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
            contactName?: string;
            contactEmail?: string;
            notes?: string;
          }>;
        };
        return {
          rows: body.organizations.map((row) => ({
            rowId: row.rowId,
            organization: {
              name: row.name ?? "",
              category: row.category ?? "",
              website: "https://new.example.org",
              country: row.country ?? "",
              status: "new",
              contactName: row.contactName ?? "",
              contactEmail: row.contactEmail ?? "",
              contactLinkedIn: "",
              lastContactAt: null,
              notes: incomingNotes,
            },
            valid: true,
            errors: [],
            missingEmail: false,
            duplicateCandidates: [
              {
                id: "org-existing",
                name: "Genome Lab 1",
                website: "",
                websiteDomain: "",
                contactEmail: "old@example.org",
                status: "contacted",
              },
            ],
            duplicateOrganizationId: "org-existing",
          })),
          summary: {
            total: body.organizations.length,
            valid: body.organizations.length,
            invalid: 0,
            missingEmail: 0,
            duplicates: body.organizations.length,
          },
        };
      }

      if (stringPath === "/admin/partnership-crm/organizations/org-existing") {
        return { organization: existingOrganization };
      }

      if (stringPath === "/admin/partnership-crm/import") {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ rowId: string }>;
        };
        return {
          results: body.organizations.map((row) => ({
            rowId: row.rowId,
            action: "updated",
            organizationId: "org-existing",
          })),
          summary: {
            total: body.organizations.length,
            created: 0,
            updated: body.organizations.length,
            skipped: 0,
            invalid: 0,
          },
        };
      }

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }

      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const importDialog = await screen.findByRole("dialog");
    const csv = crmCsv(1);
    const file = new File([csv], "manual-duplicate-crm-import.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });

    await user.upload(within(importDialog).getByLabelText("CSV file"), file);
    await waitFor(() => {
      expect(within(importDialog).getByText("CSV loaded")).toBeTruthy();
    });

    await user.click(
      within(importDialog).getByRole("button", {
        name: "Start interactive download",
      }),
    );
    await waitFor(() => {
      expect(within(importDialog).getByText("Possible duplicate")).toBeTruthy();
    });

    await user.click(
      within(importDialog).getByRole("button", { name: "Compatibilizar" }),
    );
    const resolver = await screen.findByRole("dialog", {
      name: "Compatibilizar",
    });
    expect(
      within(resolver).getAllByText("CRM existing").length,
    ).toBeGreaterThan(0);
    expect(within(resolver).getAllByText("CSV new").length).toBeGreaterThan(0);
    expect(within(resolver).getAllByText("Merge both").length).toBeGreaterThan(
      0,
    );
    const unchangedNameSection = within(resolver)
      .getByRole("heading", { name: "Organization" })
      .closest("section");
    expect(unchangedNameSection).toBeTruthy();
    expect(
      within(unchangedNameSection as HTMLElement).queryByText("CRM existing"),
    ).toBeNull();
    expect(
      within(unchangedNameSection as HTMLElement).queryByText("CSV new"),
    ).toBeNull();
    expect(
      within(unchangedNameSection as HTMLElement).queryByText("Merge both"),
    ).toBeNull();
    expect(
      within(unchangedNameSection as HTMLElement).getByText("Resolved value"),
    ).toBeTruthy();
    expect(
      within(unchangedNameSection as HTMLElement).getByText("Genome Lab 1"),
    ).toBeTruthy();
    expect(within(resolver).getAllByText("instagram").length).toBeGreaterThan(
      0,
    );
    expect(
      within(resolver).getAllByText("https://www.instagram.com/adnsalta/")
        .length,
    ).toBeGreaterThan(0);
    expect(
      within(resolver).getAllByText("partnership_fit").length,
    ).toBeGreaterThan(0);
    expect(
      within(resolver).getAllByText(
        "Mobile delivery for hereditary and prenatal genetic reports. Next step: Demo one of Genos' current reports in Pocket Genes and propose a small local pilot.",
      ).length,
    ).toBeGreaterThan(0);
    expect(within(resolver).getAllByText("reviewed").length).toBeGreaterThan(0);

    await user.click(
      within(resolver).getByRole("button", { name: "Save compatibility" }),
    );

    await waitFor(() => {
      expect(
        within(importDialog).getByText("CRM import finished"),
      ).toBeTruthy();
    });
    expect(crmImportCalls()).toHaveLength(1);
    const importedRow = JSON.parse(String(crmImportCalls()[0]?.[1]?.body))
      .organizations[0];
    expect(importedRow).toEqual(
      expect.objectContaining({
        rowId: "row-1",
        duplicateAction: "update",
        duplicateOrganizationId: "org-existing",
        website: "https://new.example.org",
        contactEmail: "old@example.org",
        notes: JSON.stringify({
          partnership_fit:
            "Mobile delivery for hereditary and prenatal genetic reports. Next step: Demo one of Genos' current reports in Pocket Genes and propose a small local pilot.",
          reviewed: "2026-09-12.",
          instagram: "https://www.instagram.com/adnsalta/",
          services: "NIPT listed as a purchasable service.",
        }),
      }),
    );
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

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
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
        name: "Process next 5",
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
          name: "Process next 5",
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
        status: "paused",
      }),
    );

    await user.click(
      within(dialog).getByRole("button", {
        name: "Process next 5",
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

  it("uses replace-variables duplicate resolution by default when importing remaining rows in sequence", async () => {
    const user = userEvent.setup();

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
            contactName?: string;
            contactEmail?: string;
            notes?: string;
          }>;
        };
        return {
          rows: body.organizations.map((row) => {
            const isDuplicate = row.rowId === "row-1";
            return {
              rowId: row.rowId,
              organization: {
                name: row.name ?? "",
                category: row.category ?? "",
                website: row.website ?? "",
                country: row.country ?? "",
                status: "new",
                contactName: row.contactName ?? "",
                contactEmail: row.contactEmail ?? "",
                contactLinkedIn: "",
                lastContactAt: null,
                notes: row.notes ?? "",
              },
              valid: true,
              errors: [],
              missingEmail: false,
              duplicateCandidates: isDuplicate
                ? [
                    {
                      id: "org-existing",
                      name: "Genome Lab 1",
                      website: "https://old.example.org",
                      websiteDomain: "old.example.org",
                      contactEmail: "old@example.org",
                      status: "contacted",
                    },
                  ]
                : [],
              duplicateOrganizationId: isDuplicate ? "org-existing" : undefined,
            };
          }),
          summary: {
            total: body.organizations.length,
            valid: body.organizations.length,
            invalid: 0,
            missingEmail: 0,
            duplicates: body.organizations.filter(
              (row) => row.rowId === "row-1",
            ).length,
          },
        };
      }

      if (stringPath === "/admin/partnership-crm/import") {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ rowId: string; duplicateAction: string }>;
        };
        return {
          results: body.organizations.map((row, index) => ({
            rowId: row.rowId,
            action:
              row.duplicateAction === "replace_variables"
                ? "updated"
                : "created",
            organizationId:
              row.duplicateAction === "replace_variables"
                ? "org-existing"
                : `imported-${index}`,
          })),
          summary: {
            total: body.organizations.length,
            created: body.organizations.filter(
              (row) => row.duplicateAction !== "replace_variables",
            ).length,
            updated: body.organizations.filter(
              (row) => row.duplicateAction === "replace_variables",
            ).length,
            skipped: 0,
            invalid: 0,
          },
        };
      }

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
        return { templates: [], nextCursor: undefined };
      }

      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = crmCsv(2);
    const file = new File([csv], "sequence-duplicate-crm-import.csv", {
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
      expect(within(dialog).getByText("Row 1 of 2")).toBeTruthy();
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "Process next 5",
      }),
    );

    await waitFor(() => {
      expect(within(dialog).getByText("CRM import finished")).toBeTruthy();
    });
    expect(
      crmImportCalls().map(([, init]) => {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ duplicateAction: string }>;
        };
        return body.organizations[0]?.duplicateAction;
      }),
    ).toEqual(["replace_variables", "import"]);
  });

  it("shows a copyable row-level diagnostic log when interactive import fails", async () => {
    const user = userEvent.setup();
    let importAttemptCount = 0;
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
        importAttemptCount += 1;
        if (importAttemptCount === 1) {
          throw requestError;
        }
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ rowId: string }>;
        };
        return {
          results: body.organizations.map((row) => ({
            rowId: row.rowId,
            action: "created",
            organizationId: "imported-after-retry",
          })),
          summary: {
            total: 1,
            created: 1,
            updated: 0,
            skipped: 0,
            invalid: 0,
          },
        };
      }

      if (stringPath.startsWith("/admin/partnership-crm/email-templates")) {
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

    const firstImportPayload = JSON.parse(
      String(crmImportCalls()[0]?.[1]?.body),
    );
    const previewPayload = JSON.parse(String(crmPreviewCalls()[0]?.[1]?.body));
    expect(previewPayload.organizations[0]).not.toHaveProperty(
      "idempotencyKey",
    );
    expect(firstImportPayload.organizations[0].idempotencyKey).toBe(
      `${crmImportSession().id}:row-1`,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry verification",
        hidden: true,
      }),
    );
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Add" }),
      ).toHaveProperty("disabled", false);
    });
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(within(dialog).getByText("CRM import finished")).toBeTruthy();
    });
    expect(crmImportCalls()).toHaveLength(2);
    const secondImportPayload = JSON.parse(
      String(crmImportCalls()[1]?.[1]?.body),
    );
    expect(secondImportPayload.organizations[0].idempotencyKey).toBe(
      firstImportPayload.organizations[0].idempotencyKey,
    );
  });

  it("reports the next sequential import row as definitely not sent after fail-closed usage", async () => {
    const user = userEvent.setup();
    jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
      const stringPath = String(path);
      if (stringPath === "/admin/partnership-crm/import-preview") {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{
            rowId: string;
            name?: string;
            category?: string;
            website?: string;
            country?: string;
            contactName?: string;
            contactEmail?: string;
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
              contactLinkedIn: "",
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
          usage: {
            surface: "crm",
            used: 2,
            limit: 100,
            percentage: 2,
            remaining: 98,
            resetAt: "2026-10-16T07:00:00.000Z",
            locked: false,
          },
        };
      }
      if (stringPath === "/admin/partnership-crm/import") {
        const body = JSON.parse(String(init?.body)) as {
          organizations: Array<{ rowId: string }>;
        };
        return {
          results: body.organizations.map((row) => ({
            rowId: row.rowId,
            action: "created",
            organizationId: `imported-${row.rowId}`,
          })),
          summary: {
            total: 1,
            created: 1,
            updated: 0,
            skipped: 0,
            invalid: 0,
          },
          // Deliberately omit authoritative usage. crmFetch must fail closed
          // before the second row can make a request.
        };
      }
      return { organizations: [], nextCursor: undefined };
    });

    renderWorkbench("en", {
      autoLoad: false,
      injectActionUsage: false,
    });
    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    const dialog = await screen.findByRole("dialog");
    const csv = crmCsv(2);
    const file = new File([csv], "usage-boundary-import.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => csv });
    await user.upload(within(dialog).getByLabelText("CSV file"), file);
    await waitFor(() => {
      expect(within(dialog).getByText("CSV loaded")).toBeTruthy();
    });

    await user.click(
      within(dialog).getByRole("button", { name: "Process next 5" }),
    );

    expect(
      await within(dialog).findByText(
        "Row 2 of 2 was not sent. Completed rows and the saved checkpoint were kept. Verify CRM usage or wait for the daily reset, then resume this row.",
      ),
    ).toBeTruthy();
    expect(crmImportCalls()).toHaveLength(1);
    expect(crmImportSession()).toEqual(
      expect.objectContaining({
        status: "paused",
        nextImportIndex: 1,
        results: [expect.objectContaining({ rowId: "row-1" })],
        lastErrorDetail: expect.objectContaining({
          rowNumber: 2,
          requestNotSent: true,
        }),
      }),
    );
    expect(within(dialog).queryByText(/Fix the CSV row/)).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Show log" }));
    const logText = dialog.querySelector("pre")?.textContent ?? "";
    expect(logText).toContain("Request status: Not sent");
    expect(logText).toContain("Next step");
    expect(logText).not.toContain("What to fix");
    expect(logText).not.toContain("Backend response details");
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
      within(dialog).getByRole("button", { name: "Process next 5" }),
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
    expect(
      within(dialog).getByText(/Optional structured JSON object string/),
    ).toBeTruthy();
    expect(within(dialog).getAllByText(/instagram/).length).toBeGreaterThan(0);

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
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Structured JSON notes must be a single quoted CSV cell",
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
    expect(
      within(dialog).getByText(
        /Best effort is required for professional imports/,
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/never start it with labels such as/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/fits inside: “Por tu experiencia en/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Professional template variable coverage"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "{{professional_name}}, {{first_name}}, {{contact_name}}",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("{{website}}, {{website_sentence}}"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/email and linkedin are not template variables/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Optional structured JSON object string/),
    ).toBeTruthy();

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
      "Best effort is required for professional imports",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "never start it with labels such as",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Por tu experiencia en {{potential_pocket_genes_editor_fit}}, pensamos que podría haber un buen match.",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Professional template variable coverage",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "{{potential_pocket_genes_editor_fit}}: potential_pocket_genes_editor_fit",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "{{website}}, {{website_sentence}}: website",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Structured JSON notes must be a single quoted CSV cell",
    );
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "Rejected: 2026-08-25 and 2026-08-25T14:29:00 because they do not include timezone.",
    );
  });
});
