import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import { PGI_NATIVE_SCHEMAS } from "../contracts/pgi-native-schemas.generated.js";

export const SUPPORTED_PGI_NATIVE_MODELS = ["mdm", "ag", "2pq"] as const;

export type PgiNativeModel = (typeof SUPPORTED_PGI_NATIVE_MODELS)[number];

export type PgiNativeModelIdentification =
  | {
      ok: true;
      model: PgiNativeModel;
    }
  | {
      ok: false;
      code: "unsupported_pgi_native_model" | "ambiguous_pgi_native_model";
      message: string;
      matches: PgiNativeModel[];
      validationErrors: Partial<Record<PgiNativeModel, string[]>>;
    };

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
  strictRequired: false,
  strictTypes: false,
});

const validators = new Map<PgiNativeModel, ValidateFunction>(
  SUPPORTED_PGI_NATIVE_MODELS.map((model) => [
    model,
    ajv.compile(PGI_NATIVE_SCHEMAS[model]),
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

/**
 * Identifies native interactive-report JSON from its content, never its URL.
 * Exactly one of the authoritative MDM, AG, or 2PQ contracts must validate.
 */
export function identifyPgiNativeModel(
  value: unknown,
): PgiNativeModelIdentification {
  const matches: PgiNativeModel[] = [];
  const validationErrors: Partial<Record<PgiNativeModel, string[]>> = {};

  for (const model of SUPPORTED_PGI_NATIVE_MODELS) {
    const validator = validators.get(model);
    if (!validator) {
      throw new Error(`Missing embedded PGI native schema for ${model}.`);
    }
    if (validator(value)) {
      matches.push(model);
      continue;
    }
    validationErrors[model] = (validator.errors ?? []).map(
      validationErrorMessage,
    );
  }

  if (matches.length === 1) {
    return { ok: true, model: matches[0] as PgiNativeModel };
  }
  if (matches.length === 0) {
    return {
      ok: false,
      code: "unsupported_pgi_native_model",
      message:
        "Interactive report content does not match any supported native model (mdm, ag, or 2pq).",
      matches,
      validationErrors,
    };
  }
  return {
    ok: false,
    code: "ambiguous_pgi_native_model",
    message: `Interactive report content ambiguously matches multiple native models: ${matches.join(", ")}.`,
    matches,
    validationErrors,
  };
}
