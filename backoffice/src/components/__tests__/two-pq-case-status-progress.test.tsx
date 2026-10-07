/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  linkedServiceTransaction: null,
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

function renderWorkbench(
  workbenchDetail: TwoPQDetailRecord = detail,
  isBootstrap = false,
  role: "full_admin" | "institution_doctor" = "full_admin",
) {
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
            role,
            institutionId:
              role === "institution_doctor" ? "institution-1" : undefined,
            doctorId: role === "institution_doctor" ? "doctor-1" : undefined,
            isBootstrap,
            canAccessBackoffice: true,
            canAccessPatientPortal: false,
            canAccessPGFlex: false,
            project: "mydnamap",
            projectAccess: ["mydnamap"],
          }}
        >
          <TwoPQRecordWorkbench
            areaKey="cases"
            detail={workbenchDetail}
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

  it("shows an optional empty state when the case has no linked service transaction", () => {
    renderWorkbench();

    expect(
      screen.getByRole("heading", { name: "Linked service transaction" }),
    ).toBeTruthy();
    expect(screen.getByText("No linked service transaction")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Open transaction" }),
    ).toBeNull();
  });

  it("shows the linked transaction snapshot and GOD MODE detail link", () => {
    renderWorkbench(
      {
        ...detail,
        linkedServiceTransaction: {
          id: "pgr_2pq_case_00022",
          name: "Solicitud de estudio de CAN",
          requestId: "pgr_2pq_case_00022",
          offerId: "rhTE3dfB8Ovhf86lY3Z5",
          offerName: "Solicitud de PGT",
          serviceId: "pgs_2pq_74399",
          serviceVersion: 3,
          providerId: "kfFtJlLuyW6deXW2Im3S",
          providerName: "2pq",
          status: "received",
          requestedByUserEmail: "doctor@clinic.example",
          outputObjectCount: 0,
          updatedAt: "2026-09-29T10:00:00.000Z",
        },
      },
      true,
    );

    expect(screen.getByText("pgr_2pq_case_00022")).toBeTruthy();
    expect(screen.getByText("Solicitud de estudio de CAN")).toBeTruthy();
    expect(screen.getByText("Solicitud de PGT")).toBeTruthy();
    expect(screen.getByText("doctor@clinic.example")).toBeTruthy();
    expect(screen.getByText("Received")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open transaction" })
        .getAttribute("href"),
    ).toBe("/god-mode/service-transactions/pgr_2pq_case_00022");
  });

  it("hides publication infrastructure and the linked transaction from doctors", () => {
    renderWorkbench(
      {
        ...detail,
        record: {
          ...detail.record,
          stored_file_id: "stored-file-1",
        },
      },
      false,
      "institution_doctor",
    );

    expect(
      screen.queryByRole("heading", {
        name: "Automatic file and code synchronization",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Publish to File Storage" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Publish as report code" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Linked service transaction" }),
    ).toBeNull();
  });

  it("keeps case status, code, batch, and samplings read-only for doctors", () => {
    renderWorkbench(
      {
        ...detail,
        record: {
          ...detail.record,
          three_letter_code: "CAN",
          caseStatus: "awaiting_pick_up",
        },
        linkedBatch: {
          id: "BATCH-00001",
          areaKey: "sequencing",
          collectionKey: "2pq_sequencing",
          institutionId: "institution-1",
          doctorId: "doctor-1",
          platform: "NovaSeq",
          createdAt: "2026-09-27T10:00:00.000Z",
          updatedAt: "2026-09-28T10:00:00.000Z",
          canReplace: true,
          canUpdate: true,
          canDelete: true,
        },
        linkedSamplings: [
          {
            id: "SAMPLING-00001",
            areaKey: "sampling",
            collectionKey: "2pq_sampling",
            institutionId: "institution-1",
            doctorId: "doctor-1",
            sampleId: "CAN001",
            createdAt: "2026-09-27T10:00:00.000Z",
            updatedAt: "2026-09-28T10:00:00.000Z",
            canReplace: true,
            canUpdate: true,
            canDelete: true,
          },
        ],
      },
      false,
      "institution_doctor",
    );

    for (const heading of [
      "Three letter code",
      "Case status",
      "Linked Batch",
      "Linked samplings",
    ]) {
      const section = screen.getByRole("heading", { name: heading }).closest(
        "section",
      );
      expect(section).not.toBeNull();
      expect(within(section!).queryAllByRole("button")).toHaveLength(0);
      expect(within(section!).queryAllByRole("link")).toHaveLength(0);
    }

    expect(screen.getByText("CAN is active for this case.")).toBeTruthy();
    expect(screen.getAllByText("Awaiting pick up").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BATCH-00001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SAMPLING-00001").length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    for (const action of ["Reset", "Replace", "Update", "Delete"]) {
      expect(screen.queryByRole("button", { name: action })).toBeNull();
    }
  });

  it("keeps the case form interactive for full admins", () => {
    renderWorkbench();

    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
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
