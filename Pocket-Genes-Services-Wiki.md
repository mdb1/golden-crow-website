# Pocket Genes Objects and Services Wiki

This document is generated from the strict schema-1 catalog and is the shared source of truth for native apps, backend, backoffice, providers and documentation.

## Canonical content rule

This is schema 1. There is no legacy compatibility contract, no older production PGO JSON, and no fallback reader. A PGO file is a strict, standalone domain payload selected and validated as one of exactly twenty registered types. It is not a portable platform record and it does not identify itself.

The JSON root must not contain `object_id`, `object_type`, `schema_version`, `revision`, `created_at`, `created_by`, `input_refs`, or generic `files`. There is no `data` wrapper in the serialized file. Those concepts remain in the existing platform records only when an actual feature uses them.

Every type has optional root `notes: string`. Notes may be absent or empty. Notes never become a landfill for removed metadata.

### Content versus platform records

| Boundary | Responsibility | Naming |
| --- | --- | --- |
| Serialized PGO file | Strict domain allowlist only | snake_case |
| `uploaded_objects` | Type, code, owner, linked file, upload version | snake_case |
| `file_storage` | Stored-file identity and content/linkage | snake_case |
| `object_owners` / `object_codes` | Ownership and access lookup | snake_case |
| `service_offers` | Untimed published contract and slots | lower camel case |
| `service_transactions` | Timed request, role bindings, status and outputs | lower camel case |

The same concept intentionally changes casing at a boundary. There are no aliases, fallback reads, or dual writes.

## Exact object registry

| Type | Required content | Optional content |
| --- | --- | --- |
| `pgo_form` | `form_shape`, `fields` | `notes` |
| `pgo_bundle_of_symptoms` | `observations` | `notes` |
| `pgo_bundle_of_candidate_genes` | `genes` | `notes` |
| `pgo_informed_consent` | `title`, `text` | `status`, `accepted_by`, `accepted_at`, `notes` |
| `pgo_test_order` | `patient`, `test_name`, `sample_type` | `test_type`, `objective`, `clinical_suspicion`, `genes`, `notes` |
| `pgo_collection_request` | `patient`, `sample_type` | `collection_method`, `container`, `requested_quantity`, `collection_site`, `scheduled_at`, `notes` |
| `pgo_blood_sample` | `sample_label` | `material`, `container`, `volume_ml`, `notes` |
| `pgo_tissue_sample` | `sample_label` | `anatomical_site`, `preparation`, `notes` |
| `pgo_embryo_sample` | `sample_label`, `material_kind` | `embryo_identifier`, `notes` |
| `pgo_dna_sample` | `sample_label` | `volume_ul`, `concentration_ng_ul`, `notes` |
| `pgo_sequence_reads` | `title`, `reads` | `notes` |
| `pgo_sequence_data` | `title`, `download_url` | `notes` |
| `pgo_aligned_reads` | `title`, `download_url` | `index_download_url`, `notes` |
| `pgo_unannotated_vcf` | `title`, `download_url` | `notes` |
| `pgo_annotated_vcf` | `title`, `download_url` | `notes` |
| `pgo_interactive_report` | `title`, `download_url` | `notes` |
| `pgo_pdf_report` | `title`, `download_url` | `notes` |
| `pgo_image_bundle` | `title`, `images` | `notes` |
| `pgo_karyotype_result` | `result_notation` | `interpretation`, `notes` |
| `pgo_flow_cytometry_data` | `title`, `download_url` | `notes` |

## Service architecture

### Offers

A service offer is an untimed, provider-owned published template. It selects a real Discover organization or professional individual, may declare zero or more input slots and zero or more output slots independently, and declares integer contract versions, work description, optional commercial terms, and at least one stage. An offer may therefore have no inputs, no outputs, or neither. Offers start as draft and become selectable only through publish/active state. `isHiddenFromSearch` removes an offer from discovery without hiding transactions already created from it.

If and only if an offer enables form input, it declares exactly one required `pgo_form` slot with role `form` and a matching external `formShape`. Manual slots cannot use `pgo_form`. The external shape retains generated ID and integer version; the submitted PGO freezes only its field definitions and answers.

### Transactions

A transaction is a timed execution created from an existing active offer. It inherits the pinned service ID/version, provider, input slots, and output slots. Transaction identity and time use transaction fields such as `requestedAt` and `requestedByUserId`; they are not generated form answers.

The native requester sequence is:

1. Validate the offer, form and all selected object references without writing.
2. Recompute usage limits from root transactions.
3. Approve or deny before creating a provider-owned form object.
4. When approved, create the strict pgo_form file under the provider organization, register its object/code, and download the requester's local copy.
5. Create the service transaction and reduced user snapshot.
6. Present confirmation over the service hub, then allow process tracking.

Status progression is controlled by provider/backoffice work. Native users cannot force progress. `delivered` is the successful final state and requires every contractually promised output PGO snapshot in `outputObjects`. A contract with zero output slots may be marked delivered with an empty `outputObjects` array after the provider finishes its work. Optional `outputReports` do not satisfy a PGO output slot.

### Ownership and delivery

The creator/administrator of an object is its seeder and may manage its stored source. `is_clinician` grants access to both report and object administration; it does not itself confer ownership. Pocket Genes transports and presents authorized files but does not warrant their clinical content.

Service offers are the primary way a regular user requests new objects. Backoffice/provider tooling performs fulfillment, registers output objects, and marks delivery. The requester keeps the transaction while work is pending, then downloads, opens, and updates delivered objects through the normal nine-digit object-code circuit.

Physical specimen identity, custody and consumption safeguards remain operational controls outside PGO content. A transport transaction moves an existing specimen; it does not create duplicate biological material.

## Request limits

The usage policy is unchanged by the PGO redesign. Stable configuration is `20` total transactions, `5` per UTC day, and a `300`-second cooldown unless policy configuration changes.

Usage state is functional and recomputed from root `service_transactions` using `requestedByUserId` and `requestedAt`. Never persist today's count, remaining tokens, last transaction time, cooldown start/end, next request time, or pending admissions. UTC buckets split at 00:00 UTC; the UI displays the reset in device-local time. When daily reset and cooldown both apply, the later deadline wins.

Admission runs before form-object persistence and provider dispatch. A denied attempt creates no transaction, file, uploaded object, code, owner normalization, counter, or cooldown record. `catalog/usage-policy.json` remains the executable source and is intentionally untouched by this migration.

## Native files and URLs

All PGO download URLs are absolute HTTPS and preserve query parameters. URLs may be opaque and need no filename extension. The client downloads and inspects actual native content with the supported parser; it must report ambiguity rather than guess.

Native interactive-report mappings remain:

| File | Model | Provider format |
| --- | --- | --- |
| `.pgi1.json` | `MDMAPIModel` | `mdm` |
| `.pgi2.json` | `AGAPIModel` | `ag` |
| `.pgi3.json` | `TwoPQAPIModel` | `2pq` |

These mappings belong to native parser configuration, not each `pgo_interactive_report`. The six single-file PGOs contain exactly `title`, `download_url`, and optional `notes`; aligned reads may additionally contain `index_download_url`.

## Strict first schema

This is the first PGO content schema and it has not shipped to production. There is no legacy compatibility reader, alias, fallback, dual decoder, or runtime migration utility. Writers emit only the strict allowlists; readers reject envelopes, removed keys and unknown properties immediately.

Repository fixtures and generators were replaced at their source instead of converted at runtime. Existing platform records may still surround strict content for identity, ownership and transaction tests, but that wrapper is not accepted as a PGO file. No discarded field is copied into `notes`, and no old local payload path is rewritten into a fabricated URL.

The repository fixtures are synthetic schema examples using the IANA-reserved `example.com` domain. They are not production objects and are never represented as live downloads.

## Validation and acceptance

The executable validator checks all twenty schemas, examples, notes variants, unknown-field rejection, exact PDF minimum, standalone symptoms/genes/specimens, Other behavior, direct component URLs, strict forms, service copies, provider examples, naming boundaries, native PGI mappings, generator idempotence, and the unchanged usage policy.

Global object validity is distinct from service suitability. A provider may ask for clarification or reject an input that does not satisfy its published service, but it cannot make provider-specific prerequisites universally required PGO fields.

## Object reference pages

### 01. Form — `pgo_form`

A completed form with its frozen field definitions and typed answers.

**Nature:** virtual  
**Stages:** test_planning, wet_lab, bioinformatics  
**Serialized extension:** `.pgform.json`  
**Schema:** `schemas/objects/pgo_form.schema.json`  
**Example:** `examples/objects/pgo_form.pgform.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `form_shape` | `object` | Yes | Frozen form shape. |
| `fields` | `array<object>` | Yes | Submitted answers. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Frozen form structure

`form_shape` contains exactly `fields`. Definitions stay ordered. Every definition requires `key`, `label`, `type`, and `required`; only `options` and `help_info_text` are optional. `options` is required and nonempty only for `enum` and `multi_enum`, and must be omitted for every other type.

Field keys use `^[a-z][a-z0-9_]{0,63}$`. Labels contain 1 to 120 characters and optional `help_info_text` contains 1 to 500 characters after trimming. Each option value contains 1 to 128 characters and matches `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; its readable label contains 1 to 120 characters. Option values are unique within the field.

Answers contain exactly `key` and `value`. Keys must be unique and declared by the frozen shape. Values are validated against the matching definition, including enum membership and numeric array element types. Optional unanswered fields may be absent. An empty answer array is valid when no required field is unanswered.

Supported definition types:

`text`, `long_text`, `email`, `phone`, `url`, `address`, `postal_code`, `country_code`, `identifier`, `number`, `integer`, `positive_integer`, `percentage`, `boolean`, `date`, `datetime`, `time`, `enum`, `multi_enum`, `string_list`, `integer_list`, `number_list`.

There are no universal `requested_at`, `requested_by`, or `subject_id` questions. Request identity and time belong to the service transaction. Shape IDs and versions belong to the service-offer configuration, not this content.

## Enum choices

#### `form_shape.fields[].type` choices

| Stored value | Display label |
| --- | --- |
| `text` | text |
| `long_text` | long_text |
| `email` | email |
| `phone` | phone |
| `url` | url |
| `address` | address |
| `postal_code` | postal_code |
| `country_code` | country_code |
| `identifier` | identifier |
| `number` | number |
| `integer` | integer |
| `positive_integer` | positive_integer |
| `percentage` | percentage |
| `boolean` | boolean |
| `date` | date |
| `datetime` | datetime |
| `time` | time |
| `enum` | enum |
| `multi_enum` | multi_enum |
| `string_list` | string_list |
| `integer_list` | integer_list |
| `number_list` | number_list |

## Minimal example

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "presentation",
        "label": "Report presentation",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "clinical",
            "label": "Clinical"
          },
          {
            "value": "patient",
            "label": "For the patient"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "presentation",
      "value": "clinical"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Definition and answer keys must each be unique.
- Every answer key must be declared by the frozen form shape and match its declared type.
- enum and multi_enum require nonempty options; all other field types must omit options.
- Optional unanswered fields may be omitted and fields may be empty when no required answer exists.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 02. Symptom bundle — `pgo_bundle_of_symptoms`

A standalone set of readable symptom observations with optional terminology coding.

**Nature:** virtual  
**Stages:** test_planning  
**Serialized extension:** `.pgsymptoms.json`  
**Schema:** `schemas/objects/pgo_bundle_of_symptoms.schema.json`  
**Example:** `examples/objects/pgo_bundle_of_symptoms.pgsymptoms.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `observations` | `array<object>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Observation structure

Each nonempty `observations` item requires only `label`. It may add `presence` (`present`, `absent`, or `uncertain`) and a closed `code` object containing exactly `system` and `value`. Code systems are `hpo`, `snomed_ct`, and `other`. Free text without a code is valid.

## Enum choices

#### `observations[].presence` choices

| Stored value | Display label |
| --- | --- |
| `present` | present |
| `absent` | absent |
| `uncertain` | uncertain |

#### `observations[].code.system` choices

| Stored value | Display label |
| --- | --- |
| `hpo` | hpo |
| `snomed_ct` | snomed_ct |
| `other` | other |

## Minimal example

```json
{
  "observations": [
    {
      "label": "Hearing loss",
      "presence": "present"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 03. Candidate gene bundle — `pgo_bundle_of_candidate_genes`

A standalone nonempty list of candidate gene symbols.

**Nature:** virtual  
**Stages:** test_planning  
**Serialized extension:** `.pggenes.json`  
**Schema:** `schemas/objects/pgo_bundle_of_candidate_genes.schema.json`  
**Example:** `examples/objects/pgo_bundle_of_candidate_genes.pggenes.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `genes` | `array<string>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Gene entries

`genes` is a nonempty ordered array of nonempty gene-symbol strings. It contains no ranking, namespace, evidence, symptom reference, or method object.



## Minimal example

```json
{
  "genes": [
    "BRCA1",
    "BRCA2"
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 04. Informed consent — `pgo_informed_consent`

Readable informed-consent content with optional explicit workflow state and acceptance facts.

**Nature:** virtual  
**Stages:** test_planning, wet_lab, bioinformatics  
**Serialized extension:** `.pgconsent.json`  
**Schema:** `schemas/objects/pgo_informed_consent.schema.json`  
**Example:** `examples/objects/pgo_informed_consent.pgconsent.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Consent title. |
| `text` | `string` | Yes | Actual consent text. |
| `status` | `enum<string>` | No | Consent workflow state. |
| `accepted_by` | `string` | No | Actual person who accepted the consent. |
| `accepted_at` | `string` | No | Actual acceptance time. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Consent meaning

`text` is the actual consent text. Optional status is exactly `pending`, `accepted`, `declined`, or `withdrawn`. Upload and schema validity never imply acceptance. `accepted_by` and `accepted_at` describe the actual acceptance only when known.

## Enum choices

#### `status` choices

| Stored value | Display label |
| --- | --- |
| `pending` | pending |
| `accepted` | accepted |
| `declined` | declined |
| `withdrawn` | withdrawn |

## Minimal example

```json
{
  "title": "Consent for genetic testing",
  "text": "I confirm that I received and understood the information provided.",
  "status": "pending"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 05. Test order — `pgo_test_order`

A standalone request for a named test on a stated patient or source and specimen type.

**Nature:** virtual  
**Stages:** test_planning, wet_lab, bioinformatics  
**Serialized extension:** `.pgorder.json`  
**Schema:** `schemas/objects/pgo_test_order.schema.json`  
**Example:** `examples/objects/pgo_test_order.pgorder.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `patient` | `string` | Yes | Patient/source name or meaningful identifier supplied for this order. |
| `test_name` | `string` | Yes | Actual requested test name. |
| `sample_type` | `enum<string>` | Yes | Specimen or material expected by the testing provider. |
| `test_type` | `enum<string>` | No | Optional broad test category. |
| `objective` | `string` | No | Optional objective for the test. |
| `clinical_suspicion` | `string` | No | Optional clinical suspicion. |
| `genes` | `array<string>` | No |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Order meaning

`patient` is readable user-supplied identity, not a mandatory Pocket Genes subject record. `test_name` is the actual requested study. `test_type` is only an optional broad category. Consent and provider suitability remain service checks.

## Enum choices

#### `sample_type` choices

| Stored value | Display label |
| --- | --- |
| `blood` | Blood |
| `dried_blood_spot` | Dried blood spot |
| `saliva` | Saliva |
| `buccal_swab` | Buccal swab |
| `tissue` | Tissue |
| `skin_biopsy` | Skin biopsy |
| `bone_marrow_aspirate` | Bone marrow aspirate |
| `bone_marrow_core` | Bone marrow core biopsy |
| `amniotic_fluid` | Amniotic fluid |
| `chorionic_villi` | Chorionic villi |
| `cord_blood` | Cord blood |
| `cerebrospinal_fluid` | Cerebrospinal fluid |
| `urine` | Urine |
| `stool` | Stool |
| `hair_follicles` | Hair follicles |
| `nail_clippings` | Nail clippings |
| `semen` | Semen |
| `embryo_biopsy` | Embryo biopsy |
| `whole_embryo` | Whole embryo |
| `polar_body` | Polar body |
| `plasma` | Plasma |
| `serum` | Serum |
| `extracted_dna` | Extracted DNA |
| `extracted_rna` | Extracted RNA |
| `other` | Other |

#### `test_type` choices

| Stored value | Display label |
| --- | --- |
| `single_gene` | Single-gene test |
| `gene_panel` | Gene panel |
| `exome_sequencing` | Exome sequencing |
| `genome_sequencing` | Genome sequencing |
| `targeted_variant_testing` | Targeted variant testing |
| `repeat_expansion_testing` | Repeat expansion testing |
| `methylation_analysis` | Methylation analysis |
| `chromosomal_microarray` | Chromosomal microarray |
| `karyotype` | Karyotype |
| `fish` | FISH |
| `other` | Other |

## Minimal example

```json
{
  "patient": "Patient AB-123",
  "test_name": "Hereditary cancer panel",
  "sample_type": "blood"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 06. Sample collection request — `pgo_collection_request`

A request to obtain biological material; it is not courier pickup or specimen transport.

**Nature:** virtual  
**Stages:** wet_lab  
**Serialized extension:** `.pgcollection.json`  
**Schema:** `schemas/objects/pgo_collection_request.schema.json`  
**Example:** `examples/objects/pgo_collection_request.pgcollection.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `patient` | `string` | Yes | Patient/source name or meaningful identifier for collection. |
| `sample_type` | `enum<string>` | Yes | Biological material to obtain. |
| `collection_method` | `enum<string>` | No | Method used to obtain the biological material. |
| `container` | `enum<string>` | No | Collection container or kit. |
| `requested_quantity` | `string` | No | Readable quantity including its unit, for example 2 mL. |
| `collection_site` | `string` | No | Readable collection location. |
| `scheduled_at` | `string` | No | Scheduled collection time. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Biological collection only

This object asks for the act of obtaining biological material from a person or source. It never means courier pickup, shipping, or transport. Only `patient` and `sample_type` are required; scheduling and collection arrangements remain optional.

## Enum choices

#### `sample_type` choices

| Stored value | Display label |
| --- | --- |
| `blood` | Blood |
| `dried_blood_spot` | Dried blood spot |
| `saliva` | Saliva |
| `buccal_swab` | Buccal swab |
| `tissue` | Tissue |
| `skin_biopsy` | Skin biopsy |
| `bone_marrow_aspirate` | Bone marrow aspirate |
| `bone_marrow_core` | Bone marrow core biopsy |
| `amniotic_fluid` | Amniotic fluid |
| `chorionic_villi` | Chorionic villi |
| `cord_blood` | Cord blood |
| `cerebrospinal_fluid` | Cerebrospinal fluid |
| `urine` | Urine |
| `stool` | Stool |
| `hair_follicles` | Hair follicles |
| `nail_clippings` | Nail clippings |
| `semen` | Semen |
| `embryo_biopsy` | Embryo biopsy |
| `whole_embryo` | Whole embryo |
| `polar_body` | Polar body |
| `other` | Other |

#### `collection_method` choices

| Stored value | Display label |
| --- | --- |
| `venous_blood_draw` | Venous blood draw |
| `capillary_blood_collection` | Capillary blood collection |
| `buccal_swab` | Buccal swab |
| `saliva_collection` | Saliva collection |
| `needle_aspiration` | Needle aspiration |
| `core_biopsy` | Core biopsy |
| `surgical_biopsy` | Surgical biopsy |
| `skin_punch_biopsy` | Skin punch biopsy |
| `amniocentesis` | Amniocentesis |
| `chorionic_villus_sampling` | Chorionic villus sampling |
| `lumbar_puncture` | Lumbar puncture |
| `embryo_biopsy` | Embryo biopsy |
| `polar_body_biopsy` | Polar body biopsy |
| `self_collection` | Self-collection |
| `other` | Other |

#### `container` choices

| Stored value | Display label |
| --- | --- |
| `edta_tube` | EDTA tube |
| `heparin_tube` | Heparin tube |
| `citrate_tube` | Citrate tube |
| `serum_tube` | Serum tube |
| `dna_stabilization_tube` | DNA stabilization tube |
| `rna_stabilization_tube` | RNA stabilization tube |
| `sterile_container` | Sterile container |
| `swab_collection_kit` | Swab collection kit |
| `saliva_collection_kit` | Saliva collection kit |
| `cryovial` | Cryovial |
| `filter_paper_card` | Filter paper card |
| `formalin_container` | Formalin container |
| `other` | Other |

## Minimal example

```json
{
  "patient": "Patient AB-123",
  "sample_type": "blood",
  "collection_method": "venous_blood_draw",
  "container": "edta_tube"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 07. Blood sample — `pgo_blood_sample`

Domain description of a distinguishable blood specimen.

**Nature:** physical  
**Stages:** wet_lab  
**Serialized extension:** `.pgblood.json`  
**Schema:** `schemas/objects/pgo_blood_sample.schema.json`  
**Example:** `examples/objects/pgo_blood_sample.pgblood.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `material` | `enum<string>` | No | Blood material. |
| `container` | `enum<string>` | No | Specimen container. |
| `volume_ml` | `number` | No | Volume in millilitres. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.

## Enum choices

#### `material` choices

| Stored value | Display label |
| --- | --- |
| `whole_blood` | Whole blood |
| `plasma` | Plasma |
| `serum` | Serum |
| `buffy_coat` | Buffy coat |
| `dried_blood_spot` | Dried blood spot |
| `other` | Other |

#### `container` choices

| Stored value | Display label |
| --- | --- |
| `edta_tube` | EDTA tube |
| `heparin_tube` | Heparin tube |
| `citrate_tube` | Citrate tube |
| `serum_tube` | Serum tube |
| `dna_stabilization_tube` | DNA stabilization tube |
| `rna_stabilization_tube` | RNA stabilization tube |
| `sterile_container` | Sterile container |
| `swab_collection_kit` | Swab collection kit |
| `saliva_collection_kit` | Saliva collection kit |
| `cryovial` | Cryovial |
| `filter_paper_card` | Filter paper card |
| `formalin_container` | Formalin container |
| `other` | Other |

## Minimal example

```json
{
  "sample_label": "Blood specimen A",
  "material": "whole_blood",
  "container": "edta_tube",
  "volume_ml": 2
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 08. Tissue sample — `pgo_tissue_sample`

Domain description of a distinguishable tissue specimen.

**Nature:** physical  
**Stages:** wet_lab  
**Serialized extension:** `.pgtissue.json`  
**Schema:** `schemas/objects/pgo_tissue_sample.schema.json`  
**Example:** `examples/objects/pgo_tissue_sample.pgtissue.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `anatomical_site` | `string` | No | Readable anatomical site. |
| `preparation` | `enum<string>` | No | Tissue preparation. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.

## Enum choices

#### `preparation` choices

| Stored value | Display label |
| --- | --- |
| `fresh` | Fresh |
| `frozen` | Frozen |
| `formalin_fixed_unembedded` | Formalin-fixed, unembedded |
| `ffpe` | FFPE |
| `alcohol_preserved` | Alcohol-preserved |
| `other` | Other |

## Minimal example

```json
{
  "sample_label": "Tissue specimen A",
  "anatomical_site": "Skin",
  "preparation": "fresh"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 09. Embryo material — `pgo_embryo_sample`

Domain description of distinguishable embryo-derived material.

**Nature:** physical  
**Stages:** wet_lab  
**Serialized extension:** `.pgembryo.json`  
**Schema:** `schemas/objects/pgo_embryo_sample.schema.json`  
**Example:** `examples/objects/pgo_embryo_sample.pgembryo.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `material_kind` | `enum<string>` | Yes | Kind of embryo-derived material. |
| `embryo_identifier` | `string` | No | Associated embryo identifier when known. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.

## Enum choices

#### `material_kind` choices

| Stored value | Display label |
| --- | --- |
| `embryo_biopsy` | Embryo biopsy |
| `whole_embryo` | Whole embryo |
| `polar_body` | Polar body |
| `other` | Other |

## Minimal example

```json
{
  "sample_label": "Embryo material A",
  "material_kind": "embryo_biopsy",
  "embryo_identifier": "Embryo 4"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 10. Extracted DNA sample — `pgo_dna_sample`

Domain description of a distinguishable extracted DNA specimen.

**Nature:** physical  
**Stages:** wet_lab  
**Serialized extension:** `.pgdna.json`  
**Schema:** `schemas/objects/pgo_dna_sample.schema.json`  
**Example:** `examples/objects/pgo_dna_sample.pgdna.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `volume_ul` | `number` | No | Volume in microlitres. |
| `concentration_ng_ul` | `number` | No | Concentration in nanograms per microlitre. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.



## Minimal example

```json
{
  "sample_label": "DNA aliquot A",
  "volume_ul": 40,
  "concentration_ng_ul": 25
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 11. Sequence reads — `pgo_sequence_reads`

A named collection of one or more directly downloadable sequencing-read files.

**Nature:** virtual  
**Stages:** wet_lab, bioinformatics  
**Serialized extension:** `.fastq`  
**Schema:** `schemas/objects/pgo_sequence_reads.schema.json`  
**Example:** `examples/objects/pgo_sequence_reads.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `reads` | `array<object>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Component structure

`reads` is nonempty. Each read contains exactly `key`, `name`, and `download_url`; all are nonempty, keys are unique, and the URL resolves the component directly. No size, checksum, MIME type, role, path, source reference, or generic file descriptor is permitted.



## Minimal example

```json
{
  "title": "Sequencing reads",
  "reads": [
    {
      "key": "r1",
      "name": "Read 1",
      "download_url": "https://example.com/sample_R1.fastq.gz"
    },
    {
      "key": "r2",
      "name": "Read 2",
      "download_url": "https://example.com/sample_R2.fastq.gz"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 12. Nucleotide sequences — `pgo_sequence_data`

A titled reference to downloadable native nucleotide-sequence data.

**Nature:** virtual  
**Stages:** wet_lab, bioinformatics  
**Serialized extension:** `.fasta`  
**Schema:** `schemas/objects/pgo_sequence_data.schema.json`  
**Example:** `examples/objects/pgo_sequence_data.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Nucleotide sequences",
  "download_url": "https://example.com/sequences"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 13. Aligned reads — `pgo_aligned_reads`

A titled reference to downloadable aligned reads with an optional index.

**Nature:** virtual  
**Stages:** wet_lab, bioinformatics  
**Serialized extension:** `.bam`  
**Schema:** `schemas/objects/pgo_aligned_reads.schema.json`  
**Example:** `examples/objects/pgo_aligned_reads.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the aligned reads. |
| `index_download_url` | `string` | No | HTTPS URL used to download the optional alignment index. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Alignment files

`download_url` points directly to the aligned reads. Optional `index_download_url` expresses index availability without a duplicate boolean. No generic file list is allowed.



## Minimal example

```json
{
  "title": "Aligned reads",
  "download_url": "https://example.com/sample.bam",
  "index_download_url": "https://example.com/sample.bam.bai"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 14. Unannotated variants — `pgo_unannotated_vcf`

A titled reference to a downloadable native unannotated VCF.

**Nature:** virtual  
**Stages:** wet_lab, bioinformatics  
**Serialized extension:** `.vcf`  
**Schema:** `schemas/objects/pgo_unannotated_vcf.schema.json`  
**Example:** `examples/objects/pgo_unannotated_vcf.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Unannotated variants",
  "download_url": "https://example.com/variants"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 15. Annotated variants — `pgo_annotated_vcf`

A titled reference to a downloadable native annotated VCF.

**Nature:** virtual  
**Stages:** bioinformatics  
**Serialized extension:** `.vcf`  
**Schema:** `schemas/objects/pgo_annotated_vcf.schema.json`  
**Example:** `examples/objects/pgo_annotated_vcf.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Annotated variants",
  "download_url": "https://example.com/annotated-variants"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 16. Interactive genomic report — `pgo_interactive_report`

A titled reference to a downloadable native PGI report decoded through the existing PGI format parsers.

**Nature:** virtual  
**Stages:** bioinformatics  
**Serialized extension:** `.pgi1.json / .pgi2.json / .pgi3.json`  
**Schema:** `schemas/objects/pgo_interactive_report.schema.json`  
**Example:** `examples/objects/pgo_interactive_report.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Interactive genomic report",
  "download_url": "https://example.com/interactive-report"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 17. PDF report — `pgo_pdf_report`

A titled reference to a downloadable PDF report.

**Nature:** virtual  
**Stages:** test_planning, wet_lab, bioinformatics  
**Serialized extension:** `.pdf`  
**Schema:** `schemas/objects/pgo_pdf_report.schema.json`  
**Example:** `examples/objects/pgo_pdf_report.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Genetic test report",
  "download_url": "https://example.com/reports/report.pdf"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 18. Image bundle — `pgo_image_bundle`

A named collection of one or more directly downloadable images.

**Nature:** virtual  
**Stages:** test_planning, wet_lab, bioinformatics  
**Serialized extension:** `.pgimages.json`  
**Schema:** `schemas/objects/pgo_image_bundle.schema.json`  
**Example:** `examples/objects/pgo_image_bundle.pgimages.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `images` | `array<object>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Component structure

`images` is nonempty. Each image contains exactly `key`, `name`, and `download_url`; all are nonempty, keys are unique, and the URL resolves the component directly. No size, checksum, MIME type, role, path, source reference, or generic file descriptor is permitted.



## Minimal example

```json
{
  "title": "Metaphase images",
  "images": [
    {
      "key": "metaphase_1",
      "name": "Metaphase image 1",
      "download_url": "https://example.com/image-1.png"
    },
    {
      "key": "metaphase_2",
      "name": "Metaphase image 2",
      "download_url": "https://example.com/image-2.png"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 19. Karyotype result — `pgo_karyotype_result`

A karyotype notation with an optional readable professional interpretation.

**Nature:** virtual  
**Stages:** bioinformatics  
**Serialized extension:** `.pgkaryotype.json`  
**Schema:** `schemas/objects/pgo_karyotype_result.schema.json`  
**Example:** `examples/objects/pgo_karyotype_result.pgkaryotype.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `result_notation` | `string` | Yes | Actual karyotype result notation. |
| `interpretation` | `string` | No | Optional readable interpretation. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Result meaning

`result_notation` is the actual karyotype notation. Professional interpretation is optional; notes may communicate additional readable limitations. Images are separate objects when they exist and are not mandatory dependencies.



## Minimal example

```json
{
  "result_notation": "46,XX",
  "interpretation": "No numerical chromosome abnormality was identified."
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 20. Flow cytometry data — `pgo_flow_cytometry_data`

A titled reference to downloadable native flow-cytometry data.

**Nature:** virtual  
**Stages:** wet_lab, bioinformatics  
**Serialized extension:** `.fcs`  
**Schema:** `schemas/objects/pgo_flow_cytometry_data.schema.json`  
**Example:** `examples/objects/pgo_flow_cytometry_data.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Flow cytometry data",
  "download_url": "https://example.com/flow-data"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

## Service catalog

### S01. Structure submitted symptoms — `pgs_symptom_intake`

Turn the submitted observations into a reusable symptom bundle. A professional or organization can supply this service.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Review the form, clarify wording if needed, and return structured entries with transaction-bound context.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `symptoms` | `pgo_bundle_of_symptoms` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `observations` | `string_list` | Yes | Reported observations |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "observations",
        "label": "Reported observations",
        "type": "string_list",
        "required": true
      }
    ]
  },
  "fields": [
    {
      "key": "observations",
      "value": [
        "Hearing loss",
        "Balance difficulties"
      ]
    }
  ]
}
```

## Acceptance conditions

- The form identifies one subject and contains at least one observation.
- Record whether each structured item is reported, observed or uncertain; do not silently replace a report with a confirmed finding.

## Scope rules

- This service structures supplied information; it does not itself establish a diagnosis.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S02. Prioritize candidate genes — `pgs_gene_prioritization`

Use a symptom bundle to return a ranked or selected bundle of candidate genes for subsequent test planning.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Apply the provider method and professional review where included; return genes, evidence and ranking rationale.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `bundle_of_symptoms` | `pgo_bundle_of_symptoms` | Required 1:1 |
| Output | `candidate_genes` | `pgo_bundle_of_candidate_genes` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `ranking_mode` | `enum` | Yes | Result organization |
| `maximum_genes` | `positive_integer` | Yes | Maximum genes |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "ranking_mode",
        "label": "Result organization",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "ranked",
            "label": "Ranked list"
          },
          {
            "value": "selected",
            "label": "Selected set"
          }
        ]
      },
      {
        "key": "maximum_genes",
        "label": "Maximum genes",
        "type": "positive_integer",
        "required": true
      }
    ]
  },
  "fields": [
    {
      "key": "ranking_mode",
      "value": "ranked"
    },
    {
      "key": "maximum_genes",
      "value": 3
    }
  ]
}
```

## Acceptance conditions

- The provider accepts the symptom bundle schema and any declared terminology profile.
- The symptom bundle represents one identified subject.

## Scope rules

- Candidate status and supporting reasons must be preserved. Ranking does not establish that these genes are affected.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S03. Record informed consent — `pgs_informed_consent`

Receive the completed consent-specific form and produce an informed-consent record for the stated scope.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Present or verify the consent material and record the completed consent process as specified by the provider service.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `consent` | `pgo_informed_consent` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient` | `text` | Yes | Patient or source |
| `consent_title` | `text` | Yes | Consent title |
| `consent_text` | `long_text` | Yes | Consent text |
| `signer_name` | `text` | No | Expected signer name |
| `signer_capacity` | `enum` | No | Expected signer capacity |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient",
        "label": "Patient or source",
        "type": "text",
        "required": true
      },
      {
        "key": "consent_title",
        "label": "Consent title",
        "type": "text",
        "required": true
      },
      {
        "key": "consent_text",
        "label": "Consent text",
        "type": "long_text",
        "required": true
      },
      {
        "key": "signer_name",
        "label": "Expected signer name",
        "type": "text",
        "required": false
      },
      {
        "key": "signer_capacity",
        "label": "Expected signer capacity",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "self",
            "label": "Self"
          },
          {
            "value": "representative",
            "label": "Representative"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "patient",
      "value": "Patient AB-123"
    },
    {
      "key": "consent_title",
      "value": "Consent for genetic testing"
    },
    {
      "key": "consent_text",
      "value": "Please review the purpose, implications and limitations of the proposed genetic test."
    },
    {
      "key": "signer_name",
      "value": "Alex Example"
    },
    {
      "key": "signer_capacity",
      "value": "self"
    }
  ]
}
```

## Acceptance conditions

- The consent text, its version, signer identity and signature or acceptance evidence must be recoverable in the resulting object.
- Only an accepted consent for the appropriate scope can satisfy the test-ordering contract. A submission alone is not proof of valid consent.

## Scope rules

- The record retains what was consented to, when and by whom. Subsequent use must fit that scope.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S04. Create the test order — `pgs_test_ordering`

Combine the consent record, candidate genes and patient/request context into the formal test order.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Review consent and test selection, consolidate the patient context, and issue the order with explicit fulfillment requirements.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `informed_consent` | `pgo_informed_consent` | Required 1:1 |
| Input | `bundle_of_candidate_genes` | `pgo_bundle_of_candidate_genes` | Required 1:1 |
| Output | `test_order` | `pgo_test_order` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient` | `text` | Yes | Patient or source |
| `test_name` | `text` | Yes | Requested test name |
| `sample_type` | `enum` | Yes | Requested specimen |
| `test_type` | `enum` | No | Broad test type |
| `objective` | `long_text` | No | Objective |
| `clinical_suspicion` | `long_text` | No | Clinical suspicion |
| `genes` | `string_list` | No | Genes |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient",
        "label": "Patient or source",
        "type": "text",
        "required": true
      },
      {
        "key": "test_name",
        "label": "Requested test name",
        "type": "text",
        "required": true
      },
      {
        "key": "sample_type",
        "label": "Requested specimen",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "blood",
            "label": "Blood"
          },
          {
            "value": "dried_blood_spot",
            "label": "Dried blood spot"
          },
          {
            "value": "saliva",
            "label": "Saliva"
          },
          {
            "value": "buccal_swab",
            "label": "Buccal swab"
          },
          {
            "value": "tissue",
            "label": "Tissue"
          },
          {
            "value": "skin_biopsy",
            "label": "Skin biopsy"
          },
          {
            "value": "bone_marrow_aspirate",
            "label": "Bone marrow aspirate"
          },
          {
            "value": "bone_marrow_core",
            "label": "Bone marrow core biopsy"
          },
          {
            "value": "amniotic_fluid",
            "label": "Amniotic fluid"
          },
          {
            "value": "chorionic_villi",
            "label": "Chorionic villi"
          },
          {
            "value": "cord_blood",
            "label": "Cord blood"
          },
          {
            "value": "cerebrospinal_fluid",
            "label": "Cerebrospinal fluid"
          },
          {
            "value": "urine",
            "label": "Urine"
          },
          {
            "value": "stool",
            "label": "Stool"
          },
          {
            "value": "hair_follicles",
            "label": "Hair follicles"
          },
          {
            "value": "nail_clippings",
            "label": "Nail clippings"
          },
          {
            "value": "semen",
            "label": "Semen"
          },
          {
            "value": "embryo_biopsy",
            "label": "Embryo biopsy"
          },
          {
            "value": "whole_embryo",
            "label": "Whole embryo"
          },
          {
            "value": "polar_body",
            "label": "Polar body"
          },
          {
            "value": "plasma",
            "label": "Plasma"
          },
          {
            "value": "serum",
            "label": "Serum"
          },
          {
            "value": "extracted_dna",
            "label": "Extracted DNA"
          },
          {
            "value": "extracted_rna",
            "label": "Extracted RNA"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "test_type",
        "label": "Broad test type",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "single_gene",
            "label": "Single-gene test"
          },
          {
            "value": "gene_panel",
            "label": "Gene panel"
          },
          {
            "value": "exome_sequencing",
            "label": "Exome sequencing"
          },
          {
            "value": "genome_sequencing",
            "label": "Genome sequencing"
          },
          {
            "value": "targeted_variant_testing",
            "label": "Targeted variant testing"
          },
          {
            "value": "repeat_expansion_testing",
            "label": "Repeat expansion testing"
          },
          {
            "value": "methylation_analysis",
            "label": "Methylation analysis"
          },
          {
            "value": "chromosomal_microarray",
            "label": "Chromosomal microarray"
          },
          {
            "value": "karyotype",
            "label": "Karyotype"
          },
          {
            "value": "fish",
            "label": "FISH"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "objective",
        "label": "Objective",
        "type": "long_text",
        "required": false
      },
      {
        "key": "clinical_suspicion",
        "label": "Clinical suspicion",
        "type": "long_text",
        "required": false
      },
      {
        "key": "genes",
        "label": "Genes",
        "type": "string_list",
        "required": false
      }
    ]
  },
  "fields": [
    {
      "key": "patient",
      "value": "Patient AB-123"
    },
    {
      "key": "test_name",
      "value": "Hereditary cancer panel"
    },
    {
      "key": "sample_type",
      "value": "blood"
    },
    {
      "key": "test_type",
      "value": "gene_panel"
    },
    {
      "key": "objective",
      "value": "Evaluate an inherited cancer predisposition."
    },
    {
      "key": "genes",
      "value": [
        "BRCA1",
        "BRCA2"
      ]
    }
  ]
}
```

## Acceptance conditions

- Patient and subject references agree across the form and input objects.
- The consent is accepted and its scope covers the proposed order.
- The provider confirms the selected tests and scope within its offered test-ordering process.

## Scope rules

- Create pgo_test_order content from the patient, test name and sample type actually supplied, plus only the optional context the requester provided.
- Consent checks and provider suitability checks remain service responsibilities and are not fabricated inside the order content.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S05. Create an actual biological sample collection request — `pgs_collection_request`

Create a request for a qualified collector or laboratory to obtain a real biological sample from the subject. This means phlebotomy, swab, saliva, biopsy, or embryo-material collection; it is not courier pickup, package pickup, truck pickup, or sample transport.

**Provider:** Origin Sample Services (`pgp_sample_logistics`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** wet_lab

## Provider work

Verify the subject, consent, requested material, collection method, collection site, collection window, and preparation profile; schedule or perform the biological sample collection.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `collection_request` | `pgo_collection_request` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient` | `text` | Yes | Patient or source |
| `sample_type` | `enum` | Yes | Biological material to collect |
| `collection_method` | `enum` | No | Collection method |
| `container` | `enum` | No | Container or kit |
| `requested_quantity` | `text` | No | Requested quantity |
| `collection_site` | `address` | No | Collection site |
| `scheduled_at` | `datetime` | No | Scheduled collection time |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient",
        "label": "Patient or source",
        "type": "text",
        "required": true
      },
      {
        "key": "sample_type",
        "label": "Biological material to collect",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "blood",
            "label": "Blood"
          },
          {
            "value": "dried_blood_spot",
            "label": "Dried blood spot"
          },
          {
            "value": "saliva",
            "label": "Saliva"
          },
          {
            "value": "buccal_swab",
            "label": "Buccal swab"
          },
          {
            "value": "tissue",
            "label": "Tissue"
          },
          {
            "value": "skin_biopsy",
            "label": "Skin biopsy"
          },
          {
            "value": "bone_marrow_aspirate",
            "label": "Bone marrow aspirate"
          },
          {
            "value": "bone_marrow_core",
            "label": "Bone marrow core biopsy"
          },
          {
            "value": "amniotic_fluid",
            "label": "Amniotic fluid"
          },
          {
            "value": "chorionic_villi",
            "label": "Chorionic villi"
          },
          {
            "value": "cord_blood",
            "label": "Cord blood"
          },
          {
            "value": "cerebrospinal_fluid",
            "label": "Cerebrospinal fluid"
          },
          {
            "value": "urine",
            "label": "Urine"
          },
          {
            "value": "stool",
            "label": "Stool"
          },
          {
            "value": "hair_follicles",
            "label": "Hair follicles"
          },
          {
            "value": "nail_clippings",
            "label": "Nail clippings"
          },
          {
            "value": "semen",
            "label": "Semen"
          },
          {
            "value": "embryo_biopsy",
            "label": "Embryo biopsy"
          },
          {
            "value": "whole_embryo",
            "label": "Whole embryo"
          },
          {
            "value": "polar_body",
            "label": "Polar body"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "collection_method",
        "label": "Collection method",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "venous_blood_draw",
            "label": "Venous blood draw"
          },
          {
            "value": "capillary_blood_collection",
            "label": "Capillary blood collection"
          },
          {
            "value": "buccal_swab",
            "label": "Buccal swab"
          },
          {
            "value": "saliva_collection",
            "label": "Saliva collection"
          },
          {
            "value": "needle_aspiration",
            "label": "Needle aspiration"
          },
          {
            "value": "core_biopsy",
            "label": "Core biopsy"
          },
          {
            "value": "surgical_biopsy",
            "label": "Surgical biopsy"
          },
          {
            "value": "skin_punch_biopsy",
            "label": "Skin punch biopsy"
          },
          {
            "value": "amniocentesis",
            "label": "Amniocentesis"
          },
          {
            "value": "chorionic_villus_sampling",
            "label": "Chorionic villus sampling"
          },
          {
            "value": "lumbar_puncture",
            "label": "Lumbar puncture"
          },
          {
            "value": "embryo_biopsy",
            "label": "Embryo biopsy"
          },
          {
            "value": "polar_body_biopsy",
            "label": "Polar body biopsy"
          },
          {
            "value": "self_collection",
            "label": "Self-collection"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "container",
        "label": "Container or kit",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "edta_tube",
            "label": "EDTA tube"
          },
          {
            "value": "heparin_tube",
            "label": "Heparin tube"
          },
          {
            "value": "citrate_tube",
            "label": "Citrate tube"
          },
          {
            "value": "serum_tube",
            "label": "Serum tube"
          },
          {
            "value": "dna_stabilization_tube",
            "label": "DNA stabilization tube"
          },
          {
            "value": "rna_stabilization_tube",
            "label": "RNA stabilization tube"
          },
          {
            "value": "sterile_container",
            "label": "Sterile container"
          },
          {
            "value": "swab_collection_kit",
            "label": "Swab collection kit"
          },
          {
            "value": "saliva_collection_kit",
            "label": "Saliva collection kit"
          },
          {
            "value": "cryovial",
            "label": "Cryovial"
          },
          {
            "value": "filter_paper_card",
            "label": "Filter paper card"
          },
          {
            "value": "formalin_container",
            "label": "Formalin container"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "requested_quantity",
        "label": "Requested quantity",
        "type": "text",
        "required": false
      },
      {
        "key": "collection_site",
        "label": "Collection site",
        "type": "address",
        "required": false
      },
      {
        "key": "scheduled_at",
        "label": "Scheduled collection time",
        "type": "datetime",
        "required": false
      }
    ]
  },
  "fields": [
    {
      "key": "patient",
      "value": "Patient AB-123"
    },
    {
      "key": "sample_type",
      "value": "blood"
    },
    {
      "key": "collection_method",
      "value": "venous_blood_draw"
    },
    {
      "key": "container",
      "value": "edta_tube"
    },
    {
      "key": "requested_quantity",
      "value": "2 mL"
    },
    {
      "key": "collection_site",
      "value": "Demo clinical collection room"
    }
  ]
}
```

## Acceptance conditions

- The request identifies the subject or source, the linked test order, the biological material to obtain, and the qualified collection method.
- The assigned provider accepts the sample collection site, time window, consent state, and preparation profile before the collection is scheduled or performed.
- This is an actual biological sample collection request. It is explicitly not a courier pickup, package pickup, truck pickup, or transport order.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- The collection_request describes the intended biological collection event. A physical sample object is created or linked only when the sample is actually obtained.
- Transportation after collection belongs to pgs_sample_transport or another explicit transport service, never to pgs_collection_request.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S06. Transport an already collected specimen — `pgs_sample_transport`

Move an already biologically collected physical specimen from origin to destination and record custody and receipt. This is the transport service; it does not create or replace the biological sample collection request.

**Provider:** Origin Sample Services (`pgp_sample_logistics`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** wet_lab

## Provider work

Perform the physical handoff and transport of the existing specimen, record custody, and obtain destination receipt.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `collection_request` | `pgo_collection_request` | Required 1:1 |
| Input | `blood_sample` | `pgo_blood_sample` | Required 1:1 |
| Output | `delivered_specimen` | `same_as:blood_sample` | new_revision |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `contact_name` | `text` | Yes | Contact name |
| `contact_phone` | `phone` | Yes | Contact phone |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "contact_name",
        "label": "Contact name",
        "type": "text",
        "required": true
      },
      {
        "key": "contact_phone",
        "label": "Contact phone",
        "type": "phone",
        "required": true
      }
    ]
  },
  "fields": [
    {
      "key": "contact_name",
      "value": "Example Contact"
    },
    {
      "key": "contact_phone",
      "value": "+541155551234"
    }
  ]
}
```

## Acceptance conditions

- The specimen reference identifies a real sample that has already been biologically collected.
- The transport provider accepts pickup and delivery locations, availability and handling requirements before dispatch.
- The collection_request input documents the prior or intended biological sample collection; it is not the transport order itself.

## Scope rules

- Reject references where object_type or revision differ from the submitted collection_request and physical specimen.
- Preserve object_id; return a new revision with destination, custody events and receipt status.
- If transport or receipt fails, record the real state. Do not fabricate a delivered specimen or create another pickup automatically.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S07. Extract DNA from an accepted specimen — `pgs_dna_extraction`

Produce an identified DNA sample from one compatible blood, tissue or embryo-biopsy specimen.

**Provider:** Atlas Precision Laboratory (`pgp_precision_lab`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** wet_lab

## Provider work

Perform the accepted extraction method and return the DNA identity, measured properties and source lineage.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `blood_sample` | `pgo_blood_sample` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `dna_sample` | `pgo_dna_sample` | new_object |
| Output | `source_specimen` | `same_as:blood_sample` | new_revision |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `extraction_profile` | `enum` | Yes | Extraction profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "extraction_profile",
        "label": "Extraction profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "demo_blood_dna_v1",
            "label": "Demo blood DNA extraction"
          },
          {
            "value": "demo_tissue_dna_v1",
            "label": "Demo tissue DNA extraction"
          },
          {
            "value": "demo_embryo_biopsy_dna_v1",
            "label": "Demo embryo-biopsy DNA extraction"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "extraction_profile",
      "value": "demo_blood_dna_v1"
    }
  ]
}
```

## Acceptance conditions

- Exactly one specimen occupies the specimen slot; accepted_types are alternatives, not three required inputs.
- The specimen is received at this provider, available for the planned procedure and accepted under the selected extraction profile.
- For pgo_embryo_sample, data.material_kind must equal embryo_biopsy. A whole_embryo is rejected by this service.
- The blood, tissue or embryo-biopsy material must match the selected extraction profile.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- The extracted DNA has its own object_id and a lineage reference to the source specimen. Record source consumption or remaining quantity in specimen tracking.
- Return a new revision of the source physical object recording consumed material and remaining quantity. This fixture consumes the entire provided aliquot. Physical execution must lock the current revision to prevent concurrent reuse.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S08. Sequence the requested scope — `pgs_sequencing`

Process an accepted DNA sample and deliver FASTQ reads supporting the contracted order scope.

**Provider:** Atlas Precision Laboratory (`pgp_precision_lab`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** wet_lab

## Provider work

Prepare and run the laboratory work, assess the requested scope, and deliver the contracted read files and support evidence.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `dna_sample` | `pgo_dna_sample` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `reads` | `pgo_sequence_reads` | new_object |
| Output | `source_dna` | `same_as:dna_sample` | new_revision |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `sequencing_profile` | `enum` | Yes | Sequencing profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "sequencing_profile",
        "label": "Sequencing profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_targeted_reads_v1",
            "label": "Demo targeted read profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "sequencing_profile",
      "value": "pg_demo_targeted_reads_v1"
    }
  ]
}
```

## Acceptance conditions

- The provider has accepted the DNA identity, quantity, quality and physical availability.
- The sequencing profile supports the order scope and requested variant classes.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- FASTQ is the output of this particular contract. A different laboratory contract may deliver BAM or VCF and combine later transformations internally.
- The digital deliverable carries the run/profile, reference and assessment evidence needed to evaluate its suitability for the order.
- Return a new revision of the source physical object recording consumed material and remaining quantity. This fixture consumes the entire provided aliquot. Physical execution must lock the current revision to prevent concurrent reuse.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S09. Align sequence reads — `pgs_read_alignment`

Align accepted FASTQ reads to the order reference and return an aligned-read object.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Run the alignment and quality assessment under the declared profile; retain the transaction-bound input and selected reference context.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `sequence_reads` | `pgo_sequence_reads` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `aligned_reads` | `pgo_aligned_reads` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `alignment_profile` | `enum` | Yes | Alignment profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "alignment_profile",
        "label": "Alignment profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_alignment_v1",
            "label": "Demo alignment profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "alignment_profile",
      "value": "pg_demo_alignment_v1"
    }
  ]
}
```

## Acceptance conditions

- Read layout, encoding and sequencing profile are supported.
- The specified reference is available to the provider and agrees with the order.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S10. Call variants in the requested scope — `pgs_variant_calling`

Derive an unannotated VCF from aligned reads for the contracted genes, regions and variant classes.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Call the agreed classes, assess support across the requested scope and produce a native VCF with transaction-bound input and output records.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `aligned_reads` | `pgo_aligned_reads` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `variants` | `pgo_unannotated_vcf` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `calling_profile` | `enum` | Yes | Variant-calling profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "calling_profile",
        "label": "Variant-calling profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_calling_v1",
            "label": "Demo variant-calling profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "calling_profile",
      "value": "pg_demo_calling_v1"
    }
  ]
}
```

## Acceptance conditions

- The alignment reference matches the order and the calling profile.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S11. Annotate a VCF — `pgs_variant_annotation`

Add the agreed variant annotations while preserving input identity, native variant context and analytical limitations.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Enrich variants using the provider annotation profile and record the knowledge-source versions and limitations.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `unannotated_vcf` | `pgo_unannotated_vcf` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `annotated_variants` | `pgo_annotated_vcf` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `annotation_profile` | `enum` | Yes | Annotation profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "annotation_profile",
        "label": "Annotation profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "PG_DEMO_ANN_V1",
            "label": "Demo annotation profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "annotation_profile",
      "value": "PG_DEMO_ANN_V1"
    }
  ]
}
```

## Acceptance conditions

- The VCF encoding, reference and variant representation are accepted.
- Required analytical-support information is available in the registered object.

## Scope rules

- When a supplied order cannot be supported by the input, return awaiting_input or failed with the affected scope. Without an order, preserve the input limitations and never claim a broader assessment.
- Annotation adds information about supplied variants; it cannot recover data missing from the input analysis.
- The annotated and unannotated types share .vcf but have different accepted semantic profiles.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S12. Produce an interactive genomic result — `pgs_interactive_interpretation`

Convert an annotated VCF into a registered Pocket Genes interactive report backed by a native MyDNAMap .pgi1.json payload that matches MDMAPIModel.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Produce or register a native PGI payload, validate it against the matching provider schema, attach support evidence and limitations, and return the Pocket Genes registration object.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `annotated_vcf` | `pgo_annotated_vcf` | Required 1:1 |
| Output | `interactive_report` | `pgo_interactive_report` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `interpretation_profile` | `enum` | Yes | Interactive report profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "interpretation_profile",
        "label": "Interactive report profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_mdm_pgi1_v1",
            "label": "Demo PGI1 MDMAPIModel profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "interpretation_profile",
      "value": "pg_demo_mdm_pgi1_v1"
    }
  ]
}
```

## Acceptance conditions

- The requested demo result is .pgi1.json version 1.0.0 and must validate against schemas/protocol/pgi1-mdm.schema.json.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Scope rules

- The demo genomic content is derived from the VCF and registered as a native MDMAPIModel payload; a symptom bundle is not an input.
- Carry source scope and limitations into the Pocket Genes registration object. A pipeline compares that declared support with its linked order.
- No test_order is a required input to this specific conversion. It can be purchased for an existing compatible annotated VCF.
- PGI2/AGAPIModel and PGI3/TwoPQAPIModel use the same pgo_interactive_report registration concept, but require their own native payload sources and schemas.
- Clinical relevance or report sections live in the native PGI payload and provider profile; patient-specific conclusions belong to the appropriately scoped reporting service.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S13. Create the final self-contained report — `pgs_final_report`

Combine the complete test order with a registered PGI payload into a final PDF for the requested objective.

**Provider:** Clarity Report Studio (`pgp_report_studio`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Verify the order match, native PGI schema, support evidence and scope, perform included report review, and issue a complete PDF using the selected presentation.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Input | `interactive_report` | `pgo_interactive_report` | Required 1:1 |
| Output | `report` | `pgo_pdf_report` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `language` | `enum` | Yes | Report language |
| `presentation` | `enum` | Yes | Report presentation |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "language",
        "label": "Report language",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "en",
            "label": "English"
          },
          {
            "value": "es-AR",
            "label": "Spanish, Argentina"
          }
        ]
      },
      {
        "key": "presentation",
        "label": "Report presentation",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "clinical",
            "label": "Clinical report"
          },
          {
            "value": "patient",
            "label": "Patient-facing report"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "language",
      "value": "en"
    },
    {
      "key": "presentation",
      "value": "clinical"
    }
  ]
}
```

## Acceptance conditions

- The order and registered PGI object identify the same subject and compatible specimen/source lineage.
- The order contains patient identity, clinical objective, suspicion and required reporting context.
- The selected provider service includes the review/issuance responsibilities required by its report profile. Rendering alone does not supply missing professional conclusions or authorizations.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- The order, registered PGI object and this service form are sufficient under this contract; do not require the original intake form or symptom bundle.
- Both successful requested-scope assessment and explicit limitations must appear in the final self-contained report as appropriate.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S14. Analyze a metaphase image bundle — `pgs_karyotype_analysis`

Review a compatible bundle of metaphase images and return a structured karyotype result without a sequencing step.

**Provider:** Chromosome Image Services (`pgp_cytogenetics`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Perform digital image analysis and the professional review included in the offered cytogenetics service.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `image_bundle` | `pgo_image_bundle` | Required 1:1 |
| Output | `karyotype_result` | `pgo_karyotype_result` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `objective` | `long_text` | No | Analysis objective |
| `analysis_profile` | `enum` | Yes | Analysis profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "objective",
        "label": "Analysis objective",
        "type": "long_text",
        "required": false
      },
      {
        "key": "analysis_profile",
        "label": "Analysis profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_metaphase_review_v1",
            "label": "Demo metaphase image review"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "objective",
      "value": "Review the supplied metaphase images."
    },
    {
      "key": "analysis_profile",
      "value": "pg_demo_metaphase_review_v1"
    }
  ]
}
```

## Acceptance conditions

- The image bundle declares a metaphase-imaging profile accepted by the provider.
- Subject identity, acquisition context, image count and image quality satisfy the selected review profile.

## Scope rules

- A generic image MIME type is insufficient; the acquisition profile and content must match the analysis.
- This three-stage catalog places digital image analysis in bioinformatics, used here as the broader digital-analysis stage.
- Report the examined material, findings, support and limitations for the selected scope.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S15. Prepare a consultation summary PDF — `pgs_form_to_pdf`

Create a standalone professional summary from the submitted form, demonstrating a service with no additional input objects.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Review the submitted information within the service scope and issue a clearly labeled consultation summary.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `summary` | `pgo_pdf_report` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient_name` | `text` | No | Patient name |
| `objective` | `long_text` | Yes | Document objective |
| `submitted_information` | `string_list` | Yes | Information to include |
| `language` | `enum` | Yes | Document language |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient_name",
        "label": "Patient name",
        "type": "text",
        "required": false
      },
      {
        "key": "objective",
        "label": "Document objective",
        "type": "long_text",
        "required": true
      },
      {
        "key": "submitted_information",
        "label": "Information to include",
        "type": "string_list",
        "required": true
      },
      {
        "key": "language",
        "label": "Document language",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "en",
            "label": "English"
          },
          {
            "value": "es-AR",
            "label": "Spanish, Argentina"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "patient_name",
      "value": "Alex Example"
    },
    {
      "key": "objective",
      "value": "Summarize the submitted request."
    },
    {
      "key": "submitted_information",
      "value": [
        "Consultation note A",
        "Consultation note B"
      ]
    },
    {
      "key": "language",
      "value": "en"
    }
  ]
}
```

## Acceptance conditions

- The form contains the information required for the offered summary service.
- The provider labels the document as a consultation summary and preserves the source/assessment distinction.

## Scope rules

- This PDF is a planning-stage summary. Sharing pgo_pdf_report with a final genomic report does not make the two documents semantically interchangeable.
- Document-purpose and required-content profiles determine which later services can accept it.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

## Provider catalog

### Meridian Clinical Planning — `pgp_clinical_planning`

Fictional multidisciplinary provider that structures request information, prioritizes candidate genes, records informed consent, prepares test orders, and produces form-based documents.

**Kind:** professional_services_organization  
**Stages:** test_planning  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_symptom_intake`
- `pgs_gene_prioritization`
- `pgs_informed_consent`
- `pgs_test_ordering`
- `pgs_form_to_pdf`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://meridianplanning.example",
    "operations_email": "operations@meridianplanning.example",
    "integration_email": "integrations@meridianplanning.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://meridianplanning.example/api/v1",
    "execution_modes": [
      "professional_review",
      "assisted_document_generation"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint"
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Origin Sample Services — `pgp_sample_logistics`

Fictional provider coordinating real biological sample collection by qualified staff and, when a separate transport service is requested, transporting already collected specimens while preserving identity, custody and condition records.

**Kind:** sample_collection_and_transport_provider  
**Stages:** wet_lab  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_collection_request`
- `pgs_sample_transport`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://originsamples.example",
    "operations_email": "operations@originsamples.example",
    "integration_email": "integrations@originsamples.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://originsamples.example/api/v1",
    "execution_modes": [
      "biological_sample_collection",
      "physical_transport"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "state_semantics": "A collection request schedules or records the intended biological sample collection event. Transport is a separate service that moves an already collected specimen and returns the same specimen object_id at a later revision with destination and custody evidence."
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Atlas Precision Laboratory — `pgp_precision_lab`

Fictional laboratory extracting DNA from accepted specimens and producing the agreed sequencing-read deliverable for the scope and fulfillment requirements in a test order.

**Kind:** laboratory  
**Stages:** wet_lab  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_dna_extraction`
- `pgs_sequencing`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://atlasprecision.example",
    "operations_email": "operations@atlasprecision.example",
    "integration_email": "integrations@atlasprecision.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://atlasprecision.example/api/v1",
    "execution_modes": [
      "specimen_receipt",
      "laboratory_processing"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "acceptance_checks": [
      "test_order_scope",
      "accepted_specimen_type_and_state",
      "quantity_and_quality_requirements",
      "agreed_output_profile"
    ]
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Variant Analysis Cooperative — `pgp_variant_analysis`

Fictional specialist in independently purchasable alignment, variant calling, annotation, and symptom-independent structured genomic interpretation.

**Kind:** bioinformatics_company  
**Stages:** bioinformatics  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_read_alignment`
- `pgs_variant_calling`
- `pgs_variant_annotation`
- `pgs_interactive_interpretation`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://variantanalysis.example",
    "operations_email": "operations@variantanalysis.example",
    "integration_email": "integrations@variantanalysis.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://variantanalysis.example/api/v1",
    "execution_modes": [
      "automated_processing",
      "specialist_review_when_included"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "complete_example_contract": "variant_analysis_api_example"
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Clarity Report Studio — `pgp_report_studio`

Fictional report provider combining a self-contained test order with a symptom-independent .pgi1.json result and the service form to produce a final PDF. Request-specific presentation options belong to the form.

**Kind:** report_production_company  
**Stages:** bioinformatics  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_final_report`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://clarityreports.example",
    "operations_email": "operations@clarityreports.example",
    "integration_email": "integrations@clarityreports.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://clarityreports.example/api/v1",
    "execution_modes": [
      "document_generation"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "clinical_role": "Any required professional interpretation or authorization must be explicitly part of the contracted service and attributable to its actual performer. Rendering a PDF does not itself supply that authorization."
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Chromosome Image Services — `pgp_cytogenetics`

Fictional image-analysis provider accepting a compatible metaphase image bundle and returning a structured karyotype result. The digital analysis can be requested independently of specimen preparation or sequencing.

**Kind:** cytogenetics_analysis_company  
**Stages:** bioinformatics  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_karyotype_analysis`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://chromosomeimages.example",
    "operations_email": "operations@chromosomeimages.example",
    "integration_email": "integrations@chromosomeimages.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://chromosomeimages.example/api/v1",
    "execution_modes": [
      "image_analysis",
      "expert_review_when_included"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "stage_note": "Bioinformatics is the catalog bucket for digital analytical services, including this non-sequencing image-analysis branch."
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

## Generated sources

- `generate_minimal_pgo_contracts.mjs` generates schemas, examples, service/provider fixtures and bundled app catalogs.
- `generate_minimal_pgo_docs.mjs` generates this wiki and all reference pages.
- `sync_pgo_form_contract.mjs` invokes the strict generator; it contains no legacy synchronization logic.
- `validate_catalog.py` is the executable conformance suite.
