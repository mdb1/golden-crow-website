import type { PartnerInput } from "@/lib/connected-partners";

export const PARTNER_CSV_MAX_BYTES = 256 * 1024;
export const PARTNER_CSV_MAX_ROWS = 200;

export const PARTNER_CSV_COLUMNS = [
  {
    key: "companyName",
    required: true,
    rule: "Required. Company or partner name, up to 180 characters.",
  },
  {
    key: "firstName",
    required: false,
    rule: "Optional. Contact first name, up to 140 characters. Leave blank when unknown.",
  },
  {
    key: "lastName",
    required: false,
    rule: "Optional. Contact last name, up to 140 characters. Leave blank when unknown.",
  },
  {
    key: "email",
    required: true,
    rule: "Required. A valid contact email, up to 254 characters. Converted to lowercase.",
  },
  {
    key: "phoneNumber",
    required: false,
    rule: "Optional. Up to 50 characters. Leave blank when unknown.",
  },
  {
    key: "meetingDate",
    required: false,
    rule: "Optional. A real date in YYYY-MM-DD format, for example 2026-11-18. Leave blank when unscheduled.",
  },
  {
    key: "notes",
    required: false,
    rule: "Optional. Up to 10,000 characters. Quote text containing commas, semicolons, or line breaks.",
  },
  {
    key: "linkedOrganizationId",
    required: false,
    rule: "Optional. The document ID of an existing organization. Names and email addresses are not IDs.",
  },
  {
    key: "linkedIndividualPublisherId",
    required: false,
    rule: "Optional. The document ID of an existing individual publisher. It can be used together with an organization ID.",
  },
  {
    key: "linkedAppId",
    required: false,
    rule: "Optional. An existing app document ID or its unique public app identifier. Its publisher is linked automatically.",
  },
] as const;

export const PARTNER_CSV_TEMPLATE = `${PARTNER_CSV_COLUMNS.map((column) => column.key).join(",")}\r\nGenome Studio,Ada,Rivera,ada@example.com,,2026-11-18,"Interested in an app, follow up next week.",,,\r\n`;

export type PartnerCsvPreviewRow = {
  rowNumber: number;
  input: PartnerInput | null;
  status: "ready" | "duplicate" | "invalid";
  errors: string[];
  duplicateReason?: string;
};
export type PartnerCsvPreview = {
  rows: PartnerCsvPreviewRow[];
  summary: {
    total: number;
    ready: number;
    duplicates: number;
    invalid: number;
  };
};
export type PartnerCsvImportResult = {
  importedCount: number;
  skippedCount: number;
  partnerIds: string[];
  invalidRows?: Array<{ rowNumber: number; errors: string[] }>;
};

export const PARTNER_CSV_RULES = [
  "Save a .csv file using UTF-8 encoding. Comma and semicolon separators are supported; use one separator consistently.",
  "In Excel or Google Sheets, keep phone numbers and IDs as text and export CSV. Excel workbooks (.xlsx) cannot be uploaded.",
  "Replace the example row in the template with your real partners before uploading.",
  "The first non-empty row must contain column headers. Header spelling and capitalization are case-sensitive. Surrounding whitespace is ignored. Columns may appear in any order.",
  "Include companyName and email. First and last names are optional; leave them blank when unknown. Optional columns may be omitted. Unknown or repeated headers are rejected.",
  "Use one partner per row. The maximum is 200 partner rows and 256 KiB per file. Completely empty rows are ignored.",
  "Values are trimmed around their edges. Emails are converted to lowercase. Blank phone numbers remain empty; blank dates, notes, and link IDs become empty optional values.",
  'Put fields containing a separator or a line break inside double quotes. Write a double quote inside a quoted field as two double quotes, for example "He said ""Hello"".".',
  "Organization and individual publisher IDs must already exist. You can link either publisher type, both, or neither. Importing never creates or changes publishers or apps.",
  "To find an ID, open a partner's Connections step and browse publishers or apps. Each result shows its ID below its name.",
  "An app ID can be its document ID or unique public app identifier. The app's own publisher is linked automatically. A supplied publisher of the same type must match the app's owner; the other publisher link is kept.",
  "Email identifies duplicates for imports. The first valid occurrence in the file is considered; later valid occurrences and partners whose email already exists are skipped. Existing partners are never overwritten.",
  "Every row is validated, including duplicates. Confirm to import valid rows; invalid rows are skipped and listed in the result. Correct them and upload the file again. No partner is created before confirmation.",
  "Error row numbers refer to the starting line in your CSV, including the header and any line breaks inside quoted cells.",
  "The import validates the file again before saving. If a response is interrupted, retry the same import to confirm its result safely without creating another copy.",
] as const;

export function partnerCsvRulesText(t: (text: string) => string) {
  return [
    t("Partner CSV import rules"),
    "",
    ...PARTNER_CSV_RULES.map((rule, index) => `${index + 1}. ${t(rule)}`),
    "",
    t("Columns"),
    ...PARTNER_CSV_COLUMNS.map((column) => `${column.key}: ${t(column.rule)}`),
    "",
    t("Example CSV"),
    PARTNER_CSV_TEMPLATE,
  ].join("\n");
}

export async function readPartnerCsvFile(file: File): Promise<string> {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Choose a file with the .csv extension.");
  }
  if (file.size > PARTNER_CSV_MAX_BYTES) {
    throw new Error("CSV file exceeds the 256 KiB limit.");
  }
  const buffer =
    typeof file.arrayBuffer === "function"
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            reader.result instanceof ArrayBuffer
              ? resolve(reader.result)
              : reject(new Error("Could not read this CSV file."));
          reader.onerror = () =>
            reject(new Error("Could not read this CSV file."));
          reader.readAsArrayBuffer(file);
        });
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error(
      "This file is not valid UTF-8. Save it as UTF-8 CSV and try again.",
    );
  }
}

export function downloadPartnerCsvText(
  content: string,
  fileName: string,
  type: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
