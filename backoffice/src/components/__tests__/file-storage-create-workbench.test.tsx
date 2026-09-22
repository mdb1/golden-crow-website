/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FileStorageCreateWorkbench } from "@/components/file-storage/file-storage-create-workbench";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";

const routerPush = jest.fn();
const routerRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
  SdkRequestError: class SdkRequestError extends Error {},
}));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

describe("FileStorageCreateWorkbench", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    sdkFetchMock.mockReset();
  });

  it("offers all 23 wizard formats and validates raw JSON before creating", async () => {
    const order: string[] = [];
    sdkFetchMock.mockImplementation(async (path, init) => {
      const payload = JSON.parse(String(init?.body));
      if (path === "/file-storage/validate") {
        order.push("validate");
        return {
          valid: true,
          fileType: payload.fileType,
          fileContent: JSON.stringify(JSON.parse(payload.fileContent)),
        };
      }
      if (path === "/file-storage") {
        order.push("create");
        expect(payload).toEqual({
          data: {
            file_name: "final.pgo.json",
            file_type: "pgo_pdf_report",
            file_content:
              '{"title":"Final","download_url":"https://example.org/final.pdf"}',
          },
        });
        return {
          document: {
            id: "new-file-1",
            path: "file_storage/new-file-1",
            collection: "file_storage",
            data: payload.data,
          },
        };
      }
      throw new Error(`Unexpected SDK path: ${String(path)}`);
    });

    render(
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        <FileStorageCreateWorkbench />
      </AppLanguageProvider>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "File type" }));
    expect(await screen.findAllByRole("option")).toHaveLength(23);
    fireEvent.click(screen.getByRole("option", { name: "PDF Report" }));

    fireEvent.change(screen.getByLabelText("File name"), {
      target: { value: "final.pgo.json" },
    });
    fireEvent.change(screen.getByLabelText("Stored JSON content"), {
      target: {
        value:
          '{"title":"Final","download_url":"https://example.org/final.pdf"}',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create file" }));

    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    expect(order).toEqual(["validate", "create"]);
    expect(routerPush).toHaveBeenCalledWith(
      "/collections/file_storage/new-file-1",
    );
  });
});
