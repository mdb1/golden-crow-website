/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { ServiceTransactionOutputExplorer } from "@/components/service-transactions/output-file-explorer";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

function renderExplorer() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <AppLanguageProvider forcedLanguage="en">
      <QueryClientProvider client={queryClient}>
        <ServiceTransactionOutputExplorer
          transactionId="pgr_ios_demo"
          role="images"
          routeBase="/publisher-portal/service-transactions"
        />
      </QueryClientProvider>
    </AppLanguageProvider>,
  );
}

describe("ServiceTransactionOutputExplorer", () => {
  beforeEach(() => {
    sdkFetchMock.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it("loads a transaction-scoped output and navigates its schema-shaped content", async () => {
    sdkFetchMock.mockResolvedValue({
      object: {
        id: "pgo_output_987654321",
        role: "images",
        objectCode: "987654321",
        objectType: "pgo_image_bundle",
        objectId: "obj_output_987654321",
        objectRevision: 1,
        fileName: "Diagnostic images",
        source: "file_storage",
        fileStorageId: "stored-images-1",
        content: {
          title: "Diagnostic images",
          images: [
            {
              key: "front",
              name: "Front image",
              download_url: "https://files.example.org/front.png",
            },
          ],
        },
        contentSizeBytes: 188,
        uploadVersionCount: 1,
        ownerName: "Publisher Lab",
        createdAt: "2026-10-24T20:00:00.000Z",
        updatedAt: "2026-10-24T20:05:00.000Z",
      },
    });

    renderExplorer();

    expect(await screen.findByText("Diagnostic images")).toBeTruthy();
    expect(sdkFetchMock).toHaveBeenCalledWith(
      "/admin/support-services/transactions/pgr_ios_demo/output-objects/images",
    );
    expect(
      screen.getByRole("link", { name: "Back to transaction" }).getAttribute("href"),
    ).toBe("/publisher-portal/service-transactions/pgr_ios_demo");
    expect(screen.getByDisplayValue("Diagnostic images")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Images/ }));
    expect(screen.getByRole("button", { name: "Back one level" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Item 1/ }));

    expect(screen.getByDisplayValue("front")).toBeTruthy();
    expect(screen.getByDisplayValue("Front image")).toBeTruthy();
    expect(
      screen.getByDisplayValue("https://files.example.org/front.png"),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open URL" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    expect(screen.getByText("stored-images-1")).toBeTruthy();
    expect(screen.getByText("obj_output_987654321")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Raw JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('"download_url": "https://files.example.org/front.png"'),
      );
    });
  });
});
