/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import type { ComponentProps } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PartnersBoard } from "@/components/god-mode/partner-board";
import { PARTNERS_API_ROUTE, type Partner } from "@/lib/connected-partners";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({ sdkFetch: jest.fn() }));

function partner(id: string, overrides: Partial<Partner> = {}): Partner {
  return {
    id,
    companyName: `Company ${id}`,
    firstName: "Ana",
    lastName: "Smith",
    phoneNumber: "+54 11 1234",
    email: `${id}@example.com`,
    meetingDate: "2026-11-20",
    notes: "Long private notes that do not belong on a board ticket.",
    linkedOrganizationId: null,
    linkedIndividualPublisherId: null,
    linkedAppId: null,
    linkedOrganizationSnapshot: null,
    linkedIndividualPublisherSnapshot: null,
    linkedAppSnapshot: null,
    linkedOrganization: null,
    linkedIndividualPublisher: null,
    linkedApp: null,
    ...overrides,
  };
}
const organization = { id: "org_one", name: "Company organization" };
const individual = { id: "individual_one", name: "Dr. Ada Rivers" };
const app = {
  id: "app_one",
  publisherKind: "organization" as const,
  publisherId: organization.id,
  publisherName: organization.name,
  status: "active" as const,
};
const noOrganization = partner("new");
const withoutApp = partner("without-app", {
  linkedOrganizationId: organization.id,
  linkedOrganization: organization,
});
const individualFreeApp = partner("free-individual", {
  linkedIndividualPublisherId: individual.id,
  linkedIndividualPublisher: individual,
  linkedAppId: "individual_app",
  linkedApp: {
    ...app,
    id: "individual_app",
    publisherKind: "individual",
    publisherId: individual.id,
    publisherName: individual.name,
    status: "active_for_testing",
  },
});
const withContract = partner("contract", {
  linkedOrganizationId: organization.id,
  linkedOrganization: organization,
  linkedAppId: app.id,
  linkedApp: app,
});
const missingLink = partner("missing", { linkedOrganizationId: "deleted-org" });
const labels = [
  "No organization yet",
  "Without app",
  "With free app",
  "With contract",
  "Other app statuses or missing links",
];

function renderBoard(props: Partial<ComponentProps<typeof PartnersBoard>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onView = props.onView ?? jest.fn();
  const view = render(
    <AppLanguageProvider forcedLanguage="en">
      <QueryClientProvider client={client}>
        <PartnersBoard panelId="partner-detail" {...props} onView={onView} />
      </QueryClientProvider>
    </AppLanguageProvider>,
  );
  return { ...view, client, onView };
}
function column(name: string) {
  return within(screen.getByRole("region", { name }));
}
function ticket(name: string) {
  return screen.getByRole("button", { name: `View partner details: ${name}` });
}

beforeEach(() => { jest.resetAllMocks(); });

it("shows all five stages and groups loaded organization and individual tickets in their matching columns", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({
    items: [noOrganization, withoutApp, individualFreeApp, withContract, missingLink],
    nextCursor: null,
  });
  renderBoard();
  await screen.findByRole("button", { name: "View partner details: Company new" });
  expect(sdkFetch).toHaveBeenCalledWith(PARTNERS_API_ROUTE, expect.any(Object));
  for (const [index, item] of [noOrganization, withoutApp, individualFreeApp, withContract, missingLink].entries()) {
    expect(column(labels[index]).getByRole("button", {
      name: `View partner details: ${item.companyName}`,
    })).toBeVisible();
  }
  expect(screen.getAllByRole("region")).toHaveLength(6);
});

it("honors saved board progress without altering the contact's factual links or app status", async () => {
  const progressed = { ...withContract, boardStage: "noOrganization" as const };
  jest.mocked(sdkFetch).mockResolvedValue({ items: [progressed], nextCursor: null });
  renderBoard();
  await screen.findByRole("button", { name: `View partner details: ${progressed.companyName}` });
  expect(column("No organization yet").getByRole("button", {
    name: `View partner details: ${progressed.companyName}`,
  })).toBeVisible();
  expect(column("With contract").queryByRole("button", {
    name: `View partner details: ${progressed.companyName}`,
  })).not.toBeInTheDocument();
  expect(sdkFetch).toHaveBeenCalledTimes(1);
});

it("keeps board tickets minimal and opens the existing detail action from the ticket name", async () => {
  const user = userEvent.setup();
  jest.mocked(sdkFetch).mockResolvedValue({ items: [noOrganization], nextCursor: null });
  const { onView } = renderBoard({ detailId: noOrganization.id });
  await screen.findByRole("button", { name: `View partner details: ${noOrganization.companyName}` });
  for (const value of [noOrganization.notes!, noOrganization.phoneNumber, noOrganization.email, noOrganization.firstName, noOrganization.meetingDate!]) {
    expect(screen.queryByText(value)).not.toBeInTheDocument();
  }
  const detailButton = ticket(noOrganization.companyName);
  expect(detailButton).toHaveAttribute("aria-expanded", "true");
  expect(detailButton).toHaveAttribute("aria-controls", "partner-detail");
  await user.click(detailButton);
  expect(onView).toHaveBeenCalledWith(noOrganization, detailButton);
});

it("keeps five empty columns visible and loads more contacts only after the operator requests the next page", async () => {
  const user = userEvent.setup();
  jest.mocked(sdkFetch).mockImplementation(async (path) => (
    String(path).includes("cursor=")
      ? { items: [withoutApp], nextCursor: null }
      : { items: [noOrganization], nextCursor: "board-next" }
  ) as never);
  renderBoard();
  await screen.findByRole("button", { name: `View partner details: ${noOrganization.companyName}` });
  for (const label of labels) expect(screen.getByRole("region", { name: label })).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: /Load more/ }));
  await screen.findByRole("button", { name: `View partner details: ${withoutApp.companyName}` });
  expect(ticket(noOrganization.companyName)).toBeVisible();
  expect(column("Without app").getByRole("button", { name: `View partner details: ${withoutApp.companyName}` })).toBeVisible();
  expect(sdkFetch).toHaveBeenLastCalledWith(`${PARTNERS_API_ROUTE}?cursor=board-next`, expect.any(Object));
  expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
});

it("moves a ticket using the accessible menu and persists only its board stage", async () => {
  const user = userEvent.setup();
  let saved = noOrganization;
  jest.mocked(sdkFetch).mockImplementation(async (_path, init) => {
    if (init?.method === "PATCH") {
      saved = { ...noOrganization, boardStage: "contract" };
      return { partner: saved } as never;
    }
    return { items: [saved], nextCursor: null } as never;
  });
  renderBoard();
  await screen.findByRole("button", { name: `View partner details: ${noOrganization.companyName}` });
  await user.click(screen.getByRole("button", { name: `Move partner: ${noOrganization.companyName}` }));
  expect(await screen.findByRole("menuitem", { name: "No organization yet" })).toHaveAttribute("aria-disabled", "true");
  await user.click(screen.getByRole("menuitem", { name: "With contract" }));
  await waitFor(() => expect(column("With contract").getByRole("button", {
    name: `View partner details: ${noOrganization.companyName}`,
  })).toBeVisible());
  expect(column("No organization yet").queryByRole("button", { name: `View partner details: ${noOrganization.companyName}` })).not.toBeInTheDocument();
  const mutations = jest.mocked(sdkFetch).mock.calls.filter(([, init]) => init?.method);
  expect(mutations).toHaveLength(1);
  expect(mutations[0][0]).toBe(`${PARTNERS_API_ROUTE}/${noOrganization.id}/board-stage`);
  expect(mutations[0][1]).toMatchObject({ method: "PATCH" });
  expect(JSON.parse(String(mutations[0][1]?.body))).toEqual({ boardStage: "contract" });
});

it("returns the ticket to its original column when saving a move fails", async () => {
  const user = userEvent.setup();
  let rejectMove: ((error: Error) => void) | undefined;
  const move = new Promise<never>((_resolve, reject) => { rejectMove = reject; });
  jest.mocked(sdkFetch).mockImplementation(async (_path, init) => (
    init?.method === "PATCH" ? move : { items: [noOrganization], nextCursor: null }
  ) as never);
  renderBoard();
  await screen.findByRole("button", { name: `View partner details: ${noOrganization.companyName}` });
  await user.click(screen.getByRole("button", { name: `Move partner: ${noOrganization.companyName}` }));
  await user.click(await screen.findByRole("menuitem", { name: "With contract" }));
  await waitFor(() => expect(jest.mocked(sdkFetch).mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1));
  await act(async () => { rejectMove?.(new Error("Board move failed")); });
  expect(await screen.findByRole("alert")).toHaveTextContent(/Board move failed|Could not move/);
  await waitFor(() => expect(column("No organization yet").getByRole("button", {
    name: `View partner details: ${noOrganization.companyName}`,
  })).toBeVisible());
  expect(column("With contract").queryByRole("button", { name: `View partner details: ${noOrganization.companyName}` })).not.toBeInTheDocument();
});

it("moves a ticket between columns with the drag handle keyboard controls", async () => {
  const user = userEvent.setup();
  const rects = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const label = this.getAttribute("aria-label") ?? "";
    const index = labels.indexOf(label);
    if (index >= 0) return new DOMRect(index * 200, 0, 200, 500);
    if (this.tagName === "ARTICLE" || this.classList.contains("w-48"))
      return new DOMRect(10, 80, 180, 60);
    if (this.style.position === "fixed" && this.style.width) {
      return new DOMRect(parseFloat(this.style.left) || 10, parseFloat(this.style.top) || 80,
        parseFloat(this.style.width) || 180, parseFloat(this.style.height) || 60);
    }
    return new DOMRect(0, 0, 1000, 600);
  });
  let saved = noOrganization;
  jest.mocked(sdkFetch).mockImplementation(async (_path, init) => {
    if (init?.method === "PATCH") {
      saved = { ...noOrganization, boardStage: "organizationWithoutApp" };
      return { partner: saved } as never;
    }
    return { items: [saved], nextCursor: null } as never;
  });
  try {
    renderBoard();
    const handle = await screen.findByRole("button", { name: `Drag partner: ${noOrganization.companyName}` });
    handle.focus();
    await user.keyboard("[Space]");
    await user.keyboard("[ArrowRight]");
    await user.keyboard("[Space]");
    await waitFor(() => expect(sdkFetch).toHaveBeenCalledWith(
      `${PARTNERS_API_ROUTE}/${noOrganization.id}/board-stage`,
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ boardStage: "organizationWithoutApp" }) }),
    ));
    expect(column("Without app").getByRole("button", {
      name: `View partner details: ${noOrganization.companyName}`,
    })).toBeVisible();
  } finally {
    rects.mockRestore();
  }
});


it("keeps a saved move when an older board refresh finishes afterward", async () => {
  const user = userEvent.setup();
  let releaseRefresh: (() => void) | undefined;
  const refreshing = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  let reads = 0;
  jest.mocked(sdkFetch).mockImplementation(async (_path, init) => {
    if (init?.method === "PATCH") {
      return { partner: { ...noOrganization, boardStage: "contract" } } as never;
    }
    reads += 1;
    if (reads > 1) await refreshing;
    return { items: [noOrganization], nextCursor: null } as never;
  });
  renderBoard();
  await screen.findByRole("button", { name: `View partner details: ${noOrganization.companyName}` });
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(reads).toBe(2));
  await user.click(screen.getByRole("button", { name: `Move partner: ${noOrganization.companyName}` }));
  await user.click(await screen.findByRole("menuitem", { name: "With contract" }));
  await waitFor(() => expect(column("With contract").getByRole("button", {
    name: `View partner details: ${noOrganization.companyName}`,
  })).toBeVisible());
  await act(async () => { releaseRefresh?.(); });
  expect(column("With contract").getByRole("button", {
    name: `View partner details: ${noOrganization.companyName}`,
  })).toBeVisible();
  expect(column("No organization yet").queryByRole("button", {
    name: `View partner details: ${noOrganization.companyName}`,
  })).not.toBeInTheDocument();
});
