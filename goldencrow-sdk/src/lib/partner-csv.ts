import {
  PartnerInputSchema,
  type PartnerInput,
} from "../contracts/connected-partners.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";

export const PARTNER_CSV_MAX_BYTES = 256 * 1024;
export const PARTNER_CSV_MAX_ROWS = 200;
export const PARTNER_CSV_REQUIRED_COLUMNS = [
  "companyName",
  "firstName",
  "lastName",
  "email",
] as const;
export const PARTNER_CSV_OPTIONAL_COLUMNS = [
  "phoneNumber",
  "meetingDate",
  "notes",
  "linkedOrganizationId",
  "linkedIndividualPublisherId",
  "linkedAppId",
] as const;

export type PartnerCsvRow = {
  rowNumber: number;
  input: PartnerInput | null;
  status: "ready" | "duplicate" | "invalid";
  errors: string[];
  duplicateReason?: string;
};
export type PartnerCsvPreview = {
  rows: PartnerCsvRow[];
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
};

function csvError(message: string): never {
  throw new AdminRepositoryError(message, 400);
}

function delimiterFor(text: string) {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  let content = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        content = true;
        index++;
      } else quoted = !quoted;
    } else if (!quoted) {
      if (character === "\n" || character === "\r") {
        if (content) break;
        commas = 0;
        semicolons = 0;
      } else if (character === ",") commas++;
      else if (character === ";") semicolons++;
      else if (character.trim()) content = true;
    } else if (character.trim()) content = true;
  }
  return semicolons > commas ? ";" : ",";
}

function readRecords(text: string) {
  const delimiter = delimiterFor(text);
  const records: Array<{ rowNumber: number; cells: string[] }> = [];
  let cells: string[] = [];
  let value = "";
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  let line = 1;
  let rowNumber = 1;
  function finishCell() {
    cells.push(value);
    value = "";
    state = "start";
  }
  function finishRecord() {
    finishCell();
    if (cells.some((cell) => cell.trim())) records.push({ rowNumber, cells });
    cells = [];
  }
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (state === "quoted") {
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index++;
        } else state = "closed";
      } else {
        value += character;
        if (character === "\r") {
          if (text[index + 1] === "\n") {
            value += "\n";
            index++;
          }
          line++;
        } else if (character === "\n") line++;
      }
      continue;
    }
    if (character === delimiter) {
      finishCell();
      continue;
    }
    if (character === "\r" || character === "\n") {
      finishRecord();
      if (character === "\r" && text[index + 1] === "\n") index++;
      line++;
      rowNumber = line;
      continue;
    }
    if (state === "closed") {
      if (character === " " || character === "\t") continue;
      csvError(`Line ${line}: unexpected text after a closing quote.`);
    }
    if (character === '"') {
      if (state !== "start")
        csvError(`Line ${line}: quote must start a CSV field.`);
      state = "quoted";
    } else {
      value += character;
      state = "plain";
    }
  }
  if (state === "quoted") csvError(`Line ${rowNumber}: unclosed quoted field.`);
  if (value || cells.length || state !== "start") finishRecord();
  return records;
}

export function parsePartnerCsv(csv: string): PartnerCsvPreview {
  if (Buffer.byteLength(csv, "utf8") > PARTNER_CSV_MAX_BYTES) {
    csvError("CSV file exceeds the 256 KiB limit.");
  }
  if (csv.includes("\0")) {
    csvError("Use a valid UTF-8 CSV file without null bytes.");
  }
  const records = readRecords(csv.replace(/^\uFEFF/, ""));
  const header = records.shift();
  if (!header)
    csvError("CSV file is empty. Include the header and at least one partner.");
  const columns = header.cells.map((cell) => cell.trim());
  const allowed = new Set<string>([
    ...PARTNER_CSV_REQUIRED_COLUMNS,
    ...PARTNER_CSV_OPTIONAL_COLUMNS,
  ]);
  if (columns.some((column) => !column))
    csvError("CSV headers cannot be blank.");
  if (new Set(columns).size !== columns.length)
    csvError("CSV headers must not contain duplicate columns.");
  const unknown = columns.filter((column) => !allowed.has(column));
  if (unknown.length)
    csvError(
      `Unknown CSV columns: ${unknown.join(", ")}. Use the exact template headers.`,
    );
  const missing = PARTNER_CSV_REQUIRED_COLUMNS.filter(
    (column) => !columns.includes(column),
  );
  if (missing.length)
    csvError(`Missing required CSV columns: ${missing.join(", ")}.`);
  if (!records.length) csvError("CSV file has no partner rows.");
  if (records.length > PARTNER_CSV_MAX_ROWS)
    csvError("CSV file exceeds the 200 partner row limit.");
  const rows = records.map(({ rowNumber, cells }): PartnerCsvRow => {
    if (cells.length !== columns.length)
      return {
        rowNumber,
        input: null,
        status: "invalid",
        errors: [
          `Expected ${columns.length} cells but found ${cells.length}. Quote values containing the separator.`,
        ],
      };
    const raw = Object.fromEntries(
      columns.map((column, index) => [column, cells[index]!.trim()]),
    );
    for (const key of [
      "meetingDate",
      "notes",
      "linkedOrganizationId",
      "linkedIndividualPublisherId",
      "linkedAppId",
    ]) {
      if (raw[key] === "") (raw as Record<string, unknown>)[key] = null;
    }
    const parsed = PartnerInputSchema.safeParse(raw);
    if (!parsed.success)
      return {
        rowNumber,
        input: null,
        status: "invalid",
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        ),
      };
    return { rowNumber, input: parsed.data, status: "ready", errors: [] };
  });
  return summarizePartnerCsv(rows);
}

export function summarizePartnerCsv(rows: PartnerCsvRow[]): PartnerCsvPreview {
  return {
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter((row) => row.status === "ready").length,
      duplicates: rows.filter((row) => row.status === "duplicate").length,
      invalid: rows.filter((row) => row.status === "invalid").length,
    },
  };
}
