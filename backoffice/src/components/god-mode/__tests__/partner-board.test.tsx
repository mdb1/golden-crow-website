/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import type { ComponentProps } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PartnersBoard } from "@/components/god-mode/partner-board";
import { PARTNERS_API_ROUTE, type Partner, type PartnerBoardStage } from "@/lib/connected-partners";
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

const stageKeys: PartnerBoardStage[] = [
  "noOrganization", "organizationWithoutApp", "freeApp", "contract", "other",
];
function boardRequest(path: string) {
  const url = new URL(path, "https://example.test");
  if (url.pathname !== `${PARTNERS_API_ROUTE}/board`) throw new Error(`Unexpected board read: ${path}`);
  const stage = url.searchParams.get("stage") as PartnerBoardStage;
  expect(stageKeys).toContain(stage);
  const limit = Number(url.searchParams.get("limit"));
  expect(limit).toBeGreaterThan(0);
  expect(limit).toBeLessThanOrEqual(20);
  return { stage, limit, cursor: url.searchParams.get("cursor") };
}
function boardPage(items: Partner[], nextCursor: string | null = null) {
  return { items, nextCursor, scanIncomplete: items.length < 20 && Boolean(nextCursor) };
}
function respond(path: string, byStage: Partial<Record<PartnerBoardStage, Partner[]>>) {
  const { stage, limit } = boardRequest(path);
  return boardPage((byStage[stage] ?? []).slice(0, limit));
}
function savedResponse(path: string, saved: Partner) {
  return respond(path, { [saved.boardStage ?? "noOrganization"]: [saved] });
}
function many(prefix: string, count: number, stage: PartnerBoardStage = "noOrganization") {
  return Array.from({ length: count }, (_, index) => partner(`${prefix}-${index + 1}`, { boardStage: stage }));
}

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
  jest.mocked(sdkFetch).mockImplementation(async (path) => respond(String(path), {
    noOrganization: [noOrganization], organizationWithoutApp: [withoutApp],
    freeApp: [individualFreeApp], contract: [withContract], other: [missingLink],
  }) as never);
  renderBoard();
  await screen.findByRole("button", { name: "View partner details: Company new" });
  expect(jest.mocked(sdkFetch).mock.calls.map(([path]) => boardRequest(String(path)).stage).sort())
    .toEqual([...stageKeys].sort());
  for (const [index, item] of [noOrganization, withoutApp, individualFreeApp, withContract, missingLink].entries()) {
    expect(column(labels[index]).getByRole("button", {
      name: `View partner details: ${item.companyName}`,
    })).toBeVisible();
  }
  expect(screen.getAllByRole("region")).toHaveLength(6);
});

it("honors saved board progress without altering the contact's factual links or app status", async () => {
  const progressed = { ...withContract, boardStage: "noOrganization" as const };
  jest.mocked(sdkFetch).mockImplementation(async (path) => respond(String(path), { noOrganization: [progressed] }) as never);
  renderBoard();
  await screen.findByRole("button", { name: `View partner details: ${progressed.companyName}` });
  expect(column("No organization yet").getByRole("button", {
    name: `View partner details: ${progressed.companyName}`,
  })).toBeVisible();
  expect(column("With contract").queryByRole("button", {
    name: `View partner details: ${progressed.companyName}`,
  })).not.toBeInTheDocument();
  expect(sdkFetch).toHaveBeenCalledTimes(5);
});

it("keeps board tickets minimal and opens the existing detail action from the ticket name", async () => {
  const user = userEvent.setup();
  jest.mocked(sdkFetch).mockImplementation(async (path) => respond(String(path), { noOrganization: [noOrganization] }) as never);
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

it("loads up to 20 contacts per column and paginates one column without replacing or rereading the others", async () => {
  const user = userEvent.setup();
  const first = many("First", 20);
  const second = many("Second", 3);
  const fixed = many("Contract", 4, "contract");
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const { stage, cursor } = boardRequest(String(path));
    if (stage === "noOrganization") return (cursor ? boardPage(second) : boardPage(first, "next-new")) as never;
    return boardPage(stage === "contract" ? fixed : []) as never;
  });
  renderBoard();
  await screen.findByRole("button", { name: "View partner details: Company First-20" });
  expect(column("No organization yet").getAllByRole("button", { name: /^View partner details:/ })).toHaveLength(20);
  expect(column("With contract").getAllByRole("button", { name: /^View partner details:/ })).toHaveLength(4);
  expect(sdkFetch).toHaveBeenCalledTimes(5);
  await user.click(column("No organization yet").getByRole("button", { name: "Next page" }));
  await screen.findByRole("button", { name: "View partner details: Company Second-3" });
  expect(screen.queryByRole("button", { name: "View partner details: Company First-1" })).not.toBeInTheDocument();
  expect(column("No organization yet").getAllByRole("button", { name: /^View partner details:/ })).toHaveLength(3);
  expect(column("With contract").getAllByRole("button", { name: /^View partner details:/ })).toHaveLength(4);
  expect(jest.mocked(sdkFetch).mock.calls.filter(([path]) => boardRequest(String(path)).stage !== "noOrganization")).toHaveLength(4);
  expect(boardRequest(String(jest.mocked(sdkFetch).mock.calls.at(-1)![0]))).toMatchObject({ stage: "noOrganization", cursor: "next-new" });
  await user.click(column("No organization yet").getByRole("button", { name: "Previous page" }));
  await screen.findByRole("button", { name: "View partner details: Company First-20" });
  expect(column("No organization yet").getAllByRole("button", { name: /^View partner details:/ })).toHaveLength(20);
});

it("automatically exhausts sparse column scan cursors to show every contact below 20", async () => {
  const dense = many("Dense", 20);
  const sparse = many("Sparse", 3, "freeApp");
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const { stage, cursor } = boardRequest(String(path));
    if (stage === "noOrganization") return boardPage(dense, "dense-next-page") as never;
    if (stage !== "freeApp") return boardPage([]) as never;
    if (!cursor) return boardPage([], "after-first-global-20") as never;
    if (cursor === "after-first-global-20") return boardPage(sparse.slice(0, 2), "after-more-unrelated") as never;
    return boardPage(sparse.slice(2)) as never;
  });
  renderBoard();
  await screen.findByRole("button", { name: "View partner details: Company Sparse-3" });
  expect(column("With free app").getAllByRole("button", { name: /^View partner details:/ })).toHaveLength(3);
  for (const contact of sparse) expect(column("With free app").getByRole("button", { name: `View partner details: ${contact.companyName}` })).toBeVisible();
  const requests = jest.mocked(sdkFetch).mock.calls.map(([path]) => boardRequest(String(path)));
  expect(requests.filter((request) => request.stage === "freeApp").map((request) => request.cursor))
    .toEqual([null, "after-first-global-20", "after-more-unrelated"]);
  expect(requests.filter((request) => request.stage === "noOrganization")).toHaveLength(1);
  const nextPage = column("With free app").queryByRole("button", { name: "Next page" });
  if (nextPage) expect(nextPage).toBeDisabled();
});

it("fills a 20-contact column across partial scan results and stops before its next matched page", async () => {
  const records = many("Partial", 25, "organizationWithoutApp");
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const { stage, cursor, limit } = boardRequest(String(path));
    if (stage !== "organizationWithoutApp") return boardPage([]) as never;
    if (!cursor) return boardPage(records.slice(0, 7), "partial-scan") as never;
    expect(cursor).toBe("partial-scan");
    expect(limit).toBe(13);
    return boardPage(records.slice(7, 20), "next-matched-page") as never;
  });
  renderBoard();
  await screen.findByRole("button", { name: "View partner details: Company Partial-20" });
  expect(column("Without app").getAllByRole("button", { name: /^View partner details:/ })).toHaveLength(20);
  expect(screen.queryByRole("button", { name: "View partner details: Company Partial-21" })).not.toBeInTheDocument();
  expect(jest.mocked(sdkFetch).mock.calls.filter(([path]) => boardRequest(String(path)).stage === "organizationWithoutApp")).toHaveLength(2);
  expect(column("Without app").getByRole("button", { name: "Next page" })).toBeEnabled();
});

it("moves a ticket using the accessible menu and persists only its board stage", async () => {
  const user = userEvent.setup();
  let saved = noOrganization;
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (init?.method === "PATCH") {
      saved = { ...noOrganization, boardStage: "contract" };
      return { partner: saved } as never;
    }
    return savedResponse(String(path), saved) as never;
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
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => (
    init?.method === "PATCH" ? move : savedResponse(String(path), noOrganization)
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
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (init?.method === "PATCH") {
      saved = { ...noOrganization, boardStage: "organizationWithoutApp" };
      return { partner: saved } as never;
    }
    return savedResponse(String(path), saved) as never;
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


it("keeps a saved move when an older column refresh finishes afterward", async () => {
  const user = userEvent.setup();
  let releaseRefresh: (() => void) | undefined;
  const refreshing = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  let sourceReads = 0;
  let saved = noOrganization;
  jest.mocked(sdkFetch).mockImplementation(async (path, init) => {
    if (init?.method === "PATCH") {
      saved = { ...noOrganization, boardStage: "contract" };
      return { partner: saved } as never;
    }
    const { stage } = boardRequest(String(path));
    if (stage === "noOrganization") {
      sourceReads += 1;
      if (sourceReads === 2) {
        await refreshing;
        return boardPage([noOrganization]) as never;
      }
    }
    return savedResponse(String(path), saved) as never;
  });
  renderBoard();
  await screen.findByRole("button", { name: `View partner details: ${noOrganization.companyName}` });
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(sourceReads).toBe(2));
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
