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

A service offer is an untimed, provider-owned published template. It selects a real Discover organization or professional individual, declares zero or more required input slots, zero or more output slots, integer contract versions, work description, optional commercial terms, and at least one stage. Offers start as draft and become selectable only through publish/active state. \`isHiddenFromSearch\` always removes an offer from discovery without hiding transactions already created from it. Otherwise, \`isHighlightedOffer\` places it under Highlighted and \`isProfessionalOffer\` places it under For professionals; an offer may appear in both segments, and one with both flags false appears in neither.

The full highlighted card requires both conditions: \`isHighlightedOffer\` is true and a normalized \`promotionalBannerImageUrl\` or, when no URL is present, \`promotionalBannerImageUploadDataUrl\` is available. An offer with a banner but \`isHighlightedOffer\` false uses the regular service cell with the complete banner as its top section. If both image properties are absent, null or empty, the regular cell reserves no banner box, even when \`isHighlightedOffer\` is true. Both banner presentations use a 1024:500 frame and aspect-fit rendering so the entire image remains visible without cropping. Segment flags continue to determine whether the offer is listed under Highlighted, For professionals, or both.

\`inputSlots\` and \`outputSlots\` are explicit arrays, but each may be empty independently and both may be empty simultaneously. A service may therefore require no form or input object, may finish without producing an object, or may represent provider work with neither object inputs nor object outputs. Empty arrays never create placeholder slots, synthetic objects, or hidden requirements. The calculated \`shortContract\` uses \`none\` for each empty side: \`none -> report:pdf_report\`, \`form:form -> none\`, or \`none -> none\`. Native contract and transaction screens show intentional empty states for those sides instead of fabricated rows.

If and only if an offer enables form input, it declares exactly one required \`pgo_form\` slot with role \`form\` and a matching external \`formShape\`. Manual slots cannot use \`pgo_form\`. The external shape retains generated ID and integer version; the submitted PGO freezes only its field definitions and answers.

### Transactions

A transaction is a timed execution created from an existing active offer. It inherits the pinned service ID/version, provider, input slots, and output slots, including explicit empty arrays. Transaction identity and time use root transaction fields; they are not generated form answers. \`requestedByUserId\` is always optional because a requester may not have an account yet. Every new transaction must have at least one requester identity: an authenticated request has \`requestedByUserId\` and may retain \`requestedByUserEmail\`; an accountless request has a normalized \`requestedByUserEmail\` and no \`requestedByUserId\`. An offer with no form and no input slots proceeds directly to confirmation and admission without creating a form object or asking for files.

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

Missing, malformed, email-mismatched, or conflicting transactions are never attached to the user; unresolved valid references remain available for a later safe retry. Feature-specific post-login work runs only after this normalization attempt finishes. After linking, native reloads \`requestedServiceTransactions\`, so the normalized transactions appear in the standard list. In the **View my reports** flow, entering the authenticated downloaded-files screen then runs the existing pending-output discovery against the normalized transaction index, allowing newly linked delivered files to appear immediately as download options. The email may remain on the full transaction as immutable requester provenance, but future authorization and user-list lookup use \`requestedByUserId\`.

The native requester sequence is:

1. Validate the offer, form, all selected object references, and either the authenticated user identity or collected normalized email without writing.
2. Recompute usage limits from root transactions by \`requestedByUserId\` for an authenticated requester or by \`requestedByUserEmail\` for an email-only requester.
3. Approve or deny before creating a provider-owned form object.
4. When approved, create the strict pgo_form file under the provider organization, register its object/code, and download the requester's local copy.
5. Create the service transaction and either the reduced authenticated-user snapshot or the one-per-email deferred index entry.
6. Present confirmation over the service hub, then allow process tracking.

Status progression is controlled by provider/backoffice work. Native users cannot force progress. \`delivered\` is the successful final state and requires every contractually promised output PGO snapshot in \`outputObjects\`. When \`outputSlots\` is empty, \`delivered\` is consistent only with an empty \`outputObjects\` array and no object is required to prove completion. Optional \`outputReports\` do not satisfy a declared PGO output slot.

### Ownership and delivery

The creator/administrator of an object is its seeder and may manage its stored source. \`is_clinician\` grants access to both report and object administration; it does not itself confer ownership. Pocket Genes transports and presents authorized files but does not warrant their clinical content.

Service offers are the primary way a regular user requests new objects. Backoffice/provider tooling performs fulfillment, registers output objects, and marks delivery. The requester keeps the transaction while work is pending, then downloads, opens, and updates delivered objects through the normal nine-digit object-code circuit.

Physical specimen identity, custody and consumption safeguards remain operational controls outside PGO content. A transport transaction moves an existing specimen; it does not create duplicate biological material.`;

const serviceOfferTypeChapter = `## Closed service-offer type registry

This registry is the complete and exclusive taxonomy for service offers. It contains exactly 30 values and is intentionally closed: adding a category requires a coordinated contract change to the canonical catalog, schema, validator, documentation, native provider and tests.

Este registro es la taxonomía completa y exclusiva de las ofertas de servicios. Contiene exactamente 30 valores y es cerrado de manera intencional: agregar una categoría requiere un cambio coordinado del catálogo canónico, el esquema, el validador, la documentación, el proveedor nativo y las pruebas.

### Persistence and selection rules / Reglas de persistencia y selección

- **Persist the key only / Persistir únicamente la clave.** The field is the lower-camel-case \`service_offers.serviceCategory\`, and its value is one exact, case-sensitive \`sot_*\` key from the table. Never write \`service_category\`, a translated label, a description or an SF Symbol. / El campo es \`service_offers.serviceCategory\` en lower camel case y su valor es una clave \`sot_*\` exacta y sensible a mayúsculas de la tabla. Nunca se guarda \`service_category\`, una etiqueta traducida, una descripción ni un SF Symbol.
- **Exactly one category per offer / Exactamente una categoría por oferta.** Select the category that describes the offer's primary contracted and billable outcome. Inputs, supporting steps and the provider's profession do not determine the category. / Se selecciona la categoría que describe el resultado principal contratado y facturable. Los insumos, pasos auxiliares y la profesión del proveedor no determinan la categoría.
- **Split independently marketed outcomes / Separar resultados comercializados por separado.** If two outcomes can be requested or fulfilled independently, publish separate offers. If several steps are inseparable parts of one package, use the category of the final primary outcome and describe the included supporting work in the offer. / Si dos resultados pueden solicitarse o cumplirse de manera independiente, se publican ofertas separadas. Si varios pasos son partes inseparables de un paquete, se usa la categoría del resultado final principal y se describe el trabajo auxiliar incluido en la oferta.
- **No aliases or inferred values / Sin alias ni valores inferidos.** Writers and backoffice validation accept only registered keys. Labels are localized at display time from the registry, and the SF Symbol is presentation metadata for the picker. / Los escritores y la validación de backoffice aceptan únicamente claves registradas. Las etiquetas se localizan al mostrarse desde el registro y el SF Symbol es metadato de presentación para el selector.
- **Historical fallback is display-only / El fallback histórico es solo visual.** Native readers tolerate a missing, null, empty or unrecognized historical value and display **Uncategorized / Sin categoría**. That fallback is not a 31st category, is never persisted, and does not match a category filter; editing the offer requires selecting a valid key. / Los lectores nativos toleran un valor histórico ausente, nulo, vacío o desconocido y muestran **Uncategorized / Sin categoría**. Ese fallback no es una categoría número 31, nunca se persiste y no coincide con un filtro de categoría; para editar la oferta se debe elegir una clave válida.

### Lifecycle routing guide / Guía por etapa del ciclo

${markdownTable(
  ["Area / Área", "Keys / Claves", "Selection boundary / Criterio de selección"],
  [
    ["Clinical preparation / Preparación clínica", "1–5", "Counseling, phenotype intake, consent, test choice or issuance of the order; stop at the exact action sold. / Asesoramiento, admisión fenotípica, consentimiento, selección del estudio o emisión de la orden; se elige la acción exacta vendida."],
    ["Specimen and laboratory / Muestra y laboratorio", "6–12", "Collection, transport, accession/quality, DNA extraction, sequencing, targeted genotyping or chromosome-level analysis. / Toma, transporte, recepción/calidad, extracción de ADN, secuenciación, genotipado dirigido o análisis cromosómico."],
    ["Specialized screening / Cribados especializados", "13–14", "Use only for prenatal screening or reproductive carrier screening; these are purpose-defined screenings, not generic sequencing or final clinical interpretation. / Se usa solo para cribado prenatal o de portadores reproductivos; son cribados definidos por propósito, no secuenciación genérica ni interpretación clínica final."],
    ["Bioinformatics pipeline / Flujo bioinformático", "15–20", "Quality control, alignment, small-variant calling, structural/CNV analysis, annotation or prioritization; each key names one computational boundary. / Control de calidad, alineamiento, detección de variantes pequeñas, análisis estructural/CNV, anotación o priorización; cada clave representa un límite computacional."],
    ["Interpretation by purpose / Interpretación por propósito", "21–27", "General clinical interpretation or a purpose-specific analysis for rare disease, hereditary cancer, pharmacogenomics, nutrigenomics/metabolism, ancestry or polygenic risk. / Interpretación clínica general o análisis específico de enfermedad rara, cáncer hereditario, farmacogenómica, nutrigenómica/metabolismo, ascendencia o riesgo poligénico."],
    ["Reporting and exchange / Informes e intercambio", "28–30", "Create a report, independently review a completed report, or convert/validate files without biological interpretation. / Crear un informe, revisar de forma independiente un informe terminado o convertir/validar archivos sin interpretación biológica."]
  ]
)}

### Exact 30-value registry / Registro exacto de 30 valores

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

const deletedIdentityContinuity = `# Deleted Identity Continuity

${deletedIdentityContractBody.replaceAll("\n### ", "\n## ")}`;
writeText(path.join(root, "docs/deleted-identity-continuity.md"), deletedIdentityContinuity);
writeText(path.join(repositoryRoot, "DELETED_IDENTITY_CONTINUITY_CONTRACT.txt"), deletedIdentityContinuity);

const readme = `# Pocket Genes Catalog Wiki

Strict schema-1 reference package for twenty Pocket Genes Object types, fifteen fictional service examples, six fictional providers, native PGI formats, transaction contracts and request-limit policy.

The universal [deleted-identity continuity contract](docs/deleted-identity-continuity.md) defines non-cascading content retention, the shared \`DeletedUserProvider\` presentation boundary, platform parity, and the strict separation between deleted identity fallback and serialized PGO content.

Run:

\`\`\`sh
node generate_minimal_pgo_contracts.mjs
python3 validate_catalog.py
\`\`\`

The generator rewrites every derived schema, example, service/provider fixture and Markdown reference. The validator rejects the retired envelope and unknown keys. \`catalog/usage-policy.json\` declares both authenticated and email-only requester accounting.`;
writeText(path.join(root, "README.md"), readme);

console.log(`Generated ${objectPages.length} object pages, ${servicePages.length} service pages, ${providerPages.length} provider pages, and canonical wiki chapters.`);
