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

const validators = new Map<string, ValidateFunction>(
  Object.entries(PGO_OBJECT_SCHEMAS).map(([objectType, schema]) => [
    objectType,
    ajv.compile(schema),
  ]),
);

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

export function serializedPgoObjectSchemaError(
  objectType: string,
  value: unknown,
) {
  const validator = validators.get(objectType);
  if (!validator) {
    return `no runtime schema is registered for ${objectType}`;
  }
  if (validator(value)) {
    return null;
  }
  const firstError = validator.errors?.[0];
  return firstError
    ? validationErrorMessage(firstError)
    : `content failed the ${objectType} schema`;
}

export const SUPPORTED_PGO_OBJECT_SCHEMA_TYPES = Object.freeze(
  [...validators.keys()].sort(),
);
