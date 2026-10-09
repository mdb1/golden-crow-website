/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TwoPQFormStorageProgress } from "@/components/two-pq-form-flow";

describe("TwoPQFormStorageProgress", () => {
  it("shows only phase 1 while whole-document validation is running", () => {
    render(
      <TwoPQFormStorageProgress
        wholeDataValidationReport={{ status: "running", issues: [] }}
        storageProcessingSteps={[]}
        storageProcessingError={null}
        storedFormId={null}
        language="en"
      />,
    );

    expect(screen.getByText("Phase 1")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Whole data validation" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Phase 2")).not.toBeInTheDocument();
    expect(
      screen.queryByText("2PQ form storage processing"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute(
      "aria-valuenow",
    );
  });

  it("shows only the current phase 2 task and makes overall progress primary", () => {
    render(
      <TwoPQFormStorageProgress
        wholeDataValidationReport={{ status: "success", issues: [] }}
        storageProcessingSteps={[
          {
            id: "completed",
            label: "Finished earlier",
            detail: "This task is already complete.",
            status: "success",
          },
          {
            id: "current",
            label: "Current storage task",
            detail: "This is what is happening now.",
            status: "running",
          },
          {
            id: "upcoming",
            label: "Future task",
            detail: "This has not started yet.",
            status: "pending",
          },
        ]}
        storageProcessingError={null}
        storedFormId={null}
        language="en"
      />,
    );

    expect(screen.getByText("Phase 2")).toBeInTheDocument();
    expect(screen.queryByText("Phase 1")).not.toBeInTheDocument();
    expect(screen.getByText("Current storage task")).toBeInTheDocument();
    expect(
      screen.getByText("This is what is happening now."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Finished earlier")).not.toBeInTheDocument();
    expect(screen.queryByText("Future task")).not.toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
  });
});
