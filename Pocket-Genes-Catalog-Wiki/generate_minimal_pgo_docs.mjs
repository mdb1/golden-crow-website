#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(root);
const readJSON = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const writeText = (filePath, text) => fs.writeFileSync(filePath, `${text.trim()}\n`);
const jsonFence = (value) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

const objectCatalog = readJSON("catalog/objects.json");
const servicesCatalog = readJSON("catalog/services.json");
const providersCatalog = readJSON("catalog/providers.json");
const fieldConventions = readJSON("catalog/field-key-conventions.json");
const usagePolicy = readJSON("catalog/usage-policy.json");

const typeName = (schema) => {
  if (schema.enum) return `enum<string>`;
  if (schema.type === "array") return `array<${typeName(schema.items ?? {})}>`;
  if (schema.type === "object") return "object";
  if (schema.oneOf) return "typed value";
  return schema.type ?? "value";
};

const markdownTable = (headers, rows) => [
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.join(" | ")} |`)
].join("\n");

const collectEnums = (schema, currentPath = "", found = []) => {
  if (!schema || typeof schema !== "object") return found;
  if (schema.enum && currentPath) {
    found.push({
      path: currentPath,
      values: schema.enum,
      labels: schema["x-enum-labels"] ?? schema.enum
    });
  }
  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      collectEnums(value, currentPath ? `${currentPath}.${key}` : key, found);
    }
  }
  if (schema.items) collectEnums(schema.items, `${currentPath}[]`, found);
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    for (const value of schema[key] ?? []) collectEnums(value, currentPath, found);
  }
  return found;
};

const nestedContract = (object) => {
  switch (object.id) {
  case "pgo_form":
    return `### Frozen form structure

\`form_shape\` contains exactly \`fields\`. Definitions stay ordered. Every definition requires \`key\`, \`label\`, \`type\`, and \`required\`; only \`options\` and \`help_info_text\` are optional. \`options\` is required and nonempty only for \`enum\` and \`multi_enum\`, and must be omitted for every other type.

Field keys use \`^[a-z][a-z0-9_]{0,63}$\`. Labels contain 1 to 120 characters and optional \`help_info_text\` contains 1 to 500 characters after trimming. Each option value contains 1 to 128 characters and matches \`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$\`; its readable label contains 1 to 120 characters. Option values are unique within the field.

Answers contain exactly \`key\` and \`value\`. Keys must be unique and declared by the frozen shape. Values are validated against the matching definition, including enum membership and numeric array element types. Optional unanswered fields may be absent. An empty answer array is valid when no required field is unanswered.

Supported definition types:

\`text\`, \`long_text\`, \`email\`, \`phone\`, \`url\`, \`address\`, \`postal_code\`, \`country_code\`, \`identifier\`, \`number\`, \`integer\`, \`positive_integer\`, \`percentage\`, \`boolean\`, \`date\`, \`datetime\`, \`time\`, \`enum\`, \`multi_enum\`, \`string_list\`, \`integer_list\`, \`number_list\`.

There are no universal \`requested_at\`, \`requested_by\`, or \`subject_id\` questions. Request identity and time belong to the service transaction. Shape IDs and versions belong to the service-offer configuration, not this content.`;
  case "pgo_bundle_of_symptoms":
    return `### Observation structure

Each nonempty \`observations\` item requires only \`label\`. It may add \`presence\` (\`present\`, \`absent\`, or \`uncertain\`) and a closed \`code\` object containing exactly \`system\` and \`value\`. Code systems are \`hpo\`, \`snomed_ct\`, and \`other\`. Free text without a code is valid.`;
  case "pgo_bundle_of_candidate_genes":
    return `### Gene entries

\`genes\` is a nonempty ordered array of nonempty gene-symbol strings. It contains no ranking, namespace, evidence, symptom reference, or method object.`;
  case "pgo_sequence_reads":
    return componentContract("reads", "read");
  case "pgo_image_bundle":
    return componentContract("images", "image");
  case "pgo_collection_request":
    return `### Biological collection only

This object asks for the act of obtaining biological material from a person or source. It never means courier pickup, shipping, or transport. Only \`patient\` and \`sample_type\` are required; scheduling and collection arrangements remain optional.`;
  case "pgo_blood_sample":
  case "pgo_tissue_sample":
  case "pgo_embryo_sample":
  case "pgo_dna_sample":
    return `### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.`;
  case "pgo_sequence_data":
  case "pgo_unannotated_vcf":
  case "pgo_annotated_vcf":
  case "pgo_interactive_report":
  case "pgo_pdf_report":
  case "pgo_flow_cytometry_data":
    return `### Native file boundary

The PGO registers a readable \`title\` and one direct \`download_url\`. The downloaded native file retains its own domain content. No generic \`files\` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.`;
  case "pgo_aligned_reads":
    return `### Alignment files

\`download_url\` points directly to the aligned reads. Optional \`index_download_url\` expresses index availability without a duplicate boolean. No generic file list is allowed.`;
  case "pgo_informed_consent":
    return `### Consent meaning

\`text\` is the actual consent text. Optional status is exactly \`pending\`, \`accepted\`, \`declined\`, or \`withdrawn\`. Upload and schema validity never imply acceptance. \`accepted_by\` and \`accepted_at\` describe the actual acceptance only when known.`;
  case "pgo_test_order":
    return `### Order meaning

\`patient\` is readable user-supplied identity, not a mandatory Pocket Genes subject record. \`test_name\` is the actual requested study. \`test_type\` is only an optional broad category. Consent and provider suitability remain service checks.`;
  case "pgo_karyotype_result":
    return `### Result meaning

\`result_notation\` is the actual karyotype notation. Professional interpretation is optional; notes may communicate additional readable limitations. Images are separate objects when they exist and are not mandatory dependencies.`;
  default:
    return "";
  }
};

const componentContract = (property, noun) => `### Component structure

\`${property}\` is nonempty. Each ${noun} contains exactly \`key\`, \`name\`, and \`download_url\`; all are nonempty, keys are unique, and the URL resolves the component directly. No size, checksum, MIME type, role, path, source reference, or generic file descriptor is permitted.`;

const objectPage = (object, index) => {
  const schema = readJSON(object.schema_path);
  const required = new Set(schema.required ?? []);
  const rows = Object.entries(schema.properties).map(([key, definition]) => [
    `\`${key}\``,
    `\`${typeName(definition)}\``,
    required.has(key) ? "Yes" : "No",
    (definition.description ?? "").replaceAll("|", "\\|")
  ]);
  const enumSections = collectEnums(schema)
    .filter((entry, enumIndex, all) => all.findIndex((candidate) => candidate.path === entry.path && JSON.stringify(candidate.values) === JSON.stringify(entry.values)) === enumIndex)
    .map((entry) => `#### \`${entry.path}\` choices\n\n${markdownTable(
      ["Stored value", "Display label"],
      entry.values.map((value, valueIndex) => [`\`${value}\``, entry.labels[valueIndex]])
    )}`)
    .join("\n\n");

  return `# ${String(index + 1).padStart(2, "0")}. ${object.name} — \`${object.id}\`

${object.description}

**Nature:** ${object.nature}  
**Stages:** ${object.stages.join(", ")}  
**Serialized extension:** \`${object.extension}\`  
**Schema:** \`${object.schema_path}\`  
**Example:** \`${object.example_path}\`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional \`notes\` may be absent or an empty string and is only for additional human information.

## Fields

${markdownTable(["Field", "Type", "Required", "Meaning"], rows)}

${nestedContract(object)}

${enumSections ? `## Enum choices\n\n${enumSections}` : ""}

## Minimal example

${jsonFence(object.example_data)}

## Validation

${object.validation_rules.map((rule) => `- ${rule}`).join("\n")}
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's \`data\` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.`;
};

const servicePage = (service, index) => {
  const formRows = (service.formShape?.fields ?? []).map((field) => [
    `\`${field.key}\``, `\`${field.type}\``, field.required ? "Yes" : "No", field.label
  ]);
  const slotRows = [
    ...(service.inputSlots ?? []).map((slot) => ["Input", `\`${slot.role}\``, `\`${slot.objectType}\``, "Required 1:1"]),
    ...(service.outputSlots ?? []).map((slot) => ["Output", `\`${slot.role}\``, `\`${slot.objectType}\``, slot.mutationMode])
  ];
  return `# S${String(index + 1).padStart(2, "0")}. ${service.name} — \`${service.serviceId}\`

${service.description}

**Provider:** ${service.providerName} (\`${service.providerId}\`)  
**Provider kind:** ${service.providerKind}  
**Service version:** ${service.serviceVersion}  
**Stages:** ${service.stages.join(", ")}

## Provider work

${service.providerWork}

## Contract slots

${markdownTable(["Direction", "Role", "PGO type", "Rule"], slotRows)}

The compact \`shortContract\` is backend/catalog syntax only. Native user interfaces render it as \`PGOConversionView\`, never as raw text.

## Request form

${formRows.length ? markdownTable(["Key", "Type", "Required", "Label"], formRows) : "This offer declares no `pgo_form` input and therefore has no form shape."}

${service.sampleFormObject ? `The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.\n\n${jsonFence(service.sampleFormObject.data)}` : ""}

## Acceptance conditions

${(service.acceptedConditions ?? []).map((rule) => `- ${rule}`).join("\n") || "No global acceptance conditions are declared."}

## Scope rules

${(service.scopeRules ?? []).map((rule) => `- ${rule}`).join("\n") || "No additional scope rules are declared."}

## Transaction rule

A real request selects this active published offer. The transaction pins \`serviceId\`, integer \`serviceVersion\`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.`;
};

const providerPage = (provider) => `# ${provider.name} — \`${provider.provider_id}\`

${provider.description}

**Kind:** ${provider.kind}  
**Stages:** ${provider.supported_stages.join(", ")}  
**Regions:** ${provider.country_codes.join(", ")}  
**Catalog status:** fictional example, not a live integration

## Services

${provider.service_ids.map((id) => `- \`${id}\``).join("\n")}

## Contact and integration

${jsonFence({ contacts: provider.contacts, api_capability_proposal: provider.api_capability_proposal })}

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.`;

const objectPages = objectCatalog.objects.map(objectPage);
const servicePages = servicesCatalog.services.map(servicePage);
const providerPages = providersCatalog.providers.map(providerPage);

objectCatalog.objects.forEach((object, index) => {
  writeText(path.join(root, `objects/${object.id}.md`), objectPages[index]);
});
servicesCatalog.services.forEach((service, index) => {
  writeText(path.join(root, `services/${service.serviceId}.md`), servicePages[index]);
});
providersCatalog.providers.forEach((provider, index) => {
  writeText(path.join(root, `providers/${provider.provider_id}.md`), providerPages[index]);
});

const coreContract = `## Canonical content rule

This is schema 1. There is no legacy compatibility contract, no older production PGO JSON, and no fallback reader. A PGO file is a strict, standalone domain payload selected and validated as one of exactly twenty registered types. It is not a portable platform record and it does not identify itself.

The JSON root must not contain \`object_id\`, \`object_type\`, \`schema_version\`, \`revision\`, \`created_at\`, \`created_by\`, \`input_refs\`, or generic \`files\`. There is no \`data\` wrapper in the serialized file. Those concepts remain in the existing platform records only when an actual feature uses them.

Every type has optional root \`notes: string\`. Notes may be absent or empty. Notes never become a landfill for removed metadata.

### Content versus platform records

| Boundary | Responsibility | Naming |
| --- | --- | --- |
| Serialized PGO file | Strict domain allowlist only | snake_case |
| \`uploaded_objects\` | Type, code, owner, linked file, upload version | snake_case |
| \`file_storage\` | Stored-file identity and content/linkage | snake_case |
| \`object_owners\` / \`object_codes\` | Ownership and access lookup | snake_case |
| \`service_offers\` | Untimed published contract and slots | lower camel case |
| \`service_transactions\` | Timed request, role bindings, status and outputs | lower camel case |

The same concept intentionally changes casing at a boundary. There are no aliases, fallback reads, or dual writes.`;

const registryTable = markdownTable(
  ["Type", "Required content", "Optional content"],
  objectCatalog.objects.map((object) => {
    const schema = readJSON(object.schema_path);
    const required = schema.required.map((key) => `\`${key}\``).join(", ");
    const optional = Object.keys(schema.properties).filter((key) => !schema.required.includes(key)).map((key) => `\`${key}\``).join(", ");
    return [`\`${object.id}\``, required, optional];
  })
);

const serviceArchitecture = `## Service architecture

### Offers

A service offer is an untimed, provider-owned published template. It selects a real Discover organization or professional individual, declares one object type per required input slot, at least one non-form output, integer contract versions, work description, optional commercial terms, and at least one stage. Offers start as draft and become selectable only through publish/active state. \`isHiddenFromSearch\` removes an offer from discovery without hiding transactions already created from it.

If and only if an offer enables form input, it declares exactly one required \`pgo_form\` slot with role \`form\` and a matching external \`formShape\`. Manual slots cannot use \`pgo_form\`. The external shape retains generated ID and integer version; the submitted PGO freezes only its field definitions and answers.

### Transactions

A transaction is a timed execution created from an existing active offer. It inherits the pinned service ID/version, provider, input slots, and output slots. Transaction identity and time use transaction fields such as \`requestedAt\` and \`requestedByUserId\`; they are not generated form answers.

The native requester sequence is:

1. Validate the offer, form and all selected object references without writing.
2. Recompute usage limits from root transactions.
3. Approve or deny before creating a provider-owned form object.
4. When approved, create the strict pgo_form file under the provider organization, register its object/code, and download the requester's local copy.
5. Create the service transaction and reduced user snapshot.
6. Present confirmation over the service hub, then allow process tracking.

Status progression is controlled by provider/backoffice work. Native users cannot force progress. \`delivered\` is the successful final state and requires every contractually promised output PGO snapshot in \`outputObjects\`. Optional \`outputReports\` do not satisfy a PGO output slot.

### Ownership and delivery

The creator/administrator of an object is its seeder and may manage its stored source. \`is_clinician\` grants access to both report and object administration; it does not itself confer ownership. Pocket Genes transports and presents authorized files but does not warrant their clinical content.

Service offers are the primary way a regular user requests new objects. Backoffice/provider tooling performs fulfillment, registers output objects, and marks delivery. The requester keeps the transaction while work is pending, then downloads, opens, and updates delivered objects through the normal nine-digit object-code circuit.

Physical specimen identity, custody and consumption safeguards remain operational controls outside PGO content. A transport transaction moves an existing specimen; it does not create duplicate biological material.`;

const usageChapter = `## Request limits

The usage policy is unchanged by the PGO redesign. Stable configuration is \`${usagePolicy.policy_configuration_defaults.total_transaction_limit}\` total transactions, \`${usagePolicy.policy_configuration_defaults.daily_transaction_limit}\` per UTC day, and a \`${usagePolicy.policy_configuration_defaults.cooldown_seconds}\`-second cooldown unless policy configuration changes.

Usage state is functional and recomputed from root \`service_transactions\` using \`requestedByUserId\` and \`requestedAt\`. Never persist today's count, remaining tokens, last transaction time, cooldown start/end, next request time, or pending admissions. UTC buckets split at 00:00 UTC; the UI displays the reset in device-local time. When daily reset and cooldown both apply, the later deadline wins.

Admission runs before form-object persistence and provider dispatch. A denied attempt creates no transaction, file, uploaded object, code, owner normalization, counter, or cooldown record. \`catalog/usage-policy.json\` remains the executable source and is intentionally untouched by this migration.`;

const nativeChapter = `## Native files and URLs

All PGO download URLs are absolute HTTPS and preserve query parameters. URLs may be opaque and need no filename extension. The client downloads and inspects actual native content with the supported parser; it must report ambiguity rather than guess.

Native interactive-report mappings remain:

| File | Model | Provider format |
| --- | --- | --- |
| \`.pgi1.json\` | \`MDMAPIModel\` | \`mdm\` |
| \`.pgi2.json\` | \`AGAPIModel\` | \`ag\` |
| \`.pgi3.json\` | \`TwoPQAPIModel\` | \`2pq\` |

These mappings belong to native parser configuration, not each \`pgo_interactive_report\`. The six single-file PGOs contain exactly \`title\`, \`download_url\`, and optional \`notes\`; aligned reads may additionally contain \`index_download_url\`.`;

const migrationChapter = `## Strict first schema

This is the first PGO content schema and it has not shipped to production. There is no legacy compatibility reader, alias, fallback, dual decoder, or runtime migration utility. Writers emit only the strict allowlists; readers reject envelopes, removed keys and unknown properties immediately.

Repository fixtures and generators were replaced at their source instead of converted at runtime. Existing platform records may still surround strict content for identity, ownership and transaction tests, but that wrapper is not accepted as a PGO file. No discarded field is copied into \`notes\`, and no old local payload path is rewritten into a fabricated URL.

The repository fixtures are synthetic schema examples using the IANA-reserved \`example.com\` domain. They are not production objects and are never represented as live downloads.`;

const validationChapter = `## Validation and acceptance

The executable validator checks all twenty schemas, examples, notes variants, unknown-field rejection, exact PDF minimum, standalone symptoms/genes/specimens, Other behavior, direct component URLs, strict forms, service copies, provider examples, naming boundaries, native PGI mappings, generator idempotence, and the unchanged usage policy.

Global object validity is distinct from service suitability. A provider may ask for clarification or reject an input that does not satisfy its published service, but it cannot make provider-specific prerequisites universally required PGO fields.`;

const objectReferences = objectPages.map((page) => page.replace(/^# /, "### ")).join("\n\n---\n\n");
const serviceReferences = servicePages.map((page) => page.replace(/^# /, "### ")).join("\n\n---\n\n");
const providerReferences = providerPages.map((page) => page.replace(/^# /, "### ")).join("\n\n---\n\n");

const completeWiki = `# Pocket Genes Objects and Services Wiki

This document is generated from the strict schema-1 catalog and is the shared source of truth for native apps, backend, backoffice, providers and documentation.

${coreContract}

## Exact object registry

${registryTable}

${serviceArchitecture}

${usageChapter}

${nativeChapter}

${migrationChapter}

${validationChapter}

## Object reference pages

${objectReferences}

## Service catalog

${serviceReferences}

## Provider catalog

${providerReferences}

## Generated sources

- \`generate_minimal_pgo_contracts.mjs\` generates schemas, examples, service/provider fixtures and bundled app catalogs.
- \`generate_minimal_pgo_docs.mjs\` generates this wiki and all reference pages.
- \`sync_pgo_form_contract.mjs\` invokes the strict generator; it contains no legacy synchronization logic.
- \`validate_catalog.py\` is the executable conformance suite.
`;

writeText(path.join(root, "Pocket-Genes-Wiki.md"), completeWiki);
writeText(path.join(repositoryRoot, "Pocket-Genes-Services-Wiki.md"), completeWiki);

const serviceModel = `# Pocket Genes Service Model

${coreContract}

## Exact object registry

${registryTable}

${serviceArchitecture}

${usageChapter}

${nativeChapter}

${migrationChapter}

## Offer and transaction naming

${markdownTable(
  ["Boundary", "Convention", "Examples"],
  fieldConventions.collections.map((entry) => [
    `\`${entry.collection}\``, entry.field_key_convention, entry.examples.map((example) => `\`${example}\``).join(", ")
  ])
)}

Serialized PGO keys remain snake_case. Explicit adapters convert them when embedding snapshots in camelCase service transactions. Wrong-case aliases are rejected.

${validationChapter}`;
writeText(path.join(root, "docs/service-model.md"), serviceModel);

const formContract = `# Form Shape Field Contract

## Two distinct boundaries

The service offer's external \`formShape\` is camelCase configuration with generated \`id\`, integer \`version\`, ordered \`fields\`, and \`allowUnknownFields: false\`. The strict \`pgo_form\` content is snake_case and contains only \`form_shape\`, \`fields\`, and optional \`notes\`. Its embedded \`form_shape\` contains exactly \`fields\`; IDs, versions and allow-unknown flags are forbidden content.

${nestedContract({ id: "pgo_form" })}

## Field validation

- \`email\`: syntactically valid email.
- \`phone\`: E.164, beginning with \`+\`, with no spaces.
- \`url\`: absolute HTTPS URL.
- \`country_code\`: uppercase ISO 3166-1 alpha-2.
- \`identifier\`: constrained stable identifier syntax.
- \`integer\` and \`positive_integer\`: integral numeric values; positive means greater than zero.
- \`percentage\`: numeric 0 through 100.
- \`date\`, \`datetime\`, and \`time\`: their declared temporal formats.
- \`enum\`: one stored option value.
- \`multi_enum\`: unique option values in declaration order.
- \`string_list\`, \`integer_list\`, and \`number_list\`: typed arrays; numeric arrays stay numeric.

Inline validation errors clear when the user edits the field. Optional unanswered fields are omitted. \`help_info_text\` is optional, requester-facing guidance shown from the field info control.

## Example

${jsonFence(objectCatalog.objects.find((object) => object.id === "pgo_form").example_data)}`;
writeText(path.join(root, "docs/form-shape-field-contract.md"), formContract);

const nativeSelection = `# Native PGO File Selection

The user first selects one of the twenty PGO types. That external selection is required because the content does not repeat \`object_type\`. The file wizard loads the matching closed schema, edits only allowed domain keys, and writes root content with no envelope.

When loading by nine-digit object code, \`object_codes\` resolves \`uploaded_objects\`; the snake_case \`object_type\` on that platform record selects the schema. The linked stored file supplies the strict JSON content. The client rejects a type mismatch or any legacy/unknown key.

${nativeChapter}

The explorer header and twenty dedicated content screens operate on the selected type and validated root content. File-bearing objects use direct URLs; image bundles use their own gallery; forms reconstruct from the frozen shape; physical samples show specimen facts without pretending that JSON transfer moves biological material.`;
writeText(path.join(root, "docs/native-pgo-file-selection.md"), nativeSelection);

const nativeServices = `# Native Services Current State

${serviceArchitecture}

${usageChapter}

The available-services list reads only active, non-hidden Firebase offers. Mock services exist only in Simulator. A request form is produced from the selected real offer. Confirmation, validation/loading, congrats, transaction detail, process tracking, provider contact, contract document, input downloads and delivered results are separate native states.

The strict content migration changes object payloads only. It does not relax authentication, publisher resolution, ownership, role binding, delivery consistency, provider email lookup, or transaction visibility.`;
writeText(path.join(root, "docs/native-services-current-state.md"), nativeServices);

const pgiFormats = `# Native PGI Formats

${nativeChapter}

The PGI models are provider-native report payloads and do not gain PGO registration fields or \`notes\`. A \`pgo_interactive_report\` is only a title and HTTPS reference to one supported native file. Parsing happens after download from actual bytes, not from a guessed URL suffix.`;
writeText(path.join(root, "docs/pgi-native-formats.md"), pgiFormats);

const ownership = `# Ownership and Service Fulfillment

${serviceArchitecture}

${migrationChapter}

## Responsibility

The object/report administrator warrants that they are authorized to seed and share the file. Downloaders must protect access codes. Providers remain responsible for their contracted work. Pocket Genes provides distribution, access and exploration infrastructure and is not the author of third-party clinical content.

## Collections

Report and object owner records remain separate. Objects use nine-digit numeric codes, \`object_codes\`, \`uploaded_objects\`, and \`object_owners\`; reports use six-character alphanumeric codes and their parallel collections. Stored files are agnostic and may back either domain. No PGO content duplicates owner or access facts.`;
writeText(path.join(root, "docs/ownership-and-service-fulfillment.md"), ownership);

const readme = `# Pocket Genes Catalog Wiki

Strict schema-1 reference package for twenty Pocket Genes Object types, fifteen fictional service examples, six fictional providers, native PGI formats, transaction contracts and request-limit policy.

Run:

\`\`\`sh
node generate_minimal_pgo_contracts.mjs
python3 validate_catalog.py
\`\`\`

The generator rewrites every derived schema, example, service/provider fixture, bundled iOS catalog and Markdown reference. The validator rejects the retired envelope and unknown keys. \`catalog/usage-policy.json\` is intentionally outside the content redesign and must remain unchanged.`;
writeText(path.join(root, "README.md"), readme);

console.log(`Generated ${objectPages.length} object pages, ${servicePages.length} service pages, ${providerPages.length} provider pages, and canonical wiki chapters.`);
