/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { FileStorageBrowser } from "@/components/file-storage/file-storage-browser";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => "/collections/file_storage",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/lib/sdk-client", () => ({ sdkFetch: jest.fn() }));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

function renderBrowser() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        <FileStorageBrowser />
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

function storedFile(id: string) {
  return {
    id,
    path: `file_storage/${id}`,
    collection: "file_storage",
    data: {
      file_name: `${id}.json`,
      file_type: "pgo_pdf_report",
      file_content:
        '{"title":"Final","download_url":"https://example.org/final.pdf"}',
    },
  };
}

describe("FileStorageBrowser", () => {
  beforeEach(() => sdkFetchMock.mockReset());

  it("loads bounded pages and exposes the new-file flow", async () => {
    sdkFetchMock.mockImplementation(async (path) => {
      const value = String(path);
      expect(value).toContain("limit=20");
      if (value.includes("cursor=page-2")) {
        return { documents: [storedFile("file-2")], nextCursor: null };
      }
      return { documents: [storedFile("file-1")], nextCursor: "page-2" };
    });

    renderBrowser();

    expect(await screen.findByText("file-1.json")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Add new file" }).getAttribute("href"),
    ).toBe("/collections/file_storage/new");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("file-2.json")).toBeTruthy();
    await waitFor(() =>
      expect(
        sdkFetchMock.mock.calls.some(([path]) =>
          String(path).includes("cursor=page-2"),
        ),
      ).toBe(true),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});
