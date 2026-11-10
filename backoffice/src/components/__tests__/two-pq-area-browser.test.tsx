/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQAreaBrowser } from "@/components/two-pq-area-browser";
import type { AdminContextRecord } from "@/lib/admin-areas";
import { sdkFetch } from "@/lib/sdk-client";
import type { TwoPQListItem } from "@/lib/two-pq-areas";

jest.mock("@/lib/sdk-client", () => ({ sdkFetch: jest.fn() }));

const context: AdminContextRecord = {
  email: "operator@example.com",
  uid: "operator-uid",
  role: "institution_operator",
  institutionId: "INST-001",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

const caseRecord: TwoPQListItem = {
  id: "CASE-001",
  areaKey: "cases",
  collectionKey: "2pq_case",
  institutionId: "INST-001",
  institutionName: "Clínica Norte",
  doctorId: "DOC-001",
  patientName: "Ada Patient",
  three_letter_code: "NIV",
  caseLabel: "NIVXXX",
  caseStatus: "awaiting_pick_up",
  caseType: "PGT FAST",
  requestedStudyTest: "pgtAUltraFast",
  biopsyCount: 4,
  createdAt: "2026-11-10T10:00:00.000Z",
  updatedAt: "2026-11-10T10:00:00.000Z",
  canUpdate: false,
  canReplace: false,
  canDelete: false,
};

it("shows the box code and request urgency, then loads another cases page", async () => {
  const user = userEvent.setup();
  const firstPage = { records: [caseRecord], nextCursor: caseRecord.id, hasMore: true };
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    const url = new URL(path, "https://test.local");
    if (url.searchParams.get("cursor") === caseRecord.id) {
      return { records: [{ ...caseRecord, id: "CASE-002", three_letter_code: "QRS", patientName: "Ada Second" }], nextCursor: null, hasMore: false };
    }
    return firstPage;
  });

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppLanguageProvider initialLanguage="en">
        <AdminContextProvider value={context}>
          <TwoPQAreaBrowser areaKey="cases" initialRecords={firstPage.records} initialCursor={firstPage.nextCursor} initialHasMore />
        </AdminContextProvider>
      </AppLanguageProvider>
    </QueryClientProvider>,
  );

  const firstRow = screen.getByRole("heading", { name: "NIV" }).parentElement!;
  expect(within(firstRow).queryByText("NIVXXX")).not.toBeInTheDocument();
  expect(within(firstRow).getByText("Ultra-fast PGT")).toHaveClass("bg-red-100");
  expect(within(firstRow).getByText("Ada Patient")).toBeInTheDocument();
  expect(within(firstRow).getByText("Clínica Norte")).toBeInTheDocument();
  expect(within(firstRow).getByText("4", { exact: false })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByRole("heading", { name: "QRS" })).toBeInTheDocument();
  expect(sdkFetch).toHaveBeenCalledWith("/2pq/cases?paginated=1&limit=20&cursor=CASE-001");
});
