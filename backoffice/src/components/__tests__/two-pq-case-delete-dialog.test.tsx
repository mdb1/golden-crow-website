/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQCaseDeleteDialog } from "@/components/two-pq-case-delete-dialog";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

function renderDialog(onFinished = jest.fn()) {
  render(
    <AppLanguageProvider initialLanguage="en">
      <TwoPQCaseDeleteDialog
        caseId="CASE-00022"
        caseLabel="PGT case"
        onFinished={onFinished}
      />
    </AppLanguageProvider>,
  );
  return onFinished;
}

describe("TwoPQCaseDeleteDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("runs a complete related cleanup sequentially and refreshes only after Finish", async () => {
    const user = userEvent.setup();
    const onFinished = renderDialog();
    (sdkFetch as jest.Mock).mockImplementation(async (path: string) => {
      const step = path.split("/deletion/")[1]?.split("?")[0];
      return {
        step,
        status: "deleted",
        deletedCount: 1,
        message: `Deleted ${step}.`,
      };
    });

    await user.click(screen.getByRole("button", { name: "Delete case" }));
    await user.click(
      screen.getByRole("radio", {
        name: /Delete case and everything related/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Start full cleanup" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Deletion complete" }),
    ).toBeInTheDocument();
    expect(sdkFetch).toHaveBeenCalledTimes(5);
    expect((sdkFetch as jest.Mock).mock.calls.map(([path]) => path)).toEqual([
      "/2pq/cases/CASE-00022/deletion/form_links?scope=related",
      "/2pq/cases/CASE-00022/deletion/samplings?scope=related",
      "/2pq/cases/CASE-00022/deletion/service_transaction?scope=related",
      "/2pq/cases/CASE-00022/deletion/files_and_codes?scope=related",
      "/2pq/cases/CASE-00022/deletion/case?scope=related",
    ]);
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("stops before deleting the case when a related cleanup stage fails", async () => {
    const user = userEvent.setup();
    renderDialog();
    (sdkFetch as jest.Mock)
      .mockResolvedValueOnce({
        step: "form_links",
        status: "not_found",
        deletedCount: 0,
        message: "No links found.",
      })
      .mockRejectedValueOnce(
        new SdkRequestError({
          status: 409,
          method: "DELETE",
          path: "/2pq/cases/CASE-00022/deletion/samplings?scope=related",
          message: "Sampling ownership changed.",
          details: "Request: DELETE samplings\n\nStatus: 409 Conflict",
        }),
      );

    await user.click(screen.getByRole("button", { name: "Delete case" }));
    await user.click(
      screen.getByRole("radio", {
        name: /Delete case and everything related/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Start full cleanup" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Deletion stopped" }),
    ).toBeInTheDocument();
    expect(sdkFetch).toHaveBeenCalledTimes(2);
    expect(
      (sdkFetch as jest.Mock).mock.calls.some(([path]) =>
        String(path).endsWith("/deletion/case?scope=related"),
      ),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Show log" }));
    expect(screen.getByText(/Status: 409 Conflict/)).toBeInTheDocument();
  });

  it("deletes only the case and marks every related artifact as preserved", async () => {
    const user = userEvent.setup();
    renderDialog();
    (sdkFetch as jest.Mock).mockResolvedValue({
      step: "case",
      status: "deleted",
      deletedCount: 1,
      message: "Deleted only the case.",
    });

    await user.click(screen.getByRole("button", { name: "Delete case" }));
    await user.click(
      screen.getByRole("button", { name: "Delete only the case" }),
    );

    await waitFor(() => expect(sdkFetch).toHaveBeenCalledTimes(1));
    expect(sdkFetch).toHaveBeenCalledWith(
      "/2pq/cases/CASE-00022/deletion/case?scope=case",
      { method: "DELETE" },
    );
    expect(screen.getAllByText("Preserved")).toHaveLength(4);
  });
});
