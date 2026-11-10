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
};

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
  const { id: _id, ...body } = contact;
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
  jest
    .mocked(sdkFetch)
    .mockResolvedValue({
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
  const { id: _id, ...body } = contact;
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
