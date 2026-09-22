#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const catalogRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(catalogRoot);

const readJSON = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJSON = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const serviceFiles = fs.readdirSync(path.join(catalogRoot, "services"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => path.join(catalogRoot, "services", name));

const normalizedShape = (shape) => ({
  id: shape.id,
  version: shape.version,
  allow_unknown_fields: false,
  fields: shape.fields.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    options: (field.options ?? []).map((option) => ({
      value: option.value,
      label: option.label,
    })),
  })),
});

const shapes = new Map();
for (const filePath of serviceFiles) {
  const service = readJSON(filePath);
  if (service.formShape) {
    shapes.set(service.formShape.id, normalizedShape(service.formShape));
  }
}

const synchronizeNode = (node) => {
  if (Array.isArray(node)) {
    return node.map(synchronizeNode);
  }
  if (!node || typeof node !== "object") {
    return node;
  }

  const result = Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, synchronizeNode(value)]),
  );
  if (result.object_type === "pgo_form" && result.data) {
    const shape = shapes.get(result.data.form_shape_id);
    if (!shape) {
      throw new Error(`Missing catalog form shape ${result.data.form_shape_id}`);
    }
    result.data.form_shape = structuredClone(shape);
  }
  return result;
};

const walkFiles = (directory, extension) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(itemPath, extension);
    }
    return entry.isFile() && entry.name.endsWith(extension) ? [itemPath] : [];
  });

for (const filePath of walkFiles(catalogRoot, ".json")) {
  const original = readJSON(filePath);
  const synchronized = synchronizeNode(original);
  if (JSON.stringify(original) !== JSON.stringify(synchronized)) {
    writeJSON(filePath, synchronized);
  }
}

for (const relativePath of [
  "mydnamap-ios/mydnamap/Resources/PocketGenesServicesCatalog.json",
  "mydnamap-ios/mydnamap/Resources/PocketGenesProvidersCatalog.json",
]) {
  const filePath = path.join(repositoryRoot, relativePath);
  const original = readJSON(filePath);
  const synchronized = synchronizeNode(original);
  if (JSON.stringify(original) !== JSON.stringify(synchronized)) {
    writeJSON(filePath, synchronized);
  }
}

const objectCatalogPath = path.join(catalogRoot, "catalog/objects.json");
const objectCatalog = readJSON(objectCatalogPath);
const formObject = objectCatalog.objects.find((item) => item.id === "pgo_form");
const formSchema = readJSON(path.join(catalogRoot, "schemas/objects/pgo_form.schema.json"));
const formExample = readJSON(path.join(catalogRoot, "examples/objects/pgo_form.pgform.json"));

for (const filePath of walkFiles(path.join(catalogRoot, "schemas/protocol"), ".schema.json")) {
  const schema = readJSON(filePath);
  if (schema.$defs?.form_data) {
    schema.$defs.form_data = structuredClone(formSchema.properties.data);
    writeJSON(filePath, schema);
  }
}

formObject.description = "A completed service request whose immutable embedded shape preserves every field, label, type, choice and required rule needed to reconstruct it.";
formObject.properties = [
  {
    name: "form_shape_id",
    type: "string",
    required: true,
    description: "Identifier of the exact published form shape used for this submission.",
  },
  {
    name: "form_shape_version",
    type: "integer",
    required: true,
    description: "Positive integer version of the exact published form shape used for this submission.",
  },
  {
    name: "form_shape",
    type: "object",
    required: true,
    description: "Immutable, closed snapshot used to validate and reconstruct the form independently of the current offer.",
  },
  {
    name: "fields",
    type: "array<object>",
    required: true,
    description: "Typed submitted answers. Optional unanswered fields remain discoverable through form_shape.fields.",
  },
];
formObject.data_schema = formSchema.properties.data;
formObject.example_data = formExample.data;
formObject.example = formExample;
formObject.validation_rules = [
  "form_shape is required, immutable, and its id/version must equal form_shape_id/form_shape_version.",
  "Shape keys and answer keys are unique; undeclared answers and allow_unknown_fields true are invalid.",
  "Validate each answer against the embedded type, requiredness and exact enum options.",
  "requested_at and requested_by are required platform fields with datetime and text types respectively.",
  "The completed pgo_form is provider-owned, while created_by preserves the authenticated requester identity.",
];
writeJSON(objectCatalogPath, objectCatalog);

const updateMarkdownJSON = (filePath) => {
  const source = fs.readFileSync(filePath, "utf8");
  const updated = source.replace(/```json\n([\s\S]*?)\n```/g, (block, jsonText) => {
    try {
      const parsed = JSON.parse(jsonText);
      const synchronized = synchronizeNode(parsed);
      return `\`\`\`json\n${JSON.stringify(synchronized, null, 2)}\n\`\`\``;
    } catch {
      return block;
    }
  });
  fs.writeFileSync(filePath, updated);
};

for (const filePath of walkFiles(catalogRoot, ".md")) {
  updateMarkdownJSON(filePath);
}
updateMarkdownJSON(path.join(repositoryRoot, "Pocket-Genes-Services-Wiki.md"));

console.log(`Synchronized ${shapes.size} immutable pgo_form shapes.`);
