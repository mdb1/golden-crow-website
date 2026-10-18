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

function deferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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
    expect(
      screen.getByRole("button", { name: "Send email again: pgr_old" }),
    ).toBeDisabled();
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

  it("previews the canonical recipient, provider, linked transactions, and raw payload before resending", async () => {
    const detail = {
      id: "deferred-index",
      email: "indexed@example.com",
      deferredTransactionIds: ["pgr_one", "pgr_two"],
      transactionCount: 2,
    };
    const preview = {
      deferredId: "deferred-index",
      deferredEmail: "indexed@example.com",
      transactionId: "pgr_one",
      linkedTransactionIds: ["pgr_one", "pgr_two"],
      requesterEmailMismatch: true,
      previewFingerprint: "a".repeat(64),
      transaction: {
        id: "pgr_one",
        name: "Genome interpretation",
        requestedByUserEmail: "requester@example.com",
        status: "received" as const,
      },
      provider: {
        id: "provider-1",
        accountType: "organization" as const,
        name: "Genome Lab",
        email: "provider@genome.example",
        status: "active",
      },
      email: {
        recipientEmail: "federico@goldencrowvs.com",
        subject: "New Pocket Genes service request",
        text: [
          "A new service request has been submitted.",
          "Service: Genome interpretation",
          "Requested by: requester@example.com",
        ].join("\n"),
        input: {
          transactionName: "Genome interpretation",
          requesterEmail: "requester@example.com",
        },
      },
    };
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "POST") {
        return {
          notification: {
            transactionId: "pgr_one",
            resendRequestId: JSON.parse(String(init.body)).resendRequestId,
            recipientEmail: "federico@goldencrowvs.com",
            status: "sent",
          },
        };
      }
      if (String(path).endsWith("/notification")) {
        return { preview };
      }
      return { deferredTransaction: detail };
    });

    renderWithProviders(
      <DeferredServiceTransactionWorkbench deferredId="deferred-index" />,
    );

    const resendButtons = await screen.findAllByRole("button", {
      name: /^Send email again:/,
    });
    expect(resendButtons).toHaveLength(2);
    fireEvent.click(resendButtons[0]!);

    const dialog = await screen.findByRole("dialog", {
      name: "Review notification email",
    });
    expect(
      within(dialog).getByText("federico@goldencrowvs.com"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Genome Lab")).toBeInTheDocument();
    expect(
      within(dialog).getByText("provider@genome.example"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Organization publisher"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("indexed@example.com")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "The deferred index email differs from the transaction requester. The email content uses the transaction requester shown above.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("pgr_one").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("pgr_two")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/"subject": "New Pocket Genes service request"/),
    ).toBeInTheDocument();
    expect(
      sdkFetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send email again" }),
    );

    await waitFor(() =>
      expect(
        sdkFetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(1),
    );
    const postCall = sdkFetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(postCall?.[0]).toBe(
      "/admin/support-services/deferred-transactions/deferred-index/transactions/pgr_one/notification",
    );
    const postBody = JSON.parse(String(postCall?.[1]?.body));
    expect(postBody).toEqual({
      resendRequestId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      previewFingerprint: "a".repeat(64),
    });
    expect(postBody).not.toHaveProperty("recipientEmail");
    expect(postBody).not.toHaveProperty("text");
    expect(await screen.findByText("Notification email sent.")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Review notification email" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a late preview response from replacing the currently selected transaction", async () => {
    const detail = {
      id: "deferred-index",
      email: "requester@example.com",
      deferredTransactionIds: ["pgr_one", "pgr_two"],
      transactionCount: 2,
    };
    const firstPreview = deferredPromise<{ preview: unknown }>();
    const secondPreview = deferredPromise<{ preview: unknown }>();
    const previewFor = (transactionId: string, name: string) => ({
      deferredId: "deferred-index",
      deferredEmail: "requester@example.com",
      transactionId,
      linkedTransactionIds: ["pgr_one", "pgr_two"],
      requesterEmailMismatch: false,
      previewFingerprint: transactionId === "pgr_one" ? "a".repeat(64) : "b".repeat(64),
      transaction: {
        id: transactionId,
        name,
        requestedByUserEmail: "requester@example.com",
        status: "received" as const,
      },
      provider: {
        id: "provider-1",
        accountType: "organization" as const,
        name: "Genome Lab",
        email: "provider@genome.example",
        status: "active",
      },
      email: {
        recipientEmail: "federico@goldencrowvs.com",
        subject: "New Pocket Genes service request",
        text: `Service: ${name}`,
        input: {
          transactionName: name,
          requesterEmail: "requester@example.com",
        },
      },
    });
    sdkFetchMock.mockImplementation(async (path) => {
      if (String(path).includes("/pgr_one/notification")) {
        return firstPreview.promise;
      }
      if (String(path).includes("/pgr_two/notification")) {
        return secondPreview.promise;
      }
      return { deferredTransaction: detail };
    });

    renderWithProviders(
      <DeferredServiceTransactionWorkbench deferredId="deferred-index" />,
    );
    const buttons = await screen.findAllByRole("button", {
      name: /^Send email again:/,
    });
    fireEvent.click(buttons[0]!);
    const firstDialog = await screen.findByRole("dialog", {
      name: "Review notification email",
    });
    fireEvent.click(
      within(firstDialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Review notification email" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(buttons[1]!);
    secondPreview.resolve({ preview: previewFor("pgr_two", "Second request") });
    const secondDialog = await screen.findByRole("dialog", {
      name: "Review notification email",
    });
    expect(
      await within(secondDialog).findByText("Second request"),
    ).toBeInTheDocument();

    await act(async () => {
      firstPreview.resolve({
        preview: previewFor("pgr_one", "First request"),
      });
      await firstPreview.promise;
    });
    expect(
      within(secondDialog).queryByText("First request"),
    ).not.toBeInTheDocument();
    expect(within(secondDialog).getByText("Second request")).toBeInTheDocument();
  });

  it("shows historical provider details but disables resend for an inactive publisher", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      if (String(path).endsWith("/notification")) {
        return {
          preview: {
            deferredId: "deferred-index",
            deferredEmail: "requester@example.com",
            transactionId: "pgr_one",
            linkedTransactionIds: ["pgr_one"],
            requesterEmailMismatch: false,
            previewFingerprint: "a".repeat(64),
            transaction: {
              id: "pgr_one",
              name: "Genome interpretation",
              requestedByUserEmail: "requester@example.com",
              status: "received",
            },
            provider: {
              id: "provider-1",
              accountType: "organization",
              name: "Former Genome Lab",
              email: "former@genome.example",
              status: "inactive",
            },
            email: {
              recipientEmail: "federico@goldencrowvs.com",
              subject: "New Pocket Genes service request",
              text: "Service: Genome interpretation",
              input: {
                transactionName: "Genome interpretation",
                requesterEmail: "requester@example.com",
              },
            },
          },
        };
      }
      return {
        deferredTransaction: {
          id: "deferred-index",
          email: "requester@example.com",
          deferredTransactionIds: ["pgr_one"],
          transactionCount: 1,
        },
      };
    });

    renderWithProviders(
      <DeferredServiceTransactionWorkbench deferredId="deferred-index" />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Send email again: pgr_one",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Review notification email",
    });
    expect(
      within(dialog).getByText(
        "This provider publisher is missing or inactive. Its displayed contact details may be historical, and sending is disabled until the publisher is active.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Send email again" }),
    ).toBeDisabled();
  });

  it("requires a fresh preview after the backend reports changed notification details", async () => {
    const detail = {
      id: "deferred-index",
      email: "requester@example.com",
      deferredTransactionIds: ["pgr_one"],
      transactionCount: 1,
    };
    const previewFor = (name: string, previewFingerprint: string) => ({
      deferredId: "deferred-index",
      deferredEmail: "requester@example.com",
      transactionId: "pgr_one",
      linkedTransactionIds: ["pgr_one"],
      requesterEmailMismatch: false,
      previewFingerprint,
      transaction: {
        id: "pgr_one",
        name,
        requestedByUserEmail: "requester@example.com",
        status: "received" as const,
      },
      provider: {
        id: "provider-1",
        accountType: "organization" as const,
        name: "Genome Lab",
        email: "provider@genome.example",
        status: "active",
      },
      email: {
        recipientEmail: "federico@goldencrowvs.com",
        subject: "New Pocket Genes service request",
        text: `Service: ${name}`,
        input: {
          transactionName: name,
          requesterEmail: "requester@example.com",
        },
      },
    });
    let previewCount = 0;
    const postBodies: Array<{
      resendRequestId: string;
      previewFingerprint: string;
    }> = [];
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "POST") {
        postBodies.push(JSON.parse(String(init.body)));
        if (postBodies.length === 1) {
          throw Object.assign(
            new Error(
              "Notification details changed. Review the email again before sending.",
            ),
            { status: 409 },
          );
        }
        return {
          notification: {
            transactionId: "pgr_one",
            resendRequestId: postBodies[1]!.resendRequestId,
            recipientEmail: "federico@goldencrowvs.com",
            status: "sent",
          },
        };
      }
      if (String(path).endsWith("/notification")) {
        previewCount += 1;
        return {
          preview:
            previewCount === 1
              ? previewFor("Original request", "a".repeat(64))
              : previewFor("Updated request", "b".repeat(64)),
        };
      }
      return { deferredTransaction: detail };
    });

    renderWithProviders(
      <DeferredServiceTransactionWorkbench deferredId="deferred-index" />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Send email again: pgr_one",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Review notification email",
    });
    expect(
      await within(dialog).findByText("Original request"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send email again" }),
    );

    expect(
      await within(dialog).findByText(
        "Notification details changed. Review the email again before sending.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Send email again" }),
    ).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(
      await within(dialog).findByText("Updated request"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send email again" }),
    );
    await waitFor(() => expect(postBodies).toHaveLength(2));
    expect(postBodies[0]?.previewFingerprint).toBe("a".repeat(64));
    expect(postBodies[1]?.previewFingerprint).toBe("b".repeat(64));
    expect(postBodies[1]?.resendRequestId).not.toBe(
      postBodies[0]?.resendRequestId,
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
