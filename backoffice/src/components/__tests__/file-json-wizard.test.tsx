/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  FileJsonWizard,
  FILE_WIZARD_SUPPORTED_FORMAT_COUNT,
  isWizardValueComplete,
} from "@/components/file-storage/file-json-wizard";
import {
  FILE_WIZARD_FORMATS,
  fileWizardSchema,
  resolveFileWizardSchema,
} from "@/lib/file-wizard-schema-catalog";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
  SdkRequestError: class SdkRequestError extends Error {},
}));

const sdkFetchMock = sdkFetch as jest.MockedFunction<typeof sdkFetch>;

describe("FileJsonWizard", () => {
  beforeEach(() => sdkFetchMock.mockReset());

  it("exposes the same 23 object-root JSON formats as the native wizard", () => {
    expect(FILE_WIZARD_FORMATS).toHaveLength(FILE_WIZARD_SUPPORTED_FORMAT_COUNT);
    for (const format of FILE_WIZARD_FORMATS) {
      const schema = fileWizardSchema(format);
      expect(schema).toBeTruthy();
      expect(resolveFileWizardSchema(schema!, schema!).type).toBe("object");
      if (format.startsWith("pgo_")) {
        const keys = Object.keys(schema?.properties ?? {});
        expect(keys).not.toEqual(
          expect.arrayContaining([
            "object_id",
            "object_type",
            "schema_version",
            "data",
          ]),
        );
      }
    }
  });

  it("tracks required completion while preserving scalar, choice, and array values", () => {
    const schema = fileWizardSchema("pgo_form")!;
    expect(isWizardValueComplete({}, schema, schema)).toBe(false);
    expect(
      isWizardValueComplete(
        { form_shape: { fields: [] }, fields: [] },
        schema,
        schema,
      ),
    ).toBe(true);
    expect(
      isWizardValueComplete(
        {
          form_shape: { fields: [] },
          fields: [
            { key: "score", value: 4.5 },
            { key: "approved", value: true },
            { key: "tags", value: ["one", "two"] },
          ],
        },
        schema,
        schema,
      ),
    ).toBe(true);

    const fieldSchema = schema.properties?.form_shape?.properties?.fields?.items;
    expect(fieldSchema).toBeTruthy();
    expect(
      isWizardValueComplete(
        { key: "choice", label: "Choice", type: "enum", required: true },
        fieldSchema!,
        schema,
      ),
    ).toBe(false);
    expect(
      isWizardValueComplete(
        { key: "name", label: "Name", type: "text", required: true },
        fieldSchema!,
        schema,
      ),
    ).toBe(true);
    expect(
      isWizardValueComplete(
        {
          key: "name",
          label: "Name",
          type: "text",
          required: true,
          options: [{ value: "wrong", label: "Wrong" }],
        },
        fieldSchema!,
        schema,
      ),
    ).toBe(false);
  });

  it("navigates into nested arrays and can add and remove an item", () => {
    render(
      <FileJsonWizard
        open
        fileType="pgo_sequence_reads"
        initialJson=""
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /0 item\(s\)/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByText("Item 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove item 1" }));
    expect(screen.queryByText("Item 1")).toBeNull();
    expect(screen.getByText("No items yet.")).toBeTruthy();
  });

  it("keeps same-container choices distinct so an answer array can contain numbers", async () => {
    render(
      <FileJsonWizard
        open
        fileType="pgo_form"
        initialJson=""
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /0 item\(s\)/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));

    fireEvent.click(screen.getByRole("combobox", { name: "Value value type" }));
    fireEvent.click(await screen.findByRole("option", { name: "String list" }));
    fireEvent.click(screen.getByRole("button", { name: /0 item\(s\)/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Value type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Number 2" }));

    const numberInput = screen.getByRole("spinbutton");
    fireEvent.change(numberInput, { target: { value: "4.5" } });
    expect((numberInput as HTMLInputElement).value).toBe("4.5");
  });

  it("requires and reveals form options only for enum field types", async () => {
    render(
      <FileJsonWizard
        open
        fileType="pgo_form"
        initialJson=""
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Section complete" }));
    fireEvent.click(screen.getByRole("button", { name: /0 item\(s\)/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));

    expect(screen.queryByText("Options *")).toBeNull();
    fireEvent.click(screen.getByLabelText(/Type \*/));
    fireEvent.click(await screen.findByRole("option", { name: "enum" }));
    expect(screen.getByText("Options *")).toBeTruthy();
    expect(
      screen.getByLabelText(/required fields complete/).getAttribute("aria-label"),
    ).toMatch(/of 5 required fields/);

    fireEvent.click(screen.getByLabelText(/Type \*/));
    fireEvent.click(await screen.findByRole("option", { name: "text" }));
    expect(screen.queryByText("Options *")).toBeNull();
  });

  it("validates with the SDK and fills the textarea callback without persisting", async () => {
    const onSave = jest.fn();
    const onOpenChange = jest.fn();
    sdkFetchMock.mockImplementation(async (path, init) => {
      expect(path).toBe("/file-storage/validate");
      expect(init?.method).toBe("POST");
      const payload = JSON.parse(String(init?.body));
      expect(payload.fileType).toBe("pgo_pdf_report");
      expect(JSON.parse(payload.fileContent)).toEqual({
        title: "Final report",
        download_url: "https://example.org/final.pdf",
      });
      return {
        valid: true,
        fileType: "pgo_pdf_report",
        fileContent: payload.fileContent,
      };
    });

    render(
      <FileJsonWizard
        open
        fileType="pgo_pdf_report"
        initialJson=""
        onOpenChange={onOpenChange}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Title \*/), {
      target: { value: "Final report" },
    });
    fireEvent.change(screen.getByLabelText(/Download Url \*/), {
      target: { value: "https://example.org/final.pdf" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Validate and use JSON" }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(JSON.parse(onSave.mock.calls[0][0])).toEqual({
      title: "Final report",
      download_url: "https://example.org/final.pdf",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(sdkFetchMock).toHaveBeenCalledTimes(1);
    expect(
      sdkFetchMock.mock.calls.some(
        ([path]) => String(path) === "/file-storage",
      ),
    ).toBe(false);
  });
});
