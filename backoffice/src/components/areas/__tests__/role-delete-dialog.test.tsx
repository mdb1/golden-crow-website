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
  email: "patient@example.com",
  role: "patient",
  firebaseUid: "patient-uid",
  patientId: "PAT-00001",
  doctorId: "DOC-00001",
  institutionId: "INST-00001",
  isActive: true,
  canAccessPatientPortal: true,
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
      const step = path.split("/").at(-1);
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
          status: "not_found",
          deletedCount: 0,
          message: "No report data was available.",
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
      "/roles/patient%40example.com/deletion/linked_entity",
      "/roles/patient%40example.com/deletion/private_profile",
      "/roles/patient%40example.com/deletion/public_profile",
      "/roles/patient%40example.com/deletion/community",
      "/roles/patient%40example.com/deletion/reports",
      "/roles/patient%40example.com/deletion/objects",
      "/roles/patient%40example.com/deletion/learning",
      "/roles/patient%40example.com/deletion/firebase_auth",
      "/roles/patient%40example.com/deletion/role",
    ]);
    expect(screen.getAllByText("Failed")).toHaveLength(1);
    expect(screen.getAllByText("Not available")).toHaveLength(1);
    expect(screen.getByText("100%")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Show log" }));
    expect(
      screen.getByRole("heading", { name: "Cleanup stage log" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Request: DELETE \/roles\/patient%40example\.com\/deletion\/community/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/FAILED_PRECONDITION: missing index/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close log" }));

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
  });
});
