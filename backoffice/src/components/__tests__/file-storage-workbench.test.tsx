/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { FileStorageWorkbench } from "@/components/file-storage/file-storage-workbench";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { sdkFetch } from "@/lib/sdk-client";

const routerPush = jest.fn();
const routerRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
  SdkRequestError: class SdkRequestError extends Error {},
}));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

function renderWorkbench(document: ModerationDocumentRecord) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        <FileStorageWorkbench document={document} />
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("FileStorageWorkbench", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerRefresh.mockClear();
    sdkFetchMock.mockReset();
  });

  it("makes a file linked to an uploaded object visibly immutable", () => {
    renderWorkbench({
      id: "stored-output-1",
      path: "file_storage/stored-output-1",
      collection: "file_storage",
      data: {
        file_name: "final-report.pgo.json",
        creator_email: "provider@example.org",
        file_type: "mdm",
        file_content: '{"object_type":"pgo_pdf_report"}',
        linked_object_code: "123456789",
      },
    });

    expect(screen.getByText("Linked")).toBeTruthy();
    expect(screen.queryByText("Orphan")).toBeNull();
    expect(
      screen.getByText(/linked to output object 123456789/i),
    ).toBeTruthy();
    expect((screen.getByLabelText("File name") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByLabelText("Creator email") as HTMLInputElement).disabled,
    ).toBe(true);
    expect((screen.getByLabelText("File type") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByLabelText("Stored JSON content") as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect((screen.getByLabelText("Linked object") as HTMLInputElement).value).toBe(
      "123456789",
    );
    expect((screen.getByRole("button", { name: "Save file" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByText("Open raw JSON workbench")).toBeNull();
    expect(sdkFetchMock).not.toHaveBeenCalled();
  });
});
