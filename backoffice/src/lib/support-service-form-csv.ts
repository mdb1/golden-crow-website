import {
  SUPPORT_SERVICE_FORM_FIELD_TYPES,
  type SupportServiceFormField,
  type SupportServiceFormFieldOption,
  type SupportServiceFormFieldType,
} from "@/lib/support-services";

export const SUPPORT_SERVICE_FORM_CSV_HEADERS = [
  "key",
  "label",
  "type",
  "required",
  "helpInfoText",
  "options",
] as const;

export const SUPPORT_SERVICE_FORM_CSV_HEADER =
  SUPPORT_SERVICE_FORM_CSV_HEADERS.join(",");
export const SUPPORT_SERVICE_FORM_CSV_MAX_BYTES = 512 * 1024;
export const TWO_PQ_STUDY_REQUEST_FORM_CSV_PATH =
  "/templates/formulario-solicitud-estudio-2pq.csv";

const FORM_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const FORM_FIELD_OPTION_VALUE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FORM_FIELD_TYPE_SET = new Set<string>(
  SUPPORT_SERVICE_FORM_FIELD_TYPES.map((option) => option.value),
);

type CsvRecord = {
  row: number;
  cells: string[];
};

export class SupportServiceFormCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportServiceFormCsvError";
  }
}

function csvError(message: string): never {
  throw new SupportServiceFormCsvError(message);
}

function utf8ByteLength(value: string) {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
}

function parseCsvRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  const source = text.replace(/^\uFEFF/, "");
  let cells: string[] = [];
  let value = "";
  let inQuotes = false;
  let afterClosingQuote = false;
  let rowNumber = 1;
  let recordStartRow = 1;

  function pushCell() {
    cells.push(value.trim());
    value = "";
    afterClosingQuote = false;
  }

  function pushRecord() {
    pushCell();
    if (cells.some((cell) => cell.length > 0)) {
      records.push({ row: recordStartRow, cells });
    }
    cells = [];
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
        afterClosingQuote = true;
      } else {
        value += char;
        if (char === "\n") {
          rowNumber += 1;
        } else if (char === "\r" && nextChar !== "\n") {
          rowNumber += 1;
        }
      }
      continue;
    }

    if (afterClosingQuote) {
      if (char === ",") {
        pushCell();
        continue;
      }
      if (char === "\n" || char === "\r") {
        if (char === "\r" && nextChar === "\n") {
          index += 1;
        }
        pushRecord();
        rowNumber += 1;
        recordStartRow = rowNumber;
        continue;
      }
      csvError(
        `CSV row ${recordStartRow} contains a character after a closing quote.`,
      );
    }

    if (char === '"') {
      if (value.length > 0) {
        csvError(`CSV row ${recordStartRow} contains an unescaped quote.`);
      }
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      pushCell();
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      pushRecord();
      rowNumber += 1;
      recordStartRow = rowNumber;
      continue;
    }
    value += char;
  }

  if (inQuotes) {
    csvError(`CSV row ${recordStartRow} contains an unclosed quoted cell.`);
  }
  if (value.length > 0 || cells.length > 0 || afterClosingQuote) {
    pushRecord();
  }

  return records;
}

function normalizedOptions(
  fieldKey: string,
  options: SupportServiceFormFieldOption[] | undefined,
) {
  if (!options) {
    return undefined;
  }
  if (options.length === 0) {
    throw new Error(`Field ${fieldKey} needs enum options.`);
  }
  if (options.length > 100) {
    throw new Error(
      `Form field ${fieldKey} cannot declare more than 100 options.`,
    );
  }

  const optionValues = new Set<string>();
  return options.map((option) => {
    const value = option.value.trim();
    const label = option.label.trim();
    if (!value || !label) {
      throw new Error(
        `Form field ${fieldKey} options need a nonempty value and label.`,
      );
    }
    if (!FORM_FIELD_OPTION_VALUE_PATTERN.test(value)) {
      throw new Error(
        `Form field ${fieldKey} option values may use only letters, numbers, dots, underscores, colons, or hyphens and contain at most 128 characters.`,
      );
    }
    if (label.length > 120) {
      throw new Error(
        `Form field ${fieldKey} option labels cannot exceed 120 characters.`,
      );
    }
    if (optionValues.has(value)) {
      throw new Error(
        `Form field ${fieldKey} has duplicate option value ${value}.`,
      );
    }
    optionValues.add(value);
    return { value, label };
  });
}

export function normalizeSupportServiceFormField(
  field: SupportServiceFormField,
  existingKeys: ReadonlySet<string> = new Set<string>(),
): SupportServiceFormField {
  const key = field.key.trim();
  const label = field.label.trim();
  if (!FORM_FIELD_KEY_PATTERN.test(key)) {
    throw new Error(
      "Form field keys must start with a lowercase letter, use only lowercase letters, numbers, or underscores, and contain at most 64 characters.",
    );
  }
  if (existingKeys.has(key)) {
    throw new Error(`Duplicate form field key: ${key}.`);
  }
  if (!label) {
    throw new Error(`Form field ${key} needs a label.`);
  }
  if (label.length > 120) {
    throw new Error(`Form field ${key} label cannot exceed 120 characters.`);
  }
  if (!FORM_FIELD_TYPE_SET.has(field.type)) {
    throw new Error(`Form field ${key} has an unsupported type.`);
  }

  const helpInfoText = field.helpInfoText?.trim();
  if (helpInfoText && helpInfoText.length > 500) {
    throw new Error(
      `Form field ${key} help info cannot exceed 500 characters.`,
    );
  }

  const isEnum = field.type === "enum" || field.type === "multi_enum";
  if (isEnum && !field.options) {
    throw new Error(`Field ${key} needs enum options.`);
  }
  if (!isEnum && field.options !== undefined) {
    throw new Error(`Only enum fields may declare options (${key}).`);
  }

  return {
    key,
    label,
    type: field.type,
    required: field.required,
    helpInfoText: helpInfoText || undefined,
    options: normalizedOptions(key, field.options),
  };
}

function parseCsvOptions(
  rawOptions: string,
  fieldType: SupportServiceFormFieldType,
  row: number,
): SupportServiceFormFieldOption[] | undefined {
  const usesOptions = fieldType === "enum" || fieldType === "multi_enum";
  if (!usesOptions) {
    if (rawOptions) {
      csvError(
        `CSV row ${row}: options must be blank unless type is enum or multi_enum.`,
      );
    }
    return undefined;
  }
  if (!rawOptions) {
    csvError(`CSV row ${row}: enum and multi_enum fields require options.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOptions);
  } catch {
    csvError(`CSV row ${row}: options must be a valid JSON array.`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    csvError(`CSV row ${row}: options must be a nonempty JSON array.`);
  }

  return parsed.map((option, optionIndex) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) {
      return csvError(
        `CSV row ${row}: option ${optionIndex + 1} must be an object with value and label.`,
      );
    }
    const record = option as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== "label" ||
      keys[1] !== "value" ||
      typeof record.value !== "string" ||
      typeof record.label !== "string"
    ) {
      return csvError(
        `CSV row ${row}: option ${optionIndex + 1} must contain only string value and label fields.`,
      );
    }
    return { value: record.value, label: record.label };
  });
}

export function parseSupportServiceFormCsv(
  text: string,
): SupportServiceFormField[] {
  if (utf8ByteLength(text) > SUPPORT_SERVICE_FORM_CSV_MAX_BYTES) {
    csvError("CSV file exceeds the 512 KiB limit.");
  }

  const [header, ...records] = parseCsvRecords(text);
  if (!header) {
    csvError("CSV file is empty.");
  }
  if (
    header.cells.length !== SUPPORT_SERVICE_FORM_CSV_HEADERS.length ||
    header.cells.some(
      (cell, index) => cell !== SUPPORT_SERVICE_FORM_CSV_HEADERS[index],
    )
  ) {
    csvError(`CSV header must be exactly: ${SUPPORT_SERVICE_FORM_CSV_HEADER}`);
  }
  if (records.length === 0) {
    csvError("CSV must contain at least one form field row.");
  }

  const keys = new Set<string>();
  return records.map(({ row, cells }) => {
    if (cells.length !== SUPPORT_SERVICE_FORM_CSV_HEADERS.length) {
      csvError(
        `CSV row ${row} must contain exactly ${SUPPORT_SERVICE_FORM_CSV_HEADERS.length} columns.`,
      );
    }

    const [key, label, rawType, rawRequired, helpInfoText, rawOptions] =
      cells as [string, string, string, string, string, string];
    if (!FORM_FIELD_TYPE_SET.has(rawType)) {
      csvError(`CSV row ${row}: unsupported field type ${rawType || "(blank)"}.`);
    }
    if (rawRequired !== "true" && rawRequired !== "false") {
      csvError(`CSV row ${row}: required must be exactly true or false.`);
    }

    try {
      const type = rawType as SupportServiceFormFieldType;
      const field = normalizeSupportServiceFormField(
        {
          key,
          label,
          type,
          required: rawRequired === "true",
          helpInfoText: helpInfoText || undefined,
          options: parseCsvOptions(rawOptions, type, row),
        },
        keys,
      );
      keys.add(field.key);
      return field;
    } catch (error) {
      if (error instanceof SupportServiceFormCsvError) {
        throw error;
      }
      csvError(
        `CSV row ${row}: ${error instanceof Error ? error.message : "invalid form field."}`,
      );
    }
  });
}
