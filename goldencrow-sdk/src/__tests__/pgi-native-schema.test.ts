import { readFileSync } from "node:fs";
import path from "node:path";
import { PGI_NATIVE_SCHEMAS } from "../contracts/pgi-native-schemas.generated.js";
import {
  identifyPgiNativeModel,
  SUPPORTED_PGI_NATIVE_MODELS,
} from "../lib/pgi-native-schema.js";

type JsonSchema = Record<string, unknown>;

function record(value: unknown) {
  return value as Record<string, unknown>;
}

function minimumValue(
  rawSchema: unknown,
  document: JsonSchema,
  resolving = new Set<string>(),
): unknown {
  const schema = record(rawSchema);
  if (typeof schema.$ref === "string") {
    const reference = schema.$ref;
    const definitionName = reference.match(/^#\/\$defs\/(.+)$/)?.[1];
    if (!definitionName || resolving.has(reference)) {
      throw new Error(`Cannot synthesize schema reference ${reference}.`);
    }
    const definitions = record(document.$defs);
    const definition = definitions[definitionName];
    if (!definition) {
      throw new Error(`Missing schema definition ${definitionName}.`);
    }
    return minimumValue(
      definition,
      document,
      new Set([...resolving, reference]),
    );
  }
  if (Array.isArray(schema.anyOf)) {
    const nonNull = schema.anyOf.find(
      (candidate) => record(candidate).type !== "null",
    );
    return minimumValue(nonNull ?? schema.anyOf[0], document, resolving);
  }
  if ("const" in schema) {
    return schema.const;
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum[0];
  }
  switch (schema.type) {
    case "object": {
      const properties = record(schema.properties);
      return Object.fromEntries(
        ((schema.required as string[] | undefined) ?? []).map((key) => [
          key,
          minimumValue(properties[key], document, resolving),
        ]),
      );
    }
    case "array":
      return [];
    case "string":
      return "fixture";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      throw new Error(`Cannot synthesize schema type ${String(schema.type)}.`);
  }
}

describe("native PGI schema identification", () => {
  it("embeds the exact three authoritative protocol schemas", () => {
    expect(SUPPORTED_PGI_NATIVE_MODELS).toEqual(["mdm", "ag", "2pq"]);

    const sourceDirectory = path.resolve(
      __dirname,
      "../../../Pocket-Genes-Catalog-Wiki/schemas/protocol",
    );
    const fileByModel = {
      mdm: "pgi1-mdm.schema.json",
      ag: "pgi2-ag.schema.json",
      "2pq": "pgi3-2pq.schema.json",
    } as const;

    for (const model of SUPPORTED_PGI_NATIVE_MODELS) {
      const source = JSON.parse(
        readFileSync(path.join(sourceDirectory, fileByModel[model]), "utf8"),
      ) as JsonSchema;
      delete source.$id;
      delete source.$schema;
      expect(PGI_NATIVE_SCHEMAS[model]).toEqual(source);
    }
  });

  it("recognizes the checked-in native MDM demo from content alone", () => {
    const demo = JSON.parse(
      readFileSync(
        path.resolve(
          __dirname,
          "../../../Pocket-Genes-Catalog-Wiki/payloads/demo-mdm.pgi1.json",
        ),
        "utf8",
      ),
    );

    expect(identifyPgiNativeModel(demo)).toEqual({ ok: true, model: "mdm" });
  });

  it.each(SUPPORTED_PGI_NATIVE_MODELS)(
    "identifies minimum valid %s content as exactly one model",
    (model) => {
      const schema = PGI_NATIVE_SCHEMAS[model] as JsonSchema;
      const content = minimumValue(schema, schema);
      expect(identifyPgiNativeModel(content)).toEqual({ ok: true, model });
    },
  );

  it("returns a specific unsupported-model error with per-model diagnostics", () => {
    const result = identifyPgiNativeModel({
      download_url: "https://example.com/report.pgi1.json",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "unsupported_pgi_native_model",
      matches: [],
    });
    if (result.ok) {
      throw new Error("Expected unsupported PGI content.");
    }
    expect(result.message).toContain("does not match any supported native model");
    expect(Object.keys(result.validationErrors).sort()).toEqual([
      "2pq",
      "ag",
      "mdm",
    ]);
    expect(result.validationErrors.mdm?.[0]).toContain(
      "is missing required field",
    );
  });

  it("does not infer a native model from a URL-looking field or suffix", () => {
    const pgi1LookingRegistration = {
      title: "Interactive report",
      download_url: "https://example.com/download?name=report.pgi1.json",
    };
    expect(identifyPgiNativeModel(pgi1LookingRegistration)).toMatchObject({
      ok: false,
      code: "unsupported_pgi_native_model",
    });
  });
});
