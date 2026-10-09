/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { UploadedReportWorkbench } from "@/components/reports/uploaded-report-workbench";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

function reportDocument(
  overrides: Record<string, unknown>
): ModerationDocumentRecord {
  return {
    id: "uploaded-report-1",
    path: "uploaded_reports/uploaded-report-1",
    collection: "uploaded_reports",
    data: {
      file_name: "Patient report.pdf",
      provider_name: "Ada Patient",
      provider_format: "2pq",
      tracking_progress_status: "document_ready",
      report_code: "M8HURK",
      upload_version_count: 1,
      download_url: null,
      linked_file_id: null,
      ...overrides,
    },
  };
}

describe("UploadedReportWorkbench access method", () => {
  it("presents a linked File Storage document as the active report source", () => {
    render(
      <UploadedReportWorkbench
        document={reportDocument({ linked_file_id: "stored-report-file-1" })}
        mode="embedded"
      />
    );

    expect(screen.getAllByText("File Storage document").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Linked File Storage ID")).toHaveValue(
      "stored-report-file-1"
    );
    expect(
      screen.getByRole("link", { name: "Open File Storage" })
    ).toHaveAttribute(
      "href",
      "/collections/file_storage/stored-report-file-1"
    );
    expect(screen.queryByLabelText("Direct download URL")).not.toBeInTheDocument();
  });

  it("presents the direct URL field when the report is URL-backed", () => {
    render(
      <UploadedReportWorkbench
        document={reportDocument({
          download_url: "https://example.com/report.pdf",
        })}
        mode="embedded"
      />
    );

    expect(screen.getAllByText("Direct download URL").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Direct download URL")).toHaveValue(
      "https://example.com/report.pdf"
    );
    expect(
      screen.queryByLabelText("Linked File Storage ID")
    ).not.toBeInTheDocument();
  });

  it("shows both corresponding fields and explains URL precedence when both exist", () => {
    render(
      <UploadedReportWorkbench
        document={reportDocument({
          download_url: "https://example.com/report.pdf",
          linked_file_id: "stored-report-file-1",
        })}
        mode="embedded"
      />
    );

    expect(screen.getAllByText("Direct URL + linked file").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/The direct URL is used first/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Direct download URL")).toHaveValue(
      "https://example.com/report.pdf"
    );
    expect(screen.getByLabelText("Linked File Storage ID")).toHaveValue(
      "stored-report-file-1"
    );
  });
});
