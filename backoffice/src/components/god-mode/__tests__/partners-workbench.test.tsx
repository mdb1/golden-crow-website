/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  PartnerEditor,
  PartnersBrowser,
} from "@/components/god-mode/partners-workbench";
import {
  PARTNERS_API_ROUTE,
  PARTNERS_QUERY_KEY,
  type Partner,
  type PartnerInput,
} from "@/lib/connected-partners";
import { sdkFetch } from "@/lib/sdk-client";

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

const contact: Partner = {
  id: "one",
  companyName: "Acme",
  firstName: "Ana",
  lastName: "Smith",
  phoneNumber: "+54 11 1234",
  email: "ana@example.com",
  meetingDate: null,
  notes: null,
  linkedOrganizationId: null,
  linkedIndividualPublisherId: null,
  linkedAppId: null,
  linkedOrganizationSnapshot: null,
  linkedIndividualPublisherSnapshot: null,
  linkedAppSnapshot: null,
  linkedOrganization: null,
  linkedIndividualPublisher: null,
  linkedApp: null,
};
const organization = { id: "org_one", name: "Acme Organization" };
const individual = { id: "individual_one", name: "Dr. Ada Rivers" };
const linkedApp = {
  id: "organization_org_one",
  publisherKind: "organization" as const,
  publisherId: organization.id,
  publisherName: organization.name,
  status: "active_for_testing" as const,
};
const individualApp = {
  id: "individual_individual_one",
  publisherKind: "individual" as const,
  publisherId: individual.id,
  publisherName: individual.name,
  status: "active" as const,
};
const withOrganization: Partner = {
  ...contact,
  linkedOrganizationId: organization.id,
  linkedOrganization: organization,
  linkedOrganizationSnapshot: organization,
};
const withBoth: Partner = {
  ...withOrganization,
  linkedIndividualPublisherId: individual.id,
  linkedIndividualPublisher: individual,
  linkedIndividualPublisherSnapshot: individual,
};
const withApp: Partner = {
  ...withBoth,
  linkedAppId: linkedApp.id,
  linkedApp,
  linkedAppSnapshot: linkedApp,
};

function inputOf(partner: Partner): PartnerInput {
  const {
    id: _id,
    linkedOrganizationSnapshot: _organizationSnapshot,
    linkedIndividualPublisherSnapshot: _individualSnapshot,
    linkedAppSnapshot: _appSnapshot,
    linkedOrganization: _organization,
    linkedIndividualPublisher: _individual,
    linkedApp: _app,
    ...input
  } = partner;
  return input;
}
function renderWorkbench(component = <PartnersBrowser />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <AppLanguageProvider forcedLanguage="en">
      <QueryClientProvider client={client}>{component}</QueryClientProvider>
    </AppLanguageProvider>,
  );
  return { ...result, client };
}
function fillContact(phone = "") {
  for (const [label, value] of [
    ["Company name", "Acme"],
    ["First name", "Ana"],
    ["Last name", "Smith"],
    ["Email", "ana@example.com"],
  ])
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}(?:\\s|$)`)), { target: { value } });
  fireEvent.change(screen.getByLabelText(/^Phone number/), {
    target: { value: phone },
  });
}

it("opens the email history from the top button and reads nothing until requested", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({ emails: [], nextCursor: null });
  renderWorkbench();
  expect(sdkFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "All emails sent" }));
  const modal = await screen.findByRole("dialog", { name: "All emails sent" });
  expect(await within(modal).findByText("No emails have been sent from Partners yet.")).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/sent-email-log?limit=20`, expect.any(Object));
  fireEvent.click(within(modal).getByRole("button", { name: "Finish" }));
  expect(screen.queryByRole("dialog", { name: "All emails sent" })).not.toBeInTheDocument();
});
function review() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Review" }));
}
function savePartner() {
  review();
  fireEvent.click(screen.getByRole("button", { name: "Save partner" }));
}
function mockEditor(saved = contact) {
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (init?.method === "POST" || init?.method === "PUT")
      return { partner: saved } as never;
    if (String(path).includes("link-options"))
      return { items: [], nextCursor: null } as never;
    if (path === `${PARTNERS_API_ROUTE}/${saved.id}`)
      return { partner: saved } as never;
    return { items: [saved], nextCursor: null } as never;
  });
}
function selectedOptions() {
  return within(screen.getByRole("dialog", { name: "Add connections" }));
}
async function choose(
  kind: "organization" | "individual publisher" | "app",
  name: string,
) {
  fireEvent.click(screen.getByRole("button", { name: `Choose ${kind}` }));
  fireEvent.click(
    await selectedOptions().findByRole("button", {
      name: new RegExp(`^Select ${name}`),
    }),
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  window.localStorage.clear();
});

function sectionRequest(path: string) {
  return new URL(path, "https://example.test").searchParams;
}
function page(
  items: Partner[],
  nextCursor: string | null = null,
  scanIncomplete = false,
) {
  return { items, nextCursor, scanIncomplete };
}
function contacts(prefix: string, count = 20) {
  return Array.from({ length: count }, (_, index): Partner => ({
    ...contact,
    id: `${prefix}_${index + 1}`,
    companyName: `${prefix} ${index + 1}`,
    email: `${prefix.toLowerCase()}${index + 1}@example.com`,
  }));
}
function openSection(name = "No organization yet") {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
}
function clickView(name: "Grid" | "Table") {
  fireEvent.mouseDown(screen.getByRole("tab", { name }));
}
function pager() {
  return within(screen.getByRole("navigation", { name: "Partner pagination" }));
}
function expectHiddenText(text: string) {
  const element = screen.queryByText(text);
  if (element) expect(element).not.toBeVisible();
  else expect(element).not.toBeInTheDocument();
}

it("keeps all section contents collapsed and does not fetch partners until a section opens", async () => {
  jest.mocked(sdkFetch).mockResolvedValue(page([]));
  renderWorkbench();
  for (const name of [
    "No organization yet",
    "Without app",
    "With free app",
    "With contract",
    "Other app statuses or missing links",
  ]) {
    expect(
      screen.getByRole("button", { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute("aria-expanded", "false");
  }
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
  expect(
    screen.queryByRole("button", { name: /^Individual publisher/ }),
  ).not.toBeInTheDocument();
  expect(sdkFetch).not.toHaveBeenCalled();
  openSection();
  expect(await screen.findByText("No partners in this section.")).toBeVisible();
  expect(
    sectionRequest(String(jest.mocked(sdkFetch).mock.calls[0][0])).get(
      "section",
    ),
  ).toBe("noOrganization");
  fireEvent.click(screen.getAllByRole("button", { name: "New partner" })[0]);
  expect(
    await screen.findByRole("dialog", { name: "New partner" }),
  ).toBeVisible();
  expect(screen.getByRole("tab", { name: "Contact" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(mockPush).not.toHaveBeenCalled();
});

it("opens one section at a time and fetches only the requested section", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const section = sectionRequest(String(path)).get("section");
    return page(
      section === "noOrganization"
        ? [contact]
        : [{ ...withOrganization, id: "two", companyName: "Beta" }],
    ) as never;
  });
  renderWorkbench();
  openSection();
  expect(await screen.findByText("Acme")).toBeVisible();
  for (const value of ["Ana", "Smith", "+54 11 1234", "ana@example.com"])
    expect(screen.getByText(value)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Edit partner: Acme" }),
  ).toBeVisible();
  openSection("Without app");
  expect(await screen.findByText("Beta")).toBeVisible();
  expectHiddenText("Acme");
  expect(
    screen.getByRole("button", { name: /^No organization yet/ }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("button", { name: /^Without app/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.map(([path]) => sectionRequest(String(path)).get("section")),
  ).toEqual(["noOrganization", "organizationWithoutApp"]);
  openSection("Without app");
  await waitFor(() => expectHiddenText("Beta"));
});

it("replaces the visible 20-partner page and preserves independent section page history", async () => {
  const first = contacts("First");
  const second = contacts("Second", 2);
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const params = sectionRequest(String(path));
    if (params.get("section") === "organizationWithoutApp")
      return page([
        { ...withOrganization, companyName: "Organization contact" },
      ]) as never;
    return params.has("cursor")
      ? (page(second) as never)
      : (page(first, "page_two") as never);
  });
  renderWorkbench();
  openSection();
  await screen.findByText("First 20");
  expect(screen.queryByText("Second 1")).not.toBeInTheDocument();
  expect(pager().getByRole("button", { name: "Previous page" })).toBeDisabled();
  const bottomPager = within(
    screen.getByRole("navigation", {
      name: "Partner pagination below results",
    }),
  );
  fireEvent.click(bottomPager.getByRole("button", { name: "Next page" }));
  await screen.findByText("Second 1");
  expect(screen.queryByText("First 1")).not.toBeInTheDocument();
  expect(pager().getByText(/^Page 2\b/)).toBeVisible();
  expect(pager().getByRole("button", { name: "Next page" })).toBeDisabled();
  openSection("Without app");
  await screen.findByText("Organization contact");
  expect(pager().getByText(/^Page 1\b/)).toBeVisible();
  const organizationRequest = jest
    .mocked(sdkFetch)
    .mock.calls.find(
      ([path]) =>
        sectionRequest(String(path)).get("section") ===
        "organizationWithoutApp",
    );
  expect(
    sectionRequest(String(organizationRequest![0])).get("cursor"),
  ).toBeNull();
  openSection();
  await screen.findByText("Second 1");
  expect(pager().getByText(/^Page 2\b/)).toBeVisible();
  await waitFor(() =>
    expect(
      pager().getByRole("button", { name: "Previous page" }),
    ).toBeEnabled(),
  );
  fireEvent.click(pager().getByRole("button", { name: "Previous page" }));
  await screen.findByText("First 1");
  expect(screen.queryByText("Second 1")).not.toBeInTheDocument();
  for (const [path] of jest.mocked(sdkFetch).mock.calls) {
    const params = sectionRequest(String(path));
    expect(params.get("limit")).toBe("20");
    expect(params.get("section")).not.toBeNull();
  }
});

it("paginates 20 mixed publisher contacts in one shared section and opens the selected individual's detail and email", async () => {
  const mixed = Array.from({ length: 24 }, (_, index): Partner => {
    const isOrganization = index % 2 === 0;
    return {
      ...contact,
      id: `mixed_${index + 1}`,
      companyName: `${isOrganization ? "Organization" : "Individual"} ${index + 1}`,
      email: `mixed${index + 1}@example.com`,
      linkedOrganizationId: isOrganization ? organization.id : null,
      linkedOrganization: isOrganization ? organization : null,
      linkedOrganizationSnapshot: isOrganization ? organization : null,
      linkedIndividualPublisherId: isOrganization ? null : individual.id,
      linkedIndividualPublisher: isOrganization ? null : individual,
      linkedIndividualPublisherSnapshot: isOrganization ? null : individual,
    };
  });
  const selectedIndividual = mixed[1];
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const value = String(path);
    if (value.includes("/email-preview"))
      return {
        partnerId: selectedIndividual.id,
        to: selectedIndividual.email,
        subject: "Prepare your publisher app",
        text: "Create your app request.",
        html: "<p>Create your app request.</p>",
        ctaLabel: "Create my app",
        ctaUrl: "https://example.test/publisher-portal/app/new",
        category: "individualWithoutApp",
        language: "es",
        partnerName: "Acme",
        from: "federico@goldencrowvs.com",
        templateVariant: 1,
        previewHash: "a".repeat(64),
      } as never;
    if (value === `${PARTNERS_API_ROUTE}/${selectedIndividual.id}`)
      return { partner: selectedIndividual } as never;
    const params = sectionRequest(value);
    expect(params.get("section")).toBe("organizationWithoutApp");
    expect(params.get("limit")).toBe("20");
    return params.has("cursor")
      ? (page(mixed.slice(20)) as never)
      : (page(mixed.slice(0, 20), "mixed_second_page") as never);
  });
  renderWorkbench();
  openSection("Without app");
  await screen.findByText("Individual 20");
  const detailButtons = () =>
    screen.getAllByRole("button", { name: /^View partner details:/ });
  expect(detailButtons()).toHaveLength(20);
  expect(
    detailButtons().filter((button) =>
      button.textContent?.startsWith("Organization"),
    ),
  ).toHaveLength(10);
  expect(
    detailButtons().filter((button) =>
      button.textContent?.startsWith("Individual"),
    ),
  ).toHaveLength(10);
  expect(screen.queryByText("Organization 21")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /^Individual publisher/ }),
  ).not.toBeInTheDocument();
  clickView("Table");
  expect(
    within(await screen.findByRole("table")).getAllByRole("row"),
  ).toHaveLength(21);
  fireEvent.click(
    screen.getByRole("button", { name: "View partner details: Individual 2" }),
  );
  const panel = within(
    await screen.findByRole("complementary", { name: "Partner details" }),
  );
  expect(await panel.findByText(selectedIndividual.email)).toBeVisible();
  fireEvent.click(panel.getByRole("button", { name: "Send an email" }));
  const dialog = await screen.findByRole("dialog", { name: "Email preview" });
  expect(
    await within(dialog).findByText("Prepare your publisher app"),
  ).toBeVisible();
  expect(within(dialog).getByText(selectedIndividual.email)).toBeVisible();
  expect(within(dialog).getByText("Without app")).toBeVisible();
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.some(([, init]) => init?.method === "POST"),
  ).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(
    screen.getByRole("complementary", { name: "Partner details" }),
  ).toBeVisible();
  fireEvent.click(pager().getByRole("button", { name: "Next page" }));
  await screen.findByText("Organization 21");
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();
  expect(detailButtons()).toHaveLength(4);
  expect(screen.queryByText("Individual 2")).not.toBeInTheDocument();
  expect(pager().getByText(/^Page 2\b/)).toBeVisible();
  clickView("Grid");
  expect(detailButtons()).toHaveLength(4);
  expect(screen.getByText("Individual 24")).toBeVisible();
});

it.each([
  { label: "With free app", key: "freeApp", status: "active_for_testing" },
  { label: "With contract", key: "contract", status: "active" },
] as const)(
  "shares the $label list between organization and individual apps",
  async ({ label, key, status }) => {
    const organizationPartner: Partner = {
      ...withApp,
      companyName: "Organization app partner",
      linkedApp: { ...linkedApp, status },
    };
    const individualPartner: Partner = {
      ...contact,
      id: "individual_app_partner",
      companyName: "Individual app partner",
      linkedIndividualPublisherId: individual.id,
      linkedIndividualPublisher: individual,
      linkedIndividualPublisherSnapshot: individual,
      linkedAppId: individualApp.id,
      linkedApp: { ...individualApp, status },
      linkedAppSnapshot: individualApp,
    };
    jest
      .mocked(sdkFetch)
      .mockResolvedValue(page([organizationPartner, individualPartner]));
    renderWorkbench();
    openSection(label);
    expect(
      await screen.findByText(organizationPartner.companyName),
    ).toBeVisible();
    expect(screen.getByText(individualPartner.companyName)).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /^View partner details:/ }),
    ).toHaveLength(2);
    expect(
      sectionRequest(String(jest.mocked(sdkFetch).mock.calls[0][0])).get(
        "section",
      ),
    ).toBe(key);
    expect(
      screen.queryByRole("button", { name: /^Individual publisher/ }),
    ).not.toBeInTheDocument();
  },
);

it("keeps an empty trailing page distinct from an empty section and allows returning to its partners", async () => {
  jest
    .mocked(sdkFetch)
    .mockImplementation(async (path) =>
      sectionRequest(String(path)).has("cursor")
        ? (page([]) as never)
        : (page(contacts("First"), "trailing_sources") as never),
    );
  renderWorkbench();
  openSection();
  await screen.findByText("First 20");
  fireEvent.click(pager().getByRole("button", { name: "Next page" }));
  expect(await screen.findByText("No partners on this page.")).toBeVisible();
  expect(
    screen.queryByText("No partners in this section."),
  ).not.toBeInTheDocument();
  expect(pager().getByText(/^Page 2\b/)).toBeVisible();
  expect(pager().getByRole("button", { name: "Next page" })).toBeDisabled();
  await waitFor(() =>
    expect(
      pager().getByRole("button", { name: "Previous page" }),
    ).toBeEnabled(),
  );
  fireEvent.click(pager().getByRole("button", { name: "Previous page" }));
  expect(await screen.findByText("First 1")).toBeVisible();
  expect(pager().getByText(/^Page 1\b/)).toBeVisible();
});

it("keeps the current page when switching between grid cells and semantic table rows", async () => {
  const first = contacts("First");
  const second = [
    {
      ...contact,
      id: "two",
      companyName: "Beta",
      meetingDate: "2026-11-10",
      notes: "Follow up next week",
    },
  ];
  jest
    .mocked(sdkFetch)
    .mockImplementation(async (path) =>
      sectionRequest(String(path)).has("cursor")
        ? (page(second) as never)
        : (page(first, "page_two") as never),
    );
  renderWorkbench();
  openSection();
  await screen.findByText("First 20");
  fireEvent.click(pager().getByRole("button", { name: "Next page" }));
  await screen.findByText("Beta");
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: Beta/ }),
  );
  clickView("Table");
  const table = await screen.findByRole("table");
  expect(screen.getByRole("tab", { name: "Table" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const row = within(table).getByText("Beta").closest("tr")!;
  expect(row).toHaveTextContent("Ana");
  expect(row).toHaveTextContent("Smith");
  expect(row).toHaveTextContent("ana@example.com");
  expect(row).toHaveTextContent("+54 11 1234");
  expect(row).toHaveTextContent("2026-11-10");
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  const notes = within(row).getByText("Follow up next week");
  expect(notes).not.toBeVisible();
  fireEvent.click(within(row).getByText("View notes"));
  expect(notes).toBeVisible();
  expect(pager().getByText(/^Page 2\b/)).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: /Select partner: Beta/ }),
  ).toBeChecked();
  expect(screen.queryByText("First 1")).not.toBeInTheDocument();
  clickView("Grid");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByText("Follow up next week")).toBeVisible();
  expect(pager().getByText(/^Page 2\b/)).toBeVisible();
});

it("preserves missing-link warnings and modal editing in table rows", async () => {
  const missing: Partner = {
    ...withApp,
    id: "missing",
    companyName: "Broken links",
    linkedOrganization: null,
    linkedApp: null,
  };
  jest
    .mocked(sdkFetch)
    .mockImplementation(async (path) =>
      String(path) === `${PARTNERS_API_ROUTE}/missing`
        ? ({ partner: missing } as never)
        : (page([missing]) as never),
    );
  renderWorkbench();
  openSection("Other app statuses or missing links");
  await screen.findByText("Broken links");
  clickView("Table");
  const table = await screen.findByRole("table");
  expect(
    within(table).getByText(/Linked organization is unavailable/),
  ).toHaveTextContent(organization.id);
  expect(
    within(table).getByText(/Linked app is unavailable/),
  ).toHaveTextContent(linkedApp.id);
  expect(
    within(table).queryByText("Testing · Free app"),
  ).not.toBeInTheDocument();
  fireEvent.click(
    within(table).getByRole("button", { name: "Edit partner: Broken links" }),
  );
  expect(await screen.findByLabelText("Company name")).toHaveValue(
    "Broken links",
  );
  expect(screen.getByRole("dialog", { name: "Edit partner" })).toBeVisible();
  expect(mockPush).not.toHaveBeenCalled();
});

it("clears bulk selections when changing page or section", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const params = sectionRequest(String(path));
    if (params.get("section") === "organizationWithoutApp")
      return page([
        { ...withOrganization, companyName: "Other contact" },
      ]) as never;
    return params.has("cursor")
      ? (page(contacts("Second", 1)) as never)
      : (page(contacts("First"), "page_two") as never);
  });
  renderWorkbench();
  openSection();
  await screen.findByText("First 20");
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: First 1 —/ }),
  );
  expect(
    screen.getByRole("button", { name: "Delete selected (1)" }),
  ).toBeVisible();
  fireEvent.click(pager().getByRole("button", { name: "Next page" }));
  await screen.findByText("Second 1");
  expect(
    screen.queryByRole("button", { name: /Delete selected/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(pager().getByRole("button", { name: "Previous page" }));
  await screen.findByText("First 1");
  expect(
    screen.getByRole("checkbox", { name: /Select partner: First 1 —/ }),
  ).not.toBeChecked();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: First 1 —/ }),
  );
  openSection("Without app");
  await screen.findByText("Other contact");
  expect(
    screen.queryByRole("button", { name: /Delete selected/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: Other contact/ }),
  );
  openSection("Without app");
  expect(
    screen.queryByRole("button", { name: /Delete selected/ }),
  ).not.toBeInTheDocument();
  openSection("Without app");
  await screen.findByText("Other contact");
  expect(
    screen.getByRole("checkbox", { name: /Select partner: Other contact/ }),
  ).not.toBeChecked();
});

it("bounds sparse section searches and continues filling the same page without dropping partners", async () => {
  const remaining = contacts("More", 19);
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const params = sectionRequest(String(path));
    switch (params.get("cursor")) {
      case null:
        return page([contact], "scan_one", true) as never;
      case "scan_one":
        return page([], "scan_two", true) as never;
      case "scan_two":
        return page([], "scan_three", true) as never;
      case "scan_three":
        return page(remaining, "page_two") as never;
      default:
        return page([{ ...contact, id: "tail", companyName: "Tail" }]) as never;
    }
  });
  renderWorkbench();
  openSection();
  await screen.findByText("Acme");
  expect(sdkFetch).toHaveBeenCalledTimes(3);
  expect(pager().getByRole("button", { name: "Next page" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Find more partners" }));
  await screen.findByText("More 19");
  expect(screen.getByText("Acme")).toBeVisible();
  const continuation = sectionRequest(
    String(jest.mocked(sdkFetch).mock.calls[3][0]),
  );
  expect(continuation.get("cursor")).toBe("scan_three");
  expect(continuation.get("limit")).toBe("19");
  expect(pager().getByRole("button", { name: "Next page" })).toBeEnabled();
  fireEvent.click(pager().getByRole("button", { name: "Next page" }));
  await screen.findByText("Tail");
  expect(screen.queryByText("Acme")).not.toBeInTheDocument();
  expect(screen.queryByText("More 19")).not.toBeInTheDocument();
});

it("retains a completed sparse window when reopening sections or returning from the next page", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const params = sectionRequest(String(path));
    if (params.get("section") === "organizationWithoutApp")
      return page([
        { ...withOrganization, companyName: "Organization contact" },
      ]) as never;
    switch (params.get("cursor")) {
      case null:
        return page([contact], "scan_one", true) as never;
      case "scan_one":
        return page([], "scan_two", true) as never;
      case "scan_two":
        return page([], "scan_three", true) as never;
      case "scan_three":
        return page(contacts("More", 19), "page_two") as never;
      default:
        return page([{ ...contact, id: "tail", companyName: "Tail" }]) as never;
    }
  });
  renderWorkbench();
  openSection();
  await screen.findByText("Acme");
  fireEvent.click(screen.getByRole("button", { name: "Find more partners" }));
  await screen.findByText("More 19");
  expect(sdkFetch).toHaveBeenCalledTimes(4);
  openSection();
  openSection();
  expect(screen.getByText("More 19")).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledTimes(4);
  openSection("Without app");
  await screen.findByText("Organization contact");
  openSection();
  expect(screen.getByText("More 19")).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledTimes(5);
  fireEvent.click(pager().getByRole("button", { name: "Next page" }));
  await screen.findByText("Tail");
  fireEvent.click(pager().getByRole("button", { name: "Previous page" }));
  expect(screen.getByText("More 19")).toBeVisible();
  expect(screen.getByText("Acme")).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledTimes(6);
});

it("refreshes the current page's live app status without resetting table view or page number", async () => {
  const prior: Partner = {
    ...withApp,
    id: "live",
    companyName: "Current app",
    linkedApp: { ...linkedApp, status: "active_waiting_for_payment" },
  };
  const refreshed: Partner = {
    ...prior,
    companyName: "Refreshed app",
    linkedApp: { ...linkedApp, status: "active" },
  };
  let secondPageReads = 0;
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const params = sectionRequest(String(path));
    if (params.get("cursor") === "page_two") {
      secondPageReads += 1;
      return page([secondPageReads === 1 ? prior : refreshed]) as never;
    }
    return page(
      contacts("Contract").map((record) => ({
        ...withApp,
        id: record.id,
        companyName: record.companyName,
        email: record.email,
        linkedApp: {
          ...linkedApp,
          status: "active_waiting_for_payment" as const,
        },
      })),
      "page_two",
    ) as never;
  });
  renderWorkbench();
  openSection("With contract");
  await screen.findByText("Contract 20");
  fireEvent.click(pager().getByRole("button", { name: "Next page" }));
  await screen.findByText("Current app");
  clickView("Table");
  expect(
    within(screen.getByRole("table")).getByText("Contract · Awaiting payment"),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: Current app/ }),
  );
  fireEvent.click(pager().getByRole("button", { name: "Refresh section" }));
  await screen.findByText("Refreshed app");
  expect(screen.getByRole("tab", { name: "Table" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(pager().getByText(/^Page 2\b/)).toBeVisible();
  expect(
    within(screen.getByRole("table")).getByText("Active app"),
  ).toBeVisible();
  expect(
    screen.queryByText("Contract · Awaiting payment"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Delete selected/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("checkbox", { name: /Select partner: Refreshed app/ }),
  ).not.toBeChecked();
  expect(secondPageReads).toBe(2);
  expect(
    sectionRequest(String(jest.mocked(sdkFetch).mock.calls.at(-1)![0])).get(
      "cursor",
    ),
  ).toBe("page_two");
});

it("does not restore selection when a partner leaves and later returns after data invalidation", async () => {
  const replacement = {
    ...contact,
    id: "replacement",
    companyName: "Replacement",
  };
  let showOriginal = true;
  jest
    .mocked(sdkFetch)
    .mockImplementation(
      async () => page(showOriginal ? [contact] : [replacement]) as never,
    );
  const { client } = renderWorkbench();
  openSection();
  await screen.findByText("Acme");
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: Acme/ }),
  );
  showOriginal = false;
  await act(async () => {
    await client.invalidateQueries({ queryKey: PARTNERS_QUERY_KEY });
  });
  await screen.findByText("Replacement");
  expect(
    screen.queryByRole("button", { name: /Delete selected/ }),
  ).not.toBeInTheDocument();
  showOriginal = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: PARTNERS_QUERY_KEY });
  });
  await screen.findByText("Acme");
  expect(
    screen.getByRole("checkbox", { name: /Select partner: Acme/ }),
  ).not.toBeChecked();
});

it("cancels the active section request when it is collapsed and does not keep scanning", async () => {
  let finish!: (value: ReturnType<typeof page>) => void;
  const pending = new Promise<ReturnType<typeof page>>((resolve) => {
    finish = resolve;
  });
  let signal: AbortSignal | null | undefined;
  jest.mocked(sdkFetch).mockImplementation(async (_path, init) => {
    signal = init?.signal;
    return pending as never;
  });
  renderWorkbench();
  openSection();
  await waitFor(() => expect(sdkFetch).toHaveBeenCalledTimes(1));
  openSection();
  await waitFor(() => expect(signal?.aborted).toBe(true));
  await act(async () => {
    finish(page([], "more_to_scan", true));
  });
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: /^No organization yet/ }),
  ).toHaveAttribute("aria-expanded", "false");
});

it("does not label a sparse section empty until its continuation is exhausted", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const cursor = sectionRequest(String(path)).get("cursor");
    return cursor === "scan_three"
      ? (page([]) as never)
      : (page(
          [],
          cursor === null
            ? "scan_one"
            : cursor === "scan_one"
              ? "scan_two"
              : "scan_three",
          true,
        ) as never);
  });
  renderWorkbench();
  openSection();
  await screen.findByText("Keep looking in this section.");
  expect(sdkFetch).toHaveBeenCalledTimes(3);
  expect(
    screen.queryByText("No partners in this section."),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Find more partners" }));
  expect(await screen.findByText("No partners in this section.")).toBeVisible();
});

it("confirms and deletes selected partners while retaining unselected partners", async () => {
  const second = { ...contact, id: "two", companyName: "Beta" };
  const third = { ...contact, id: "three", companyName: "Gamma" };
  let deleted = false;
  jest.mocked(sdkFetch).mockImplementation(async (_path, init) => {
    if (init?.method === "POST") {
      deleted = true;
      return { deletedIds: ["one", "two"] } as never;
    }
    return page(deleted ? [third] : [contact, second, third]) as never;
  });
  renderWorkbench();
  openSection();
  await screen.findByText("Acme");
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: Acme/ }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: Beta/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete selected (2)" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(sdkFetch).not.toHaveBeenCalledWith(
    `${PARTNERS_API_ROUTE}/delete`,
    expect.anything(),
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Delete selected" }),
  );
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/delete`, {
      method: "POST",
      body: JSON.stringify({ ids: ["one", "two"] }),
    }),
  );
  await waitFor(() =>
    expect(screen.queryByText("Acme")).not.toBeInTheDocument(),
  );
  expect(screen.getByText("Gamma")).toBeVisible();
});

it("retains contacts and selection after a failed deletion", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (_path, init) => {
    if (init?.method === "POST") throw new Error("Write failed");
    return page([contact]) as never;
  });
  renderWorkbench();
  openSection();
  await screen.findByText("Acme");
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: Acme/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Delete selected" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Write failed");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Acme")).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: /Select partner: Acme/ }),
  ).toBeChecked();
});

it("creates a partner through the wizard with no phone, meeting date, notes or links", async () => {
  mockEditor({ ...contact, phoneNumber: "" });
  renderWorkbench(<PartnerEditor />);
  fillContact();
  expect(screen.getByLabelText(/^Phone number/)).not.toBeRequired();
  expect(screen.getByLabelText(/Meeting date/)).not.toBeRequired();
  expect(screen.getByLabelText(/^Notes/)).not.toBeRequired();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("tab", { name: "Connections" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Review partner" }));
  expect(screen.getByRole("tab", { name: "Review" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save partner" }));
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(PARTNERS_API_ROUTE, {
      method: "POST",
      body: JSON.stringify({ ...inputOf(contact), phoneNumber: "" }),
    }),
  );
});

it("creates a partner with only a company name and email, without inventing contact names", async () => {
  const unnamed = { ...contact, firstName: "", lastName: "", phoneNumber: "" };
  mockEditor(unnamed);
  renderWorkbench(<PartnerEditor />);
  fireEvent.change(screen.getByLabelText("Company name"), {
    target: { value: unnamed.companyName },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: unnamed.email },
  });
  expect(screen.getByLabelText(/^First name/)).not.toBeRequired();
  expect(screen.getByLabelText(/^Last name/)).not.toBeRequired();
  savePartner();
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(PARTNERS_API_ROUTE, {
      method: "POST",
      body: JSON.stringify(inputOf(unnamed)),
    }),
  );
});

it("keeps required contact validation active when jumping to another step", async () => {
  mockEditor();
  renderWorkbench(<PartnerEditor />);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Review" }));
  expect(screen.getByRole("tab", { name: "Contact" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByLabelText("Company name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(sdkFetch).not.toHaveBeenCalledWith(
    PARTNERS_API_ROUTE,
    expect.objectContaining({ method: "POST" }),
  );
  fillContact();
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "not-an-email" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("tab", { name: "Contact" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByLabelText("Email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

it("edits a partner in a modal and clears all optional contact values", async () => {
  mockEditor({ ...contact, meetingDate: "2026-11-10", notes: "Original note" });
  renderWorkbench(<PartnerEditor partnerId="one" />);
  expect(await screen.findByLabelText("Company name")).toHaveValue("Acme");
  fireEvent.change(screen.getByLabelText(/^Phone number/), {
    target: { value: "  " },
  });
  fireEvent.change(screen.getByLabelText(/Meeting date/), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText(/^Notes/), {
    target: { value: "  " },
  });
  savePartner();
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/one`, {
      method: "PUT",
      body: JSON.stringify({ ...inputOf(contact), phoneNumber: "" }),
    }),
  );
});

it("keeps the modal and draft editable when saving fails", async () => {
  jest.mocked(sdkFetch).mockRejectedValue(new Error("Save failed"));
  renderWorkbench(<PartnerEditor />);
  fillContact();
  savePartner();
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Contact" }));
  expect(screen.getByLabelText("Company name")).toHaveValue("Acme");
  expect(screen.getByLabelText("Email")).toHaveValue("ana@example.com");
  expect(mockPush).not.toHaveBeenCalled();
});

it("shows organizations and individual publishers in shared lazy sections and keeps unavailable links separate", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    switch (sectionRequest(String(path)).get("section")) {
      case "organizationWithoutApp":
        return page([
          {
            ...withOrganization,
            id: "organization_only",
            companyName: "Organization only",
          },
          {
            ...contact,
            companyName: "Individual only",
            linkedIndividualPublisherId: individual.id,
            linkedIndividualPublisher: individual,
            linkedIndividualPublisherSnapshot: individual,
          },
        ]) as never;
      case "contract":
        return page([
          {
            ...withApp,
            id: "organization_contract",
            companyName: "Organization contract",
            linkedApp: { ...linkedApp, status: "active" },
          },
          {
            ...contact,
            companyName: "Individual contract",
            linkedIndividualPublisherId: individual.id,
            linkedIndividualPublisher: individual,
            linkedIndividualPublisherSnapshot: individual,
            linkedAppId: individualApp.id,
            linkedApp: individualApp,
            linkedAppSnapshot: individualApp,
          },
        ]) as never;
      default:
        return page([
          {
            ...withApp,
            id: "missing",
            companyName: "Missing app",
            linkedApp: null,
          },
          {
            ...withOrganization,
            id: "missing_org",
            companyName: "Missing organization",
            linkedOrganization: null,
          },
        ]) as never;
    }
  });
  renderWorkbench();
  openSection("Without app");
  expect(await screen.findByText("Individual only")).toBeVisible();
  expect(screen.getByText("Organization only")).toBeVisible();
  openSection("With contract");
  expect(await screen.findByText("Individual contract")).toBeVisible();
  expect(screen.getByText("Organization contract")).toBeVisible();
  expectHiddenText("Individual only");
  expectHiddenText("Organization only");
  openSection("Other app statuses or missing links");
  await screen.findByText("Missing app");
  expect(screen.getByText(/Linked app is unavailable/)).toHaveTextContent(
    linkedApp.id,
  );
  expect(
    screen.getByText(/Linked organization is unavailable/),
  ).toHaveTextContent(organization.id);
});

it("links an organization and individual publisher together and preserves both when selecting an app", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (init?.method === "POST") return { partner: withApp } as never;
    const params = new URL(`https://example.test${path}`).searchParams;
    const kind = params.get("kind");
    return {
      items:
        kind === "organization"
          ? [organization]
          : kind === "individual"
            ? [individual]
            : [{ ...linkedApp, name: linkedApp.publisherName }],
      nextCursor: null,
    } as never;
  });
  renderWorkbench(<PartnerEditor />);
  fillContact();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await choose("organization", organization.name);
  await choose("individual publisher", individual.name.replaceAll(".", "\\."));
  await choose("app", organization.name);
  savePartner();
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(PARTNERS_API_ROUTE, {
      method: "POST",
      body: JSON.stringify({ ...inputOf(withApp), phoneNumber: "" }),
    }),
  );
});

it("uses paginated app choices and derives the selected app's publisher", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (init?.method === "POST") return { partner: withApp } as never;
    const params = new URL(`https://example.test${path}`).searchParams;
    return params.has("cursor")
      ? ({
          items: [{ ...linkedApp, name: organization.name }],
          nextCursor: null,
        } as never)
      : ({
          items: [
            {
              id: "app_first",
              name: "First app",
              publisherKind: "organization",
              publisherId: "org_first",
              status: "active",
            },
          ],
          nextCursor: "app_first",
        } as never);
  });
  renderWorkbench(<PartnerEditor />);
  fillContact();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose app" }));
  await selectedOptions().findByRole("button", { name: /^Select First app/ });
  fireEvent.click(selectedOptions().getByRole("button", { name: "Load more" }));
  fireEvent.click(
    await selectedOptions().findByRole("button", {
      name: /^Select Acme Organization/,
    }),
  );
  expect(sdkFetch).toHaveBeenCalledWith(
    `${PARTNERS_API_ROUTE}/link-options?kind=app&cursor=app_first`,
  );
  savePartner();
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(PARTNERS_API_ROUTE, {
      method: "POST",
      body: JSON.stringify({
        ...inputOf(contact),
        phoneNumber: "",
        linkedOrganizationId: organization.id,
        linkedAppId: linkedApp.id,
      }),
    }),
  );
});

it("finds an app by its exact ID and derives an individual publisher without losing the organization", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (init?.method === "PUT") return { partner: withBoth } as never;
    if (!String(path).includes("link-options"))
      return { partner: withOrganization } as never;
    const params = new URL(`https://example.test${path}`).searchParams;
    return {
      items: params.has("id")
        ? [{ ...individualApp, name: individual.name }]
        : [],
      nextCursor: null,
    } as never;
  });
  renderWorkbench(<PartnerEditor partnerId="one" />);
  await screen.findByLabelText("Company name");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Connections" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose app" }));
  fireEvent.change(selectedOptions().getByLabelText("App ID"), {
    target: { value: individualApp.id },
  });
  fireEvent.click(selectedOptions().getByRole("button", { name: "Find app" }));
  fireEvent.click(
    await selectedOptions().findByRole("button", {
      name: /^Select Dr\. Ada Rivers/,
    }),
  );
  savePartner();
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/one`, {
      method: "PUT",
      body: JSON.stringify({
        ...inputOf(withBoth),
        linkedAppId: individualApp.id,
      }),
    }),
  );
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.some(
        ([path]) =>
          new URL(`https://example.test${path}`).searchParams.get("id") ===
          individualApp.id,
      ),
  ).toBe(true);
});

it("preserves linked items absent from the first picker page when editing other fields", async () => {
  mockEditor(withApp);
  renderWorkbench(<PartnerEditor partnerId="one" />);
  await screen.findByLabelText("Company name");
  fireEvent.change(screen.getByLabelText(/^Notes/), {
    target: { value: "Follow up next week" },
  });
  savePartner();
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/one`, {
      method: "PUT",
      body: JSON.stringify({
        ...inputOf(withApp),
        notes: "Follow up next week",
      }),
    }),
  );
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.some(([path]) => String(path).includes("link-options")),
  ).toBe(false);
});

it("removes an organization with its app while retaining the individual publisher", async () => {
  mockEditor(withApp);
  renderWorkbench(<PartnerEditor partnerId="one" />);
  await screen.findByLabelText("Company name");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Connections" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Remove organization link" }),
  );
  savePartner();
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/one`, {
      method: "PUT",
      body: JSON.stringify({
        ...inputOf(withBoth),
        linkedOrganizationId: null,
        linkedAppId: null,
      }),
    }),
  );
});

it("keeps an individual app when only the organization link is removed", async () => {
  const saved = {
    ...withBoth,
    linkedAppId: individualApp.id,
    linkedApp: individualApp,
    linkedAppSnapshot: individualApp,
  };
  mockEditor(saved);
  renderWorkbench(<PartnerEditor partnerId="one" />);
  await screen.findByLabelText("Company name");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Connections" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Remove organization link" }),
  );
  savePartner();
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/one`, {
      method: "PUT",
      body: JSON.stringify({ ...inputOf(saved), linkedOrganizationId: null }),
    }),
  );
});

it("warns before discarding a draft and preserves it when the operator keeps editing", async () => {
  mockEditor();
  renderWorkbench();
  fireEvent.click(screen.getByRole("button", { name: "New partner" }));
  fireEvent.change(screen.getByLabelText("Company name"), {
    target: { value: "New draft" },
  });
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "New partner" })).getByRole(
      "button",
      { name: "Close" },
    ),
  );
  const warning = await screen.findByRole("alertdialog", {
    name: "Discard changes?",
  });
  fireEvent.click(
    within(warning).getByRole("button", { name: "Keep editing" }),
  );
  expect(screen.getByLabelText("Company name")).toHaveValue("New draft");
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "New partner" })).getByRole(
      "button",
      { name: "Close" },
    ),
  );
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Discard changes",
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "New partner" }),
    ).not.toBeInTheDocument(),
  );
  expect(sdkFetch).not.toHaveBeenCalledWith(
    PARTNERS_API_ROUTE,
    expect.objectContaining({ method: "POST" }),
  );
});

it("distinguishes publisher selections when organization and individual IDs coincide", async () => {
  const sharedIndividual = { id: "shared", name: "Linked individual" };
  const saved = {
    ...contact,
    linkedIndividualPublisherId: "shared",
    linkedIndividualPublisher: sharedIndividual,
    linkedIndividualPublisherSnapshot: sharedIndividual,
  };
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (!String(path).includes("link-options"))
      return { partner: saved } as never;
    const kind = new URL(`https://example.test${path}`).searchParams.get(
      "kind",
    );
    return {
      items:
        kind === "organization"
          ? [{ id: "shared", name: "Unlinked organization" }]
          : [sharedIndividual],
      nextCursor: null,
    } as never;
  });
  renderWorkbench(<PartnerEditor partnerId="one" />);
  await screen.findByLabelText("Company name");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Connections" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose organization" }));
  expect(
    await selectedOptions().findByRole("button", {
      name: /^Select Unlinked organization/,
    }),
  ).toHaveAttribute("aria-pressed", "false");
  fireEvent.mouseDown(
    selectedOptions().getByRole("tab", { name: "Individual publishers" }),
  );
  expect(
    await selectedOptions().findByRole("button", {
      name: /^Select Linked individual/,
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

it("ignores a late app lookup after navigating to a different publisher tab", async () => {
  let completeLookup!: (value: unknown) => void;
  const delayed = new Promise((resolve) => {
    completeLookup = resolve;
  });
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const params = new URL(`https://example.test${path}`).searchParams;
    if (params.has("id")) return delayed as never;
    return {
      items: params.get("kind") === "organization" ? [organization] : [],
      nextCursor: null,
    } as never;
  });
  renderWorkbench(<PartnerEditor />);
  fillContact();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose app" }));
  fireEvent.change(selectedOptions().getByLabelText("App ID"), {
    target: { value: individualApp.id },
  });
  fireEvent.click(selectedOptions().getByRole("button", { name: "Find app" }));
  fireEvent.mouseDown(
    selectedOptions().getByRole("tab", { name: "Organizations" }),
  );
  await selectedOptions().findByRole("button", {
    name: /^Select Acme Organization/,
  });
  await act(async () => {
    completeLookup({
      items: [{ ...individualApp, name: individual.name }],
      nextCursor: null,
    });
  });
  expect(
    selectedOptions().getByRole("button", {
      name: /^Select Acme Organization/,
    }),
  ).toBeVisible();
  expect(
    selectedOptions().queryByRole("button", {
      name: /^Select Dr\. Ada Rivers/,
    }),
  ).not.toBeInTheDocument();
});

it("keeps an unavailable link warning visible on the review step and connects the tab panel", async () => {
  mockEditor({ ...withApp, linkedApp: null });
  renderWorkbench(<PartnerEditor partnerId="one" />);
  await screen.findByLabelText("Company name");
  review();
  expect(screen.getByText("Unavailable connection")).toBeVisible();
  const tab = screen.getByRole("tab", { name: "Review" });
  const panel = screen.getByRole("tabpanel", { name: "Review" });
  expect(panel.id).toBe(tab.getAttribute("aria-controls"));
  expect(panel).toHaveAttribute("aria-labelledby", tab.id);
});
