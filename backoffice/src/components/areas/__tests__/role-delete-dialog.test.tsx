/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { RoleDeleteDialog } from "@/components/areas/role-delete-dialog";
import type {
  AdminContextRecord,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

const adminContext: AdminContextRecord = {
  email: "admin@example.com",
  uid: "admin-uid",
  role: "full_admin",
  isBootstrap: false,
  canAccessBackoffice: true,
  canAccessPatientPortal: false,
  canAccessPGFlex: false,
  project: "mydnamap",
  projectAccess: ["mydnamap"],
};

const roleRecord: RoleManagementRecord = {
  email: "doctor@example.com",
  role: "institution_doctor",
  firebaseUid: "doctor-uid",
  doctorId: "DOC-00001",
  institutionId: "INST-00001",
  isActive: true,
  canAccessPatientPortal: false,
  createdAt: "2026-09-28T12:00:00.000Z",
  updatedAt: "2026-09-28T12:00:00.000Z",
};

function renderDialog(onFinished = jest.fn()) {
  render(
    <AppLanguageProvider initialLanguage="en">
      <AdminContextProvider value={adminContext}>
        <RoleDeleteDialog roleRecord={roleRecord} onFinished={onFinished} />
      </AdminContextProvider>
    </AppLanguageProvider>,
  );
  return onFinished;
}

describe("RoleDeleteDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("runs the complete account cleanup sequentially and reports every outcome", async () => {
    const user = userEvent.setup();
    const onFinished = renderDialog();
    (sdkFetch as jest.Mock).mockImplementation(async (path: string) => {
      if (path.startsWith("/roles/deletion/orphaned-artifacts?")) {
        return {
          items: [
            {
              collection: "report_codes",
              id: "RPT001",
              ownerId: "patient-uid",
              code: "RPT001",
              linkedRecordId: "uploaded-report-1",
            },
            {
              collection: "uploaded_reports",
              id: "uploaded-report-1",
              ownerId: "patient-uid",
              code: "RPT001",
              fileName: "report.pdf",
            },
          ],
          nextCursors: { code: null, record: null },
        };
      }
      if (
        path.startsWith(
          "/roles/deletion/orphaned-two-pq-assignments?",
        )
      ) {
        return {
          items: [
            {
              collection: "patients",
              id: "PAT-00001",
              entityKind: "doctor",
              entityId: "DOC-00001",
              institutionId: "INST-00001",
              doctorId: "DOC-00001",
              fullName: "Orphaned patient",
              email: "patient@example.com",
              status: "active",
            },
            {
              collection: "2pq_case",
              id: "CASE-00020",
              entityKind: "doctor",
              entityId: "DOC-00001",
              institutionId: "INST-00001",
              doctorId: "DOC-00001",
              patientId: "PAT-00001",
              caseLabel: "PGT case",
              caseStatus: "entered",
            },
            {
              collection: "2pq_sequencing",
              id: "SEQ-00007",
              entityKind: "doctor",
              entityId: "DOC-00001",
              institutionId: "INST-00001",
              doctorId: "DOC-00001",
              patientId: "PAT-00001",
              runId: "RUN-7",
              platform: "NovaSeq",
              analysisStatus: "pending",
            },
          ],
          nextCursors: { patients: null, cases: null, batches: null },
        };
      }
      const step = path.split("/").at(-1);
      if (step === "linked_entity") {
        return {
          step,
          status: "deleted",
          deletedCount: 1,
          message:
            "Deleted 1 linked personal or professional record(s). Preserved 1 linked patient(s), 1 2PQ case(s), and 1 sequencing batch(es); none were deleted or reassigned.",
          orphanedTwoPQAssignments: {
            entityKind: "doctor",
            entityId: "DOC-00001",
            patientCount: 1,
            caseCount: 1,
            batchCount: 1,
            totalCount: 3,
          },
        };
      }
      if (step === "community") {
        throw new SdkRequestError({
          status: 500,
          method: "DELETE",
          path,
          message: "Role account cleanup step failed.",
          details: [
            `Request: DELETE ${path}`,
            "Status: 500 Internal Server Error",
            "Vercel request id: iad1::cleanup-request-id",
            'Response JSON:\n{"message":"9 FAILED_PRECONDITION: missing index"}',
          ].join("\n\n"),
        });
      }
      if (step === "reports") {
        return {
          step,
          status: "deleted",
          deletedCount: 1,
          message:
            "Deleted 1 report owner account(s). Preserved 1 report code(s) and 1 uploaded report(s); none were deleted or reassigned.",
          orphanedArtifacts: {
            kind: "reports",
            ownerIds: ["patient-uid"],
            codeCount: 1,
            recordCount: 1,
            totalCount: 2,
          },
        };
      }
      if (step === "objects") {
        return {
          step,
          status: "not_found",
          deletedCount: 0,
          message:
            "No object owner account was available. Preserved 0 object code(s) and 0 uploaded object(s); none were deleted or reassigned.",
        };
      }
      return {
        step,
        status: "deleted",
        deletedCount: 1,
        message: `Deleted ${step}.`,
      };
    });

    await user.click(screen.getByRole("button", { name: "Delete role" }));
    await user.click(
      screen.getByRole("radio", { name: /Delete the whole account too/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Start full cleanup" }),
    );

    await screen.findByText("Cleanup completed with pending items");
    expect(sdkFetch).toHaveBeenCalledTimes(9);
    expect((sdkFetch as jest.Mock).mock.calls.map((call) => call[0])).toEqual([
      "/roles/doctor%40example.com/deletion/linked_entity",
      "/roles/doctor%40example.com/deletion/private_profile",
      "/roles/doctor%40example.com/deletion/public_profile",
      "/roles/doctor%40example.com/deletion/community",
      "/roles/doctor%40example.com/deletion/reports",
      "/roles/doctor%40example.com/deletion/objects",
      "/roles/doctor%40example.com/deletion/learning",
      "/roles/doctor%40example.com/deletion/firebase_auth",
      "/roles/doctor%40example.com/deletion/role",
    ]);
    expect(screen.getAllByText("Failed")).toHaveLength(1);
    expect(screen.getAllByText("Not available")).toHaveLength(1);
    const ownerlessNextStep = screen.getByText(
      "Next step: review ownerless records",
    );
    expect(
      ownerlessNextStep.closest('[data-slot="dialog-footer"]'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Stored file metadata")).not.toBeInTheDocument();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(
      screen.getByText("Next step: review ownerless records"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Review ownerless reports/ }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Ownerless reports and codes",
      }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText("RPT001")).toHaveLength(3);
    expect(
      (sdkFetch as jest.Mock).mock.calls.some(([path]) =>
        String(path).startsWith("/roles/deletion/orphaned-artifacts?"),
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Close review" }));

    expect(
      screen.getByText("Third step: review orphaned relationships"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Review patients and 2PQ records/ }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Orphaned patients and 2PQ records",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Orphaned patient")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: /^Open$/ })
        .some(
          (link) =>
            link.getAttribute("href") === "/areas/patients/PAT-00001",
        ),
    ).toBe(true);
    expect(await screen.findByText("PGT case")).toBeInTheDocument();
    expect(await screen.findByText("RUN-7")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: /^Open$/ })
        .some(
          (link) =>
            link.getAttribute("href") === "/2pq-dashboard/cases/CASE-00020",
        ),
    ).toBe(true);
    expect(
      (sdkFetch as jest.Mock).mock.calls.some(([path]) =>
        String(path).startsWith(
          "/roles/deletion/orphaned-two-pq-assignments?",
        ),
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Close review" }));

    await user.click(screen.getByRole("button", { name: "Show log" }));
    expect(
      screen.getByRole("heading", { name: "Cleanup stage log" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Request: DELETE \/roles\/doctor%40example\.com\/deletion\/community/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/FAILED_PRECONDITION: missing index/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close log" }));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
  });
});
