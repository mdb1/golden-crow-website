#!/usr/bin/env python3
"""Validate the strict, first-version Pocket Genes Object contracts.

PGO content is a closed, domain-only JSON root. Platform records may wrap that
content, but the validator intentionally provides no legacy envelope reader,
field alias, fallback, or migration path.
"""

from __future__ import annotations

import copy
import json
import math
import re
import sys
from datetime import date, datetime, time
from pathlib import Path
from urllib.parse import urlparse

from jsonschema import Draft202012Validator, FormatChecker, ValidationError


ROOT = Path(__file__).resolve().parent
FORMAT_CHECKER = FormatChecker()
CHECKS: list[dict[str, str]] = []

TYPE_IDS = [
    "pgo_form",
    "pgo_bundle_of_symptoms",
    "pgo_bundle_of_candidate_genes",
    "pgo_informed_consent",
    "pgo_test_order",
    "pgo_collection_request",
    "pgo_blood_sample",
    "pgo_tissue_sample",
    "pgo_embryo_sample",
    "pgo_dna_sample",
    "pgo_sequence_reads",
    "pgo_sequence_data",
    "pgo_aligned_reads",
    "pgo_unannotated_vcf",
    "pgo_annotated_vcf",
    "pgo_interactive_report",
    "pgo_pdf_report",
    "pgo_image_bundle",
    "pgo_karyotype_result",
    "pgo_flow_cytometry_data",
]

CONTRACTS = {
    "pgo_form": ({"form_shape", "fields"}, {"notes"}),
    "pgo_bundle_of_symptoms": ({"observations"}, {"notes"}),
    "pgo_bundle_of_candidate_genes": ({"genes"}, {"notes"}),
    "pgo_informed_consent": (
        {"title", "text"},
        {"status", "accepted_by", "accepted_at", "notes"},
    ),
    "pgo_test_order": (
        {"patient", "test_name", "sample_type"},
        {"test_type", "objective", "clinical_suspicion", "genes", "notes"},
    ),
    "pgo_collection_request": (
        {"patient", "sample_type"},
        {
            "collection_method",
            "container",
            "requested_quantity",
            "collection_site",
            "scheduled_at",
            "notes",
        },
    ),
    "pgo_blood_sample": (
        {"sample_label"},
        {"material", "container", "volume_ml", "notes"},
    ),
    "pgo_tissue_sample": (
        {"sample_label"},
        {"anatomical_site", "preparation", "notes"},
    ),
    "pgo_embryo_sample": (
        {"sample_label", "material_kind"},
        {"embryo_identifier", "notes"},
    ),
    "pgo_dna_sample": (
        {"sample_label"},
        {"volume_ul", "concentration_ng_ul", "notes"},
    ),
    "pgo_sequence_reads": ({"title", "reads"}, {"notes"}),
    "pgo_sequence_data": ({"title", "download_url"}, {"notes"}),
    "pgo_aligned_reads": (
        {"title", "download_url"},
        {"index_download_url", "notes"},
    ),
    "pgo_unannotated_vcf": ({"title", "download_url"}, {"notes"}),
    "pgo_annotated_vcf": ({"title", "download_url"}, {"notes"}),
    "pgo_interactive_report": ({"title", "download_url"}, {"notes"}),
    "pgo_pdf_report": ({"title", "download_url"}, {"notes"}),
    "pgo_image_bundle": ({"title", "images"}, {"notes"}),
    "pgo_karyotype_result": (
        {"result_notation"},
        {"interpretation", "notes"},
    ),
    "pgo_flow_cytometry_data": ({"title", "download_url"}, {"notes"}),
}

FORM_FIELD_TYPES = {
    "text",
    "long_text",
    "email",
    "phone",
    "url",
    "address",
    "postal_code",
    "country_code",
    "identifier",
    "number",
    "integer",
    "positive_integer",
    "percentage",
    "boolean",
    "date",
    "datetime",
    "time",
    "enum",
    "multi_enum",
    "string_list",
    "integer_list",
    "number_list",
}

SAMPLE_TYPES = [
    "blood",
    "dried_blood_spot",
    "saliva",
    "buccal_swab",
    "tissue",
    "skin_biopsy",
    "bone_marrow_aspirate",
    "bone_marrow_core",
    "amniotic_fluid",
    "chorionic_villi",
    "cord_blood",
    "cerebrospinal_fluid",
    "urine",
    "stool",
    "hair_follicles",
    "nail_clippings",
    "semen",
    "embryo_biopsy",
    "whole_embryo",
    "polar_body",
    "other",
]
ORDER_ONLY_SAMPLE_TYPES = ["plasma", "serum", "extracted_dna", "extracted_rna"]
TEST_TYPES = [
    "single_gene",
    "gene_panel",
    "exome_sequencing",
    "genome_sequencing",
    "targeted_variant_testing",
    "repeat_expansion_testing",
    "methylation_analysis",
    "chromosomal_microarray",
    "karyotype",
    "fish",
    "other",
]
COLLECTION_METHODS = [
    "venous_blood_draw",
    "capillary_blood_collection",
    "buccal_swab",
    "saliva_collection",
    "needle_aspiration",
    "core_biopsy",
    "surgical_biopsy",
    "skin_punch_biopsy",
    "amniocentesis",
    "chorionic_villus_sampling",
    "lumbar_puncture",
    "embryo_biopsy",
    "polar_body_biopsy",
    "self_collection",
    "other",
]
CONTAINERS = [
    "edta_tube",
    "heparin_tube",
    "citrate_tube",
    "serum_tube",
    "dna_stabilization_tube",
    "rna_stabilization_tube",
    "sterile_container",
    "swab_collection_kit",
    "saliva_collection_kit",
    "cryovial",
    "filter_paper_card",
    "formalin_container",
    "other",
]

PGI_NATIVE_FORMATS = {
    ".pgi1.json": ("MDMAPIModel", "mdm", "schemas/protocol/pgi1-mdm.schema.json"),
    ".pgi2.json": ("AGAPIModel", "ag", "schemas/protocol/pgi2-ag.schema.json"),
    ".pgi3.json": ("TwoPQAPIModel", "2pq", "schemas/protocol/pgi3-2pq.schema.json"),
}

FORBIDDEN_CONTENT_KEYS = {
    "object_id",
    "object_type",
    "schema_version",
    "revision",
    "created_at",
    "created_by",
    "input_refs",
    "files",
    "subject_id",
    "template_id",
    "source_pgi_ref",
    "source_images_ref",
    "payload_ref",
    "native_format",
    "lineage_refs",
    "page_count",
}


def read(relative_path: str):
    return json.loads((ROOT / relative_path).read_text())


def require(condition: bool, message: str):
    if not condition:
        raise ValueError(message)


def check(name: str, action):
    try:
        action()
        CHECKS.append({"check": name, "status": "passed"})
    except Exception as error:  # report every independent contract failure
        CHECKS.append({"check": name, "status": "failed", "detail": str(error)})


def reject(action, message: str = "Invalid counterexample was accepted"):
    try:
        action()
    except (ValueError, KeyError, TypeError, ValidationError):
        return
    raise ValueError(message)


def schema_validator(schema):
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FORMAT_CHECKER)


OBJECT_CATALOG = read("catalog/objects.json")
SERVICE_CATALOG = read("catalog/services.json")
PROVIDER_CATALOG = read("catalog/providers.json")
FIELD_KEY_CONVENTIONS = read("catalog/field-key-conventions.json")
OBJECTS = OBJECT_CATALOG["objects"]
SERVICES = SERVICE_CATALOG["services"]
PROVIDERS = PROVIDER_CATALOG["providers"]
OBJECT_BY_ID = {item["id"]: item for item in OBJECTS}
SCHEMAS = {type_id: read(f"schemas/objects/{type_id}.schema.json") for type_id in TYPE_IDS}
VALIDATORS = {type_id: schema_validator(schema) for type_id, schema in SCHEMAS.items()}


def assert_https_url(value: str):
    parsed = urlparse(value)
    require(parsed.scheme == "https" and bool(parsed.netloc), f"Not an absolute HTTPS URL: {value}")


def assert_unique_component_keys(content: dict, collection_key: str):
    keys = [item["key"] for item in content[collection_key]]
    require(len(keys) == len(set(keys)), f"Duplicate {collection_key} component key")
    for item in content[collection_key]:
        assert_https_url(item["download_url"])


def parse_iso_date(value: str):
    date.fromisoformat(value)


def parse_iso_time(value: str):
    require(re.fullmatch(r"\d{2}:\d{2}", value) is not None, "Time must use HH:mm")
    time.fromisoformat(value)


def parse_iso_datetime(value: str):
    datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_form_value(field: dict, value):
    kind = field["type"]
    key = field["key"]
    options = [item["value"] for item in field.get("options", [])]
    is_number = isinstance(value, (int, float)) and not isinstance(value, bool)

    if kind in {"text", "long_text", "address"}:
        require(isinstance(value, str) and bool(value.strip()), f"Invalid {kind} answer: {key}")
    elif kind == "email":
        require(
            isinstance(value, str)
            and re.fullmatch(r"[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+", value, re.I),
            f"Invalid email answer: {key}",
        )
    elif kind == "phone":
        require(isinstance(value, str) and re.fullmatch(r"\+[1-9][0-9]{7,14}", value), f"Invalid phone answer: {key}")
    elif kind == "url":
        require(isinstance(value, str), f"Invalid URL answer: {key}")
        assert_https_url(value)
    elif kind == "postal_code":
        require(isinstance(value, str) and re.fullmatch(r"[A-Z0-9](?:[A-Z0-9 -]{0,10}[A-Z0-9])?", value, re.I), f"Invalid postal code: {key}")
    elif kind == "country_code":
        require(isinstance(value, str) and re.fullmatch(r"[A-Z]{2}", value), f"Invalid country code: {key}")
    elif kind == "identifier":
        require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", value), f"Invalid identifier: {key}")
    elif kind == "number":
        require(is_number and math.isfinite(value), f"Invalid number: {key}")
    elif kind == "integer":
        require(is_number and math.isfinite(value) and float(value).is_integer(), f"Invalid integer: {key}")
    elif kind == "positive_integer":
        require(is_number and math.isfinite(value) and float(value).is_integer() and value > 0, f"Invalid positive integer: {key}")
    elif kind == "percentage":
        require(is_number and math.isfinite(value) and 0 <= value <= 100, f"Invalid percentage: {key}")
    elif kind == "boolean":
        require(isinstance(value, bool), f"Invalid boolean: {key}")
    elif kind == "date":
        require(isinstance(value, str), f"Invalid date: {key}")
        parse_iso_date(value)
    elif kind == "datetime":
        require(isinstance(value, str), f"Invalid datetime: {key}")
        parse_iso_datetime(value)
    elif kind == "time":
        require(isinstance(value, str), f"Invalid time: {key}")
        parse_iso_time(value)
    elif kind == "enum":
        require(isinstance(value, str) and value in options, f"Invalid enum answer: {key}")
    elif kind == "multi_enum":
        require(isinstance(value, list) and all(isinstance(item, str) for item in value), f"Invalid multi-enum: {key}")
        require(len(value) == len(set(value)), f"Duplicate multi-enum answer: {key}")
        require(value == [option for option in options if option in set(value)], f"Noncanonical multi-enum order: {key}")
        require(not field["required"] or bool(value), f"Required multi-enum is empty: {key}")
    elif kind == "string_list":
        require(isinstance(value, list) and all(isinstance(item, str) and item.strip() for item in value), f"Invalid string list: {key}")
        require(not field["required"] or bool(value), f"Required string list is empty: {key}")
    elif kind == "integer_list":
        require(isinstance(value, list) and all(isinstance(item, int) and not isinstance(item, bool) for item in value), f"Invalid integer list: {key}")
        require(not field["required"] or bool(value), f"Required integer list is empty: {key}")
    elif kind == "number_list":
        require(isinstance(value, list) and all(isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item) for item in value), f"Invalid number list: {key}")
        require(not field["required"] or bool(value), f"Required number list is empty: {key}")
    else:
        raise ValueError(f"Unsupported form type: {kind}")


def validate_form_content(content: dict):
    require(set(content["form_shape"]) == {"fields"}, "form_shape contains an unapproved key")
    definitions = content["form_shape"]["fields"]
    answers = content["fields"]
    definition_keys = [item["key"] for item in definitions]
    answer_keys = [item["key"] for item in answers]
    require(len(definition_keys) == len(set(definition_keys)), "Duplicate form definition key")
    require(len(answer_keys) == len(set(answer_keys)), "Duplicate form answer key")
    by_key = {item["key"]: item for item in definitions}

    for field in definitions:
        require(field["type"] in FORM_FIELD_TYPES, f"Unknown field type: {field['type']}")
        expected_keys = {"key", "label", "type", "required"}
        if field["type"] in {"enum", "multi_enum"}:
            expected_keys.add("options")
            options = field.get("options", [])
            require(bool(options), f"Options required for {field['key']}")
            values = [item["value"] for item in options]
            require(len(values) == len(set(values)), f"Duplicate options for {field['key']}")
        else:
            require("options" not in field, f"Options forbidden for {field['key']}")
        if "help_info_text" in field:
            expected_keys.add("help_info_text")
        require(set(field) == expected_keys, f"Unexpected form definition key for {field['key']}")

    for answer in answers:
        require(set(answer) == {"key", "value"}, "Form answer must contain only key and value")
        require(answer["key"] in by_key, f"Undeclared answer: {answer['key']}")
        validate_form_value(by_key[answer["key"]], answer["value"])
    for field in definitions:
        require(not field["required"] or field["key"] in answer_keys, f"Missing required answer: {field['key']}")


def validate_content(type_id: str, content: dict):
    VALIDATORS[type_id].validate(content)
    required, optional = CONTRACTS[type_id]
    require(set(content).issubset(required | optional), f"Unapproved root key in {type_id}")
    require(required.issubset(content), f"Missing required root key in {type_id}")
    require(not (set(content) & FORBIDDEN_CONTENT_KEYS), f"Envelope key found inside {type_id}")

    if type_id == "pgo_form":
        validate_form_content(content)
    if type_id == "pgo_sequence_reads":
        assert_unique_component_keys(content, "reads")
    if type_id == "pgo_image_bundle":
        assert_unique_component_keys(content, "images")
    for key in ("download_url", "index_download_url"):
        if key in content:
            assert_https_url(content[key])


def minimal_instance(schema: dict, root: dict | None = None, property_name: str = ""):
    root = root or schema
    if "$ref" in schema:
        prefix = "#/$defs/"
        require(schema["$ref"].startswith(prefix), f"Unsupported ref: {schema['$ref']}")
        return minimal_instance(root["$defs"][schema["$ref"][len(prefix):]], root, property_name)
    if "const" in schema:
        return schema["const"]
    if "enum" in schema:
        return schema["enum"][0]
    if "oneOf" in schema:
        return minimal_instance(schema["oneOf"][0], root, property_name)
    if "anyOf" in schema:
        choice = next((item for item in schema["anyOf"] if item.get("type") != "null"), schema["anyOf"][0])
        return minimal_instance(choice, root, property_name)
    kind = schema.get("type")
    if isinstance(kind, list):
        kind = next(item for item in kind if item != "null")
    if kind == "object":
        return {
            key: minimal_instance(schema["properties"][key], root, key)
            for key in schema.get("required", [])
        }
    if kind == "array":
        return [minimal_instance(schema.get("items", {}), root, property_name) for _ in range(schema.get("minItems", 0))]
    if kind == "string":
        if schema.get("format") == "date-time":
            return "2026-09-22T12:00:00Z"
        if property_name.endswith("download_url"):
            return "https://example.com/download?token=kept"
        return "x"
    if kind == "integer":
        return max(1, schema.get("minimum", 1))
    if kind == "number":
        return float(max(0, schema.get("minimum", 0)))
    if kind == "boolean":
        return True
    return {}


def validate_catalog_contracts():
    require([item["id"] for item in OBJECTS] == TYPE_IDS, "The catalog must retain exactly the canonical 20 PGO IDs")
    require(OBJECT_CATALOG["object_count"] == 20, "object_count must equal 20")
    for type_id in TYPE_IDS:
        item = OBJECT_BY_ID[type_id]
        schema = SCHEMAS[type_id]
        required, optional = CONTRACTS[type_id]
        require(set(schema["required"]) == required, f"Required keys differ for {type_id}")
        require(set(schema["properties"]) == required | optional, f"Allowed keys differ for {type_id}")
        require(schema.get("additionalProperties") is False, f"Root schema is open for {type_id}")
        executable_schema = {
            key: value
            for key, value in schema.items()
            if key not in {"$schema", "$id", "title"}
        }
        require(item["data_schema"] == executable_schema, f"Embedded schema differs for {type_id}")
        catalog_properties = {field["name"]: field["required"] for field in item["properties"]}
        require(set(catalog_properties) == required | optional, f"Catalog property list differs for {type_id}")
        require({key for key, is_required in catalog_properties.items() if is_required} == required, f"Catalog required flags differ for {type_id}")
        require(item["example"] == item["example_data"], f"Catalog examples differ for {type_id}")
        require(item["example_data"] == read(item["example_path"]), f"Example file differs for {type_id}")
        validate_content(type_id, item["example_data"])


check("exact_20_type_registry_and_allowlists", validate_catalog_contracts)


for type_id in TYPE_IDS:
    check(f"minimum_content:{type_id}", lambda type_id=type_id: validate_content(type_id, minimal_instance(SCHEMAS[type_id])))

    def notes_cases(type_id=type_id):
        content = minimal_instance(SCHEMAS[type_id])
        validate_content(type_id, content)
        content["notes"] = ""
        validate_content(type_id, content)

    check(f"notes_absent_and_empty:{type_id}", notes_cases)

    def unknown_key_rejected(type_id=type_id):
        content = minimal_instance(SCHEMAS[type_id])
        content["legacy_metadata"] = "forbidden"
        reject(lambda: validate_content(type_id, content))

    check(f"unknown_root_key_rejected:{type_id}", unknown_key_rejected)


def validate_pdf_contract():
    minimum = {"title": "Genetic test report", "download_url": "https://example.com/reports/report.pdf?signature=kept"}
    validate_content("pgo_pdf_report", minimum)
    validate_content("pgo_pdf_report", {**minimum, "notes": ""})
    reject(lambda: validate_content("pgo_pdf_report", {**minimum, "page_count": 8}))
    require(set(SCHEMAS["pgo_pdf_report"]["properties"]) == {"title", "download_url", "notes"}, "PDF is not the exact two-field-plus-notes contract")


check("pdf_exact_minimum_and_query_preservation", validate_pdf_contract)
check("candidate_genes_standalone", lambda: validate_content("pgo_bundle_of_candidate_genes", {"genes": ["BRCA1"]}))
check("symptoms_standalone_free_text", lambda: validate_content("pgo_bundle_of_symptoms", {"observations": [{"label": "Hearing loss"}]}))
check("physical_sample_standalone", lambda: validate_content("pgo_blood_sample", {"sample_label": "Tube A"}))


def property_enum(type_id: str, key: str):
    return SCHEMAS[type_id]["properties"][key]["enum"]


def validate_exact_enums():
    require(property_enum("pgo_test_order", "sample_type") == SAMPLE_TYPES[:-1] + ORDER_ONLY_SAMPLE_TYPES + ["other"], "Test-order sample choices differ")
    require(property_enum("pgo_collection_request", "sample_type") == SAMPLE_TYPES, "Collection sample choices differ")
    require(property_enum("pgo_test_order", "test_type") == TEST_TYPES, "Test type choices differ")
    require(property_enum("pgo_collection_request", "collection_method") == COLLECTION_METHODS, "Collection methods differ")
    require(property_enum("pgo_collection_request", "container") == CONTAINERS, "Collection containers differ")
    require(property_enum("pgo_blood_sample", "container") == CONTAINERS, "Blood containers differ")
    require(property_enum("pgo_blood_sample", "material") == ["whole_blood", "plasma", "serum", "buffy_coat", "dried_blood_spot", "other"], "Blood material choices differ")
    require(property_enum("pgo_tissue_sample", "preparation") == ["fresh", "frozen", "formalin_fixed_unembedded", "ffpe", "alcohol_preserved", "other"], "Tissue choices differ")
    require(property_enum("pgo_embryo_sample", "material_kind") == ["embryo_biopsy", "whole_embryo", "polar_body", "other"], "Embryo choices differ")
    require(property_enum("pgo_informed_consent", "status") == ["pending", "accepted", "declined", "withdrawn"], "Consent states differ")


check("exact_domain_enums", validate_exact_enums)


def validate_other_without_companion():
    cases = [
        ("pgo_test_order", "sample_type"),
        ("pgo_test_order", "test_type"),
        ("pgo_collection_request", "sample_type"),
        ("pgo_collection_request", "collection_method"),
        ("pgo_collection_request", "container"),
        ("pgo_blood_sample", "material"),
        ("pgo_blood_sample", "container"),
        ("pgo_tissue_sample", "preparation"),
        ("pgo_embryo_sample", "material_kind"),
    ]
    for type_id, key in cases:
        content = minimal_instance(SCHEMAS[type_id])
        content[key] = "other"
        content.pop("notes", None)
        validate_content(type_id, content)
    serialized = json.dumps(SCHEMAS)
    require(not re.search(r"other_(description|text)|specify_other|sample_type_other", serialized), "A specify-Other field remains")


check("other_valid_without_notes_or_companion", validate_other_without_companion)


def validate_component_contracts():
    reads = {
        "title": "Single interleaved lane",
        "reads": [{"key": "interleaved", "name": "Reads", "download_url": "https://example.com/download?opaque=1"}],
    }
    validate_content("pgo_sequence_reads", reads)
    duplicate_reads = copy.deepcopy(reads)
    duplicate_reads["reads"].append(copy.deepcopy(duplicate_reads["reads"][0]))
    reject(lambda: validate_content("pgo_sequence_reads", duplicate_reads))
    images = {
        "title": "Images",
        "images": [{"key": "image_1", "name": "Image 1", "download_url": "https://example.com/image?id=1"}],
    }
    validate_content("pgo_image_bundle", images)
    duplicate_images = copy.deepcopy(images)
    duplicate_images["images"].append(copy.deepcopy(duplicate_images["images"][0]))
    reject(lambda: validate_content("pgo_image_bundle", duplicate_images))
    for type_id, collection_key in [("pgo_sequence_reads", "reads"), ("pgo_image_bundle", "images")]:
        item_schema = SCHEMAS[type_id]["properties"][collection_key]["items"]
        require(set(item_schema["properties"]) == {"key", "name", "download_url"}, f"Extra component field in {type_id}")
        require(item_schema.get("additionalProperties") is False, f"Open component schema in {type_id}")


check("direct_component_urls_and_unique_keys", validate_component_contracts)


def validate_single_file_contracts():
    common = {
        "pgo_sequence_data",
        "pgo_unannotated_vcf",
        "pgo_annotated_vcf",
        "pgo_interactive_report",
        "pgo_pdf_report",
        "pgo_flow_cytometry_data",
    }
    for type_id in common:
        require(set(SCHEMAS[type_id]["properties"]) == {"title", "download_url", "notes"}, f"Single-file contract differs for {type_id}")
        reject(lambda type_id=type_id: validate_content(type_id, {"title": "x", "download_url": "https://example.com/x", "files": []}))
    require(set(SCHEMAS["pgo_aligned_reads"]["properties"]) == {"title", "download_url", "index_download_url", "notes"}, "Aligned reads has extra keys")


check("single_file_objects_have_no_generic_files", validate_single_file_contracts)


VALID_FORM_VALUES = {
    "text": "Text",
    "long_text": "Long text",
    "email": "person@example.com",
    "phone": "+5491112345678",
    "url": "https://example.com/value",
    "address": "Street 123",
    "postal_code": "C1000",
    "country_code": "AR",
    "identifier": "identifier_1",
    "number": 1.5,
    "integer": 2,
    "positive_integer": 1,
    "percentage": 50,
    "boolean": True,
    "date": "2026-09-22",
    "datetime": "2026-09-22T12:00:00Z",
    "time": "12:30",
    "enum": "first",
    "multi_enum": ["first", "second"],
    "string_list": ["one", "two"],
    "integer_list": [1, 2],
    "number_list": [1.5, 2],
}


def form_for_types():
    fields = []
    answers = []
    for index, kind in enumerate(sorted(FORM_FIELD_TYPES)):
        field = {"key": f"field_{index}", "label": kind, "type": kind, "required": True}
        if kind in {"enum", "multi_enum"}:
            field["options"] = [{"value": "first", "label": "First"}, {"value": "second", "label": "Second"}]
        fields.append(field)
        answers.append({"key": field["key"], "value": VALID_FORM_VALUES[kind]})
    return {"form_shape": {"fields": fields}, "fields": answers}


def validate_form_semantics():
    validate_content("pgo_form", form_for_types())
    validate_content("pgo_form", {"form_shape": {"fields": []}, "fields": []})
    base = {"form_shape": {"fields": [{"key": "choice", "label": "Choice", "type": "enum", "required": True, "options": [{"value": "a", "label": "A"}]}]}, "fields": [{"key": "choice", "value": "a"}]}
    duplicate_definition = copy.deepcopy(base)
    duplicate_definition["form_shape"]["fields"].append(copy.deepcopy(duplicate_definition["form_shape"]["fields"][0]))
    reject(lambda: validate_content("pgo_form", duplicate_definition))
    duplicate_answer = copy.deepcopy(base)
    duplicate_answer["fields"].append(copy.deepcopy(duplicate_answer["fields"][0]))
    reject(lambda: validate_content("pgo_form", duplicate_answer))
    undeclared = copy.deepcopy(base)
    undeclared["fields"][0]["key"] = "missing"
    reject(lambda: validate_content("pgo_form", undeclared))
    invalid_enum = copy.deepcopy(base)
    invalid_enum["fields"][0]["value"] = "b"
    reject(lambda: validate_content("pgo_form", invalid_enum))
    wrong_numeric_array = {"form_shape": {"fields": [{"key": "numbers", "label": "Numbers", "type": "integer_list", "required": True}]}, "fields": [{"key": "numbers", "value": ["1"]}]}
    reject(lambda: validate_content("pgo_form", wrong_numeric_array))


check("form_frozen_shape_and_all_21_typed_answers", validate_form_semantics)


def embedded_form_shape(shape: dict):
    result = []
    for field in shape["fields"]:
        item = {key: field[key] for key in ("key", "label", "type", "required")}
        if "options" in field:
            item["options"] = field["options"]
        if "helpInfoText" in field:
            item["help_info_text"] = field["helpInfoText"]
        result.append(item)
    return result


def validate_service_forms_and_slots():
    require(len(SERVICES) == SERVICE_CATALOG["serviceCount"] == 15, "Service catalog count differs")
    forbidden_paths = re.compile(r"data\.(scope|fulfillment|analysis_support|reference_id|profile_id|native_format|payload_ref|source_pgi_ref|source_images_ref|lineage_refs)", re.I)
    for service in SERVICES:
        service_id = service["serviceId"]
        form_slots = [slot for slot in service["inputSlots"] if slot["objectType"] == "pgo_form"]
        has_shape = "formShape" in service
        require(has_shape == bool(form_slots), f"Form slot/shape mismatch for {service_id}")
        require(len(form_slots) <= 1, f"Multiple form slots for {service_id}")
        input_roles = {slot["role"] for slot in service["inputSlots"]}
        for slot in service["inputSlots"] + service["outputSlots"]:
            object_type = slot["objectType"]
            if object_type.startswith("same_as:"):
                source_role = object_type.removeprefix("same_as:")
                require(source_role in input_roles, f"Unknown same-identity source in {service_id}")
                require(slot.get("sameIdentityAsInput") == source_role, f"same_as binding differs in {service_id}")
            else:
                require(object_type in TYPE_IDS, f"Unknown PGO slot in {service_id}")
        require(all(slot["objectType"] != "pgo_form" for slot in service["outputSlots"]), f"Form output in {service_id}")
        for rule in service.get("acceptedConditions", []) + service.get("scopeRules", []):
            require(not forbidden_paths.search(rule), f"Deleted content path remains in {service_id}: {rule}")
        if has_shape:
            shape = service["formShape"]
            keys = [field["key"] for field in shape["fields"]]
            require("requested_at" not in keys and "requested_by" not in keys and "subject_id" not in keys, f"Universal technical field remains in {service_id}")
            require(shape["allowUnknownFields"] is False, f"Unknown form fields enabled for {service_id}")
            content = service["sampleFormObject"]["data"]
            require(set(content) <= {"form_shape", "fields", "notes"}, f"Extra form content in {service_id}")
            require(content["form_shape"] == {"fields": embedded_form_shape(shape)}, f"Frozen shape differs in {service_id}")
            require(content["fields"] == service["sampleFormData"]["fields"], f"Sample answers differ in {service_id}")
            validate_content("pgo_form", content)
            fixture = read(f"examples/forms/{service_id}.pgform.json")
            require(fixture == service["sampleFormObject"], f"Form fixture differs in {service_id}")
        require(read(f"services/{service_id}.json") == service, f"Individual service file differs for {service_id}")


check("service_forms_slots_and_deleted_paths", validate_service_forms_and_slots)


def validate_optional_service_slots():
    validator = schema_validator(read("schemas/protocol/service-definition.schema.json"))
    base = SERVICES[0]
    variants = (
        ("no_inputs", False, True),
        ("no_outputs", True, False),
        ("no_inputs_or_outputs", False, False),
    )
    for name, keep_inputs, keep_outputs in variants:
        service = copy.deepcopy(base)
        service["serviceId"] = f"pgs_contract_{name}"
        if not keep_inputs:
            service["inputSlots"] = []
            service.pop("formShape", None)
            service.pop("sampleFormData", None)
            service.pop("sampleFormObject", None)
            service["sampleRequest"]["inputs"] = []
        if not keep_outputs:
            service["outputSlots"] = []
            service["sampleResult"]["outputs"] = []
        left = "form:form" if keep_inputs else "none"
        right = "symptoms:bundle_of_symptoms" if keep_outputs else "none"
        service["shortContract"] = f"{left} -> {right}"
        validator.validate(service)

    transaction_validator = schema_validator(read("schemas/protocol/service-transaction.schema.json"))
    transaction_validator.validate({
        "requestId": "pgr_empty_contract",
        "offerId": "offer_empty_contract",
        "serviceId": "pgs_contract_no_inputs_or_outputs",
        "serviceVersion": 1,
        "providerId": "provider_empty_contract",
        "providerKind": "organization",
        "requestedByUserId": "user_requester",
        "requestedAt": "2026-09-22T12:00:00Z",
        "requestedAtClient": "2026-09-22T12:00:00Z",
        "status": "delivered",
        "requestRevision": 1,
        "idempotencyKey": "empty-contract-delivery",
        "inputs": [],
        "outputObjects": [],
        "outputReports": [],
        "issues": [],
        "missingRequiredInputRoles": [],
        "offerSnapshot": {},
        "providerSnapshot": {},
        "contractSource": "pocket_genes_services_wiki_v1",
        "createdAt": "2026-09-22T12:00:00Z",
        "updatedAt": "2026-09-22T12:00:00Z",
    })


check("optional_service_input_and_output_slots", validate_optional_service_slots)


def validate_protocol_examples():
    protocol_pairs = [
        ("service-request.schema.json", ROOT / "examples/requests"),
        ("service-result.schema.json", ROOT / "examples/results"),
    ]
    for schema_name, directory in protocol_pairs:
        validator = schema_validator(read(f"schemas/protocol/{schema_name}"))
        for path in sorted(directory.glob("*.json")):
            validator.validate(json.loads(path.read_text()))
    envelope_validator = schema_validator(read("schemas/protocol/object-envelope.schema.json"))
    for path in sorted((ROOT / "examples/objects").glob("*.json")) + sorted((ROOT / "examples/forms").glob("*.json")):
        value = json.loads(path.read_text())
        if "data" not in value:
            continue
        envelope_validator.validate(value)
        validate_content(value["object_type"], value["data"])


check("protocol_and_platform_fixture_examples", validate_protocol_examples)


def validate_provider_catalog():
    require(len(PROVIDERS) == 6, "Provider count differs")
    provider_validator = schema_validator(read("schemas/protocol/provider-definition.schema.json"))
    for provider in PROVIDERS:
        provider_validator.validate(provider)
        require(read(f"providers/{provider['provider_id']}.json") == provider, f"Provider file differs for {provider['provider_id']}")
        require(set(provider["service_ids"]).issubset({service["serviceId"] for service in SERVICES}), f"Unknown provider service for {provider['provider_id']}")
    referenced_form = PROVIDER_CATALOG["variant_analysis_api_example"]["referenced_form_example"]
    require("data" in referenced_form and referenced_form["object_type"] == "pgo_form", "Provider form fixture is missing")
    validate_content("pgo_form", referenced_form["data"])
    shared = PROVIDER_CATALOG["shared_api_contract"]
    require("requestedAt" in shared["form_metadata_location"] and "requestedByUserId" in shared["form_metadata_location"], "Transaction metadata location is unclear")
    require("input_refs" in shared["object_provenance"] and "no input_refs" in shared["object_provenance"], "Standalone provenance rule is missing")


check("providers_and_shared_api_boundary", validate_provider_catalog)


def validate_field_key_matrix():
    expected = {
        "service_offers": "lower_camel_case",
        "service_transactions": "lower_camel_case",
        "uploaded_objects": "snake_case",
        "uploaded_reports": "snake_case",
        "file_storage": "snake_case",
        "object_owners": "snake_case",
        "report_owners": "snake_case",
        "object_codes": "snake_case",
        "report_codes": "snake_case",
    }
    actual = {item["collection"]: item["field_key_convention"] for item in FIELD_KEY_CONVENTIONS["collections"]}
    require(actual == expected, "Firestore field-key convention matrix differs")
    require(FIELD_KEY_CONVENTIONS["compatibility_aliases_allowed"] is False, "Compatibility aliases must remain forbidden")
    serialized = FIELD_KEY_CONVENTIONS["serialized_pgo_content"]
    require(serialized["field_key_convention"] == "snake_case", "Serialized PGO content must use snake_case")


check("field_key_boundary_matrix", validate_field_key_matrix)


def validate_native_pgi_contracts():
    documentation = read_text("docs/pgi-native-formats.md")
    swift_sources = "\n".join(path.read_text() for path in (ROOT.parent / "mydnamap-ios/mydnamap").rglob("*.swift"))
    for extension, (model, provider_format, schema_path) in PGI_NATIVE_FORMATS.items():
        schema_validator(read(schema_path))
        require(extension in documentation and model in documentation and provider_format in documentation, f"Native PGI docs missing {extension}")
        require(extension in swift_sources and model in swift_sources, f"Native iOS mapping missing {extension}")


def read_text(relative_path: str):
    return (ROOT / relative_path).read_text()


check("native_pgi_mappings_preserved", validate_native_pgi_contracts)


def validate_collection_request_language():
    combined = "\n".join([
        OBJECT_BY_ID["pgo_collection_request"]["description"],
        read_text("objects/pgo_collection_request.md"),
        read_text("docs/service-model.md"),
    ]).lower()
    require("biological" in combined, "Collection request must say biological collection")
    require("courier" in combined and "transport" in combined, "Collection request must explicitly reject courier/transport meaning")


check("collection_request_is_biological_not_transport", validate_collection_request_language)


def validate_docs_and_breaking_policy():
    aggregate = read_text("Pocket-Genes-Wiki.md")
    root_wiki = (ROOT.parent / "Pocket-Genes-Services-Wiki.md").read_text()
    service_model = read_text("docs/service-model.md")
    for text_name, text in [("package wiki", aggregate), ("root wiki", root_wiki), ("service model", service_model)]:
        require("no compatibility" in text.lower() or "no legacy" in text.lower(), f"{text_name} does not state the strict breaking policy")
        require(
            any(phrase in text.lower() for phrase in ("domain-only", "domain content", "domain payload")),
            f"{text_name} does not explain the content boundary",
        )
        for type_id in TYPE_IDS:
            require(type_id in text, f"{text_name} omits {type_id}")
    require(aggregate == root_wiki, "The two generated aggregate wikis differ")
    for type_id in TYPE_IDS:
        page = read_text(f"objects/{type_id}.md")
        for key in CONTRACTS[type_id][0] | CONTRACTS[type_id][1]:
            require(f"`{key}`" in page, f"Object page {type_id} omits {key}")


check("wiki_service_model_and_20_pages", validate_docs_and_breaking_policy)


def validate_all_json_and_mirrors():
    for path in sorted(ROOT.rglob("*.json")):
        json.loads(path.read_text())
    ios_root = ROOT.parent / "mydnamap-ios/mydnamap/Resources"
    require(json.loads((ios_root / "PocketGenesServicesCatalog.json").read_text()) == SERVICE_CATALOG, "Bundled iOS service catalog differs")
    require(json.loads((ios_root / "PocketGenesProvidersCatalog.json").read_text()) == PROVIDER_CATALOG, "Bundled iOS provider catalog differs")
    for type_id in TYPE_IDS:
        require(json.loads((ios_root / f"FileWizardSchemas/{type_id}.schema.json").read_text()) == SCHEMAS[type_id], f"Bundled wizard schema differs for {type_id}")


check("all_json_and_native_resource_mirrors", validate_all_json_and_mirrors)


def validate_no_forbidden_content_definitions():
    for type_id, schema in SCHEMAS.items():
        serialized = json.dumps(schema)
        for key in FORBIDDEN_CONTENT_KEYS:
            require(f'"{key}"' not in serialized, f"Forbidden content key {key} remains in {type_id}")


check("no_envelope_or_discarded_keys_in_content_schemas", validate_no_forbidden_content_definitions)


passed = sum(item["status"] == "passed" for item in CHECKS)
failed = len(CHECKS) - passed
report = {
    "status": "passed" if failed == 0 else "failed",
    "summary": {"total": len(CHECKS), "passed": passed, "failed": failed},
    "checks": CHECKS,
}
(ROOT / "validation-report.json").write_text(json.dumps(report, indent=2) + "\n")

print(f"{passed}/{len(CHECKS)} strict PGO package checks passed")
if failed:
    for item in CHECKS:
        if item["status"] == "failed":
            print(f"FAIL {item['check']}: {item['detail']}")
    sys.exit(1)
