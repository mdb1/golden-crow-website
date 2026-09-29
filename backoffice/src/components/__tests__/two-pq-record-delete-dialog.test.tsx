/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { TwoPQRecordDeleteDialog } from "@/components/two-pq-record-delete-dialog";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

function renderDialog(
  areaKey: "sampling" | "sequencing",
  onFinished = jest.fn(),
) {
  render(
    <AppLanguageProvider initialLanguage="en">
      <TwoPQRecordDeleteDialog
        areaKey={areaKey}
        recordId={areaKey === "sampling" ? "SAM-00001" : "SEQ-00001"}
        recordLabel={areaKey === "sampling" ? "Blood sample" : "Run 01"}
        onFinished={onFinished}
      />
    </AppLanguageProvider>,
  );
  return onFinished;
}

describe("TwoPQRecordDeleteDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes a sampling through the existing relationship-aware endpoint", async () => {
    const user = userEvent.setup();
    const onFinished = renderDialog("sampling");
    (sdkFetch as jest.Mock).mockResolvedValue({
      success: true,
      recordId: "SAM-00001",
    });

    await user.click(screen.getByRole("button", { name: "Delete sampling" }));
    expect(screen.getByText("Linked case")).toBeInTheDocument();
    expect(screen.getByText("Historical records")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete sampling" }));

    expect(
      await screen.findByRole("heading", { name: "Deletion complete" }),
    ).toBeInTheDocument();
    expect(sdkFetch).toHaveBeenCalledWith("/2pq/sampling/SAM-00001", {
      method: "DELETE",
    });
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("deletes a sequencing batch while explicitly preserving linked cases", async () => {
    const user = userEvent.setup();
    renderDialog("sequencing");
    (sdkFetch as jest.Mock).mockResolvedValue({
      success: true,
      recordId: "SEQ-00001",
    });

    await user.click(screen.getByRole("button", { name: "Delete batch" }));
    expect(screen.getByText("Linked cases")).toBeInTheDocument();
    expect(
      screen.getByText(/Cases are preserved, their parent batch is removed/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete batch" }));

    expect(
      await screen.findByRole("heading", { name: "Deletion complete" }),
    ).toBeInTheDocument();
    expect(sdkFetch).toHaveBeenCalledWith("/2pq/sequencing/SEQ-00001", {
      method: "DELETE",
    });
  });

  it("keeps a failed operation inspectable and refreshes after Finish", async () => {
    const user = userEvent.setup();
    const onFinished = renderDialog("sampling");
    (sdkFetch as jest.Mock).mockRejectedValue(
      new SdkRequestError({
        status: 500,
        method: "DELETE",
        path: "/2pq/sampling/SAM-00001",
        message: "Case synchronization failed.",
        details:
          "Request: DELETE /2pq/sampling/SAM-00001\n\nStatus: 500 Internal Server Error",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Delete sampling" }));
    await user.click(screen.getByRole("button", { name: "Delete sampling" }));

    expect(
      await screen.findByRole("heading", {
        name: "Deletion reported an error",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show log" }));
    expect(screen.getByText(/500 Internal Server Error/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close log" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
