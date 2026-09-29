/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQRecordWorkbench } from "@/components/two-pq-record-workbench";
import { sdkFetch } from "@/lib/sdk-client";
import type { TwoPQDetailRecord } from "@/lib/two-pq-areas";

const routerRefresh = jest.fn();
const routerPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
  SdkRequestError: class SdkRequestError extends Error {
    status = 500;
    details = "SDK request failed.";
  },
}));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

const detail: TwoPQDetailRecord = {
  record: {
    id: "CASE-00022",
    areaKey: "cases",
    collectionKey: "2pq_case",
    institutionId: "institution-1",
    doctorId: "doctor-1",
    caseLabel: "CANXXX",
    caseStatus: "intake",
    createdAt: "2026-09-28T10:00:00.000Z",
    updatedAt: "2026-09-28T11:00:00.000Z",
    canReplace: true,
    canUpdate: true,
    canDelete: true,
  },
  institution: null,
  doctor: null,
  patient: null,
  linkedBatch: null,
  linkedCase: null,
  linkedCases: [],
  linkedSamplings: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderWorkbench() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider initialLanguage="en" forcedLanguage="en">
        <AdminContextProvider
          value={{
            email: "admin@example.com",
            uid: "admin-1",
            role: "full_admin",
            isBootstrap: false,
            canAccessBackoffice: true,
            canAccessPatientPortal: false,
            canAccessPGFlex: false,
            project: "mydnamap",
            projectAccess: ["mydnamap"],
          }}
        >
          <TwoPQRecordWorkbench
            areaKey="cases"
            detail={detail}
            institutions={[]}
            doctors={[]}
            patients={[]}
          />
        </AdminContextProvider>
      </AppLanguageProvider>
    </QueryClientProvider>,
  );
}

describe("2PQ case-status progress modal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens immediately and refreshes only after the operator finishes", async () => {
    const mutation = deferred<Record<string, unknown>>();
    sdkFetchMock.mockImplementation(async (path, init) => {
      if (init?.method === "PATCH" && path === "/2pq/cases/CASE-00022") {
        return mutation.promise;
      }
      throw new Error(`Unexpected SDK request: ${String(path)}`);
    });
    renderWorkbench();

    fireEvent.click(screen.getByRole("button", { name: "Next status" }));

    expect(
      await screen.findByRole("heading", { name: "Updating case status" }),
    ).toBeTruthy();
    expect(screen.getByText("Update case status")).toBeTruthy();
    expect(screen.getByText("Update sampling children")).toBeTruthy();
    expect(screen.getByText("Update File Storage")).toBeTruthy();
    expect(screen.getByText("Update report code")).toBeTruthy();
    expect(routerRefresh).not.toHaveBeenCalled();

    mutation.resolve({
      record: { ...detail.record, caseStatus: "awaiting_pick_up" },
      operation: {
        id: "operation-123456789",
        caseId: "CASE-00022",
        targetCaseStatus: "awaiting_pick_up",
        actorEmail: "admin@example.com",
        status: "success",
        steps: [
          { key: "case", status: "success", updatedAt: "2026-09-28T12:00:01.000Z" },
          { key: "samplings", status: "success", updatedAt: "2026-09-28T12:00:02.000Z" },
          { key: "file_storage", status: "success", updatedAt: "2026-09-28T12:00:03.000Z" },
          { key: "report_code", status: "success", updatedAt: "2026-09-28T12:00:04.000Z" },
        ],
        startedAt: "2026-09-28T12:00:00.000Z",
        updatedAt: "2026-09-28T12:00:04.000Z",
        completedAt: "2026-09-28T12:00:04.000Z",
        expiresAt: "2026-09-29T12:00:00.000Z",
      },
    });

    expect(
      await screen.findByRole("heading", { name: "Everything is up to date" }),
    ).toBeTruthy();
    expect(routerRefresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
  });

  it("keeps a failed partial process visible until Finish refreshes it", async () => {
    sdkFetchMock.mockRejectedValueOnce(new Error("Report code update failed."));
    renderWorkbench();

    fireEvent.click(screen.getByRole("button", { name: "Next status" }));

    expect(
      await screen.findByRole("heading", {
        name: "Case update finished with an error",
      }),
    ).toBeTruthy();
    expect(screen.getByText("The sequence could not be completed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show log" })).toBeTruthy();
    expect(routerRefresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
  });
});
