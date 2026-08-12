/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { SingleFileUpload } from "@/components/single-file-upload";

describe("SingleFileUpload", () => {
  it("rejects files larger than the configured limit", () => {
    const onChange = jest.fn();
    const { container } = render(
      <SingleFileUpload
        id="consent-file"
        label="Consent file"
        value={null}
        onChange={onChange}
        maxBytes={1000}
      />,
    );
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input!, {
      target: {
        files: [
          new File(["x".repeat(1001)], "consent.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "The selected file exceeds 1 KB.",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects SVG files", () => {
    const onChange = jest.fn();
    const { container } = render(
      <SingleFileUpload
        id="consent-image"
        label="Consent image"
        value={null}
        onChange={onChange}
      />,
    );
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input!, {
      target: {
        files: [new File(["<svg />"], "consent.svg", { type: "image/svg+xml" })],
      },
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "Select a PDF or supported image file.",
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
