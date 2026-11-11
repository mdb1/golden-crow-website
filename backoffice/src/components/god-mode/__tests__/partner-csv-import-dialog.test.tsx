/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { TextDecoder } from "node:util";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLanguageProvider } from "@/components/app-language-provider";
import {
  PartnerCsvImportDialog,
  PartnerCsvImportRulesDialog,
} from "@/components/god-mode/partner-csv-import-dialog";
import { PartnersBrowser } from "@/components/god-mode/partners-workbench";
import {
  PARTNERS_API_ROUTE,
  type PartnerInput,
} from "@/lib/connected-partners";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const csv =
  "companyName,firstName,lastName,email\nAcme,Ana,Smith,ana@example.com\n";
const importId = "d85bccf6-3909-4f42-97bc-e797770baa52";
const contact: PartnerInput = {
  companyName: "Acme",
  firstName: "Ana",
  lastName: "Smith",
  email: "ana@example.com",
  phoneNumber: "",
  meetingDate: null,
  notes: null,
  linkedOrganizationId: null,
  linkedIndividualPublisherId: null,
  linkedAppId: null,
};
const ready = {
  rows: [
    { rowNumber: 2, input: contact, status: "ready" as const, errors: [] },
  ],
  summary: { total: 1, ready: 1, duplicates: 0, invalid: 0 },
};
const mockClose = jest.fn();

function file(text = csv, name = "partners.csv") {
  const upload = new File([text], name, { type: "text/csv" });
  Object.defineProperty(upload, "text", { value: async () => text });
  Object.defineProperty(upload, "arrayBuffer", {
    value: async () => new Uint8Array(Buffer.from(text, "utf8")).buffer,
  });
  return upload;
}

function renderImport(
  component = <PartnerCsvImportDialog onClose={mockClose} />,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  return {
    ...render(
      <AppLanguageProvider forcedLanguage="en">
        <QueryClientProvider client={client}>{component}</QueryClientProvider>
      </AppLanguageProvider>,
    ),
    invalidate,
  };
}

function upload(upload = file()) {
  fireEvent.change(screen.getByLabelText("CSV file"), {
    target: { files: [upload] },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: jest.fn(() => importId),
  });
});

beforeAll(() => {
  if (typeof globalThis.TextDecoder === "undefined") {
    Object.defineProperty(globalThis, "TextDecoder", {
      configurable: true,
      value: TextDecoder,
    });
  }
});

it("previews a selected CSV without creating records until the user imports", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path) =>
    path.endsWith("/preview")
      ? (ready as never)
      : ({
          importedCount: 1,
          skippedCount: 0,
          partnerIds: ["imported"],
        } as never),
  );
  const { invalidate } = renderImport();
  upload();
  expect(await screen.findByText("Acme")).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  expect(sdkFetch).toHaveBeenCalledWith(
    `${PARTNERS_API_ROUTE}/import/preview`,
    {
      method: "POST",
      body: JSON.stringify({ csv }),
    },
  );
  expect(sdkFetch).not.toHaveBeenCalledWith(
    `${PARTNERS_API_ROUTE}/import`,
    expect.anything(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Import partners" }));
  await waitFor(() =>
    expect(sdkFetch).toHaveBeenCalledWith(`${PARTNERS_API_ROUTE}/import`, {
      method: "POST",
      body: JSON.stringify({ csv, importId }),
    }),
  );
  await waitFor(() => expect(invalidate).toHaveBeenCalled());
  expect(mockClose).not.toHaveBeenCalled();
});

it("shows physical CSV row errors and prevents import when any row is invalid", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({
    rows: [
      ...ready.rows,
      {
        rowNumber: 5,
        input: null,
        status: "invalid",
        errors: ["email: Invalid email address"],
      },
    ],
    summary: { total: 2, ready: 1, duplicates: 0, invalid: 1 },
  });
  renderImport();
  upload();
  expect(await screen.findByText(/email: Invalid email address/)).toBeVisible();
  expect(screen.getByText(/\b5\b/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Import partners" }),
  ).toBeDisabled();
  expect(sdkFetch).toHaveBeenCalledTimes(1);
});

it("makes skipped duplicates visible and imports the remaining rows without overwriting", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path) =>
    path.endsWith("/preview")
      ? ({
          rows: [
            ...ready.rows,
            {
              rowNumber: 3,
              input: { ...contact, companyName: "Already known" },
              status: "duplicate",
              errors: [],
              duplicateReason: "A partner already uses this email.",
            },
          ],
          summary: { total: 2, ready: 1, duplicates: 1, invalid: 0 },
        } as never)
      : ({ importedCount: 1, skippedCount: 1, partnerIds: ["new"] } as never),
  );
  renderImport();
  upload();
  expect(
    await screen.findByText("A partner already uses this email."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Import partners" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Import partners" }));
  await waitFor(() => expect(sdkFetch).toHaveBeenCalledTimes(2));
  expect(mockClose).not.toHaveBeenCalled();
});

it("rejects a file above the limit before sending it to the server", async () => {
  renderImport();
  upload(file("x".repeat(256 * 1024 + 1)));
  expect(await screen.findByRole("alert")).toHaveTextContent(/256/);
  expect(sdkFetch).not.toHaveBeenCalled();
});

it("rejects invalid UTF-8 bytes instead of silently changing the imported names", async () => {
  const uploadFile = new File(
    [new Uint8Array([0xff, 0xfe, 0xfd])],
    "partners.csv",
    { type: "text/csv" },
  );
  Object.defineProperty(uploadFile, "arrayBuffer", {
    value: async () => new Uint8Array([0xff, 0xfe, 0xfd]).buffer,
  });
  renderImport();
  upload(uploadFile);
  expect(await screen.findByRole("alert")).toHaveTextContent(/UTF-8/);
  expect(sdkFetch).not.toHaveBeenCalled();
});

it("keeps a file-level validation error visible and never starts an import", async () => {
  jest
    .mocked(sdkFetch)
    .mockRejectedValue(new Error("Missing required header: email"));
  renderImport();
  upload();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Missing required header: email",
  );
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: "Import partners" }),
  ).not.toBeEnabled();
});

it("retries an uncertain import with the same import ID and preserves the preview", async () => {
  let attempts = 0;
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (path.endsWith("/preview")) return ready as never;
    if (++attempts === 1) throw new Error("Network response lost");
    return { importedCount: 1, skippedCount: 0, partnerIds: ["new"] } as never;
  });
  renderImport();
  upload();
  await screen.findByText("Acme");
  fireEvent.click(screen.getByRole("button", { name: "Import partners" }));
  expect(await screen.findByText("Network response lost")).toBeVisible();
  const retry =
    screen.queryByRole("button", { name: /Retry import/ }) ??
    screen.getByRole("button", { name: "Import partners" });
  fireEvent.click(retry);
  await waitFor(() => expect(attempts).toBe(2));
  const writes = jest
    .mocked(sdkFetch)
    .mock.calls.filter(([path]) => path === `${PARTNERS_API_ROUTE}/import`);
  expect(writes).toHaveLength(2);
  expect(writes[0][1]?.body).toEqual(writes[1][1]?.body);
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ csv, importId });
});

it("requires fresh validation after a definitive server rejection before another import", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (path.endsWith("/preview")) return ready as never;
    throw new SdkRequestError({
      status: 400,
      method: "POST",
      path: `${PARTNERS_API_ROUTE}/import`,
      message: "A linked organization was removed. Validate this file again.",
      details: "Rejected before writing",
    });
  });
  renderImport();
  upload();
  await screen.findByText("Acme");
  fireEvent.click(screen.getByRole("button", { name: "Import partners" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "A linked organization was removed.",
  );
  expect(
    screen.getByRole("button", { name: "Import partners" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Validate again" }));
  await waitFor(() => expect(sdkFetch).toHaveBeenCalledTimes(3));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Import partners" }),
    ).toBeEnabled(),
  );
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.filter(([path]) => path === `${PARTNERS_API_ROUTE}/import`),
  ).toHaveLength(1);
});

it("ignores an old preview response after the selected file changes", async () => {
  const slow = deferred<typeof ready>();
  jest.mocked(sdkFetch).mockImplementation(async (_path, init) => {
    const request = JSON.parse(String(init?.body)) as { csv: string };
    return request.csv === csv
      ? (slow.promise as never)
      : ({
          rows: [
            {
              rowNumber: 2,
              input: { ...contact, companyName: "Beta" },
              status: "ready",
              errors: [],
            },
          ],
          summary: ready.summary,
        } as never);
  });
  renderImport();
  upload();
  await waitFor(() => expect(sdkFetch).toHaveBeenCalledTimes(1));
  upload(file(csv.replace("Acme", "Beta"), "new-partners.csv"));
  expect(await screen.findByText("Beta")).toBeVisible();
  await act(async () => {
    slow.resolve(ready);
    await slow.promise;
  });
  expect(screen.getByText("Beta")).toBeVisible();
  expect(screen.queryByText("Acme")).not.toBeInTheDocument();
});

it("prevents closing or replacing the file while an import is running", async () => {
  const pending = deferred<{
    importedCount: number;
    skippedCount: number;
    partnerIds: string[];
  }>();
  jest
    .mocked(sdkFetch)
    .mockImplementation(async (path) =>
      path.endsWith("/preview") ? (ready as never) : (pending.promise as never),
    );
  renderImport();
  upload();
  await screen.findByText("Acme");
  fireEvent.click(screen.getByRole("button", { name: "Import partners" }));
  await waitFor(() => expect(screen.getByLabelText("CSV file")).toBeDisabled());
  const close = screen.queryByRole("button", { name: "Close" });
  if (close) expect(close).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), {
    key: "Escape",
    code: "Escape",
  });
  expect(mockClose).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve({ importedCount: 1, skippedCount: 0, partnerIds: ["new"] });
    await pending.promise;
  });
});

it("explains required columns, optional phone, dates, duplicates and linking in import rules", () => {
  renderImport(<PartnerCsvImportRulesDialog onClose={mockClose} />);
  const dialog = within(screen.getByRole("dialog", { name: "Import rules" }));
  for (const field of [
    "companyName",
    "firstName",
    "lastName",
    "email",
    "phoneNumber",
    "meetingDate",
    "notes",
    "linkedOrganizationId",
    "linkedIndividualPublisherId",
    "linkedAppId",
  ]) {
    expect(dialog.getAllByText(field, { exact: true }).length).toBeGreaterThan(
      0,
    );
  }
  expect(dialog.getAllByText(/YYYY-MM-DD/).length).toBeGreaterThan(0);
  expect(dialog.getAllByText(/256/).length).toBeGreaterThan(0);
  expect(dialog.getAllByText(/200/).length).toBeGreaterThan(0);
  expect(
    dialog.getByRole("button", { name: "Download template" }),
  ).toBeEnabled();
});

it("opens both import tools directly from the partner list", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({ items: [], nextCursor: null });
  renderImport(<PartnersBrowser />);
  await screen.findByText("No partners yet.");
  fireEvent.click(screen.getByRole("button", { name: "Import rules" }));
  expect(
    await screen.findByRole("dialog", { name: "Import rules" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
  expect(await screen.findByLabelText("CSV file")).toBeVisible();
});

it("downloads a CSV with every canonical column and a complete rules guide", async () => {
  const createUrl = jest.fn((_blob: Blob) => "blob:partners-download");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: jest.fn(),
  });
  const downloads: string[] = [];
  const click = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  function read(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }
  try {
    renderImport(<PartnerCsvImportRulesDialog onClose={mockClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Download template" }));
    const template = createUrl.mock.calls[0][0] as Blob;
    expect(template.type).toBe("text/csv;charset=utf-8");
    const header = (await read(template))
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)[0];
    expect(new Set(header.split(","))).toEqual(
      new Set([
        "companyName",
        "firstName",
        "lastName",
        "email",
        "phoneNumber",
        "meetingDate",
        "notes",
        "linkedOrganizationId",
        "linkedIndividualPublisherId",
        "linkedAppId",
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Download rules" }));
    const guide = await read(createUrl.mock.calls[1][0] as Blob);
    expect(guide).toContain("UTF-8");
    expect(guide).toContain("YYYY-MM-DD");
    expect(guide).toContain("Existing partners are never overwritten.");
    expect(downloads).toEqual([
      "partners-template.csv",
      "partners-import-rules.txt",
    ]);
  } finally {
    click.mockRestore();
  }
});
