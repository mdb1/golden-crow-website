/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  DeferredServiceTransactionWorkbench,
  DeferredServiceTransactionsBrowser,
} from "@/components/god-mode/deferred-service-transactions-workbench";
import { sdkFetch } from "@/lib/sdk-client";

const routerReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

function renderWithProviders(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider forcedLanguage="en">
        {children}
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("deferred service transaction workbenches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists deferred requester emails with counts and detail links", async () => {
    sdkFetchMock.mockResolvedValue({
      deferredTransactions: [
        {
          id: "cGVyc29uQGV4YW1wbGUuY29t",
          email: "person@example.com",
          deferredTransactionIds: ["pgr_one", "pgr_two"],
          transactionCount: 2,
        },
      ],
    });

    renderWithProviders(<DeferredServiceTransactionsBrowser />);

    expect(await screen.findByText("person@example.com")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("pgr_one")).not.toBeInTheDocument();
    expect(screen.queryByText("pgr_two")).not.toBeInTheDocument();
    expect(
      screen.queryByText("cGVyc29uQGV4YW1wbGUuY29t"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open/ })).toHaveAttribute(
      "href",
      "/god-mode/defered-service-transactions/cGVyc29uQGV4YW1wbGUuY29t",
    );
    expect(sdkFetchMock).toHaveBeenCalledWith(
      "/admin/support-services/deferred-transactions?limit=20",
    );
  });

  it("selects all loaded indexes and deletes them sequentially without deleting root transactions", async () => {
    const deferredTransactions = [
      {
        id: "index+one=",
        email: "one@example.com",
        deferredTransactionIds: ["pgr_one"],
        transactionCount: 1,
      },
      {
        id: "index-two",
        email: "two@example.com",
        deferredTransactionIds: ["pgr_two", "pgr_three"],
        transactionCount: 2,
      },
    ];
    sdkFetchMock.mockImplementation(async (_path, init) => {
      if (init?.method === "DELETE") {
        return { deleted: true };
      }
      return { deferredTransactions };
    });

    renderWithProviders(<DeferredServiceTransactionsBrowser />);

    await screen.findByText("one@example.com");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select deferred transaction index one@example.com",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", {
          name: "Select all visible deferred transaction indexes",
        }),
      ).toHaveAttribute("aria-checked", "mixed"),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select all visible deferred transaction indexes",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Select deferred transaction index one@example.com",
        }),
      ).toBeChecked();
      expect(
        screen.getByRole("checkbox", {
          name: "Select deferred transaction index two@example.com",
        }),
      ).toBeChecked();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Delete selected (2)" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete selected deferred indexes",
    });
    expect(
      within(dialog).getByText(
        "Deletion removes only each selected email index. Root service transactions are preserved, but their pending IDs will no longer link automatically when those emails sign in.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );

    expect(
      await within(dialog).findByText(
        "The selected deferred indexes were deleted. Root service transactions were preserved.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("100%")).toBeInTheDocument();
    expect(
      sdkFetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toEqual([
      [
        "/admin/support-services/deferred-transactions/index%2Bone%3D",
        { method: "DELETE" },
      ],
      [
        "/admin/support-services/deferred-transactions/index-two",
        { method: "DELETE" },
      ],
    ]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Finish" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Deletion complete",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Delete selected (2)" }),
    ).not.toBeInTheDocument();
  });

  it("uses the same consequence dialog for a single-row delete", async () => {
    sdkFetchMock.mockResolvedValue({
      deferredTransactions: [
        {
          id: "one-index",
          email: "one@example.com",
          deferredTransactionIds: ["pgr_one"],
          transactionCount: 1,
        },
      ],
    });

    renderWithProviders(<DeferredServiceTransactionsBrowser />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete deferred index one@example.com",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Delete deferred index",
    });
    expect(
      within(dialog).getByText(
        "Deletion removes only each selected email index. Root service transactions are preserved, but their pending IDs will no longer link automatically when those emails sign in.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("dialog", { name: "Delete deferred index" }),
    ).not.toBeInTheDocument();
    expect(
      sdkFetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(0);
  });

  it("stops bulk deletion on the first failure and leaves later indexes pending", async () => {
    const deferredTransactions = [
      {
        id: "first-index",
        email: "first@example.com",
        deferredTransactionIds: ["pgr_first"],
        transactionCount: 1,
      },
      {
        id: "second-index",
        email: "second@example.com",
        deferredTransactionIds: ["pgr_second"],
        transactionCount: 1,
      },
      {
        id: "third-index",
        email: "third@example.com",
        deferredTransactionIds: ["pgr_third"],
        transactionCount: 1,
      },
    ];
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method !== "DELETE") {
        return { deferredTransactions };
      }
      if (String(path).endsWith("/second-index")) {
        throw new Error("Delete failed.");
      }
      return { deleted: true };
    });

    renderWithProviders(<DeferredServiceTransactionsBrowser />);
    await screen.findByText("first@example.com");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select all visible deferred transaction indexes",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete selected (3)" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete selected deferred indexes",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete selected" }),
    );

    expect(
      await within(dialog).findByText(
        "A deferred index could not be deleted. Completed deletions were preserved and later indexes were not processed.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Delete failed.")).toBeInTheDocument();
    expect(within(dialog).getByText("67%")).toBeInTheDocument();
    expect(
      sdkFetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(2);
    expect(
      sdkFetchMock.mock.calls.some(([path]) =>
        String(path).endsWith("/third-index"),
      ),
    ).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Finish" }));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", {
          name: "Select deferred transaction index first@example.com",
        }),
      ).not.toBeChecked(),
    );
    expect(
      screen.getByRole("checkbox", {
        name: "Select deferred transaction index second@example.com",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Select deferred transaction index third@example.com",
      }),
    ).toBeChecked();
    expect(
      await screen.findByText("Some deferred indexes could not be deleted."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete selected (2)" }),
    ).toBeInTheDocument();
  });

  it("edits the email, links and unlinks transaction IDs, and follows a moved index", async () => {
    sdkFetchMock
      .mockResolvedValueOnce({
        deferredTransaction: {
          id: "old-index",
          email: "old@example.com",
          deferredTransactionIds: ["pgr_old"],
          transactionCount: 1,
          communityUser: {
            id: "community-user-1",
            email: "old@example.com",
            username: "old-user",
          },
        },
      })
      .mockResolvedValueOnce({
        deferredTransaction: {
          id: "new-index",
          email: "new@example.com",
          deferredTransactionIds: ["pgr_new"],
          transactionCount: 1,
        },
      });

    renderWithProviders(
      <DeferredServiceTransactionWorkbench deferredId="old-index" />,
    );

    const email = await screen.findByLabelText("Email");
    expect(
      screen.getByText("A community user already exists for this email."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open user/ })).toHaveAttribute(
      "href",
      "/collections/community_users/community-user-1",
    );
    expect(screen.getByRole("link", { name: /^Open$/ })).toHaveAttribute(
      "href",
      "/god-mode/service-transactions/pgr_old",
    );
    fireEvent.change(email, { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("pgr_*"), {
      target: { value: "pgr_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link transaction" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Unlink" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(sdkFetchMock).toHaveBeenLastCalledWith(
        "/admin/support-services/deferred-transactions/old-index",
        {
          method: "PUT",
          body: JSON.stringify({
            email: "new@example.com",
            deferredTransactionIds: ["pgr_new"],
          }),
        },
      ),
    );
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith(
        "/god-mode/defered-service-transactions/new-index",
      ),
    );
  });

  it("explains when no community user has the deferred email", async () => {
    sdkFetchMock.mockResolvedValue({
      deferredTransaction: {
        id: "unclaimed-index",
        email: "unclaimed@example.com",
        deferredTransactionIds: [],
        transactionCount: 0,
      },
    });

    renderWithProviders(
      <DeferredServiceTransactionWorkbench deferredId="unclaimed-index" />,
    );

    expect(
      await screen.findByText("No community user has this exact email."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The linked service transactions remain deferred by email until that community account exists.",
      ),
    ).toBeInTheDocument();
  });
});
