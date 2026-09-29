/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ReportOwnerWarning } from "@/components/reports/report-owner-warning";

describe("ReportOwnerWarning", () => {
  it("warns when a report still references a deleted owner", () => {
    render(
      <ReportOwnerWarning
        ownerId="deleted-owner"
        ownerExists={false}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Orphaned report owner",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "report_owners/deleted-owner",
    );
  });

  it("stays hidden while the linked owner exists", () => {
    render(
      <ReportOwnerWarning ownerId="active-owner" ownerExists />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
