/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
