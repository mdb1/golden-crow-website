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
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PartnersBrowser } from "@/components/god-mode/partners-workbench";
import { PartnersSplitPane } from "@/components/god-mode/partner-detail-panel";
import { PARTNERS_API_ROUTE, type Partner } from "@/lib/connected-partners";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

const partner: Partner = {
  id: "partner_acme",
  companyName: "Acme Health",
  firstName: "Ana",
  lastName: "Rivers",
  phoneNumber: "",
  email: "ana@example.com",
  meetingDate: "2026-11-12",
  notes: "Short list notes",
  linkedOrganizationId: "org_acme",
  linkedIndividualPublisherId: "individual_ada",
  linkedAppId: "app_acme",
  linkedOrganizationSnapshot: { id: "org_acme", name: "Previous Acme" },
  linkedIndividualPublisherSnapshot: {
    id: "individual_ada",
    name: "Previous Ada",
  },
  linkedAppSnapshot: {
    id: "app_acme",
    publisherKind: "organization",
    publisherId: "org_acme",
    publisherName: "Previous Acme",
    status: "active_for_testing",
    appProviderIdentifier: "old.provider",
  },
  linkedOrganization: { id: "org_acme", name: "Acme Organization" },
  linkedIndividualPublisher: { id: "individual_ada", name: "Dr. Ada" },
  linkedApp: {
    id: "app_acme",
    publisherKind: "organization",
    publisherId: "org_acme",
    publisherName: "Acme Organization",
    status: "active_waiting_for_payment",
    appProviderIdentifier: "com.acme.health",
  },
};
const beta: Partner = {
  ...partner,
  id: "partner_beta",
  companyName: "Beta Research",
  email: "beta@example.com",
};
const fullPartner: Partner = {
  ...partner,
  notes:
    "Full partner notes returned by the detail endpoint.\nA second line stays readable in the expanded information.",
};

const fullNotes = /Full partner notes returned by the detail endpoint\./;

function page(items: Partner[], nextCursor: string | null = null) {
  return { items, nextCursor, scanIncomplete: false };
}

function mockPartners({
  items = [partner],
  detail = fullPartner,
}: {
  items?: Partner[];
  detail?: Partner;
} = {}) {
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (String(path) === `${PARTNERS_API_ROUTE}/${partner.id}`)
      return { partner: detail } as never;
    if (String(path) === `${PARTNERS_API_ROUTE}/${beta.id}`)
      return { partner: beta } as never;
    if (String(path).includes("link-options"))
      return { items: [], nextCursor: null } as never;
    return page(items) as never;
  });
}

function renderPartners() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <AppLanguageProvider forcedLanguage="en">
      <QueryClientProvider client={client}>
        <PartnersBrowser />
      </QueryClientProvider>
    </AppLanguageProvider>,
  );
}

function openSection(name = "Organization with contract") {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
}

async function openPartner(name = partner.companyName) {
  const trigger = await screen.findByRole("button", {
    name: `View partner details: ${name}`,
  });
  fireEvent.click(trigger);
  return trigger;
}

function details() {
  return within(screen.getByRole("complementary", { name: "Partner details" }));
}

function switchView(name: "Grid" | "Table") {
  fireEvent.mouseDown(screen.getByRole("tab", { name }));
}

beforeEach(() => {
  jest.resetAllMocks();
  window.localStorage.clear();
});

it("opens a grid cell's full detail using its record endpoint", async () => {
  mockPartners();
  renderPartners();
  openSection();
  const trigger = await screen.findByRole("button", {
    name: `View partner details: ${partner.companyName}`,
  });
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.some(
        ([path]) => path === `${PARTNERS_API_ROUTE}/${partner.id}`,
      ),
  ).toBe(false);

  // Tapping a plain field in the card opens the same full detail as its title.
  fireEvent.click(screen.getByText(partner.email));
  const panel = details();
  expect(await panel.findByText(fullNotes)).toBeVisible();
  for (const value of [
    partner.id,
    partner.firstName,
    partner.lastName,
    partner.email,
    partner.meetingDate!,
    partner.linkedOrganizationId!,
    partner.linkedIndividualPublisherId!,
    partner.linkedAppId!,
    partner.linkedApp!.appProviderIdentifier!,
  ]) {
    expect(panel.getAllByText(value, { exact: true })[0]).toBeVisible();
  }
  expect(trigger.closest("article")).toHaveAttribute("data-state", "selected");
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.some(
        ([path]) => path === `${PARTNERS_API_ROUTE}/${partner.id}`,
      ),
  ).toBe(true);
});

it("opens with the keyboard and returns focus to its title button when closed", async () => {
  const user = userEvent.setup();
  mockPartners();
  renderPartners();
  openSection();
  const trigger = await screen.findByRole("button", {
    name: `View partner details: ${partner.companyName}`,
  });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(await details().findByText(fullNotes)).toBeVisible();
  await user.click(details().getByRole("button", { name: "Hide details" }));
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger.closest("article")).not.toHaveAttribute(
    "data-state",
    "selected",
  );
});

it("opens the email preview from the detail panel without sending and keeps the panel when dismissed", async () => {
  const user = userEvent.setup();
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (String(path).includes("/email-preview"))
      return {
        partnerId: partner.id,
        to: partner.email,
        subject: "Gestioná tu app en Pocket Genes",
        text: "Continuá con tu app desde el portal de publicadores.",
        html: "<p>Continuá con tu app desde el portal de publicadores.</p>",
        ctaLabel: "Gestionar mi app",
        ctaUrl:
          "https://golden-crow-backoffice.vercel.app/publisher-portal/login?callbackUrl=%2Fpublisher-portal%2Fapp%2Fedit",
        category: "contract",
        language: "es",
        previewHash: "a".repeat(64),
      } as never;
    if (path === `${PARTNERS_API_ROUTE}/${partner.id}`)
      return { partner: fullPartner } as never;
    return page([partner]) as never;
  });
  renderPartners();
  openSection();
  await openPartner();
  await user.click(
    await details().findByRole("button", { name: "Send an email" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Email preview" });
  expect(
    await within(dialog).findByText("Gestioná tu app en Pocket Genes"),
  ).toBeVisible();
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.some(([, init]) => init?.method === "POST"),
  ).toBe(false);
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Email preview" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("complementary", { name: "Partner details" }),
  ).toBeVisible();
});

it("opens table rows while keeping checkbox and notes controls independent", async () => {
  mockPartners();
  renderPartners();
  openSection();
  await screen.findByRole("button", {
    name: `View partner details: ${partner.companyName}`,
  });
  switchView("Table");
  const table = await screen.findByRole("table");
  const row = within(table).getByText(partner.companyName).closest("tr")!;
  fireEvent.click(within(row).getByRole("checkbox"));
  expect(within(row).getByRole("checkbox")).toBeChecked();
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(row).getByText("View notes"));
  expect(within(row).getByText(partner.notes!)).toBeVisible();
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();

  fireEvent.click(within(row).getByText(partner.email));
  expect(await details().findByText(fullNotes)).toBeVisible();
  expect(row).toHaveAttribute("data-state", "selected");
});

it("keeps grid checkbox and edit actions independent from opening details", async () => {
  mockPartners();
  renderPartners();
  openSection();
  await screen.findByRole("button", {
    name: `View partner details: ${partner.companyName}`,
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Select partner: Acme Health/ }),
  );
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", {
      name: `Edit partner: ${partner.companyName}`,
    }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Edit partner" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();
});

it("replaces the selected partner in one panel and retains it across layout changes", async () => {
  mockPartners({ items: [partner, beta] });
  renderPartners();
  openSection();
  await openPartner();
  expect(await details().findByText(fullNotes)).toBeVisible();
  await openPartner(beta.companyName);
  expect(
    screen.getAllByRole("complementary", { name: "Partner details" }),
  ).toHaveLength(1);
  expect(await details().findByText(beta.email)).toBeVisible();
  expect(details().queryByText(fullNotes)).not.toBeInTheDocument();
  switchView("Table");
  expect(await screen.findByRole("table")).toBeVisible();
  expect(details().getByText(beta.email)).toBeVisible();
  const row = within(screen.getByRole("table"))
    .getByText(beta.companyName)
    .closest("tr")!;
  expect(row).toHaveAttribute("data-state", "selected");
  switchView("Grid");
  expect(details().getByText(beta.email)).toBeVisible();
  const currentTrigger = screen.getByRole("button", {
    name: `View partner details: ${beta.companyName}`,
  });
  fireEvent.click(details().getByRole("button", { name: "Hide details" }));
  await waitFor(() => expect(currentTrigger).toHaveFocus());
});

it("closes details when changing page, changing section, or collapsing the section", async () => {
  const firstPage = Array.from({ length: 20 }, (_, index): Partner => ({
    ...partner,
    id: index === 0 ? partner.id : `partner_${index}`,
    companyName: index === 0 ? partner.companyName : `Partner ${index}`,
  }));
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (String(path) === `${PARTNERS_API_ROUTE}/${partner.id}`)
      return { partner: fullPartner } as never;
    if (String(path) === `${PARTNERS_API_ROUTE}/${beta.id}`)
      return { partner: beta } as never;
    const params = new URL(String(path), "https://test.example").searchParams;
    if (params.get("section") !== "contract") return page([partner]) as never;
    return params.has("cursor")
      ? (page([beta]) as never)
      : (page(firstPage, "page_two") as never);
  });
  renderPartners();
  openSection();
  await openPartner();
  await details().findByText(fullNotes);
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Partner pagination" }),
    ).getByRole("button", { name: "Next page" }),
  );
  await screen.findByRole("button", {
    name: `View partner details: ${beta.companyName}`,
  });
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();

  await openPartner(beta.companyName);
  await details().findByText(beta.email);
  openSection("Organization without app");
  await screen.findByRole("button", {
    name: `View partner details: ${partner.companyName}`,
  });
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();
  await openPartner();
  await details().findByText(fullNotes);
  openSection("Organization without app");
  expect(
    screen.queryByRole("complementary", { name: "Partner details" }),
  ).not.toBeInTheDocument();
});

it("shows a loading state and lets a failed detail request be retried", async () => {
  let rejectDetail!: (reason?: unknown) => void;
  const pendingDetail = new Promise<never>((_resolve, reject) => {
    rejectDetail = reject;
  });
  let detailRequests = 0;
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (String(path) === `${PARTNERS_API_ROUTE}/${partner.id}`) {
      detailRequests++;
      if (detailRequests === 1) return pendingDetail;
      return { partner: fullPartner } as never;
    }
    return page([partner]) as never;
  });
  renderPartners();
  openSection();
  await openPartner();
  expect(details().getByRole("status")).toBeVisible();
  await act(async () => rejectDetail(new Error("Detail unavailable")));
  expect(await details().findByRole("alert")).toHaveTextContent(
    "Detail unavailable",
  );
  expect(details().queryByText(fullNotes)).not.toBeInTheDocument();
  fireEvent.click(details().getByRole("button", { name: "Retry detail" }));
  expect(await details().findByText(fullNotes)).toBeVisible();
  await waitFor(() =>
    expect(details().queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(detailRequests).toBe(2);
});

it("keeps stored connection snapshots distinct from current linked records", async () => {
  mockPartners();
  renderPartners();
  openSection();
  await openPartner();
  const panel = details();
  expect(await panel.findByText("com.acme.health")).toBeVisible();
  const snapshotSummary = panel.getByText("Stored connection snapshots");
  const snapshots = snapshotSummary.closest("details")!;
  expect(snapshots).not.toHaveAttribute("open");
  fireEvent.click(snapshotSummary);
  expect(within(snapshots).getAllByText("Previous Acme")[0]).toBeVisible();
  expect(within(snapshots).getByText(/Previous Ada/)).toBeVisible();
  expect(within(snapshots).getByText("old.provider")).toBeVisible();
  expect(panel.getAllByText("Acme Organization")[0]).toBeVisible();
});

it("warns about missing current links without using stored app status as current", async () => {
  mockPartners({
    detail: {
      ...fullPartner,
      linkedOrganization: null,
      linkedIndividualPublisher: null,
      linkedApp: null,
    },
  });
  renderPartners();
  openSection();
  await openPartner();
  const panel = details();
  await panel.findByText(fullNotes);
  expect(
    panel.getByText(/Linked organization is unavailable/),
  ).toHaveTextContent("org_acme");
  expect(
    panel.getByText(/Linked individual publisher is unavailable/),
  ).toHaveTextContent("individual_ada");
  expect(panel.getByText(/Linked app is unavailable/)).toHaveTextContent(
    "app_acme",
  );
  expect(panel.queryByText("Current status")).not.toBeInTheDocument();
  expect(panel.getByText("Saved app status")).not.toBeVisible();
});

it("opens the existing editor from the selected partner detail panel", async () => {
  mockPartners();
  renderPartners();
  openSection();
  await openPartner();
  const panel = details();
  await panel.findByText(fullNotes);
  fireEvent.click(
    panel.getByRole("button", { name: `Edit partner: ${partner.companyName}` }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Edit partner" });
  expect(await within(dialog).findByLabelText("Company name")).toHaveValue(
    partner.companyName,
  );
  expect(panel.getByText(fullNotes)).toBeInTheDocument();
});

it("refreshes an open detail together with its section after an external change", async () => {
  let latest = fullPartner;
  let listReads = 0;
  let detailReads = 0;
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (String(path) === `${PARTNERS_API_ROUTE}/${partner.id}`) {
      detailReads++;
      return { partner: latest } as never;
    }
    listReads++;
    return page([latest]) as never;
  });
  renderPartners();
  openSection();
  await openPartner();
  const panel = details();
  await panel.findByText(fullNotes);
  expect(panel.getByText("Contract · Awaiting payment")).toBeVisible();

  latest = {
    ...fullPartner,
    notes: "Externally updated meeting notes",
    linkedApp: { ...fullPartner.linkedApp!, status: "active" },
  };
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Partner pagination" }),
    ).getByRole("button", { name: "Refresh section" }),
  );
  expect(await panel.findByText(latest.notes!)).toBeVisible();
  expect(panel.getByText("Active app")).toBeVisible();
  expect(
    panel.queryByText("Contract · Awaiting payment"),
  ).not.toBeInTheDocument();
  const card = screen
    .getByRole("button", {
      name: `View partner details: ${partner.companyName}`,
    })
    .closest("article")!;
  expect(within(card).getByText(latest.notes!)).toBeVisible();
  expect(listReads).toBe(2);
  expect(detailReads).toBe(2);
  expect(
    screen.getByRole("complementary", { name: "Partner details" }),
  ).toBeVisible();
});

it("refreshes the open detail after editing and saving its partner", async () => {
  let latest = fullPartner;
  const savedNotes = "Notes changed and saved from the partner editor";
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (String(path) === `${PARTNERS_API_ROUTE}/${partner.id}`) {
      if (init?.method === "PUT") {
        latest = { ...latest, ...JSON.parse(String(init.body)) };
      }
      return { partner: latest } as never;
    }
    return page([latest]) as never;
  });
  renderPartners();
  openSection();
  await openPartner();
  const panel = details();
  await panel.findByText(fullNotes);
  fireEvent.click(
    panel.getByRole("button", {
      name: `Edit partner: ${partner.companyName}`,
    }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Edit partner" });
  fireEvent.change(await within(dialog).findByLabelText(/^Notes/), {
    target: { value: savedNotes },
  });
  fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Review" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save partner" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Edit partner" }),
    ).not.toBeInTheDocument(),
  );
  expect(await details().findByText(savedNotes)).toBeVisible();
  expect(details().queryByText(fullNotes)).not.toBeInTheDocument();
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.some(
        ([path, init]) =>
          path === `${PARTNERS_API_ROUTE}/${partner.id}` &&
          init?.method === "PUT" &&
          JSON.parse(String(init.body)).notes === savedNotes,
      ),
  ).toBe(true);
});

function splitPane(open = true) {
  return (
    <AppLanguageProvider forcedLanguage="en">
      <PartnersSplitPane
        detail={open ? <aside>Selected partner</aside> : undefined}
      >
        <div>Partner list</div>
      </PartnersSplitPane>
    </AppLanguageProvider>
  );
}

function pointer(target: Element | Window, type: string, clientX: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, button: 0, pointerType: "mouse" });
  fireEvent(target, event);
}

it("provides the CRM-style keyboard resize control only while details are open", () => {
  const { rerender } = render(splitPane(false));
  expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  rerender(splitPane());
  const separator = screen.getByRole("separator", {
    name: "Resize partner detail panel",
  });
  expect(separator).toHaveAttribute("tabindex", "0");
  expect(separator).toHaveAttribute("aria-orientation", "vertical");
  expect(separator).toHaveAttribute("aria-valuenow", "50");
  fireEvent.keyDown(separator, { key: "ArrowLeft" });
  expect(separator).toHaveAttribute("aria-valuenow", "54");
  fireEvent.keyDown(separator, { key: "ArrowRight" });
  expect(separator).toHaveAttribute("aria-valuenow", "50");
  fireEvent.keyDown(separator, { key: "Home" });
  expect(separator).toHaveAttribute("aria-valuenow", "33");
  fireEvent.keyDown(separator, { key: "ArrowRight" });
  expect(separator).toHaveAttribute("aria-valuenow", "33");
  fireEvent.keyDown(separator, { key: "End" });
  expect(separator).toHaveAttribute("aria-valuenow", "67");
  expect(screen.getByTestId("partners-split-pane").className).toContain(
    "xl:overflow-hidden",
  );
});

it("resizes with pointer movement within bounds and restores document behavior on release", () => {
  render(splitPane());
  const pane = screen.getByTestId("partners-split-pane");
  jest.spyOn(pane, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
    toJSON: () => ({}),
  });
  const separator = screen.getByRole("separator", {
    name: "Resize partner detail panel",
  });
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  pointer(separator, "pointerdown", 600);
  expect(separator).toHaveAttribute("aria-valuenow", "40");
  expect(document.body.style.cursor).toBe("col-resize");
  pointer(window, "pointermove", 100);
  expect(separator).toHaveAttribute("aria-valuenow", "67");
  pointer(window, "pointermove", 900);
  expect(separator).toHaveAttribute("aria-valuenow", "33");
  pointer(window, "pointerup", 900);
  expect(document.body.style.cursor).toBe(previousCursor);
  expect(document.body.style.userSelect).toBe(previousUserSelect);
  pointer(window, "pointermove", 500);
  expect(separator).toHaveAttribute("aria-valuenow", "33");
});

it("cancels a drag when details close without restarting it on the next selection", () => {
  const { rerender } = render(splitPane());
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  pointer(screen.getByRole("separator"), "pointerdown", 500);
  expect(document.body.style.cursor).toBe("col-resize");
  rerender(splitPane(false));
  expect(document.body.style.cursor).toBe(previousCursor);
  expect(document.body.style.userSelect).toBe(previousUserSelect);
  rerender(splitPane());
  expect(document.body.style.cursor).toBe(previousCursor);
  expect(document.body.style.userSelect).toBe(previousUserSelect);
});
