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
const serviceOfferTypeCatalog = readJSON("catalog/service-offer-types.json");
const fieldConventions = readJSON("catalog/field-key-conventions.json");
const usagePolicy = readJSON("catalog/usage-policy.json");
const serviceMoreInformationExample = servicesCatalog.services.find(
  (service) => service.moreInformation
)?.moreInformation ?? {};

// Protocol fixtures remain snake_case by their own schemas and live outside direct
// lower-camel-case service offer documents.
const serviceProtocolFixtures = (serviceId) => {
  const formPath = path.join(root, `examples/forms/${serviceId}.pgform.json`);
  return {
    formObject: fs.existsSync(formPath)
      ? JSON.parse(fs.readFileSync(formPath, "utf8"))
      : null,
    request: readJSON(`examples/requests/${serviceId}.json`),
    result: readJSON(`examples/results/${serviceId}.json`)
  };
};

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

**Nature:** ${object.nature}<br>
**Stages:** ${object.stages.join(", ")}<br>
**Serialized extension:** \`${object.extension}\`<br>
**Schema:** \`${object.schema_path}\`<br>
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
  const fixtures = serviceProtocolFixtures(service.serviceId);
  const formRows = (service.formShape?.fields ?? []).map((field) => [
    `\`${field.key}\``, `\`${field.type}\``, field.required ? "Yes" : "No", field.label
  ]);
  const slotRows = [
    ...(service.inputSlots ?? []).map((slot) => ["Input", `\`${slot.role}\``, `\`${slot.objectType}\``, "Required 1:1"]),
    ...(service.outputSlots ?? []).map((slot) => ["Output", `\`${slot.role}\``, `\`${slot.objectType}\``, slot.mutationMode])
  ];
  return `# S${String(index + 1).padStart(2, "0")}. ${service.name} — \`${service.serviceId}\`

${service.description}

**Provider:** ${service.providerName} (\`${service.providerId}\`)<br>
**Provider kind:** ${service.providerKind}<br>
**Service version:** ${service.serviceVersion}<br>
**Stages:** ${service.stages.join(", ")}<br>
**Highlighted:** ${service.isHighlightedOffer ? "Yes" : "No"}<br>
**For professionals:** ${service.isProfessionalOffer ? "Yes" : "No"}<br>
**Promotional banner:** ${service.promotionalBannerImageUrl ? `\`${service.promotionalBannerImageUrl}\`` : service.promotionalBannerImageUploadDataUrl ? "Uploaded image data" : "Not set"}

## Provider work

${service.providerWork}

## Contract slots

${slotRows.length
    ? markdownTable(["Direction", "Role", "PGO type", "Rule"], slotRows)
    : "This offer declares no input or output object slots."}

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as \`none\` in the calculated \`shortContract\`, including \`none -> none\`. The compact syntax is backend/catalog data only; native user interfaces render it as \`PGOConversionView\`, never as raw text.

## Request form

${formRows.length ? markdownTable(["Key", "Type", "Required", "Label"], formRows) : "This offer declares no `pgo_form` input and therefore has no form shape."}

${fixtures.formObject ? `The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.\n\n${jsonFence(fixtures.formObject.data)}` : ""}

## Acceptance conditions

${(service.acceptedConditions ?? []).map((rule) => `- ${rule}`).join("\n") || "No global acceptance conditions are declared."}

## Scope rules

${(service.scopeRules ?? []).map((rule) => `- ${rule}`).join("\n") || "No additional scope rules are declared."}

## More information

${service.moreInformation
    ? `This fixture demonstrates the optional closed \`moreInformation\` map. Only non-null, non-empty sections are rendered in the modal.\n\n${jsonFence(service.moreInformation)}`
    : "This offer omits `moreInformation`, so its detail screen shows no More information action."}

## Transaction rule

A real request selects this active published offer. The transaction pins \`serviceId\`, integer \`serviceVersion\`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.`;
};

const providerPage = (provider) => `# ${provider.name} — \`${provider.provider_id}\`

${provider.description}

**Kind:** ${provider.kind}<br>
**Stages:** ${provider.supported_stages.join(", ")}<br>
**Regions:** ${provider.country_codes.join(", ")}<br>
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
| \`deferred_service_transactions\` | Email-to-transaction-ID index for requesters without an account | snake_case |

The same concept intentionally changes casing at a boundary. There are no aliases, fallback reads, or dual writes.

Entries in \`catalog/services.json.services[]\` and every \`services/*.json\` file are direct \`service_offers\` documents, so every nested document key remains lower camel case. The snake-case platform form objects, provider requests and provider results are separate protocol fixtures under \`examples/forms/\`, \`examples/requests/\` and \`examples/results/\`; they are never embedded in or copied verbatim into a service offer.`;

const registryTable = markdownTable(
  ["Type", "Required content", "Optional content"],
  objectCatalog.objects.map((object) => {
    const schema = readJSON(object.schema_path);
    const required = schema.required.map((key) => `\`${key}\``).join(", ");
    const optional = Object.keys(schema.properties).filter((key) => !schema.required.includes(key)).map((key) => `\`${key}\``).join(", ");
    return [`\`${object.id}\``, required, optional];
  })
);

const moreInformationContract = `### Optional more-information presentation

\`moreInformation\` is an optional, presentation-only lower-camel-case map on a \`service_offers\` document. It explains a published offer without changing its input slots, output slots, acceptance rules, price, availability, or provider obligations. The same closed shape is available at \`service_transactions.offerSnapshot.moreInformation\` so a transaction can freeze the explanatory content that accompanied the selected offer.

| Optional child key | Non-null shape | What to publish |
| --- | --- | --- |
| \`frequentQuestions\` | array of \`{ question, answer }\` | Questions a requester commonly asks and direct answers. |
| \`keyInsights\` | array of \`{ title, description }\` | The most important takeaways about the service. |
| \`scientificFacts\` | array of \`{ title, description }\` | Relevant scientific context stated for the requester. |
| \`usefulLinks\` | array of \`{ title, url }\` | Titled external resources whose \`url\` is absolute HTTPS. |
| \`sampleLink\` | one \`{ title, description, buttonTitle, url }\` map | A featured example or sample resource and the exact action label that opens it. |
| \`bulletSegments\` | array of \`{ title, description, imageUrl?, imageUploadDataUrl? }\` | Illustrated explanatory segments. Supply at least one image source: an absolute-HTTPS \`imageUrl\`, an inline base64 image data URL in \`imageUploadDataUrl\`, or both. When both are present, apps prefer \`imageUrl\`. |
| \`technicalInformationFacts\` | array of \`{ title, description, subitems }\` | Technical facts with an ordered \`subitems: string[]\` list. |
| \`biologicalSampleRequirements\` | array of \`{ title, description, instructions }\` | Biological-material requirements and the instructions needed to satisfy each one. |
| \`websiteUrl\` | string | The offer's absolute HTTPS website destination. |

Every child key is independently optional and may explicitly be \`null\`. The root \`moreInformation\` value may also be omitted or \`null\`. An empty map, a map whose children are all null, and empty top-level arrays are valid representations of no displayable content. In those states the service-offer detail screen does not show the **More information** button. When at least one section has displayable content, the button presents a modal list; each key has its own visual component, and every omitted, null, or empty section is skipped. The table documents the persistence contract rather than visual order. Both mobile clients use the editorial order \`keyInsights\`, \`scientificFacts\`, \`frequentQuestions\`, \`sampleLink\`, \`bulletSegments\`, \`technicalInformationFacts\`, \`biologicalSampleRequirements\`, \`usefulLinks\`, then \`websiteUrl\`; absence collapses that section without leaving a gap. The illustrated hero uses the real service display name, and shortcuts or anchor chips are created only for destinations that actually exist.

Every visible segment has a styled title header with a small information control at its upper right. Activating that control expands a localized gray explanation directly below the title on the same screen; it never opens a second modal. The \`sampleLink\` control is the intentional exception in placement: it overlays the featured card's upper-right corner while preserving a full touch target and reserved title space. This guidance is owned by the mobile apps and is not another Firestore field: catalog authors supply only the optional keys and values in the table above.

The two native apps share the same interaction contract. Frequently asked questions and technical groups disclose their content inline; technical headers reserve equal leading and trailing control slots for vertical alignment. \`bulletSegments\` accepts either \`imageUrl\` or \`imageUploadDataUrl\` and renders a fixed circular leading thumbnail without an expand action. The service website has its own titled section. Supplied decorative artwork is bundled for the hero, featured sample link, illustrated-image fallback, and first biological-requirement summary; artwork does not create a section when the corresponding model value is absent.

Every non-null array item is a closed map and must contain all fields shown for that item type, except that each \`bulletSegments[]\` item requires \`title\`, \`description\`, and at least one of its two optional image-source keys. A non-null \`sampleLink\` is also closed and requires all four fields. Object members and array string items are nonempty after whitespace; array items themselves cannot be null. Empty \`technicalInformationFacts[].subitems\` arrays are valid. \`usefulLinks[].url\`, \`sampleLink.url\`, \`bulletSegments[].imageUrl\`, and \`websiteUrl\` must be nonempty absolute URIs with the exact lowercase \`https://\` scheme. Userinfo is forbidden; the host must use DNS/IPv4 label form or bracketed IPv6; an optional port contains one to five digits; whitespace is invalid. Paths, queries, and fragments remain valid. \`bulletSegments[].imageUploadDataUrl\` must be a nonempty \`data:image/...;base64,...\` value with a valid base64 payload. This is the same uploaded-image representation used elsewhere in the apps and is copied unchanged into transaction offer snapshots.

The map accepts only the nine keys in the table, and every nested item accepts only its documented keys. Unknown properties, malformed non-null values, snake-case aliases such as \`more_information\`, \`frequent_questions\`, \`button_title\`, \`image_url\`, \`image_upload_data_url\`, or \`website_url\`, and wrong-case alternatives are rejected rather than read as compatibility aliases.

#### Complete authoring example

${jsonFence(serviceMoreInformationExample)}`;

const linkedOutputReportsContract = `### Supplemental linked output reports

\`service_transactions.outputReports\` is the one report-link boundary for a service transaction. It is optional, output-only, and independent of the service offer contract. The field may be omitted or explicitly \`null\`; an empty array is also valid. All three states mean that the transaction has no linked report to present, so native transaction detail screens omit the entire **Linked output reports** section. The section appears only when at least one valid linked report is actually present.

When present and non-null, the value is an array of unique closed maps with exactly one key:

\`{ "reportCode": "ABC123" }\`

\`reportCode\` uses the lower-camel-case key required inside \`service_transactions\`; its value is exactly six uppercase ASCII letters or digits. The snapshot must not duplicate a report title, file name, URL, owner, provider format, upload version, or report payload, and it must not use snake-case \`report_code\`. There is no \`inputReports\` field. \`outputReports\` also never appears on \`service_offers\` or inside \`offerSnapshot\`.

Service-offer \`inputSlots\`, \`outputSlots\`, the corresponding frozen snapshot arrays, \`shortContract\`, and \`outputObjects\` describe Pocket Genes Objects only. They never promise, require, or count uploaded reports. A PGO type such as \`pgo_pdf_report\` remains an object governed by an object slot; that is distinct from a supplemental uploaded-report link. Consequently, adding or removing \`outputReports\` never changes transaction status, never makes a transaction complete or incomplete, never satisfies a missing \`outputSlots\` role, and never prevents delivery. A provider may attach no report, one report, or several reports without changing the contracted object outcome.

#### Backend registration and linkage

Before appending a snapshot, trusted backend/provider tooling registers a real, authorized report through the existing report storage circuit:

1. Normalize and validate the six-character code, then resolve \`report_codes/{reportCode}\` through its snake-case \`uploaded_report_id\` field.
2. Load \`uploaded_reports/{uploadedReportId}\` and require its snake-case \`report_code\` to equal the transaction snapshot code exactly. The record must be ready for the requesting user, expose a supported \`provider_format\`, and have a positive \`upload_version_count\`.
3. Supply report bytes through the report record's usable \`download_url\` or its \`linked_file_id\`. A linked \`file_storage\` record must carry the same snake-case \`linked_report_code\` and a compatible \`file_type\`/payload.
4. Only after the report can be resolved safely, append the unique lower-camel-case transaction snapshot \`{ "reportCode": "ABC123" }\`. Do not copy snake-case storage metadata into the transaction and do not write both naming styles.

For uploaded reports, the canonical \`provider_format\` values supported by both native clients are exactly \`mdm\`, \`ag\`, \`2pq\`, \`vcf\`, and \`pdf\`. When \`linked_file_id\` is used, \`file_storage.file_type\` must use the same canonical value. A \`pgo_*\` value belongs to the separate uploaded-object/\`outputObjects\` circuit and is never a linked report format.

The following is a partial linkage example; unrelated collection-required ownership, authorization, attribution, and audit fields are intentionally omitted:

    service_transactions/{transactionId}
    { "outputReports": [{ "reportCode": "ABC123" }] }

    report_codes/ABC123
    { "uploaded_report_id": "uploaded-report-123" }

    uploaded_reports/uploaded-report-123
    {
      "report_code": "ABC123",
      "provider_format": "pdf",
      "upload_version_count": 3,
      "linked_file_id": "file-123"
    }

    file_storage/file-123
    {
      "linked_report_code": "ABC123",
      "file_type": "pdf",
      "file_content": "<payload encoded for the normal PDF report pipeline>"
    }

The direct-download variant writes an unpadded absolute HTTP(S) \`download_url\` with a host on \`uploaded_reports\` instead of depending on \`linked_file_id\` and \`file_storage\`. In both variants all report-code occurrences must match byte-for-byte; clients do not trim, uppercase, or accept legacy aliases at read time.

The transaction detail screen resolves each code through that same established report path and presents the report experience below **Output files**: download when it is not stored locally, open when it is available, and update when the registered positive upload version is newer. Resolution or authorization failures are report-level errors; they do not retroactively alter the transaction lifecycle. Writers should omit the field when there are no links, although explicit \`null\` and \`[]\` remain valid no-content representations for readers and migrations.`;

const serviceArchitecture = `## Service architecture

### Offers

A service offer is an untimed, provider-owned published template. It selects a real Discover organization or professional individual, declares zero or more required input slots, zero or more output slots, integer contract versions, work description, optional commercial terms, and at least one stage. Offers start as draft and become selectable only through publish/active state. \`isHiddenFromSearch\` always removes an offer from discovery without hiding transactions already created from it. Otherwise, \`isHighlightedOffer\` places it under Highlighted and \`isProfessionalOffer\` places it under For professionals; an offer may appear in both segments, and one with both flags false appears in neither.

The full highlighted card requires both conditions: \`isHighlightedOffer\` is true and a normalized \`promotionalBannerImageUrl\` or, when no URL is present, \`promotionalBannerImageUploadDataUrl\` is available. An offer with a banner but \`isHighlightedOffer\` false uses the regular service cell with the complete banner as its top section. If both image properties are absent, null or empty, the regular cell reserves no banner box, even when \`isHighlightedOffer\` is true. Both banner presentations use a 1024:500 frame and aspect-fit rendering so the entire image remains visible without cropping. Segment flags continue to determine whether the offer is listed under Highlighted, For professionals, or both.

\`inputSlots\` and \`outputSlots\` are explicit arrays, but each may be empty independently and both may be empty simultaneously. A service may therefore require no form or input object, may finish without producing an object, or may represent provider work with neither object inputs nor object outputs. Empty arrays never create placeholder slots, synthetic objects, or hidden requirements. The calculated \`shortContract\` uses \`none\` for each empty side: \`none -> report:pdf_report\`, \`form:form -> none\`, or \`none -> none\`. Native contract and transaction screens show intentional empty states for those sides instead of fabricated rows.

If and only if an offer enables form input, it declares exactly one required \`pgo_form\` slot with role \`form\` and a matching external \`formShape\`. Manual slots cannot use \`pgo_form\`. The external shape retains generated ID and integer version; the submitted PGO freezes only its field definitions and answers.

${moreInformationContract}

### Transactions

A transaction is a timed execution created from an existing active offer. It inherits the pinned service ID/version, provider, input slots, and output slots, including explicit empty arrays. Transaction identity and time use root transaction fields; they are not generated form answers. \`requestedByUserId\` is always optional because a requester may not have an account yet. Every new transaction must have at least one requester identity: an authenticated request has \`requestedByUserId\` and may retain \`requestedByUserEmail\`; an accountless request has a normalized \`requestedByUserEmail\` and no \`requestedByUserId\`. An offer with no form and no input slots proceeds directly to confirmation and admission without creating a form object or asking for files.

${linkedOutputReportsContract}

### Email-only requests and deferred linking

The offers authentication wall has a tertiary **Continue without signing in** action. It never unlocks another account's private records; it establishes only the device's verified deferred-email boundary. It opens \`TransactionEmailCollectScreen\` before the service form, validates one email address, and checks the normalized lowercase value against the \`community_users\` account index before storing it locally through \`TransactionEmailCollectProvider\`. An existing account blocks the anonymous path and shows a dedicated warning with a **Log in** action that presents the shared authentication wall again; a failed lookup also blocks progress. Only an email confirmed not to belong to an existing account is eligible for the anonymous form. Native then reads that email's deferred index and permits at most five unresolved \`deferred_transaction_ids\`. At five IDs, \`TransactionEmailCollectLimitExceededScreen\` replaces the form path with a terminal explanation and a primary **Log in to continue** action. Successful authentication returns to the usual authenticated request flow. Transaction creation enforces the same maximum atomically while writing the transaction and deferred index, so concurrent devices cannot exceed it. Only after both checks pass is the email stored locally. The provider records whether the device has requested a service with the email, the \`deferred_email\` request method, and the locally known deferred transaction IDs. The email is requester identity for admission and transaction creation; it is not an authenticated user ID.

An email-only request still creates its complete canonical document in root \`service_transactions\`, with \`requestedByUserEmail\` and without \`requestedByUserId\`. The separate \`deferred_service_transactions\` collection is only an index. It contains exactly one deterministic document per normalized email (the document ID is a URL-safe base64 encoding of that normalized email), with this closed snake_case payload:

\`{ "email": "x@y.com", "deferred_transaction_ids": ["pgr_..."] }\`

It never duplicates transaction data. New accountless requests append their transaction ID to \`deferred_transaction_ids\`; duplicate IDs are forbidden. The email field and every indexed transaction's \`requestedByUserEmail\` must normalize to the exact same value.

The standard requested-services screen uses one list for authenticated and accountless requests. When signed out, if \`TransactionEmailCollectProvider\` retains an email, native reads only that email's deterministic deferred index, loads those exact transaction documents, and verifies that each still has the same normalized \`requestedByUserEmail\` and no \`requestedByUserId\`. Verified deferred requests appear directly as the normal tappable service-request cells and open the usual transaction detail screen; there is no separate deferred-services modal. The signed-out empty state is shown only when no verified deferred requests exist. When deferred cells are present, a **Create an account** promotional cell and device-link disclaimer appear below them and open the shared authentication wall. Signed-out detail access repeats the deterministic-index membership, email, and missing-user-ID checks before returning the full transaction. Missing, mismatched, malformed, already-linked, or non-indexed transactions are never shown or opened.

The **Account status** modal follows the same boundary. While signed out with verified deferred requests, its usage projection is built only from the current email's exact verified deferred items, so cooldown, daily usage, total remaining, and recent activity are available without an authentication empty state. It never broadens the lookup to arbitrary transactions sharing an untrusted email value.

Native code checks the one deferred index document for the exact verified account email after every successful authentication completed through the shared authentication wall, regardless of which feature presented it, including Discover, **View my reports**, and the requested-services account promotion. Opening or refreshing either authenticated transaction screen also performs the check in the background; while that screen is doing the work, its table shows a small **Linking service transactions** spinner. For each valid deferred ID, one Firestore transaction performs the normalization as a unit:

1. Read the full \`service_transactions/{id}\`, verify the exact normalized email, and reject a record linked to a different user.
2. Build the normal reduced snapshot and insert or replace it in \`community_users/{uid}.requestedServiceTransactions\`.
3. Add the authenticated UID to \`service_transactions.requestedByUserId\`, producing the same user-to-transaction link as a request originally made while signed in.
4. Remove the ID from \`deferred_service_transactions.deferred_transaction_ids\` only after the user and transaction links are written in that same atomic operation.

Missing, malformed, email-mismatched, or conflicting transactions are never attached to the user; unresolved valid references remain available for a later safe retry. Feature-specific post-login work runs only after this normalization attempt finishes. After linking, native reloads \`requestedServiceTransactions\`, so the normalized transactions appear in the standard list. Native pending-output discovery uses that normalized index on app/root startup, when the user enters the **Reports** tab, and from the existing downloaded-file and source-selection entry points. A successful account transition schedules the same authenticated discovery again, so newly linked files do not depend on visiting one particular screen. The email may remain on the full transaction as immutable requester provenance, but future authorization and user-list lookup use \`requestedByUserId\`.

The native requester sequence is:

1. Validate the offer, form, all selected object references, and either the authenticated user identity or collected normalized email without writing.
2. Recompute usage limits from root transactions by \`requestedByUserId\` for an authenticated requester or by \`requestedByUserEmail\` for an email-only requester.
3. Approve or deny before creating a provider-owned form object.
4. When approved, create the strict pgo_form file under the provider organization, register its object/code, and download the requester's local copy.
5. Create the service transaction and either the reduced authenticated-user snapshot or the one-per-email deferred index entry.
6. Present confirmation over the service hub, then allow process tracking.

Status progression is controlled by provider/backoffice work. Native users cannot force progress. \`delivered\` is the successful final state and requires every contractually promised output PGO snapshot in \`outputObjects\`. When \`outputSlots\` is empty, \`delivered\` is consistent only with an empty \`outputObjects\` array and no object is required to prove completion. Supplemental \`outputReports\` are always optional: their absence, null value, empty array, later addition, removal, or resolution failure does not change status or completeness, and they never satisfy a declared PGO output slot.

### Proactive service-output discovery

Output availability and transaction status are intentionally independent in the native clients. For an authenticated requester, discovery starts only from that user's reduced \`requestedServiceTransactions\` references, fetches the referenced root transactions one by one, verifies \`requestedByUserId\` against the active user, and inspects every valid referenced transaction regardless of whether its status is \`requested\`, \`received\`, \`validating\`, \`awaiting_input\`, \`accepted\`, \`queued\`, \`running\`, \`delivered\`, \`rejected\`, \`failed\`, or \`cancelled\`. A failure or stale reference is isolated to that transaction and does not suppress later checks.

Every scan considers both canonical output boundaries: \`outputObjects\` and \`outputReports\`. Objects are eligible as soon as their canonical object snapshot is attached. Reports remain optional and are eligible only when their report code resolves to supported, ready downloadable metadata and payload. Items already present in the local downloaded-file inventory are removed from the result, and repeated pending references are presented only once. A transaction-detail screen likewise shows attached output objects immediately even before \`delivered\`; early availability never changes status, satisfies missing contract roles, or proves completion.

The app-level discovery coordinator runs asynchronously on root startup, after the authenticated user boundary changes, and whenever the user switches to the **Reports** tab. Its presentation owner lives above the tab content, so the existing **New files available** experience can appear over any root tab, including **Discover**. Existing downloaded-file and report/object source-selection entry points request that same whole-account scan through the global coordinator instead of owning competing modal presentations. Only one global scan or presentation is active at a time: overlapping scan triggers coalesce, routine triggers received while the modal is visible are ignored, and the post-authentication normalization refresh waits until the current presentation ends so newly linked transactions are not missed. Discovery never downloads silently: the user still chooses one item or **Download all**, whose queue is processed sequentially.

### Ownership and delivery

The creator/administrator of an object is its seeder and may manage its stored source. \`is_clinician\` grants access to both report and object administration; it does not itself confer ownership. Pocket Genes transports and presents authorized files but does not warrant their clinical content.

Service offers are the primary way a regular user requests new objects. Backoffice/provider tooling performs fulfillment, registers output objects, and marks delivery. The requester keeps the transaction throughout its lifecycle and may download, open, and update an attached object through the normal nine-digit object-code circuit as soon as it becomes available; the later \`delivered\` status still communicates contractual completion rather than file visibility.

Physical specimen identity, custody and consumption safeguards remain operational controls outside PGO content. A transport transaction moves an existing specimen; it does not create duplicate biological material.`;

const downloadedFileUpdateContractBody = `The downloaded-file update lifecycle is a native-client convenience for files the user has already downloaded. It applies equally to reports and Pocket Genes Objects, preserves the user's current selection, and never changes the meaning or lifecycle of a service transaction. Two native entities own the behavior: \`DownloadedFileUpdater\` coordinates version checks and safe local replacement, while \`BlacklistedFileUpdateProvider\` stores the user's per-file automatic-update opt-outs.

### Canonical identity and version

An update preference and every public update state identify a file only by the closed pair \`{ kind, code }\`:

| Member | Canonical values | Rule |
| --- | --- | --- |
| \`kind\` | \`report\` or \`object\` | Keeps the report and object code namespaces independent. |
| Report \`code\` | Exactly six uppercase ASCII letters or digits | Uses the existing report code without trimming, case conversion, or an alias. |
| Object \`code\` | Exactly nine ASCII digits | Uses the existing object code without an alias. |

Source/provider format, object type, local record ID, file name, owner, URL, current version, and file content are not identity. Source still participates in replacement validation: a downloaded report must retain its report source/provider format, and an object must retain its registered PGO object type. A report can never replace an object or vice versa.

The local current version is the positive integer saved with the downloaded file. The remote latest version comes only from the canonical positive \`uploaded_reports.upload_version_count\` or \`uploaded_objects.upload_version_count\` metadata reached through the existing authorized report/object lookup. Clients do not infer versions from dates, payloads, URLs, file names, or service transactions. A missing or non-positive local or remote version is **version unavailable**, not an invitation to overwrite.

An update exists only when \`latestVersion > currentVersion\`. Equal versions and a remote value lower than the local value are treated as up to date; automatic update never performs a rollback. Before persistence, the downloaded replacement must match the same \`kind\`, canonical \`code\`, and source, and its positive version must be greater than the installed version and at least the version observed by the probe. This permits the backend to advance again between the probe and download while rejecting stale, misrouted, or mismatched content.

### Three run intents

Every inspectable \`updateRun\` declares exactly one intent:

| Intent | Trigger and scope | Blacklist | Presentation |
| --- | --- | --- | --- |
| \`collectionAutomatic\` | Opening **Your downloaded files**; evaluates the deduplicated local report/object collection in stable order. | Respected. | The detailed, non-interactive \`DownloadedFileUpdaterView\` blocks that screen for the run and shows per-item progress and outcomes. |
| \`currentAutomatic\` | Opening or restoring Explore with one already-selected report or object, including an app launch that bypasses **Your downloaded files**. | Respected. | The version probe is silent and non-blocking. Only a proven update entering download, storage, or active-content rehydration presents the compact blocking \`CurrentDownloadedFileUpdaterView\`. |
| \`currentManual\` | The user selects the green **Update now** action for the current blacklisted file after a probe proved a newer version exists. | Bypassed for this run only. | Uses the same compact blocking view while downloading, replacing, and rehydrating the current content. |

A current automatic probe is attempted once for the exact current-file fingerprint of canonical identity, source, and installed version. View recomposition, repeated appearance callbacks, and nested Explore destinations must not duplicate it. A successful replacement changes the installed version and therefore permits a later probe of the new fingerprint when the root Explore experience is entered again.

### Update-run pipeline

An \`updateRun\` has a unique run ID, start time, optional finish time, intent, phase, ordered item states, optional current item, and the finalized identities that will actually be replaced. It moves forward through \`preparing\`, \`validatingVersions\`, \`filteringBlacklist\`, \`updatingFiles\`, and \`finished\`.

1. Normalize valid local candidates, reject malformed kind/code/source/version combinations, deduplicate by canonical identity with first occurrence winning, and preserve source order.
2. Probe canonical latest-version metadata. The focused \`currentAutomatic\` probe remains entirely in the background during this step.
3. Mark each item as up to date, version unavailable, version-check failed, or update available. No local file is changed during discovery.
4. Unless the intent is \`currentManual\`, consult \`BlacklistedFileUpdateProvider\` only after a newer version is known. Mark opted-out items \`skippedBlacklisted\` and exclude them from the queue.
5. Publish the final \`listOfItemsThatNeedToBeUpdated\` and its matching identity list. It contains only validated, newer, non-blacklisted candidates, except that an explicitly requested \`currentManual\` run may contain its one blacklisted current file.
6. Download queued replacements strictly one at a time. Validate the replacement identity, source, and version before it can reach storage.
7. Replace the existing local entry through one repository-level commit. The downloaded-files collection and active-file record are updated as one logical replacement boundary; there is no delete-first interval and a failed validation, download, or persistence operation leaves the prior readable version intact.
8. When the replaced identity is currently open, keep the compact blocker visible while the active parser/model is rehydrated from the newly persisted content. Never leave the screen rendering the old in-memory report or object after reporting success.
9. Publish a terminal item state and finish time, clear the current item and private payload context, emit completion, and release the coordinator for the next run.

The collection queue is sequential by contract: at most one replacement downloads or commits at a time. A failure for one collection item is recorded and the next queued item continues. Public states may include \`pendingValidation\`, \`validatingVersion\`, \`versionUnavailable\`, \`upToDate\`, \`updateAvailable\`, \`skippedBlacklisted\`, \`queuedForUpdate\`, \`downloading\`, \`storing\`, \`updated\`, \`versionCheckFailed\`, and \`updateFailed\`. Events cover run start, phase changes, item-state changes, final queue creation, successful replacement, failed replacement, and run completion.

### Quiet current-file experience

The common case must be invisible. While a \`currentAutomatic\` run prepares, checks a version, discovers an unavailable version, confirms the installed version is current, or encounters a version-check failure, Explore stays usable and shows no update overlay. No transient spinner, toast, layout shift, or empty state is introduced merely because the app checked.

Once a newer non-blacklisted version is confirmed and its download begins, interaction is blocked only for the short download, validated replacement, and rehydration window. The compact overlay is kind-aware and explains that a newer version of the current report or object is being installed and that the user should wait for the latest information. It does not show the collection table, a cancel action, internal code, URL, owner, or raw status machine. It covers the complete interactive surface, supports Dynamic Type/font scaling, exposes a progress accessibility role/label, honors reduced motion, and cannot be dismissed over an incomplete replacement.

If there is no update, nothing else happens. If a known update cannot be downloaded or stored, the blocker is removed, the previous local content remains available, and a localized retryable explanation is shown without leaking an internal error or path.

### Blacklist and manual update

\`BlacklistedFileUpdateProvider\` is a local preference store, not a server blacklist and not an authorization system. It persists only valid canonical \`{ kind, code }\` identities in a closed versioned representation. Corrupt, aliased, partially valid, or future-incompatible preference data fails open to an empty blacklist so malformed local data cannot silently disable updates.

Automatic runs still perform the quiet version probe for the current blacklisted file. This is required to distinguish a current file from one for which **Update now** is useful. When and only when a newer version is proven for that blacklisted identity, the Explore details area shows a green **Update now** button directly below **Reactivate automatic updates**. Unknown-version, up-to-date, wrong-identity, and stale-run states never show that action.

Selecting **Update now** starts \`currentManual\`. The explicit action bypasses blacklist filtering only for that single run; it does not remove the identity from \`BlacklistedFileUpdateProvider\` or silently reverse the user's opt-out. After success the file remains opted out, **Reactivate automatic updates** remains available, and **Update now** disappears until a later probe proves another newer version. Selecting **Reactivate automatic updates** is the only one of these actions that removes the identity from the blacklist.

### Concurrency, cancellation, failure, and retry

Only one write-capable update run may own the native coordinator at a time. Collection and focused requests use that same serialization boundary, or an equivalent repository-level identity lock, so two runs can never download and replace the same canonical identity concurrently. A focused request that arrives while another run owns the coordinator waits or retries after release; it is not silently discarded. Before a queued focused request starts, it must re-resolve the current file and stop if the selected identity changed or the file disappeared.

Run IDs, expected queue positions, and canonical identities guard every asynchronous completion. Late callbacks from a finished, cancelled, timed-out, superseded, or different run are ignored. Network and persistence steps have a bounded watchdog. While the process remains alive, cancellation and timeout publish terminal states, remove any blocking overlay, release coordinator ownership, and retain the last complete local version. Process termination cannot publish an in-memory terminal event; safety instead comes from the atomic, no-delete-first replacement boundary. On the next launch there is no stale overlay or retained in-memory run, and the app reads whichever complete local version was durably committed.

A version-check failure never starts a download. A download, identity-validation, or persistence failure never reports replacement success. The updater's \`updated\` state and successful-replacement event mean that the validated file was durably installed; they do not claim that the presentation layer has finished rehydrating it. If that subsequent rehydration fails, the UI removes its blocker, preserves the installed local replacement, and presents a localized load error instead of claiming that the new content is visible. Collection runs continue with later items after an item-level failure; focused runs end after their one item. Retry is a fresh run using fresh local and remote versions, initiated by a later eligible automatic entry or an explicit manual action. Implementations must not spin in an unbounded retry loop.

### Privacy, authorization, and persistence boundaries

All metadata lookup and download operations reuse the existing authorized report/object access paths. Update eligibility never grants access, guesses a code, changes an owner, or bypasses a report/object authorization check. A blacklist entry grants no access and the manual blacklist bypass affects preference filtering only.

Downloaded bytes and serialized report/object content remain inside private run context until validated persistence. Public state, events, analytics, and logs may contain only the canonical kind/code identity, neutral source/type, positive version numbers, timestamps, phases, counts, and sanitized failure categories/messages needed for presentation. They must not contain payloads, data URLs, download URLs, access credentials, form answers, variants, clinical values, owner details, requester details, or other report/object content. Private run context is cleared at terminal completion.

The blacklist uses platform-local preferences (UserDefaults on iOS and SharedPreferences on Android) and is not synchronized to Firestore. This lifecycle introduces no new backend collection or document field. It may read existing version and download metadata and overwrite the authorized local copy; it does not rewrite \`uploaded_reports\`, \`uploaded_objects\`, \`file_storage\`, ownership/code records, service offers, or service transactions.

Updating a file never changes a service transaction's status, completion, contract snapshot, input/output slots, \`outputObjects\`, or \`outputReports\`. Supplemental linked output reports remain optional, and updating a locally downloaded report cannot make a transaction complete or incomplete. A local update is content freshness, not service fulfillment.

### Cross-platform parity and acceptance

iOS and Android implement the same identities, version comparison, run intents, phases, blacklist behavior, manual bypass, queue order, replacement validation, active-content rehydration, blocker visibility, failure safety, and report/object coverage. Platform-native layout may differ; behavior and localized English/Spanish meaning may not.

The acceptance test matrix for this contract includes:

1. Canonical report/object identity validation, namespace separation, positive/unknown versions, duplicate first-wins order, and rejection of mismatched kind, code, source, or replacement version.
2. All three intents, including a single-item scope for both current intents and a stable sequential queue for \`collectionAutomatic\`.
3. Silent \`currentAutomatic\` preparation/version checks and an absent overlay for up-to-date, unavailable, failed-probe, and blacklisted-without-known-update cases.
4. Compact blocker appearance only during proven download, storage, and current-content rehydration, followed by rendering from the newly stored version.
5. Blacklisted automatic skip, conditional green **Update now**, one-run manual bypass, preserved opt-out after success/failure, and explicit reactivation as the only preference removal.
6. Single-owner concurrency, queued/retried focused requests, changed-selection cancellation, stale callback rejection, watchdog timeout, lifecycle cancellation, and coordinator release.
7. Download, validation, and persistence failures leaving the prior file readable; rehydration failure retaining the durably installed replacement while presenting a localized load error; collection continuation after an item failure; and clean fresh-run retry.
8. Public state/event/log privacy tests proving no payload, URL, credentials, owner/requester data, or clinical content escapes private run context.
9. Report and all supported object-source paths on both platforms, plus English/Spanish copy, accessibility, reduced-motion, and full interaction blocking assertions.
10. Persistence tests proving local collection and active selection advance together, the blacklist survives relaunch, manual update does not clear it, and no backend or service-transaction record is mutated.`;

const downloadedFileUpdateSummary = `## Downloaded-file updates

\`DownloadedFileUpdater\` keeps authorized local reports and Pocket Genes Objects current without changing backend records or service fulfillment. This lifecycle introduces no new backend collection or document field. Canonical identity is \`{ kind, code }\`; report codes are six uppercase ASCII letters/digits, object codes are nine ASCII digits, and only a positive canonical \`upload_version_count\` greater than the installed version creates an update. Replacements must match kind, code, source, and a version at least as new as the probe, then commit over the existing local copy without a delete-first interval.

The three explicit intents are \`collectionAutomatic\` for the fully blocking **Your downloaded files** sweep, \`currentAutomatic\` for one silently probed current file, and \`currentManual\` for the user's one-file **Update now** request. Current-file checks show no UI in the usual up-to-date case. A compact blocker appears only after a newer version is proven and remains through sequential download, validated local replacement, and active-content rehydration.

Automatic intents honor \`BlacklistedFileUpdateProvider\`. A blacklisted current file shows the green **Update now** action only when its quiet probe proves a newer version; that manual run bypasses filtering once but preserves the opt-out. Runs are serialized, cancellable, watchdog-bounded, failure-safe, retryable as fresh runs, and privacy-safe: public state never contains file payloads, URLs, access credentials, ownership/requester data, or clinical content. iOS and Android share this contract for reports and objects. The full generated specification is \`docs/downloaded-file-updates.md\`.`;
const serviceOfferTypeChapter = `## Closed service-offer type registry

This registry is the complete and exclusive taxonomy for service offers. It contains exactly 110 values and is intentionally closed: adding a category requires a coordinated contract change to the canonical catalog, schema, validator, documentation, native provider and tests. Entries 1–30 describe one atomic genomic professional or pipeline outcome. Entries 31–60 describe an inseparable, end-to-end genomic pathway whose contracted outcome is a completed report. Entries 61–110 describe person-to-person advice, education and support whose outcome is professional guidance rather than genomic processing.

Este registro es la taxonomía completa y exclusiva de las ofertas de servicios. Contiene exactamente 110 valores y es cerrado de manera intencional: agregar una categoría requiere un cambio coordinado del catálogo canónico, el esquema, el validador, la documentación, el proveedor nativo y las pruebas. Las entradas 1–30 describen un resultado profesional o de proceso genómico puntual. Las entradas 31–60 describen un circuito genómico integral e indivisible cuyo resultado contratado es un informe terminado. Las entradas 61–110 describen asesoramiento, educación y apoyo entre personas cuyo resultado es orientación profesional y no procesamiento genómico.

### Persistence and selection rules / Reglas de persistencia y selección

- **Persist the key only / Persistir únicamente la clave.** The field is the lower-camel-case \`service_offers.serviceCategory\`, and its value is one exact, case-sensitive \`sot_*\` key from the table. Never write \`service_category\`, a translated label, a description or an SF Symbol. / El campo es \`service_offers.serviceCategory\` en lower camel case y su valor es una clave \`sot_*\` exacta y sensible a mayúsculas de la tabla. Nunca se guarda \`service_category\`, una etiqueta traducida, una descripción ni un SF Symbol.
- **Exactly one category per offer / Exactamente una categoría por oferta.** Select the category that describes the offer's primary contracted and billable outcome. Inputs, supporting steps and the provider's profession do not determine the category. / Se selecciona la categoría que describe el resultado principal contratado y facturable. Los insumos, pasos auxiliares y la profesión del proveedor no determinan la categoría.
- **Split independently marketed outcomes / Separar resultados comercializados por separado.** If two outcomes can be requested or fulfilled independently, publish separate offers. If several steps are inseparable parts of one package, use the category of the final primary outcome and describe the included supporting work in the offer. / Si dos resultados pueden solicitarse o cumplirse de manera independiente, se publican ofertas separadas. Si varios pasos son partes inseparables de un paquete, se usa la categoría del resultado final principal y se describe el trabajo auxiliar incluido en la oferta.
- **Reserve \`sot_complete_*\` for the full pathway / Reservar \`sot_complete_*\` para el circuito integral.** A complete category is valid only when one offer includes sample planning and collection, laboratory analysis, bioinformatic interpretation and delivery of the named final report. The schema therefore requires exactly the three canonical stages \`test_planning\`, \`wet_lab\` and \`bioinformatics\`. A collection-only, assay-only, interpretation-only or report-formatting offer must use one of entries 1–30 instead. / Una categoría integral solo es válida cuando una misma oferta incluye planificación y toma de muestra, análisis de laboratorio, interpretación bioinformática y entrega del informe final indicado. Por eso el esquema exige exactamente las tres etapas canónicas \`test_planning\`, \`wet_lab\` y \`bioinformatics\`. Una oferta solo de toma, ensayo, interpretación o armado de informe debe usar una de las entradas 1–30.
- **Reserve \`sot_human_advice_*\` for human guidance / Reservar \`sot_human_advice_*\` para la orientación humana.** Entries 61–110 classify a contracted consultation, counseling, teaching or support outcome. They require the single stage \`human_advice\`; that stage is invalid for every other category. They do not imply that Pocket Genes licensed, accredited or endorsed the provider, and they never represent emergency response, an invasive procedure, legal representation, admission, approval, employment, savings or another guaranteed result unless the offer expressly and lawfully says so. / Las entradas 61–110 clasifican un resultado contratado de consulta, asesoramiento, enseñanza o apoyo. Requieren la única etapa \`human_advice\`, que es inválida para cualquier otra categoría. No implican que Pocket Genes haya habilitado, acreditado o avalado al prestador y nunca representan respuesta de emergencia, un procedimiento invasivo, representación legal, admisión, aprobación, empleo, ahorro u otro resultado garantizado, salvo que la oferta lo indique de manera expresa y lícita.
- **Keep service stages separate from PGO stages / Separar las etapas de servicio de las etapas PGO.** \`human_advice\` extends only the service-offer, transaction-snapshot and provider-capability lifecycle vocabulary. It does not change the three-stage PGO object catalog and is never written into standalone serialized PGO content. / \`human_advice\` amplía únicamente el vocabulario del ciclo de ofertas, snapshots de transacción y capacidades de prestadores. No modifica el catálogo de objetos PGO de tres etapas y nunca se escribe dentro del contenido PGO serializado e independiente.
- **Keep provider identity separate / Mantener separada la identidad del prestador.** Human-advice offers are suitable for independent professionals but may also be published by organizations. \`providerKind\` remains an independent field, while credentials, jurisdiction, delivery mode and precise scope must be stated and verified through their own provider and offer data. / Las ofertas de asesoramiento humano son adecuadas para profesionales independientes, pero también pueden ser publicadas por organizaciones. \`providerKind\` sigue siendo un campo independiente, mientras que las credenciales, la jurisdicción, la modalidad y el alcance preciso deben declararse y verificarse mediante los datos propios del prestador y de la oferta.
- **Do not relabel genomic work as advice / No reclasificar trabajo genómico como asesoramiento.** A test, sample, assay, genomic interpretation or report deliverable continues to use entries 1–60. Advice may discuss such work, but the selected category must follow the primary billable outcome. / Un estudio, una muestra, un ensayo, una interpretación genómica o un informe entregable continúa usando las entradas 1–60. El asesoramiento puede tratar esos temas, pero la categoría elegida debe seguir el resultado principal facturable.
- **Keep screening and diagnosis distinct / Distinguir cribado de diagnóstico.** A category named screening or risk report communicates probability and follow-up needs; it must not be presented as a definitive diagnosis. Non-clinical wellness, ancestry and trait reports must retain their stated limits. / Una categoría denominada cribado o informe de riesgo comunica probabilidades y necesidades de seguimiento; no debe presentarse como diagnóstico definitivo. Los informes no clínicos de bienestar, ascendencia y rasgos deben conservar los límites indicados.
- **No aliases or inferred values / Sin alias ni valores inferidos.** Writers and backoffice validation accept only registered keys. Labels are localized at display time from the registry, and the SF Symbol is presentation metadata for the picker. / Los escritores y la validación de backoffice aceptan únicamente claves registradas. Las etiquetas se localizan al mostrarse desde el registro y el SF Symbol es metadato de presentación para el selector.
- **Historical fallback is display-only / El fallback histórico es solo visual.** Native readers tolerate a missing, null, empty or unrecognized historical value and display **Uncategorized / Sin categoría**. That fallback is not a 111th category, is never persisted, and does not match a category filter; editing the offer requires selecting a valid key. / Los lectores nativos toleran un valor histórico ausente, nulo, vacío o desconocido y muestran **Uncategorized / Sin categoría**. Ese fallback no es una categoría número 111, nunca se persiste y no coincide con un filtro de categoría; para editar la oferta se debe elegir una clave válida.

### Lifecycle routing guide / Guía por etapa del ciclo

${markdownTable(
  ["Area / Área", "Keys / Claves", "Selection boundary / Criterio de selección"],
  [
    ["Clinical preparation / Preparación clínica", "1–5", "Counseling, phenotype intake, consent, test choice or issuance of the order; stop at the exact action sold. / Asesoramiento, admisión fenotípica, consentimiento, selección del estudio o emisión de la orden; se elige la acción exacta vendida."],
    ["Specimen and laboratory / Muestra y laboratorio", "6–12", "Collection, transport, accession/quality, DNA extraction, sequencing, targeted genotyping or chromosome-level analysis. / Toma, transporte, recepción/calidad, extracción de ADN, secuenciación, genotipado dirigido o análisis cromosómico."],
    ["Specialized screening / Cribados especializados", "13–14", "Use only for prenatal screening or reproductive carrier screening; these are purpose-defined screenings, not generic sequencing or final clinical interpretation. / Se usa solo para cribado prenatal o de portadores reproductivos; son cribados definidos por propósito, no secuenciación genérica ni interpretación clínica final."],
    ["Bioinformatics pipeline / Flujo bioinformático", "15–20", "Quality control, alignment, small-variant calling, structural/CNV analysis, annotation or prioritization; each key names one computational boundary. / Control de calidad, alineamiento, detección de variantes pequeñas, análisis estructural/CNV, anotación o priorización; cada clave representa un límite computacional."],
    ["Interpretation by purpose / Interpretación por propósito", "21–27", "General clinical interpretation or a purpose-specific analysis for rare disease, hereditary cancer, pharmacogenomics, nutrigenomics/metabolism, ancestry or polygenic risk. / Interpretación clínica general o análisis específico de enfermedad rara, cáncer hereditario, farmacogenómica, nutrigenómica/metabolismo, ascendencia o riesgo poligénico."],
    ["Reporting and exchange / Informes e intercambio", "28–30", "Create a report, independently review a completed report, or convert/validate files without biological interpretation. / Crear un informe, revisar de forma independiente un informe terminado o convertir/validar archivos sin interpretación biológica."],
    ["Complete human reports / Informes humanos integrales", "31–43", "Use only when collection, laboratory genomics, interpretation and the named human health, wellness, ancestry or trait report are sold as one inseparable service. / Usar solo cuando la toma, el estudio genómico de laboratorio, la interpretación y el informe humano de salud, bienestar, ascendencia o rasgos se venden como un servicio indivisible."],
    ["Complete reproductive and early-life reports / Informes reproductivos y de primera etapa de vida integrales", "44–54", "Carrier, fertility, sperm-DNA, karyotype, preimplantation, prenatal or newborn pathways that begin with the required sample and end with the purpose-specific report. / Circuitos de portación, fertilidad, ADN espermático, cariotipo, preimplantación, etapa prenatal o neonatal que comienzan con la muestra requerida y terminan con el informe específico."],
    ["Complete animal and authentication reports / Informes animales y de autenticación integrales", "55–60", "Species-aware animal health, traits, diversity, identity or food-authentication workflows delivered from verified sampling through the final report. / Circuitos por especie de salud, rasgos, diversidad, identidad animal o autenticación alimentaria entregados desde el muestreo verificado hasta el informe final."],
    ["Health and reproductive guidance / Orientación en salud y reproducción", "61–68", "Non-emergency medical, medication, nutrition, rehabilitation, reproductive, sexual-health, pregnancy or postpartum guidance; choose the professional scope actually contracted. / Orientación no urgente médica, farmacéutica, nutricional, de rehabilitación, reproductiva, de salud sexual, embarazo o posparto; se elige el alcance profesional efectivamente contratado."],
    ["Psychological and social support / Apoyo psicológico y social", "69–76", "Psychological, relationship, grief, addiction-recovery, parenting, caregiving, accessibility or social-resource support; emergency response and formal certifications stay outside these categories. / Apoyo psicológico, vincular, en duelo, recuperación de adicciones, crianza, cuidados, accesibilidad o recursos sociales; la respuesta de emergencia y las certificaciones formales quedan fuera de estas categorías."],
    ["Legal guidance / Orientación jurídica", "77–81", "Civil, family and estate, labor, commercial-contract or immigration advice under the provider's declared jurisdiction; representation is included only when explicitly stated. / Asesoramiento civil, de familia y sucesiones, laboral, comercial-contractual o migratorio bajo la jurisdicción declarada por el prestador; la representación solo se incluye cuando se indica expresamente."],
    ["Education and career / Educación y carrera", "82–86", "Tutoring, specialized learning support, language instruction, admissions planning or career guidance; no credential, admission, funding or employment result is implied. / Tutoría, apoyo especializado al aprendizaje, enseñanza de idiomas, planificación de admisiones u orientación profesional; no se presume un título, admisión, financiamiento ni empleo."],
    ["Technology, business and finance / Tecnología, negocios y finanzas", "87–90", "Practical digital support, cybersecurity/privacy consulting, entrepreneurship consulting, or financial/accounting/tax guidance, each limited to the provider's declared competence and authorization. / Soporte digital práctico, consultoría en ciberseguridad y privacidad, consultoría para emprendimientos o asesoramiento financiero, contable e impositivo, cada uno limitado a la competencia y habilitación declaradas por el prestador."],
    ["Health professional development and healthcare improvement / Desarrollo profesional y mejora en salud", "91–100", "Career and professional development, clinical mentoring, leadership, training design, research and publication support, evidence-based practice, quality and safety, or practice operations; choose the exact professional or organizational outcome contracted. / Desarrollo de carrera y profesional, mentoría clínica, liderazgo, diseño de capacitación, apoyo en investigación y publicación, práctica basada en evidencia, calidad y seguridad u operaciones de prácticas; se elige el resultado profesional u organizacional exacto contratado."],
    ["Digital health and health technology / Salud digital y tecnología sanitaria", "101–110", "Digital-health strategy, system implementation and optimization, interoperability, telehealth, health-data governance, responsible AI adoption, medical-technology products, infrastructure, usability, human factors, or accessibility; select the exact advisory outcome rather than a clinical service or custom engineering deliverable. / Estrategia de salud digital, implementación y optimización de sistemas, interoperabilidad, telesalud, gobierno de datos de salud, adopción responsable de inteligencia artificial, productos de tecnología médica, infraestructura, usabilidad, factores humanos o accesibilidad; se selecciona el resultado de asesoramiento exacto y no un servicio clínico ni un desarrollo de ingeniería a medida."]
  ]
)}

### Exact 110-value registry / Registro exacto de 110 valores

${markdownTable(
  ["Key", "English", "Español", "SF Symbol", "Closed definition (English)", "Definición cerrada (español)"],
  serviceOfferTypeCatalog.serviceOfferTypes.map((type) => [
    `\`${type.key}\``,
    type.nameEnglish,
    type.nameSpanish,
    `\`${type.systemImage}\``,
    type.descriptionEnglish,
    type.descriptionSpanish
  ])
)}`;

const usageChapter = `## Request limits

Stable usage configuration is \`${usagePolicy.policy_configuration_defaults.total_transaction_limit}\` total transactions, \`${usagePolicy.policy_configuration_defaults.daily_transaction_limit}\` per UTC day, and a \`${usagePolicy.policy_configuration_defaults.cooldown_seconds}\`-second cooldown unless policy configuration changes.

Usage state is functional and recomputed from root \`service_transactions\` using \`requestedAt\` plus the active requester key: \`requestedByUserId\` for an authenticated requester or the exact normalized \`requestedByUserEmail\` for an email-only requester. Never persist today's count, remaining tokens, last transaction time, cooldown start/end, next request time, or pending admissions. UTC buckets split at 00:00 UTC; the UI displays the reset in device-local time. When daily reset and cooldown both apply, the later deadline wins.

Admission runs before form-object persistence and provider dispatch. A denied attempt creates no transaction, file, uploaded object, code, owner normalization, counter, or cooldown record. \`catalog/usage-policy.json\` remains the executable source and declares both authenticated and deferred requester keys.`;

const nativeChapter = `## Native files and URLs

All PGO download URLs are absolute HTTPS and preserve query parameters. URLs may be opaque and need no filename extension. The client downloads and inspects actual native content with the supported parser; it must report ambiguity rather than guess.

Native interactive-report mappings remain:

| File | Model | Provider format |
| --- | --- | --- |
| \`.pgi1.json\` | \`MDMAPIModel\` | \`mdm\` |
| \`.pgi2.json\` | \`AGAPIModel\` | \`ag\` |
| \`.pgi3.json\` | \`TwoPQAPIModel\` | \`2pq\` |

These mappings belong to native parser configuration, not each \`pgo_interactive_report\`. The six single-file PGOs contain exactly \`title\`, \`download_url\`, and optional \`notes\`; aligned reads may additionally contain \`index_download_url\`.`;

const deletedIdentityContractBody = `This contract applies whenever retained application data references a person, profile, professional, publisher, provider, owner, requester, participant, or organization whose canonical identity no longer exists. It applies to every current and future feature, even when that feature is not named below.

### Non-cascading continuity rule

Deleting an account or identity does not implicitly delete otherwise valid content or business records created by, owned by, requested by, published by, or associated with that identity. Posts, replies, reference cards, conversations, events, activity entries, relationships, service offers, service transactions, reports, Pocket Genes Objects, stored files, audit records, and other surviving records remain available wherever their own retention, moderation, privacy, authorization, and lifecycle rules allow them to appear.

The absence of the referenced identity changes attribution and identity-targeted actions; it does not make the surviving record malformed. Clients must not discard a valid record merely because its creator, owner, requester, provider, publisher, or participant lookup is missing. Content is removed only by its own explicit deletion, moderation, legal, retention, or lifecycle rule. Account deletion is never an inferred cascade.

Keeping a record does not widen access. Existing authorization, access-code, transaction-party, report, object, file, and privacy boundaries still apply. A missing owner must never cause ownership or administrative rights to transfer to another user, and cached email, username, display name, avatar, logo, or raw ID must never be used to bypass those boundaries.

### Authoritative identity states

Every identity reference is resolved through the shared \`DeletedUserProvider\` contract into exactly one runtime state:

1. **Loading/unresolved:** no authoritative result exists yet. Show a neutral loading presentation when needed and do not enable identity-targeted actions.
2. **Active:** a successful authoritative lookup found the canonical identity. Normal presentation and actions may be used, subject to their ordinary authorization.
3. **Deleted:** a successful server lookup authoritatively confirmed that the canonical identity document does not exist, or a trusted backend deletion marker confirms deletion. Only this state may use deleted-identity copy.
4. **Unavailable:** the lookup failed, timed out, was denied, returned malformed data, received an invalid/blank reference, or otherwise could not establish existence. This is not deletion. Show a retryable unavailable state and never label it **Deleted**.

A missing embedded snapshot, missing avatar, empty display name, cached miss, offline cache, permission error, or network error is not evidence of deletion. Authoritative active/deleted results may be cached for a short bounded period and invalidated on authentication or account lifecycle changes. User-owned mutations must force a fresh authoritative check because an authentication session can outlive account deletion.

### Single presentation authority

\`DeletedUserProvider\` is the single point of contact on every client, including iOS, Android, and web, for identity availability and deleted/unavailable presentation. Despite its historical name, its presentation contract covers user, profile, professional, owner, publisher, provider, and organization references. Lookup adapters may resolve different canonical collections, but feature code must not invent its own tombstones.

The provider owns:

- State resolution, batching, deduplication, bounded caching, invalidation, and retry behavior.
- Context-aware localized display names, descriptions, accessibility labels, icons, colors, full-state views, and navigation destinations.
- The decision to suppress cached identity imagery and personal text after confirmed deletion.
- The active-identity guard used immediately before mutations that require a live actor.

Feature screens own their surviving domain content and authorization rules, but consume the provider's presentation. They must not hardcode **Deleted user**, select a one-off icon, expose a raw identifier, or independently infer deletion.

### Canonical deleted presentation

A confirmed deleted identity uses a neutral gray crossed-out/slashed profile icon. The default cross-platform semantic asset is \`person.crop.circle.badge.xmark\` (or the visually equivalent platform icon) with \`#8E8E93\`. It has no remote image URL. Preserved snapshots may remain in storage for historical integrity, but client rendering must ignore their former avatar, logo, icon, color, username, full name, email, and organization name once deletion is confirmed.

The provider selects localized context-aware copy:

| Context | Primary English fallback | Intended use |
| --- | --- | --- |
| Person byline, message, participant, requester, friend | **Deleted user** | A missing human account in retained content or a relationship. |
| Profile destination | **Deleted profile** | A route whose primary resource was the deleted person's profile. |
| Organization, institutional publisher, organization owner | **Deleted organization** | A missing organization identity or publisher record. |
| Professional publisher or service provider | **Deleted provider** | A missing professional/provider identity when provider wording is clearer than user wording. |
| Generic ownership field | **Deleted owner** | A report/object owner row when person versus organization cannot be established safely. |

Spanish and every other supported locale must receive real translations from the provider. Screens must not concatenate localized fragments. Accessibility labels must convey both the identity kind and that it was deleted; color and the crossed-out mark cannot be the only signal.

Unavailable identity presentation must be visibly and semantically different: use provider-owned **User information unavailable** or context equivalent, an unavailable/warning icon, and **Try again** when retry is possible. It must not reuse deleted wording, imply permanent deletion, or silently fall back to stale personal data.

### Surface-by-surface behavior

| Surface or record | What survives | Deleted-identity behavior |
| --- | --- | --- |
| Community posts, replies, comments, reactions, reference cards, and quoted content | The content, timestamps, counts, attachments, and thread structure remain under their own rules. | Replace the author identity only. The card/detail remains readable and tappable. The byline uses **Deleted user** and the gray crossed-out icon; the identity control opens the deleted-profile state instead of a live profile. |
| Public/private community profile and activity routes | Links from retained content may still navigate to the former identity route. | Show a complete deleted-profile state with no former personal fields. Activity that cannot exist without the profile gets an intentional empty/deleted state; never crash or synthesize a profile. |
| Rare Friends connections, requests, suggestions, circles, participant lists, chat threads, messages, and notifications | Historical relationship, circle, message, and notification records remain when their own rules retain them. | Historical rows/messages show a tombstone identity. Do not allow new friendship requests, follows, invitations, direct chats, or other mutations targeting the deleted identity. Active-only discovery/suggestion lists may exclude deleted identities. If no actionable identities remain, show that surface's normal empty state. |
| Discover feed items, news, research, opportunities, events, saved items, and spotlight references | Published/editorial content remains readable, shareable, and saved according to its own status. | Override stale \`publisherSnapshot\` identity presentation. Publisher taps open a deleted-profile/organization/provider state. A missing publisher never causes a valid feed item or event to disappear. Active publisher directories may exclude deleted publishers because those lists advertise actionable identities. |
| Service offers | Historical offer content and references remain available where the product normally exposes them. | Show **Deleted provider** or **Deleted organization** in place of the former provider. Disable a new request, contact, follow, or other action that requires the missing provider; do not infer a replacement provider. Existing transactions remain reachable. |
| Service transactions and process history | Contract snapshot, status, stages, inputs, outputs, dates, and audit history remain visible to already-authorized parties. | A deleted requester or provider is tombstoned in its role. Do not attach the transaction to a different account, recover identity from email, or expose former personal data. Provider/requester-targeted actions are disabled, while authorized access to surviving transaction details and outputs continues. |
| Reports, report owners, uploaded objects, object owners, access-code records, and stored files | The report/object/file remains governed by its own owner, code, storage, and authorization records. | Render the missing creator/owner/provider through the provider. Do not delete the report/object, invalidate a legitimate code solely because identity presentation is missing, grant management rights, or replace the owner. Missing subordinate data gets a contextual empty state. |
| Pocket Genes Object content | The strict serialized domain payload is unchanged. | Never add deleted-user flags, names, icons, owner IDs, creator snapshots, tombstones, or platform envelopes to PGO JSON. Resolve deleted identity only at surrounding \`uploaded_objects\`, \`object_owners\`, \`service_transactions\`, Discover publisher, report, and UI presentation boundaries. |
| Events, activity/audit entries, and in-app notifications | Historical event and audit facts remain according to their independent policy. | Preserve the fact and replace only actor presentation. If the target content itself is gone, show the event/notification's missing-content state rather than pretending the actor deletion removed it. |
| Organizations, professionals, publishers, and providers | Surviving content and business history that reference the entity remain. | Use the context label and gray crossed-out identity visual; suppress the former logo and contact data. Active catalogs may omit the missing entity, but historical content must still render. |
| Any future actor-linked feature | Its domain record survives according to its own policy. | Resolve every actor reference through \`DeletedUserProvider\`. A feature is incomplete if a missing identity can hide surviving content, leak stale identity data, expose a raw ID, enable a forbidden mutation, or crash. |

### Navigation, interaction, and empty states

Content navigation and identity navigation are separate. Tapping a retained post, reply, event, offer, transaction, report, object, or message opens that surviving record when the viewer is authorized. Tapping its deleted avatar/name opens the provider-owned deleted state. Deep links to deleted profiles, owners, publishers, providers, or organizations must resolve to that same fallback instead of failing navigation.

Actions that operate on surviving content, such as reading, sharing, saving, downloading an already-authorized output, or viewing transaction progress, continue under normal rules. Actions that require the deleted principal, including follow, friend request, invite, start-chat, provider contact, ownership transfer acceptance, editing as that owner, or creation of a new service request, are absent or disabled with provider-owned explanatory copy. Mutation code must reject the operation even if stale UI left a control visible.

Identity absence is not a content empty state. A list of retained posts from deleted authors still shows the posts. A conversation with deleted senders still shows retained messages. Use an empty state only when the domain query itself has no visible records or the requested subordinate resource is independently missing. Detail screens must tolerate absent optional profile, owner, provider, report, object, attachment, participant, or contact data and replace the missing region with a contextual empty state rather than force-unwrapping, spinning forever, or removing the whole surviving record.

### Backoffice and persistence responsibilities

Deletion tooling must make non-cascading behavior explicit. Removing authentication, community user, public/private profile, or an organization/professional identity must not issue broad deletes against content, relationship history, offers, transactions, reports, objects, files, events, or audit records unless a separate explicit policy requires that exact deletion. It may clean active-only indexes and future-action queues, but retained records keep stable foreign IDs so the provider can resolve their presentation deterministically.

Clients must not rewrite every historical record to copy a tombstone, and no collection gains ad hoc \`isDeletedUser\`, deleted-name, or deleted-avatar aliases. The canonical identity lookup (or trusted deletion marker) determines runtime state. Existing snapshots remain provenance only and are overridden at presentation time. Logging and analytics may retain opaque IDs where policy permits, but user-facing UI never shows a raw deleted identity ID or personal snapshot as fallback.

Every producer that persists actor-linked data must write the stable canonical reference available at that boundary. These references are platform metadata, never serialized PGO content:

| Retained boundary | Stable reference used for runtime resolution |
| --- | --- |
| Community posts, replies, messages, reactions, Rare Friends relationships/circles, notifications, events, and audit entries | The canonical community-user ID, plus an explicit actor kind only when the record can reference more than one identity collection. |
| Discover feed items, saved items, opportunities, events, organizations, and professionals | Publisher ID plus publisher kind, resolved against \`feed_organizations\` or \`feed_individuals\`. A publisher snapshot is display provenance only. |
| \`service_offers\` and \`service_transactions\` | \`providerId\` plus \`providerKind\`; authenticated transactions also retain \`requestedByUserId\`. Snapshot names and requester emails never replace those references. |
| \`uploaded_reports\` and \`report_owners\` | \`report_owner_id\` and, when the owner is tied to an account, \`owner_community_user_id\`. |
| \`uploaded_objects\` and \`object_owners\` | \`object_owner_id\` and \`owner_community_user_id\`; service-created objects additionally retain \`provider_id\` plus \`provider_kind\`. |
| \`file_storage\` | Authenticated submissions retain \`submitted_by_user_id\`; provider-produced files also retain \`provider_id\` plus \`provider_kind\` when that canonical provider is known. |

New writes must not rely on email, username, display name, avatar URL, logo URL, or other mutable personal text as the only actor reference. A legacy record with no usable canonical ID is **Unavailable**, not **Deleted**: keep the domain record, suppress stale personal snapshots, show the provider-owned unavailable state, and do not guess identity by email. A record with a usable canonical reference must resolve that reference before rendering its identity region, even when a cached snapshot is present.

### Platform parity and acceptance tests

iOS, Android, and web must implement the same state machine, evidence rules, labels by context, gray crossed-out visual semantics, navigation results, mutation guards, retry behavior, accessibility meaning, and English/Spanish localization wherever the corresponding surface exists. Layout may be native to each platform; behavior may not diverge.

Minimum automated coverage includes:

1. Provider unit tests for active, deleted, unavailable, loading, invalid ID, authoritative cache expiry/invalidation, request deduplication, batch lookup, forced refresh, and stale completion handling.
2. Negative tests proving timeout, permission denial, malformed data, missing snapshot object, offline state, and missing embedded snapshots never become **Deleted**.
3. Presentation tests proving deleted state suppresses every cached avatar/logo/name/email/color and emits the provider-owned context label, icon, gray color, description, and accessibility label.
4. Feature tests for community posts/replies/profiles/activity, Rare Friends connections/circles/chat, Discover publishers/events, services/offers/transactions, and report/object/owner details. Each test keeps the domain record visible while replacing identity presentation.
5. Navigation tests proving identity taps and deep links reach the deleted or retryable unavailable state, while content taps still reach surviving authorized content.
6. Mutation tests proving stale sessions and stale UI cannot post, reply, follow, connect, message, administer, transfer, contact, or request work as/with a deleted principal.
7. Empty-state and malformed-reference tests proving missing nested data cannot crash, loop indefinitely, reveal a raw ID, or erase otherwise valid parent content.
8. Contract tests proving serialized PGO files remain unchanged and reject any attempted deleted-identity metadata or platform envelope.
9. Cross-platform snapshot/semantic assertions for the gray crossed-out icon, context-specific localized copy, retryable unavailable state, and accessibility labels.

The acceptance rule is universal: every retained record must remain coherent when each actor reference is independently active, deleted, temporarily unavailable, loading, malformed, or absent. New actor-linked surfaces must add these cases before they are complete.`;

const deletedIdentityChapter = `## Deleted identity continuity

${deletedIdentityContractBody}`;

const strictSchemaChapter = `## Strict first schema

This is the first PGO content schema and it has not shipped to production. There is no legacy compatibility reader, alias, fallback, dual decoder, or runtime migration utility. Writers emit only the strict allowlists; readers reject envelopes, removed keys and unknown properties immediately.

Repository fixtures and generators were replaced at their source instead of converted at runtime. Existing platform records may still surround strict content for identity, ownership and transaction tests, but that wrapper is not accepted as a PGO file. No discarded field is copied into \`notes\`, and no old local payload path is rewritten into a fabricated URL.

The repository fixtures are synthetic schema examples using the IANA-reserved \`example.com\` domain. They are not production objects and are never represented as live downloads.`;

const validationChapter = `## Validation and acceptance

The executable validator checks all twenty schemas, examples, notes variants, unknown-field rejection, exact PDF minimum, standalone symptoms/genes/specimens, Other behavior, direct component URLs, strict forms, service copies, provider examples, naming boundaries, deferred transaction indexing, native PGI mappings, generator idempotence, and the usage policy.

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

${downloadedFileUpdateSummary}

${deletedIdentityChapter}

${serviceOfferTypeChapter}

${usageChapter}

${nativeChapter}

${strictSchemaChapter}

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

${downloadedFileUpdateSummary}

${deletedIdentityChapter}

${serviceOfferTypeChapter}

${usageChapter}

${nativeChapter}

${strictSchemaChapter}

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

${downloadedFileUpdateSummary}

${deletedIdentityChapter}

${usageChapter}

The available-services list reads only active, non-hidden Firebase offers whose highlighted or professional segment flag is enabled. A request form is produced only when the selected offer declares its matching \`pgo_form\` input. Confirmation, validation/loading, congrats, transaction detail, process tracking, provider contact, contract document, input downloads and delivered results are separate native states. Transaction detail shows explicit empty states for missing input and output contracts instead of inventing rows.

The strict first-schema redesign changes object payloads only. Offers allow the explicit email-only request route described above. The account transaction list remains authenticated; the signed-out device modal is a read-only view constrained to the locally retained email's verified deferred index. Publisher resolution, ownership, role binding, delivery consistency, provider email lookup, and transaction visibility remain enforced.`;
writeText(path.join(root, "docs/native-services-current-state.md"), nativeServices);

const pgiFormats = `# Native PGI Formats

${nativeChapter}

The PGI models are provider-native report payloads and do not gain PGO registration fields or \`notes\`. A \`pgo_interactive_report\` is only a title and HTTPS reference to one supported native file. Parsing happens after download from actual bytes, not from a guessed URL suffix.`;
writeText(path.join(root, "docs/pgi-native-formats.md"), pgiFormats);

const ownership = `# Ownership and Service Fulfillment

${serviceArchitecture}

${deletedIdentityChapter}

${strictSchemaChapter}

## Responsibility

The object/report administrator warrants that they are authorized to seed and share the file. Downloaders must protect access codes. Providers remain responsible for their contracted work. Pocket Genes provides distribution, access and exploration infrastructure and is not the author of third-party clinical content.

## Collections

Report and object owner records remain separate. Objects use nine-digit numeric codes, \`object_codes\`, \`uploaded_objects\`, and \`object_owners\`; reports use six-character alphanumeric codes and their parallel collections. Stored files are agnostic and may back either domain. No PGO content duplicates owner or access facts.`;
writeText(path.join(root, "docs/ownership-and-service-fulfillment.md"), ownership);

const downloadedFileUpdates = `# Downloaded-File Update Lifecycle

${downloadedFileUpdateContractBody.replaceAll("\n### ", "\n## ")}`;
writeText(path.join(root, "docs/downloaded-file-updates.md"), downloadedFileUpdates);

const deletedIdentityContinuity = `# Deleted Identity Continuity

${deletedIdentityContractBody.replaceAll("\n### ", "\n## ")}`;
writeText(path.join(root, "docs/deleted-identity-continuity.md"), deletedIdentityContinuity);
writeText(path.join(repositoryRoot, "DELETED_IDENTITY_CONTINUITY_CONTRACT.txt"), deletedIdentityContinuity);

const readme = `# Pocket Genes Catalog Wiki

Strict schema-1 reference package for twenty Pocket Genes Object types, fifteen fictional service examples, six fictional providers, native PGI formats, transaction contracts and request-limit policy.

The universal [deleted-identity continuity contract](docs/deleted-identity-continuity.md) defines non-cascading content retention, the shared \`DeletedUserProvider\` presentation boundary, platform parity, and the strict separation between deleted identity fallback and serialized PGO content.

The [downloaded-file update lifecycle](docs/downloaded-file-updates.md) defines canonical report/object identity and version checks, the three automatic/manual run intents, quiet current-file probing, blacklist and manual-update behavior, sequential safe replacement, privacy, failure recovery, and iOS/Android parity.

Run:

\`\`\`sh
node generate_minimal_pgo_contracts.mjs
python3 validate_catalog.py
\`\`\`

The generator rewrites every derived schema, example, service/provider fixture and Markdown reference. The validator rejects the retired envelope and unknown keys. \`catalog/usage-policy.json\` declares both authenticated and email-only requester accounting.`;
writeText(path.join(root, "README.md"), readme);

console.log(`Generated ${objectPages.length} object pages, ${servicePages.length} service pages, ${providerPages.length} provider pages, and canonical wiki chapters.`);
