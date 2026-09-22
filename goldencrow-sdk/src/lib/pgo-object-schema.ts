import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { PGO_OBJECT_SCHEMAS } from "../contracts/pgo-object-schemas.generated.js";

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
  strictRequired: false,
  strictTypes: false,
  validateFormats: true,
});
const addFormats = addFormatsImport as unknown as (
  instance: Ajv2020,
) => Ajv2020;
addFormats(ajv);

// Catalog schemas retain this display-only annotation so consumers can render
// stored enum values without maintaining a second, drifting label table.
ajv.addKeyword({
  keyword: "x-enum-labels",
  schemaType: "array",
  valid: true,
});

const validators = new Map<string, ValidateFunction>(
  Object.entries(PGO_OBJECT_SCHEMAS).map(([objectType, schema]) => [
    objectType,
    ajv.compile(schema),
  ]),
);

const ISO_COUNTRY_CODES = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  ),
);

type JsonRecord = Record<string, unknown>;

function record(value: unknown) {
  return value as JsonRecord;
}

function validationErrorMessage(error: ErrorObject) {
  const location = error.instancePath || "/";
  if (error.keyword === "required") {
    const missingProperty = String(error.params.missingProperty ?? "field");
    return `${location} is missing required field ${missingProperty}`;
  }
  if (error.keyword === "additionalProperties") {
    const additionalProperty = String(
      error.params.additionalProperty ?? "field",
    );
    return `${location} contains unsupported field ${additionalProperty}`;
  }
  return `${location} ${error.message ?? `failed ${error.keyword} validation`}`;
}

function isValidDateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidDateTime(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/,
  );
  return (
    Boolean(match) &&
    isValidDateOnly(match?.[1]) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isValidHttpsUrl(value: unknown) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.includes("\\") ||
    !/^https:\/\/[^/?#\\\s]+(?:[/?#]|$)/i.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function formAnswerError(field: JsonRecord, value: unknown) {
  const key = String(field.key);
  const type = String(field.type);
  const required = field.required === true;
  const options = Array.isArray(field.options)
    ? field.options.map((option) => String(record(option).value))
    : [];
  const optionValues = new Set(options);
  const nonBlankString =
    typeof value === "string" && value.trim().length > 0;
  const invalid = () => `form answer ${key} is invalid for type ${type}`;

  switch (type) {
    case "text":
    case "long_text":
    case "address":
      return nonBlankString ? null : invalid();
    case "email":
      return typeof value === "string" &&
        /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(
          value,
        )
        ? null
        : invalid();
    case "phone":
      return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value)
        ? null
        : invalid();
    case "url":
      return isValidHttpsUrl(value) ? null : invalid();
    case "postal_code":
      return typeof value === "string" &&
        /^[A-Z0-9](?:[A-Z0-9 -]{0,10}[A-Z0-9])?$/i.test(value)
        ? null
        : invalid();
    case "country_code":
      return typeof value === "string" && ISO_COUNTRY_CODES.has(value)
        ? null
        : invalid();
    case "identifier":
      return typeof value === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
        ? null
        : invalid();
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : invalid();
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
        ? null
        : invalid();
    case "positive_integer":
      return typeof value === "number" &&
        Number.isInteger(value) &&
        value > 0
        ? null
        : invalid();
    case "percentage":
      return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100
        ? null
        : invalid();
    case "boolean":
      return typeof value === "boolean" ? null : invalid();
    case "date":
      return isValidDateOnly(value) ? null : invalid();
    case "datetime":
      return isValidDateTime(value) ? null : invalid();
    case "time":
      return typeof value === "string" &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
        ? null
        : invalid();
    case "enum":
      return typeof value === "string" && optionValues.has(value)
        ? null
        : invalid();
    case "multi_enum": {
      if (
        !Array.isArray(value) ||
        (required && value.length === 0) ||
        !value.every(
          (item): item is string =>
            typeof item === "string" && optionValues.has(item),
        ) ||
        new Set(value).size !== value.length
      ) {
        return invalid();
      }
      const selected = new Set(value);
      return value.every(
        (item, index) =>
          item === options.filter((option) => selected.has(option))[index],
      )
        ? null
        : invalid();
    }
    case "string_list":
      return Array.isArray(value) &&
        (!required || value.length > 0) &&
        value.every(
          (item) => typeof item === "string" && item.trim().length > 0,
        )
        ? null
        : invalid();
    case "integer_list":
      return Array.isArray(value) &&
        (!required || value.length > 0) &&
        value.every(
          (item) => typeof item === "number" && Number.isInteger(item),
        )
        ? null
        : invalid();
    case "number_list":
      return Array.isArray(value) &&
        (!required || value.length > 0) &&
        value.every(
          (item) => typeof item === "number" && Number.isFinite(item),
        )
        ? null
        : invalid();
    default:
      return `form field ${key} uses unsupported type ${type}`;
  }
}

function formContentError(value: unknown) {
  const content = record(value);
  const definitions = record(content.form_shape).fields as unknown[];
  const answers = content.fields as unknown[];
  const fieldsByKey = new Map<string, JsonRecord>();

  for (const item of definitions) {
    const field = record(item);
    const key = String(field.key);
    if (fieldsByKey.has(key)) {
      return `form_shape contains duplicate field key ${key}`;
    }
    fieldsByKey.set(key, field);

    if (Array.isArray(field.options)) {
      const optionValues = field.options.map((option) =>
        String(record(option).value),
      );
      if (new Set(optionValues).size !== optionValues.length) {
        return `form field ${key} contains duplicate option values`;
      }
    }
  }

  const answeredKeys = new Set<string>();
  for (const item of answers) {
    const answer = record(item);
    const key = String(answer.key);
    if (answeredKeys.has(key)) {
      return `form contains duplicate answer key ${key}`;
    }
    answeredKeys.add(key);

    const field = fieldsByKey.get(key);
    if (!field) {
      return `form answer ${key} is not declared by form_shape`;
    }
    const answerError = formAnswerError(field, answer.value);
    if (answerError) {
      return answerError;
    }
  }

  for (const [key, field] of fieldsByKey) {
    if (field.required === true && !answeredKeys.has(key)) {
      return `form is missing required answer ${key}`;
    }
  }
  return null;
}

function duplicateComponentKeyError(value: unknown, collectionKey: string) {
  const components = record(value)[collectionKey] as unknown[];
  const keys = new Set<string>();
  for (const item of components) {
    const key = String(record(item).key);
    if (keys.has(key)) {
      return `${collectionKey} contains duplicate component key ${key}`;
    }
    keys.add(key);
  }
  return null;
}

function semanticPgoObjectSchemaError(objectType: string, value: unknown) {
  if (objectType === "pgo_form") {
    return formContentError(value);
  }
  if (objectType === "pgo_sequence_reads") {
    return duplicateComponentKeyError(value, "reads");
  }
  if (objectType === "pgo_image_bundle") {
    return duplicateComponentKeyError(value, "images");
  }
  return null;
}

export function serializedPgoObjectSchemaError(
  objectType: string,
  value: unknown,
) {
  const validator = validators.get(objectType);
  if (!validator) {
    return `no runtime schema is registered for ${objectType}`;
  }
  if (!validator(value)) {
    const firstError = validator.errors?.[0];
    return firstError
      ? validationErrorMessage(firstError)
      : `content failed the ${objectType} schema`;
  }
  return semanticPgoObjectSchemaError(objectType, value);
}

export const SUPPORTED_PGO_OBJECT_SCHEMA_TYPES = Object.freeze(
  [...validators.keys()].sort(),
);
