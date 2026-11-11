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
  return render(
    <AppLanguageProvider forcedLanguage="en">
      <QueryClientProvider client={client}>{component}</QueryClientProvider>
    </AppLanguageProvider>,
  );
}
function fillContact(phone = "") {
  for (const [label, value] of [
    ["Company name", "Acme"],
    ["First name", "Ana"],
    ["Last name", "Smith"],
    ["Email", "ana@example.com"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.change(screen.getByLabelText(/^Phone number/), {
    target: { value: phone },
  });
}
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
});

it("opens a new partner modal from the empty state without leaving the list", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({ items: [], nextCursor: null });
  renderWorkbench();
  expect(await screen.findByText("No partners yet.")).toBeVisible();
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

it("renders contact values, loads the next bounded page and offers modal editing", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({ items: [contact], nextCursor: "one" })
    .mockResolvedValueOnce({
      items: [
        {
          ...contact,
          id: "two",
          companyName: "Beta",
          meetingDate: "2026-11-10",
          notes: "A note",
        },
      ],
      nextCursor: null,
    });
  renderWorkbench();
  expect(await screen.findByText("Acme")).toBeVisible();
  for (const value of ["Ana", "Smith", "+54 11 1234", "ana@example.com"])
    expect(screen.getByText(value)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Edit partner: Acme" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Beta")).toBeVisible();
  expect(screen.getByText("2026-11-10")).toBeVisible();
  expect(screen.getByText("A note")).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}?cursor=one`);
  expect(
    screen.queryByRole("button", { name: "Load more" }),
  ).not.toBeInTheDocument();
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
    return {
      items: deleted ? [third] : [contact, second, third],
      nextCursor: null,
    } as never;
  });
  renderWorkbench();
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
    return { items: [contact], nextCursor: null } as never;
  });
  renderWorkbench();
  await screen.findByText("Acme");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select loaded partners" }),
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

it("groups partners using current linked items, including individual publishers, rather than snapshots", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValue({
      items: [
        contact,
        { ...withOrganization, id: "org", companyName: "Organization only" },
        { ...withApp, id: "free", companyName: "Testing app" },
        ...[
          "active",
          "active_waiting_for_payment",
          "active_waiting_for_upload",
        ].map((status) => ({
          ...withApp,
          id: status,
          companyName: status,
          linkedApp: { ...linkedApp, status },
        })),
        {
          ...withApp,
          id: "pending",
          companyName: "Pending app",
          linkedApp: { ...linkedApp, status: "pending_revision" },
        },
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
        {
          ...contact,
          id: "individual",
          companyName: "Individual only",
          linkedIndividualPublisherId: individual.id,
          linkedIndividualPublisher: individual,
          linkedIndividualPublisherSnapshot: individual,
        },
        {
          ...contact,
          id: "individual_app",
          companyName: "Individual contract",
          linkedIndividualPublisherId: individual.id,
          linkedIndividualPublisher: individual,
          linkedIndividualPublisherSnapshot: individual,
          linkedAppId: individualApp.id,
          linkedApp: individualApp,
          linkedAppSnapshot: individualApp,
        },
      ],
      nextCursor: null,
    });
  renderWorkbench();
  await screen.findByText("Acme");
  expect(
    within(
      screen.getByRole("region", { name: "No organization yet" }),
    ).getByText("Acme"),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole("region", { name: "Organization without app" }),
    ).getByText("Organization only"),
  ).toBeVisible();
  const free = within(
    screen.getByRole("region", { name: "Organization with free app" }),
  );
  expect(free.getByText("Testing app")).toBeVisible();
  expect(free.queryByText("Missing app")).not.toBeInTheDocument();
  const contract = within(
    screen.getByRole("region", { name: "Organization with contract" }),
  );
  for (const status of [
    "active",
    "active_waiting_for_payment",
    "active_waiting_for_upload",
  ])
    expect(contract.getByRole("heading", { name: status })).toBeVisible();
  const other = within(
    screen.getByRole("region", { name: "Other app statuses or missing links" }),
  );
  for (const name of ["Pending app", "Missing app", "Missing organization"])
    expect(other.getByRole("heading", { name })).toBeVisible();
  expect(other.getByText(/Linked app is unavailable/)).toHaveTextContent(
    linkedApp.id,
  );
  expect(
    other.getByText(/Linked organization is unavailable/),
  ).toHaveTextContent(organization.id);
  expect(
    within(
      screen.getByRole("region", { name: "Individual publisher without app" }),
    ).getByText("Individual only"),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole("region", {
        name: "Individual publisher with contract",
      }),
    ).getByText("Individual contract"),
  ).toBeVisible();
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
  await screen.findByText("Acme");
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
