/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionBrowser } from "@/components/collection-browser";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

function reportOwner(id: string, name: string) {
  return {
    id,
    path: `report_owners/${id}`,
    collection: "report_owners",
    data: {
      owner_name: name,
      owner_contact_email: `${id}@example.com`,
    },
  };
}

describe("CollectionBrowser report owner pagination", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sdkFetch as jest.Mock).mockImplementation(
      async (path: string, options?: { method?: string }) => {
        if (path === "/moderation/community_users") {
          return { documents: [] };
        }
        if (path === "/users/verification-summaries") {
          return { summaries: [] };
        }
        if (path.includes("cursor=owner-a")) {
          return {
            documents: [reportOwner("owner-b", "Professional owner")],
            nextCursor: null,
          };
        }
        if (path === "/moderation/report_owners?limit=20") {
          return {
            documents: [reportOwner("owner-a", "Organization owner")],
            nextCursor: "owner-a",
          };
        }
        throw new Error(
          `Unexpected request: ${options?.method ?? "GET"} ${path}`,
        );
      },
    );
  });

  it("loads every report-owner page through the visible Load more control", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <CollectionBrowser collectionKey="report_owners" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Organization owner")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Professional owner")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });
});
