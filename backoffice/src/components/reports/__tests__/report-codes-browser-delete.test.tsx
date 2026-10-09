/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportCodesBrowser } from "@/components/reports/report-codes-browser";
import { sdkFetch } from "@/lib/sdk-client";
import type { AdminReportRecord } from "@/lib/moderation-types";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const reports: AdminReportRecord[] = [
  {
    id: "report-alpha",
    code: "ABC123",
    source: "myDNAMap",
    userId: "user-alpha",
    downloadUrl: "https://example.com/alpha.pdf",
    fileName: "Alpha report.pdf",
  },
  {
    id: "report-beta",
    code: "DEF456",
    source: "2pq",
    userId: "user-beta",
    downloadUrl: null,
    fileName: "Beta report.pdf",
  },
];

function renderBrowser() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReportCodesBrowser />
    </QueryClientProvider>,
  );
}

describe("ReportCodesBrowser report deletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let currentReports = [...reports];

    (sdkFetch as jest.Mock).mockImplementation(
      async (path: string, options?: { method?: string }) => {
        if (path === "/reports" && !options?.method) {
          return { reports: currentReports };
        }
        if (path === "/reports/report-alpha" && options?.method === "DELETE") {
          currentReports = currentReports.filter(
            (report) => report.id !== "report-alpha",
          );
          return { success: true, storageDeleted: true };
        }
        throw new Error(`Unexpected request: ${options?.method ?? "GET"} ${path}`);
      },
    );
  });

  it("shows a delete button beside every open action and refreshes in place", async () => {
    const user = userEvent.setup();
    renderBrowser();

    expect(await screen.findAllByRole("link", { name: "Open report" })).toHaveLength(2);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    expect(deleteButtons).toHaveLength(2);

    await user.click(deleteButtons[0]);
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", { name: "Delete report ABC123?" }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
    });
    expect(sdkFetch).toHaveBeenCalledWith("/reports/report-alpha", {
      method: "DELETE",
    });
    expect(push).not.toHaveBeenCalled();
  });
});
