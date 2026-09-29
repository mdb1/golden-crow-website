/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminContextProvider } from "@/components/admin-context-provider";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { DoctorDeleteDialog } from "@/components/areas/doctor-delete-dialog";
import type {
  AdminContextRecord,
  DoctorListItem,
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

const doctor: DoctorListItem = {
  id: "DOC-00001",
  institutionId: "INST-00001",
  institutionName: "Central Clinic",
  authEmail: "doctor@example.com",
  authUid: "doctor-uid",
  fullName: "Dr. Ada Lovelace",
  status: "active",
  patientCount: 2,
  createdAt: "2026-09-28T12:00:00.000Z",
  updatedAt: "2026-09-28T12:00:00.000Z",
};

function renderDialog(
  onFinished = jest.fn(),
  context: AdminContextRecord = adminContext,
) {
  render(
    <AppLanguageProvider initialLanguage="en">
      <AdminContextProvider value={context}>
        <DoctorDeleteDialog doctor={doctor} onFinished={onFinished} />
      </AdminContextProvider>
    </AppLanguageProvider>,
  );
  return onFinished;
}

describe("DoctorDeleteDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes only the doctor and marks every relationship as preserved", async () => {
    const user = userEvent.setup();
    const onFinished = renderDialog();
    (sdkFetch as jest.Mock).mockResolvedValue({
      step: "doctor",
      status: "deleted",
      deletedCount: 1,
      message: "Deleted only doctor DOC-00001.",
    });

    await user.click(screen.getByRole("button", { name: "Delete doctor" }));
    await user.click(
      screen.getByRole("button", { name: "Delete doctor only" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Cleanup complete" }),
    ).toBeInTheDocument();
    expect(sdkFetch).toHaveBeenCalledWith(
      "/areas/doctors/DOC-00001/deletion/doctor?scope=doctor",
      { method: "DELETE" },
    );
    expect(sdkFetch).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Preserved")).toHaveLength(5);
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("runs the full cleanup sequentially and drains paged cases", async () => {
    const user = userEvent.setup();
    const onFinished = renderDialog();
    let caseCalls = 0;
    (sdkFetch as jest.Mock).mockImplementation(async (path: string) => {
      const step = path.split("/deletion/")[1]?.split("?")[0];
      if (step === "cases") {
        caseCalls += 1;
        return {
          step,
          status: "deleted",
          deletedCount: 1,
          message: `Deleted case ${caseCalls}.`,
          hasMore: caseCalls === 1,
        };
      }
      return {
        step,
        status: step === "object_owner" ? "not_found" : "deleted",
        deletedCount: step === "object_owner" ? 0 : 1,
        message: `Processed ${step}.`,
      };
    });

    await user.click(screen.getByRole("button", { name: "Delete doctor" }));
    await user.click(
      screen.getByRole("radio", {
        name: /Delete doctor and main relationships/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Start full cleanup" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Cleanup complete" }),
    ).toBeInTheDocument();
    expect((sdkFetch as jest.Mock).mock.calls.map(([path]) => path)).toEqual([
      "/areas/doctors/DOC-00001/deletion/cases?scope=full",
      "/areas/doctors/DOC-00001/deletion/cases?scope=full",
      "/areas/doctors/DOC-00001/deletion/patients?scope=full",
      "/areas/doctors/DOC-00001/deletion/report_owner?scope=full",
      "/areas/doctors/DOC-00001/deletion/object_owner?scope=full",
      "/areas/doctors/DOC-00001/deletion/role?scope=full",
      "/areas/doctors/DOC-00001/deletion/doctor?scope=full",
    ]);
    expect(screen.getByText("Deleted · 2 items")).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("stops at a failed stage and exposes the request log", async () => {
    const user = userEvent.setup();
    renderDialog();
    (sdkFetch as jest.Mock).mockRejectedValue(
      new SdkRequestError({
        status: 409,
        method: "DELETE",
        path: "/areas/doctors/DOC-00001/deletion/cases?scope=full",
        message: "The case could not be deleted.",
        details: "Request: DELETE linked cases\n\nStatus: 409 Conflict",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Delete doctor" }));
    await user.click(
      screen.getByRole("radio", {
        name: /Delete doctor and main relationships/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Start full cleanup" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Cleanup stopped" }),
    ).toBeInTheDocument();
    expect(sdkFetch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Show log" }));
    expect(screen.getByText(/Status: 409 Conflict/)).toBeInTheDocument();
  });

  it("keeps full cleanup unavailable to an institution admin", async () => {
    const user = userEvent.setup();
    renderDialog(jest.fn(), {
      ...adminContext,
      role: "institution_admin",
      institutionId: doctor.institutionId,
    });

    await user.click(screen.getByRole("button", { name: "Delete doctor" }));

    expect(
      screen.getByRole("radio", {
        name: /Delete doctor and main relationships/,
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Full cleanup is available only to Full Admin/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete doctor only" }),
    ).toBeEnabled();
    await waitFor(() => expect(sdkFetch).not.toHaveBeenCalled());
  });
});
