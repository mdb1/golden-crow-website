/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import {
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
import { PARTNERS_API_ROUTE, type Partner } from "@/lib/connected-partners";
import { sdkFetch } from "@/lib/sdk-client";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
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
  linkedAppId: null,
  linkedOrganizationSnapshot: null,
  linkedAppSnapshot: null,
  linkedOrganization: null,
  linkedApp: null,
};

function inputOf(partner: Partner) {
  const {
    id: _id,
    linkedOrganizationSnapshot: _organizationSnapshot,
    linkedAppSnapshot: _appSnapshot,
    linkedOrganization: _organization,
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

beforeEach(() => {
  jest.clearAllMocks();
});

it("shows the empty state and the new route", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({ items: [], nextCursor: null });
  renderWorkbench();
  expect(await screen.findByText("No partners yet.")).toBeVisible();
  screen
    .getAllByRole("link", { name: "New partner" })
    .forEach((link) =>
      expect(link).toHaveAttribute("href", "/god-mode/partners/new"),
    );
});

it("renders only contact values on cards and loads another bounded page", async () => {
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
    screen.getByRole("link", { name: "Edit partner: Acme" }),
  ).toHaveAttribute("href", "/god-mode/partners/one/edit");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Beta")).toBeVisible();
  expect(screen.getByText("2026-11-10")).toBeVisible();
  expect(screen.getByText("A note")).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}?cursor=one`);
  expect(
    screen.queryByRole("button", { name: "Load more" }),
  ).not.toBeInTheDocument();
});

it("confirms and deletes multiple selected contacts while leaving unselected contacts alone", async () => {
  const second = { ...contact, id: "two", companyName: "Beta" };
  const third = { ...contact, id: "three", companyName: "Gamma" };
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (init?.method === "POST") return { deletedIds: ["one", "two"] } as never;
    const deleted = jest
      .mocked(sdkFetch)
      .mock.calls.some(([, options]) => options?.method === "POST");
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
  expect(
    within(dialog).getByRole("button", { name: "Delete selected" }),
  ).toBeEnabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Acme")).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: /Select partner: Acme/ }),
  ).toBeChecked();
});

it("creates a contact without requiring meeting date or notes", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({ partner: contact });
  renderWorkbench(<PartnerEditor />);
  for (const [label, value] of [
    ["Company name", " Acme "],
    ["First name", "Ana"],
    ["Last name", "Smith"],
    ["Phone number", "+54 11 1234"],
    ["Email", "ANA@example.com"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  expect(screen.getByLabelText(/Meeting date/)).not.toBeRequired();
  expect(screen.getByLabelText(/Notes/)).not.toBeRequired();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const body = inputOf(contact);
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(PARTNERS_API_ROUTE, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith("/god-mode/partners"),
  );
});

it("prefills an existing contact and lets both optional fields be cleared", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({
    partner: {
      ...contact,
      meetingDate: "2026-11-10",
      notes: "Original note",
    },
  });
  renderWorkbench(<PartnerEditor partnerId="one" />);
  expect(await screen.findByLabelText("Company name")).toHaveValue("Acme");
  fireEvent.change(screen.getByLabelText(/Meeting date/), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: "  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const body = inputOf(contact);
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/one`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );
});

it("keeps unsaved values and displays the save error", async () => {
  jest.mocked(sdkFetch).mockRejectedValue(new Error("Save failed"));
  renderWorkbench(<PartnerEditor />);
  for (const [label, value] of [
    ["Company name", "Acme"],
    ["First name", "Ana"],
    ["Last name", "Smith"],
    ["Phone number", "1234"],
    ["Email", "ana@example.com"],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  expect(screen.getByLabelText("Company name")).toHaveValue("Acme");
  expect(mockPush).not.toHaveBeenCalled();
});

const organization = { id: "org_one", name: "Linked organization" };
const linkedApp = {
  id: "app_one",
  publisherId: organization.id,
  publisherName: organization.name,
  status: "active_for_testing" as const,
};

it("groups partners from live linked documents and never a stale app snapshot", async () => {
  const withOrganization = {
    ...contact,
    linkedOrganizationId: organization.id,
    linkedOrganization: organization,
    linkedOrganizationSnapshot: organization,
  };
  const withApp = {
    ...withOrganization,
    linkedAppId: linkedApp.id,
    linkedApp,
    linkedAppSnapshot: linkedApp,
  };
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
});

it("selects an app from a later bounded options page and derives its organization", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (init?.method === "POST") return { partner: contact } as never;
    if (String(path).includes("cursor=app_first"))
      return {
        items: [
          {
            id: linkedApp.id,
            name: linkedApp.publisherName,
            publisherId: organization.id,
            status: linkedApp.status,
          },
        ],
        nextCursor: null,
      } as never;
    return {
      items: [
        {
          id: "app_first",
          name: "First app",
          publisherId: "org_first",
          status: "active",
        },
      ],
      nextCursor: "app_first",
    } as never;
  });
  renderWorkbench(<PartnerEditor />);
  for (const [label, value] of [
    ["Company name", "Acme"],
    ["First name", "Ana"],
    ["Last name", "Smith"],
    ["Phone number", "+54 11 1234"],
    ["Email", "ana@example.com"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Choose app" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("button", { name: /First app/ });
  fireEvent.click(within(dialog).getByRole("button", { name: "Load more" }));
  fireEvent.click(
    await within(dialog).findByRole("button", { name: /Linked organization/ }),
  );
  expect(sdkFetch).toHaveBeenCalledWith(
    `${PARTNERS_API_ROUTE}/link-options?kind=app&cursor=app_first`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(PARTNERS_API_ROUTE, {
      method: "POST",
      body: JSON.stringify({
        ...inputOf(contact),
        linkedOrganizationId: organization.id,
        linkedAppId: linkedApp.id,
      }),
    }),
  );
});

it("preserves selected links outside the loaded options and clears both links when removing the organization", async () => {
  const saved = {
    ...contact,
    linkedOrganizationId: organization.id,
    linkedAppId: linkedApp.id,
    linkedOrganization: organization,
    linkedApp,
    linkedOrganizationSnapshot: organization,
    linkedAppSnapshot: linkedApp,
  };
  jest.mocked(sdkFetch).mockResolvedValue({ partner: saved });
  renderWorkbench(<PartnerEditor partnerId="one" />);
  await screen.findByLabelText("Company name");
  expect(screen.getByText(`(${linkedApp.id})`)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/one`, {
      method: "PUT",
      body: JSON.stringify(inputOf(saved)),
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Remove organization and app links" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/one`, {
      method: "PUT",
      body: JSON.stringify(inputOf(contact)),
    }),
  );
});

it("switches organizations and clears an incompatible app", async () => {
  const saved = {
    ...contact,
    linkedOrganizationId: organization.id,
    linkedAppId: linkedApp.id,
    linkedOrganization: organization,
    linkedApp,
    linkedOrganizationSnapshot: organization,
    linkedAppSnapshot: linkedApp,
  };
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (String(path).includes("link-options"))
      return {
        items: [{ id: "org_two", name: "Another organization" }],
        nextCursor: null,
      } as never;
    return { partner: saved } as never;
  });
  renderWorkbench(<PartnerEditor partnerId="one" />);
  await screen.findByLabelText("Company name");
  fireEvent.click(screen.getByRole("button", { name: "Choose organization" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Another organization/ }),
  );
  expect(screen.queryByText(`(${linkedApp.id})`)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/one`, {
      method: "PUT",
      body: JSON.stringify({
        ...inputOf(contact),
        linkedOrganizationId: "org_two",
      }),
    }),
  );
});
