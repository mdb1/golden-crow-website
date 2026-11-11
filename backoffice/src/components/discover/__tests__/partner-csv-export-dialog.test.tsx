/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DiscoverPartnerCsvExportButton } from "@/components/discover/partner-csv-export-dialog";
import { sdkFetch } from "@/lib/sdk-client";
import { downloadPartnerCsvText } from "@/lib/partner-csv-import";

jest.mock("@/lib/sdk-client", () => ({ sdkFetch: jest.fn() }));
jest.mock("@/lib/partner-csv-import", () => ({
  ...jest.requireActual("@/lib/partner-csv-import"),
  downloadPartnerCsvText: jest.fn(),
}));

const publisher = {
  id: "org-1",
  name: "Genome Lab",
  contactEmail: "HELLO@EXAMPLE.ORG",
  internalNotes: "Some notes",
};

function renderButton(
  kind: "organization" | "individual" = "organization",
  language: "en" | "es" = "en",
) {
  return render(
    <AppLanguageProvider forcedLanguage={language}>
      <DiscoverPartnerCsvExportButton kind={kind} />
    </AppLanguageProvider>,
  );
}

beforeEach(() => jest.resetAllMocks());

it("reads every bounded page on demand and downloads a linked CSV only when requested", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({
      organizations: [publisher],
      nextCursor: "next / page",
    })
    .mockResolvedValueOnce({
      organizations: [{ ...publisher, id: "org-2", name: "Second Lab" }],
      nextCursor: null,
    });
  renderButton();
  expect(sdkFetch).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Export as partners CSV" }),
  );
  const download = await screen.findByRole("button", {
    name: "Download CSV 1",
  });
  expect(sdkFetch).toHaveBeenNthCalledWith(
    1,
    "/discover/organizations?limit=20",
    { signal: expect.any(AbortSignal) },
  );
  expect(sdkFetch).toHaveBeenNthCalledWith(
    2,
    "/discover/organizations?limit=20&cursor=next+%2F+page",
    { signal: expect.any(AbortSignal) },
  );
  expect(screen.getByText(/Contact first and last names are optional/)).toBeVisible();
  expect(screen.queryByText(/Complete or correct these fields/)).toBeNull();
  expect(downloadPartnerCsvText).not.toHaveBeenCalled();
  fireEvent.click(download);
  expect(downloadPartnerCsvText).toHaveBeenCalledWith(
    expect.stringContaining('"org-2","",""'),
    expect.stringMatching(/^organizations-as-partners-.*-01\.csv$/),
    "text/csv;charset=utf-8",
  );
  expect(jest.mocked(downloadPartnerCsvText).mock.calls[0][0]).toContain(
    "hello@example.org",
  );
  expect(screen.getByRole("link", { name: "Go to Partners" })).toHaveAttribute(
    "href",
    "/god-mode/partners",
  );
});

it("exports individuals, including their parent organization, and explains name splitting", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({
    individuals: [
      {
        ...publisher,
        id: "person-1",
        name: "Ana Rivera",
        linkedParentOrganizationId: "parent-1",
      },
    ],
    nextCursor: null,
  });
  renderButton("individual");
  fireEvent.click(
    screen.getByRole("button", { name: "Export as partners CSV" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Download CSV 1" }),
  );
  expect(sdkFetch).toHaveBeenCalledWith("/discover/individuals?limit=20", {
    signal: expect.any(AbortSignal),
  });
  expect(screen.getByText(/Review compound names/)).toBeVisible();
  expect(
    screen.queryByText(/All publishers remain in the CSV/),
  ).not.toBeInTheDocument();
  expect(downloadPartnerCsvText).toHaveBeenCalledWith(
    expect.stringContaining('"parent-1","person-1",""'),
    expect.any(String),
    "text/csv;charset=utf-8",
  );
});

it("withholds partial files on page failure and restarts from page one on retry", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({ organizations: [publisher], nextCursor: "next" })
    .mockRejectedValueOnce(new Error("Offline"));
  renderButton();
  fireEvent.click(
    screen.getByRole("button", { name: "Export as partners CSV" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not prepare the partners CSV",
  );
  expect(
    screen.queryByRole("button", { name: "Download CSV 1" }),
  ).not.toBeInTheDocument();
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({ organizations: [publisher], nextCursor: null });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("button", { name: "Download CSV 1" }),
  ).toBeVisible();
  expect(jest.mocked(sdkFetch).mock.calls[2][0]).toBe(
    "/discover/organizations?limit=20",
  );
  expect(downloadPartnerCsvText).not.toHaveBeenCalled();
});

it("cancels an in-flight export when closed and never starts the next page", async () => {
  let resolvePage!: (page: unknown) => void;
  jest.mocked(sdkFetch).mockReturnValue(
    new Promise((resolve) => {
      resolvePage = resolve;
    }),
  );
  renderButton();
  fireEvent.click(
    screen.getByRole("button", { name: "Export as partners CSV" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Preparing partners CSV",
  );
  const signal = jest.mocked(sdkFetch).mock.calls[0][1]!.signal!;
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolvePage({ organizations: [publisher], nextCursor: "next" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  expect(downloadPartnerCsvText).not.toHaveBeenCalled();
});

it("shows the empty state without downloading a header-only file", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValue({ organizations: [], nextCursor: null });
  renderButton();
  fireEvent.click(
    screen.getByRole("button", { name: "Export as partners CSV" }),
  );
  expect(
    await screen.findByText("There are no publishers to export."),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Download CSV 1" }),
  ).not.toBeInTheDocument();
});

it("offers separately downloadable parts that respect the import row limit", async () => {
  // More than 20 rows in this mock exercises file splitting; real calls always request limit=20.
  jest.mocked(sdkFetch).mockResolvedValue({
    organizations: Array.from({ length: 201 }, (_, i) => ({
      ...publisher,
      id: `org-${i}`,
    })),
    nextCursor: null,
  });
  renderButton("organization", "es");
  fireEvent.click(
    screen.getByRole("button", { name: "Exportar como CSV de partners" }),
  );
  expect(
    await screen.findByRole("button", { name: "Descargar CSV 2" }),
  ).toBeVisible();
  expect(screen.getByText(/200 filas y 256 KiB/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Descargar CSV 2" }));
  await waitFor(() => expect(downloadPartnerCsvText).toHaveBeenCalledTimes(1));
  expect(jest.mocked(downloadPartnerCsvText).mock.calls[0][0]).toContain(
    '"org-200","",""',
  );
  expect(jest.mocked(downloadPartnerCsvText).mock.calls[0][0]).not.toContain(
    '"org-199","",""',
  );
});
