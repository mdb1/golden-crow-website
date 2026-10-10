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
SERVICE_OFFER_TYPE_CATALOG = read("catalog/service-offer-types.json")
PROVIDER_CATALOG = read("catalog/providers.json")
FIELD_KEY_CONVENTIONS = read("catalog/field-key-conventions.json")
OBJECTS = OBJECT_CATALOG["objects"]
SERVICES = SERVICE_CATALOG["services"]
SERVICE_OFFER_TYPES = SERVICE_OFFER_TYPE_CATALOG["serviceOfferTypes"]
PROVIDERS = PROVIDER_CATALOG["providers"]
EXPECTED_EXISTING_SERVICE_OFFER_TYPE_KEYS = (
    "sot_genetic_counseling",
    "sot_clinical_intake_phenotyping",
    "sot_informed_consent",
    "sot_genetic_test_selection",
    "sot_genetic_test_ordering",
    "sot_sample_collection",
    "sot_sample_logistics",
    "sot_sample_accession_quality",
    "sot_dna_extraction",
    "sot_dna_sequencing",
    "sot_genotyping",
    "sot_cytogenetic_analysis",
    "sot_prenatal_genetic_screening",
    "sot_reproductive_carrier_screening",
    "sot_sequence_quality_control",
    "sot_read_alignment",
    "sot_variant_calling",
    "sot_structural_variant_cnv_analysis",
    "sot_variant_annotation",
    "sot_gene_variant_prioritization",
    "sot_genomic_interpretation",
    "sot_rare_disease_analysis",
    "sot_hereditary_cancer_analysis",
    "sot_pharmacogenomic_analysis",
    "sot_nutrigenomic_metabolic_analysis",
    "sot_ancestry_analysis",
    "sot_polygenic_risk_analysis",
    "sot_genomic_report_generation",
    "sot_genomic_report_review",
    "sot_genomic_data_interoperability",
    "sot_complete_health_genomics_report",
    "sot_complete_rare_disease_diagnostic_report",
    "sot_complete_hereditary_cancer_report",
    "sot_complete_inherited_cardiovascular_report",
    "sot_complete_neurogenetic_disease_report",
    "sot_complete_cystic_fibrosis_report",
    "sot_complete_pharmacogenomic_report",
    "sot_complete_nutrigenomic_report",
    "sot_complete_food_response_genetics_report",
    "sot_complete_sports_performance_genetics_report",
    "sot_complete_skin_hair_genetics_report",
    "sot_complete_genetic_ancestry_report",
    "sot_complete_personal_traits_genetics_report",
    "sot_complete_reproductive_carrier_report",
    "sot_complete_female_fertility_genetics_report",
    "sot_complete_male_infertility_genetics_report",
    "sot_complete_sperm_dna_integrity_report",
    "sot_complete_reproductive_couple_karyotype_report",
    "sot_complete_preimplantation_aneuploidy_report",
    "sot_complete_preimplantation_monogenic_report",
    "sot_complete_preimplantation_structural_report",
    "sot_complete_noninvasive_prenatal_report",
    "sot_complete_prenatal_carrier_fetal_risk_report",
    "sot_complete_newborn_genomic_screening_report",
    "sot_complete_animal_parentage_identity_report",
    "sot_complete_canine_health_diversity_report",
    "sot_complete_feline_health_traits_report",
    "sot_complete_equine_health_performance_report",
    "sot_complete_livestock_breeding_traits_report",
    "sot_complete_meat_species_authentication_report",
)
EXPECTED_HUMAN_ADVICE_SERVICE_OFFER_TYPE_KEYS = (
    "sot_human_advice_medical_consultation",
    "sot_human_advice_medical_second_opinion",
    "sot_human_advice_medication_pharmacy_counseling",
    "sot_human_advice_nutrition_dietary_counseling",
    "sot_human_advice_rehabilitation_physical_therapy_guidance",
    "sot_human_advice_reproductive_fertility_counseling",
    "sot_human_advice_sexual_health_counseling",
    "sot_human_advice_pregnancy_postpartum_support",
    "sot_human_advice_psychological_counseling",
    "sot_human_advice_couples_family_counseling",
    "sot_human_advice_grief_bereavement_support",
    "sot_human_advice_addiction_recovery_counseling",
    "sot_human_advice_parenting_guidance",
    "sot_human_advice_caregiver_eldercare_support",
    "sot_human_advice_disability_accessibility_guidance",
    "sot_human_advice_social_care_navigation",
    "sot_human_advice_personal_civil_legal",
    "sot_human_advice_family_estate_legal",
    "sot_human_advice_employment_labor_legal",
    "sot_human_advice_business_contract_legal",
    "sot_human_advice_immigration_residency_legal",
    "sot_human_advice_academic_tutoring",
    "sot_human_advice_special_education_learning_support",
    "sot_human_advice_language_learning",
    "sot_human_advice_academic_admissions_guidance",
    "sot_human_advice_career_vocational_guidance",
    "sot_human_advice_digital_technology_support",
    "sot_human_advice_cybersecurity_privacy_consulting",
    "sot_human_advice_business_entrepreneurship_consulting",
    "sot_human_advice_financial_accounting_tax_consulting",
    "sot_human_advice_health_professional_career_guidance",
    "sot_human_advice_health_professional_development",
    "sot_human_advice_clinical_mentoring_supervision",
    "sot_human_advice_healthcare_leadership_management",
    "sot_human_advice_health_education_training_design",
    "sot_human_advice_health_research_methodology",
    "sot_human_advice_health_scientific_writing_publication",
    "sot_human_advice_evidence_based_health_practice",
    "sot_human_advice_healthcare_quality_patient_safety",
    "sot_human_advice_health_practice_operations",
    "sot_human_advice_digital_health_strategy_transformation",
    "sot_human_advice_health_information_systems_implementation",
    "sot_human_advice_electronic_health_record_workflow_optimization",
    "sot_human_advice_health_data_interoperability_integration",
    "sot_human_advice_telehealth_remote_care_implementation",
    "sot_human_advice_health_data_governance_analytics",
    "sot_human_advice_healthcare_ai_evaluation_adoption",
    "sot_human_advice_digital_health_product_medical_technology",
    "sot_human_advice_health_it_infrastructure_cloud_architecture",
    "sot_human_advice_health_technology_usability_human_factors_accessibility",
)
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


def validate_optional_test_order_genes_have_no_added_minimum():
    genes_schema = SCHEMAS["pgo_test_order"]["properties"]["genes"]
    require("minItems" not in genes_schema, "Optional test-order genes gained an unspecified minimum")
    validate_content(
        "pgo_test_order",
        {
            "patient": "Patient AB-123",
            "test_name": "Hereditary cancer panel",
            "sample_type": "blood",
            "genes": [],
        },
    )


check("optional_test_order_genes_have_no_added_minimum", validate_optional_test_order_genes_have_no_added_minimum)


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
    offer_validator = schema_validator(read("schemas/protocol/service-definition.schema.json"))
    forbidden_paths = re.compile(r"data\.(scope|fulfillment|analysis_support|reference_id|profile_id|native_format|payload_ref|source_pgi_ref|source_images_ref|lineage_refs)", re.I)
    for service in SERVICES:
        service_id = service["serviceId"]
        offer_validator.validate(service)
        for fixture_field in ("sampleFormObject", "sampleRequest", "sampleResult"):
            require(fixture_field not in service, f"Protocol fixture embedded in service offer {service_id}: {fixture_field}")
        require(type(service.get("isHighlightedOffer")) is bool, f"Invalid isHighlightedOffer for {service_id}")
        require(type(service.get("isProfessionalOffer")) is bool, f"Invalid isProfessionalOffer for {service_id}")
        require("is_highlighted_offer" not in service, f"Snake-case highlighted alias in {service_id}")
        require("is_professional_offer" not in service, f"Snake-case professional alias in {service_id}")
        require("promotional_banner_image_url" not in service, f"Snake-case promotional banner alias in {service_id}")
        require("promotional_banner_image_upload_data_url" not in service, f"Snake-case promotional upload alias in {service_id}")
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
            fixture = read(f"examples/forms/{service_id}.pgform.json")
            content = fixture["data"]
            require(set(content) <= {"form_shape", "fields", "notes"}, f"Extra form content in {service_id}")
            require(content["form_shape"] == {"fields": embedded_form_shape(shape)}, f"Frozen shape differs in {service_id}")
            require(content["fields"] == service["sampleFormData"]["fields"], f"Sample answers differ in {service_id}")
            validate_content("pgo_form", content)
        request_fixture = read(f"examples/requests/{service_id}.json")
        result_fixture = read(f"examples/results/{service_id}.json")
        require(request_fixture["service_id"] == service_id, f"Request fixture service differs in {service_id}")
        require(request_fixture["service_version"] == service["serviceVersion"], f"Request fixture version differs in {service_id}")
        require(result_fixture["request_id"] == request_fixture["request_id"], f"Result fixture request differs in {service_id}")
        require(read(f"services/{service_id}.json") == service, f"Individual service file differs for {service_id}")


check("service_forms_slots_and_deleted_paths", validate_service_forms_and_slots)


def validate_service_more_information_contract():
    offer_schema = read("schemas/protocol/service-definition.schema.json")
    transaction_schema = read("schemas/protocol/service-transaction.schema.json")
    offer_validator = schema_validator(offer_schema)
    example_offer = copy.deepcopy(next(
        service for service in SERVICES if service["serviceId"] == "pgs_dna_extraction"
    ))
    expected_keys = {
        "frequentQuestions",
        "keyInsights",
        "scientificFacts",
        "usefulLinks",
        "sampleLink",
        "bulletSegments",
        "technicalInformationFacts",
        "biologicalSampleRequirements",
        "websiteUrl",
    }
    array_keys = expected_keys - {"sampleLink", "websiteUrl"}

    require(
        [service["serviceId"] for service in SERVICES if "moreInformation" in service]
        == ["pgs_dna_extraction"],
        "Generated moreInformation fixture set differs",
    )
    require(
        set(example_offer["moreInformation"]) == expected_keys,
        "Complete moreInformation fixture does not exercise every optional child",
    )
    offer_validator.validate(example_offer)

    definition_names = {
        "service_more_information",
        "service_more_information_frequent_question",
        "service_more_information_key_insight",
        "service_more_information_scientific_fact",
        "service_more_information_useful_link",
        "service_more_information_sample_link",
        "service_more_information_bullet_segment",
        "service_more_information_technical_fact",
        "service_more_information_biological_sample_requirement",
    }
    for definition_name in definition_names:
        require(
            offer_schema["$defs"][definition_name]
            == transaction_schema["$defs"][definition_name],
            f"Offer and transaction snapshot definitions differ for {definition_name}",
        )
    require(
        offer_schema["$defs"]["service_definition"]["properties"]["moreInformation"]
        == transaction_schema["$defs"]["offer_snapshot"]["properties"]["moreInformation"],
        "Direct offer and frozen offer snapshot use different moreInformation properties",
    )

    root_null = copy.deepcopy(example_offer)
    root_null["moreInformation"] = None
    offer_validator.validate(root_null)

    empty_map = copy.deepcopy(example_offer)
    empty_map["moreInformation"] = {}
    offer_validator.validate(empty_map)

    all_null = copy.deepcopy(example_offer)
    all_null["moreInformation"] = {key: None for key in expected_keys}
    offer_validator.validate(all_null)

    empty_arrays = copy.deepcopy(example_offer)
    empty_arrays["moreInformation"] = {
        **{key: [] for key in array_keys},
        "sampleLink": None,
        "websiteUrl": None,
    }
    offer_validator.validate(empty_arrays)

    empty_subitems = copy.deepcopy(example_offer)
    empty_subitems["moreInformation"]["technicalInformationFacts"][0]["subitems"] = []
    offer_validator.validate(empty_subitems)

    wrong_root_alias = copy.deepcopy(example_offer)
    wrong_root_alias["more_information"] = wrong_root_alias.pop("moreInformation")
    reject(
        lambda: offer_validator.validate(wrong_root_alias),
        "service_offers accepted more_information",
    )

    wrong_child_alias = copy.deepcopy(example_offer)
    info = wrong_child_alias["moreInformation"]
    info["frequent_questions"] = info.pop("frequentQuestions")
    reject(
        lambda: offer_validator.validate(wrong_child_alias),
        "service_offers accepted moreInformation.frequent_questions",
    )

    wrong_sample_alias = copy.deepcopy(example_offer)
    sample_link = wrong_sample_alias["moreInformation"]["sampleLink"]
    sample_link["button_title"] = sample_link.pop("buttonTitle")
    reject(
        lambda: offer_validator.validate(wrong_sample_alias),
        "service_offers accepted moreInformation.sampleLink.button_title",
    )

    wrong_image_alias = copy.deepcopy(example_offer)
    bullet = wrong_image_alias["moreInformation"]["bulletSegments"][0]
    bullet["image_url"] = bullet.pop("imageUrl")
    reject(
        lambda: offer_validator.validate(wrong_image_alias),
        "service_offers accepted moreInformation.bulletSegments[].image_url",
    )

    wrong_image_data_alias = copy.deepcopy(example_offer)
    bullet = wrong_image_data_alias["moreInformation"]["bulletSegments"][0]
    bullet["image_upload_data_url"] = "data:image/png;base64,aGVsbG8="
    reject(
        lambda: offer_validator.validate(wrong_image_data_alias),
        "service_offers accepted moreInformation.bulletSegments[].image_upload_data_url",
    )

    inline_bullet_image = copy.deepcopy(example_offer)
    bullet = inline_bullet_image["moreInformation"]["bulletSegments"][0]
    bullet.pop("imageUrl")
    bullet["imageUploadDataUrl"] = "data:image/png;base64,aGVsbG8="
    offer_validator.validate(inline_bullet_image)

    missing_bullet_image = copy.deepcopy(example_offer)
    missing_bullet_image["moreInformation"]["bulletSegments"][0].pop("imageUrl")
    reject(
        lambda: offer_validator.validate(missing_bullet_image),
        "service_offers accepted bulletSegments[] without an image source",
    )

    malformed_bullet_image_data = copy.deepcopy(example_offer)
    bullet = malformed_bullet_image_data["moreInformation"]["bulletSegments"][0]
    bullet.pop("imageUrl")
    bullet["imageUploadDataUrl"] = "data:text/plain;base64,aGVsbG8="
    reject(
        lambda: offer_validator.validate(malformed_bullet_image_data),
        "service_offers accepted malformed bulletSegments[].imageUploadDataUrl",
    )

    invalid_base64_bullet_image_data = copy.deepcopy(example_offer)
    bullet = invalid_base64_bullet_image_data["moreInformation"]["bulletSegments"][0]
    bullet.pop("imageUrl")
    bullet["imageUploadDataUrl"] = "data:image/png;base64,not_base64"
    reject(
        lambda: offer_validator.validate(invalid_base64_bullet_image_data),
        "service_offers accepted invalid base64 in bulletSegments[].imageUploadDataUrl",
    )

    unknown_child = copy.deepcopy(example_offer)
    unknown_child["moreInformation"]["extraSection"] = []
    reject(
        lambda: offer_validator.validate(unknown_child),
        "service_offers accepted an unknown moreInformation child",
    )

    unknown_item_field = copy.deepcopy(example_offer)
    unknown_item_field["moreInformation"]["keyInsights"][0]["subtitle"] = "Not canonical"
    reject(
        lambda: offer_validator.validate(unknown_item_field),
        "service_offers accepted an unknown moreInformation item field",
    )

    missing_required_item_field = copy.deepcopy(example_offer)
    del missing_required_item_field["moreInformation"]["frequentQuestions"][0]["answer"]
    reject(
        lambda: offer_validator.validate(missing_required_item_field),
        "service_offers accepted an incomplete frequent-question item",
    )

    blank_item_field = copy.deepcopy(example_offer)
    blank_item_field["moreInformation"]["scientificFacts"][0]["title"] = "   "
    reject(
        lambda: offer_validator.validate(blank_item_field),
        "service_offers accepted a blank moreInformation item string",
    )

    null_array_item = copy.deepcopy(example_offer)
    null_array_item["moreInformation"]["keyInsights"] = [None]
    reject(
        lambda: offer_validator.validate(null_array_item),
        "service_offers accepted a null moreInformation array item",
    )

    null_subitem = copy.deepcopy(example_offer)
    null_subitem["moreInformation"]["technicalInformationFacts"][0]["subitems"] = [None]
    reject(
        lambda: offer_validator.validate(null_subitem),
        "service_offers accepted a null technical-information subitem",
    )

    wrong_child_type = copy.deepcopy(example_offer)
    wrong_child_type["moreInformation"]["usefulLinks"] = "https://example.com"
    reject(
        lambda: offer_validator.validate(wrong_child_type),
        "service_offers accepted a scalar usefulLinks section",
    )

    invalid_url_cases = []
    invalid_useful_link = copy.deepcopy(example_offer)
    invalid_useful_link["moreInformation"]["usefulLinks"][0]["url"] = "http://example.com/resource"
    invalid_url_cases.append(("usefulLinks[].url", invalid_useful_link))
    invalid_sample_link = copy.deepcopy(example_offer)
    invalid_sample_link["moreInformation"]["sampleLink"]["url"] = "sample"
    invalid_url_cases.append(("sampleLink.url", invalid_sample_link))
    invalid_bullet_image = copy.deepcopy(example_offer)
    invalid_bullet_image["moreInformation"]["bulletSegments"][0]["imageUrl"] = "https://example .com/image.png"
    invalid_url_cases.append(("bulletSegments[].imageUrl", invalid_bullet_image))
    invalid_website = copy.deepcopy(example_offer)
    invalid_website["moreInformation"]["websiteUrl"] = "https://"
    invalid_url_cases.append(("websiteUrl", invalid_website))
    for path, invalid_offer in invalid_url_cases:
        reject(
            lambda invalid_offer=invalid_offer: offer_validator.validate(invalid_offer),
            f"service_offers accepted non-HTTPS {path}",
        )

    malformed_authorities = (
        "https://user@/path",
        "https://:443/path",
        "https://example.com:bad/path",
        "https://user@example.com/path",
        "HTTPS://example.com/path",
        "https://example.com:123456/path",
        "https://2001:db8::1/path",
        "https://[1:2]/path",
        "https://[::::]/path",
        "https://[2001:::1]/path",
    )
    for malformed_url in malformed_authorities:
        invalid_authority = copy.deepcopy(example_offer)
        invalid_authority["moreInformation"]["websiteUrl"] = malformed_url
        reject(
            lambda invalid_authority=invalid_authority: offer_validator.validate(invalid_authority),
            f"service_offers accepted malformed moreInformation URL {malformed_url}",
        )

    valid_url_forms = (
        "https://example.com/path/to/resource?sample=true#details",
        "https://127.0.0.1:443/path?q=1#fragment",
        "https://1.2.3/",
        "https://example.com/%",
        f"https://{'a' * 63}.{'b' * 63}.{'c' * 63}.{'d' * 63}/",
        "https://[2001:db8::1]:8443/path?q=1#fragment",
        "https://[::]/",
        "https://[::ffff:192.0.2.1]/path?q=1#fragment",
    )
    for valid_url in valid_url_forms:
        valid_url_offer = copy.deepcopy(example_offer)
        valid_url_offer["moreInformation"]["websiteUrl"] = valid_url
        offer_validator.validate(valid_url_offer)


check("service_more_information_closed_nullable_contract", validate_service_more_information_contract)


def validate_service_offer_type_registry():
    require(len(SERVICE_OFFER_TYPES) == 110, "Service-offer type registry must contain exactly 110 values")
    keys = [item["key"] for item in SERVICE_OFFER_TYPES]
    icons = [item["systemImage"] for item in SERVICE_OFFER_TYPES]
    complete_keys = [key for key in keys if key.startswith("sot_complete_")]
    advice_keys = [key for key in keys if key.startswith("sot_human_advice_")]
    require(len(set(keys)) == len(keys), "Service-offer type keys are not unique")
    require(len(set(icons)) == len(icons), "Service-offer type SF Symbols are not unique")
    require(
        len({item["nameEnglish"] for item in SERVICE_OFFER_TYPES}) == len(SERVICE_OFFER_TYPES),
        "English service-offer type names are not unique",
    )
    require(
        len({item["nameSpanish"] for item in SERVICE_OFFER_TYPES}) == len(SERVICE_OFFER_TYPES),
        "Spanish service-offer type names are not unique",
    )
    require(all(re.fullmatch(r"sot_[a-z0-9]+(?:_[a-z0-9]+)*", key) for key in keys), "Invalid sot_* key")
    require(len(complete_keys) == 30, "Complete sample-to-report registry must contain exactly 30 values")
    require(len(advice_keys) == 50, "Human-advice registry must contain exactly 50 values")
    require(
        all(
            not key.startswith("sot_complete_")
            and not key.startswith("sot_human_advice_")
            for key in keys[:30]
        )
        and all(key.startswith("sot_complete_") for key in keys[30:60])
        and all(key.startswith("sot_human_advice_") for key in keys[60:110]),
        "The registry must contain atomic, complete, and human-advice blocks in canonical order",
    )
    require(
        tuple(keys[:60]) == EXPECTED_EXISTING_SERVICE_OFFER_TYPE_KEYS,
        "The original 60 service-offer type keys or their order changed",
    )
    require(
        tuple(keys[60:]) == EXPECTED_HUMAN_ADVICE_SERVICE_OFFER_TYPE_KEYS,
        "The canonical human-advice service-offer type keys or their order changed",
    )
    canonical_fields = {
        "key",
        "nameEnglish",
        "nameSpanish",
        "descriptionEnglish",
        "descriptionSpanish",
        "systemImage",
    }
    for item in SERVICE_OFFER_TYPES:
        require(set(item) == canonical_fields, f"Unexpected service-offer type fields for {item['key']}")
        for field in ("nameEnglish", "nameSpanish", "descriptionEnglish", "descriptionSpanish", "systemImage"):
            require(isinstance(item.get(field), str) and item[field].strip(), f"Missing {field} for {item['key']}")
    require(all(service.get("serviceCategory") in keys for service in SERVICES), "A catalog service uses an unknown serviceCategory")
    service_schema = read("schemas/protocol/service-definition.schema.json")["$defs"]["service_definition"]
    require(service_schema["properties"]["serviceCategory"]["enum"] == keys, "Schema serviceCategory enum differs from registry")
    transaction_schema = read("schemas/protocol/service-transaction.schema.json")
    require(
        transaction_schema["$defs"]["offer_snapshot"]["properties"]["serviceCategory"]["enum"] == keys,
        "Transaction offerSnapshot serviceCategory enum differs from registry",
    )
    swift_source = (ROOT.parent / "mydnamap-ios/mydnamap/Tabs/ServicesHub/ServiceOfferTypeProvider.swift").read_text()
    swift_entries = re.findall(
        r'''\.init\(\s*key: "([^"]+)",\s*nameEnglish: "([^"]+)",\s*nameSpanish: "([^"]+)",\s*descriptionEnglish: "([^"]+)",\s*descriptionSpanish: "([^"]+)",\s*systemImage: "([^"]+)"\s*\)''',
        swift_source,
        re.DOTALL,
    )
    native_registry = [
        dict(zip(("key", "nameEnglish", "nameSpanish", "descriptionEnglish", "descriptionSpanish", "systemImage"), entry))
        for entry in swift_entries
    ]
    require(native_registry == SERVICE_OFFER_TYPES, "Native iOS service-offer type provider differs from the canonical registry")
    kotlin_source = (ROOT.parent / "mydnamap-android/app/src/main/java/com/genetics/app/services/domain/model/ServiceOfferTypeProvider.kt").read_text()
    kotlin_entries = re.findall(
        r'''ServiceOfferType\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",?\s*\)''',
        kotlin_source,
        re.DOTALL,
    )
    android_registry = [
        dict(zip(("key", "nameEnglish", "nameSpanish", "descriptionEnglish", "descriptionSpanish", "systemImage"), entry))
        for entry in kotlin_entries
    ]
    require(android_registry == SERVICE_OFFER_TYPES, "Native Android service-offer type provider differs from the canonical registry")


check("closed_110_value_service_offer_type_registry", validate_service_offer_type_registry)


def validate_service_offer_stage_contract():
    service_schema_document = read("schemas/protocol/service-definition.schema.json")
    service_schema = service_schema_document["$defs"]["service_definition"]
    transaction_schema_document = read("schemas/protocol/service-transaction.schema.json")
    snapshot_schema = transaction_schema_document["$defs"]["offer_snapshot"]
    complete_keys = [
        item["key"] for item in SERVICE_OFFER_TYPES if item["key"].startswith("sot_complete_")
    ]
    advice_keys = [
        item["key"] for item in SERVICE_OFFER_TYPES if item["key"].startswith("sot_human_advice_")
    ]
    complete_stages = ["test_planning", "wet_lab", "bioinformatics"]
    service_stages = [*complete_stages, "human_advice"]

    for schema, boundary in (
        (service_schema, "service_offers"),
        (snapshot_schema, "service_transactions.offerSnapshot"),
    ):
        require(
            schema["properties"]["stages"]["items"]["enum"] == service_stages,
            f"{boundary} stage enum differs from the four-value service lifecycle contract",
        )
        complete_rules = [
            rule
            for rule in schema.get("allOf", [])
            if rule.get("x-pocket-genes-rule") == "complete-service-offer-stages"
        ]
        require(len(complete_rules) == 1, f"{boundary} must contain one generated complete-stage rule")
        rule = complete_rules[0]
        require(
            rule["if"]["properties"]["serviceCategory"]["enum"] == complete_keys,
            f"{boundary} complete-stage rule differs from the canonical complete keys",
        )
        stages_rule = rule["then"]["properties"]["stages"]
        require(
            stages_rule.get("minItems") == 3 and stages_rule.get("maxItems") == 3,
            f"{boundary} complete-stage rule must require exactly three stages",
        )
        require(
            [condition["contains"]["const"] for condition in stages_rule.get("allOf", [])]
            == complete_stages,
            f"{boundary} complete-stage rule must explicitly contain every genomic stage",
        )

        advice_rules = [
            rule
            for rule in schema.get("allOf", [])
            if rule.get("x-pocket-genes-rule") == "human-advice-service-offer-stage"
        ]
        require(len(advice_rules) == 1, f"{boundary} must contain one generated human-advice rule")
        advice_rule = advice_rules[0]
        require(
            advice_rule["if"]["properties"]["serviceCategory"]["enum"] == advice_keys,
            f"{boundary} human-advice rule differs from the canonical advice keys",
        )
        advice_stages = advice_rule["then"]["properties"]["stages"]
        require(
            advice_stages.get("minItems") == 1
            and advice_stages.get("maxItems") == 1
            and advice_stages.get("contains", {}).get("const") == "human_advice",
            f"{boundary} human-advice rule must require exactly human_advice",
        )
        require(
            advice_rule["else"]["properties"]["stages"]["not"]["contains"]["const"]
            == "human_advice",
            f"{boundary} must reserve human_advice for human-advice categories",
        )

    offer_validator = schema_validator(service_schema_document)
    base_offer = copy.deepcopy(SERVICES[0])
    complete_offer = copy.deepcopy(base_offer)
    complete_offer["serviceCategory"] = complete_keys[0]
    complete_offer["stages"] = list(reversed(complete_stages))
    offer_validator.validate(complete_offer)

    for missing_stage in complete_stages:
        incomplete_offer = copy.deepcopy(complete_offer)
        incomplete_offer["stages"] = [
            stage for stage in complete_stages if stage != missing_stage
        ] + ["human_advice"]
        reject(
            lambda incomplete_offer=incomplete_offer: offer_validator.validate(incomplete_offer),
            f"service_offers accepted {complete_keys[0]} with human_advice replacing {missing_stage}",
        )

    atomic_offer = copy.deepcopy(base_offer)
    atomic_offer["serviceCategory"] = SERVICE_OFFER_TYPES[0]["key"]
    atomic_offer["stages"] = ["test_planning"]
    offer_validator.validate(atomic_offer)

    invalid_atomic_offer = copy.deepcopy(atomic_offer)
    invalid_atomic_offer["stages"] = ["human_advice"]
    reject(
        lambda: offer_validator.validate(invalid_atomic_offer),
        "service_offers accepted human_advice for a non-advice category",
    )

    advice_offer = copy.deepcopy(base_offer)
    advice_offer["serviceCategory"] = advice_keys[0]
    advice_offer["stages"] = ["human_advice"]
    offer_validator.validate(advice_offer)
    for invalid_stages in (["test_planning"], ["human_advice", "test_planning"]):
        invalid_advice_offer = copy.deepcopy(advice_offer)
        invalid_advice_offer["stages"] = invalid_stages
        reject(
            lambda invalid_advice_offer=invalid_advice_offer: offer_validator.validate(invalid_advice_offer),
            f"service_offers accepted {advice_keys[0]} with stages {invalid_stages}",
        )

    unknown_offer = copy.deepcopy(complete_offer)
    unknown_offer["serviceCategory"] = "sot_complete_not_registered"
    reject(
        lambda: offer_validator.validate(unknown_offer),
        "service_offers accepted an unregistered complete service category",
    )

    standalone_snapshot_schema = copy.deepcopy(snapshot_schema)
    standalone_snapshot_schema["$schema"] = transaction_schema_document["$schema"]
    standalone_snapshot_schema["$defs"] = copy.deepcopy(transaction_schema_document["$defs"])
    snapshot_validator = schema_validator(standalone_snapshot_schema)
    snapshot = {
        "offerId": "offer_complete_stage_fixture",
        "schemaVersion": base_offer["schemaVersion"],
        "name": base_offer["name"],
        "status": base_offer["status"],
        "isHiddenFromSearch": base_offer["isHiddenFromSearch"],
        "isHighlightedOffer": base_offer["isHighlightedOffer"],
        "isProfessionalOffer": base_offer["isProfessionalOffer"],
        "providerId": base_offer["providerId"],
        "providerName": base_offer["providerName"],
        "providerKind": base_offer["providerKind"],
        "serviceId": base_offer["serviceId"],
        "serviceVersion": base_offer["serviceVersion"],
        "description": base_offer["description"],
        "serviceCategory": complete_keys[-1],
        "stages": complete_stages,
        "availability": base_offer["availability"],
        "shortContract": "none -> none",
        "providerWork": base_offer["providerWork"],
        "inputSlots": [],
        "outputSlots": [],
    }
    snapshot_validator.validate(snapshot)
    for missing_stage in complete_stages:
        incomplete_snapshot = copy.deepcopy(snapshot)
        incomplete_snapshot["stages"] = [
            stage for stage in complete_stages if stage != missing_stage
        ] + ["human_advice"]
        reject(
            lambda incomplete_snapshot=incomplete_snapshot: snapshot_validator.validate(incomplete_snapshot),
            f"service_transactions.offerSnapshot accepted {complete_keys[-1]} with human_advice replacing {missing_stage}",
        )

    advice_snapshot = copy.deepcopy(snapshot)
    advice_snapshot["serviceCategory"] = advice_keys[-1]
    advice_snapshot["stages"] = ["human_advice"]
    snapshot_validator.validate(advice_snapshot)
    for invalid_stages in (["bioinformatics"], ["human_advice", "bioinformatics"]):
        invalid_advice_snapshot = copy.deepcopy(advice_snapshot)
        invalid_advice_snapshot["stages"] = invalid_stages
        reject(
            lambda invalid_advice_snapshot=invalid_advice_snapshot: snapshot_validator.validate(invalid_advice_snapshot),
            f"service_transactions.offerSnapshot accepted {advice_keys[-1]} with stages {invalid_stages}",
        )


check("service_offer_category_stage_contract", validate_service_offer_stage_contract)


def validate_empty_service_slot_policy():
    schema = read("schemas/protocol/service-definition.schema.json")
    service_schema = schema["$defs"]["service_definition"]
    properties = service_schema["properties"]
    require(properties["inputSlots"].get("minItems") == 0, "inputSlots must allow an empty array")
    require(properties["outputSlots"].get("minItems") == 0, "outputSlots must allow an empty array")
    require("inputSlots" in service_schema["required"], "inputSlots must remain an explicit contract array")
    require("outputSlots" in service_schema["required"], "outputSlots must remain an explicit contract array")
    require("isHighlightedOffer" in service_schema["required"], "isHighlightedOffer must be required")
    require("isProfessionalOffer" in service_schema["required"], "isProfessionalOffer must be required")

    validator = schema_validator(schema)
    original = SERVICES[0]

    no_outputs = copy.deepcopy(original)
    no_outputs["outputSlots"] = []
    no_outputs["shortContract"] = "form:form -> none"
    validator.validate(no_outputs)

    no_inputs = copy.deepcopy(original)
    no_inputs["inputSlots"] = []
    no_inputs["shortContract"] = "none -> symptoms:bundle_of_symptoms"
    no_inputs.pop("formShape", None)
    no_inputs.pop("sampleFormData", None)
    validator.validate(no_inputs)

    slotless = copy.deepcopy(no_inputs)
    slotless["outputSlots"] = []
    slotless["shortContract"] = "none -> none"
    validator.validate(slotless)


check("service_slots_may_be_empty_independently_or_together", validate_empty_service_slot_policy)


def validate_strict_service_boundary_casing():
    offer_validator = schema_validator(read("schemas/protocol/service-definition.schema.json"))
    offer = copy.deepcopy(SERVICES[0])
    canonical_service_id = re.compile(r"^pgs_[a-z0-9]+(?:_[a-z0-9]+)*$")
    require(
        all(canonical_service_id.fullmatch(service["serviceId"]) for service in SERVICES),
        "A direct service_offers fixture has a noncanonical serviceId",
    )

    canonical_tax = copy.deepcopy(offer)
    canonical_tax["commercialTerms"]["taxAndPaymentPolicy"] = "Collected by the provider after review."
    offer_validator.validate(canonical_tax)

    for forbidden_report_field in ("inputReports", "outputReports", "input_reports", "output_reports"):
        report_link_on_offer = copy.deepcopy(canonical_tax)
        report_link_on_offer[forbidden_report_field] = []
        reject(
            lambda report_link_on_offer=report_link_on_offer: offer_validator.validate(report_link_on_offer),
            f"service_offers accepted forbidden report-link field {forbidden_report_field}",
        )

    wrong_tax = copy.deepcopy(canonical_tax)
    wrong_tax["commercialTerms"]["tax_and_payment_policy"] = wrong_tax["commercialTerms"].pop("taxAndPaymentPolicy")
    reject(lambda: offer_validator.validate(wrong_tax), "service_offers accepted tax_and_payment_policy")

    wrong_slot = copy.deepcopy(offer)
    wrong_slot["inputSlots"][0]["accepted_types"] = wrong_slot["inputSlots"][0].pop("acceptedTypes")
    reject(lambda: offer_validator.validate(wrong_slot), "service_offers accepted inputSlots[].accepted_types")

    embedded_fixture = copy.deepcopy(offer)
    embedded_fixture["sampleRequest"] = read(f"examples/requests/{offer['serviceId']}.json")
    reject(lambda: offer_validator.validate(embedded_fixture), "service_offers accepted an embedded snake-case protocol fixture")

    transaction_validator = schema_validator(read("schemas/protocol/service-transaction.schema.json"))
    offer_snapshot = {
        "offerId": "offer_contract_fixture",
        "schemaVersion": 1,
        "name": offer["name"],
        "status": offer["status"],
        "isHiddenFromSearch": offer["isHiddenFromSearch"],
        "isHighlightedOffer": offer["isHighlightedOffer"],
        "isProfessionalOffer": offer["isProfessionalOffer"],
        "providerId": offer["providerId"],
        "providerName": offer["providerName"],
        "providerKind": offer["providerKind"],
        "serviceId": offer["serviceId"],
        "serviceVersion": offer["serviceVersion"],
        "description": offer["description"],
        "serviceCategory": offer["serviceCategory"],
        "stages": offer["stages"],
        "availability": offer["availability"],
        "shortContract": "none -> none",
        "providerWork": offer["providerWork"],
        "inputSlots": [],
        "outputSlots": [],
    }
    transaction = {
        "requestId": "pgr_contract_fixture",
        "offerId": "offer_contract_fixture",
        "serviceId": offer["serviceId"],
        "serviceVersion": offer["serviceVersion"],
        "providerId": offer["providerId"],
        "providerKind": offer["providerKind"],
        "requestedByUserId": "user_contract_fixture",
        "requestedAt": "2026-09-30T00:00:00Z",
        "requestedAtClient": "2026-09-30T00:00:00Z",
        "status": "received",
        "requestRevision": 1,
        "idempotencyKey": "contract-fixture",
        "inputs": [],
        "outputObjects": [],
        "issues": [],
        "missingRequiredInputRoles": [],
        "offerSnapshot": offer_snapshot,
        "providerSnapshot": {
            "id": offer["providerId"],
            "kind": offer["providerKind"],
            "name": offer["providerName"],
        },
        "contractSource": "pocket_genes_services_wiki_v1",
        "createdAt": "2026-09-30T00:00:00Z",
        "updatedAt": "2026-09-30T00:00:00Z",
    }
    transaction_validator.validate(transaction)

    output_reports_null = copy.deepcopy(transaction)
    output_reports_null["outputReports"] = None
    transaction_validator.validate(output_reports_null)

    output_reports_empty = copy.deepcopy(transaction)
    output_reports_empty["outputReports"] = []
    transaction_validator.validate(output_reports_empty)

    output_reports_linked = copy.deepcopy(transaction)
    output_reports_linked["outputReports"] = [
        {"reportCode": "ABC123"},
        {"reportCode": "RPT9Z8"},
    ]
    transaction_validator.validate(output_reports_linked)

    for invalid_report_code in ("abc123", "ABC12", "ABC1234", "ABC-12", "ÁBC123", "ABC123\n"):
        invalid_output_report = copy.deepcopy(transaction)
        invalid_output_report["outputReports"] = [{"reportCode": invalid_report_code}]
        reject(
            lambda invalid_output_report=invalid_output_report: transaction_validator.validate(invalid_output_report),
            f"service_transactions accepted invalid outputReports reportCode {invalid_report_code!r}",
        )

    duplicate_output_reports = copy.deepcopy(transaction)
    duplicate_output_reports["outputReports"] = [
        {"reportCode": "ABC123"},
        {"reportCode": "ABC123"},
    ]
    reject(
        lambda: transaction_validator.validate(duplicate_output_reports),
        "service_transactions accepted duplicate outputReports entries",
    )

    bare_output_report_code = copy.deepcopy(transaction)
    bare_output_report_code["outputReports"] = ["ABC123"]
    reject(
        lambda: transaction_validator.validate(bare_output_report_code),
        "service_transactions accepted a bare outputReports code instead of a snapshot map",
    )

    nonarray_output_reports = copy.deepcopy(transaction)
    nonarray_output_reports["outputReports"] = {"reportCode": "ABC123"}
    reject(
        lambda: transaction_validator.validate(nonarray_output_reports),
        "service_transactions accepted a nonarray outputReports map",
    )

    wrong_output_report_key = copy.deepcopy(transaction)
    wrong_output_report_key["outputReports"] = [{"report_code": "ABC123"}]
    reject(
        lambda: transaction_validator.validate(wrong_output_report_key),
        "service_transactions accepted outputReports[].report_code",
    )

    open_output_report = copy.deepcopy(transaction)
    open_output_report["outputReports"] = [{"reportCode": "ABC123", "title": "Duplicated metadata"}]
    reject(
        lambda: transaction_validator.validate(open_output_report),
        "service_transactions accepted duplicated metadata in outputReports[]",
    )

    for forbidden_transaction_field in ("inputReports", "input_reports", "output_reports"):
        wrong_report_boundary = copy.deepcopy(transaction)
        wrong_report_boundary[forbidden_transaction_field] = []
        reject(
            lambda wrong_report_boundary=wrong_report_boundary: transaction_validator.validate(wrong_report_boundary),
            f"service_transactions accepted forbidden report-link field {forbidden_transaction_field}",
        )

    for forbidden_snapshot_field in ("inputReports", "outputReports", "input_reports", "output_reports"):
        report_link_on_snapshot = copy.deepcopy(transaction)
        report_link_on_snapshot["offerSnapshot"][forbidden_snapshot_field] = []
        reject(
            lambda report_link_on_snapshot=report_link_on_snapshot: transaction_validator.validate(report_link_on_snapshot),
            f"service_transactions accepted offerSnapshot.{forbidden_snapshot_field}",
        )

    more_information_example = copy.deepcopy(next(
        service["moreInformation"] for service in SERVICES if "moreInformation" in service
    ))
    snapshot_more_information = copy.deepcopy(transaction)
    snapshot_more_information["offerSnapshot"]["moreInformation"] = more_information_example
    transaction_validator.validate(snapshot_more_information)

    snapshot_null = copy.deepcopy(transaction)
    snapshot_null["offerSnapshot"]["moreInformation"] = None
    transaction_validator.validate(snapshot_null)

    snapshot_empty = copy.deepcopy(transaction)
    snapshot_empty["offerSnapshot"]["moreInformation"] = {}
    transaction_validator.validate(snapshot_empty)

    snapshot_empty_arrays = copy.deepcopy(transaction)
    snapshot_empty_arrays["offerSnapshot"]["moreInformation"] = {
        "frequentQuestions": [],
        "keyInsights": [],
        "scientificFacts": [],
        "usefulLinks": [],
        "sampleLink": None,
        "bulletSegments": [],
        "technicalInformationFacts": [],
        "biologicalSampleRequirements": [],
        "websiteUrl": None,
    }
    transaction_validator.validate(snapshot_empty_arrays)

    wrong_snapshot_root_alias = copy.deepcopy(snapshot_more_information)
    snapshot = wrong_snapshot_root_alias["offerSnapshot"]
    snapshot["more_information"] = snapshot.pop("moreInformation")
    reject(
        lambda: transaction_validator.validate(wrong_snapshot_root_alias),
        "service_transactions accepted offerSnapshot.more_information",
    )

    wrong_snapshot_child_alias = copy.deepcopy(snapshot_more_information)
    snapshot_info = wrong_snapshot_child_alias["offerSnapshot"]["moreInformation"]
    snapshot_info["technical_information_facts"] = snapshot_info.pop("technicalInformationFacts")
    reject(
        lambda: transaction_validator.validate(wrong_snapshot_child_alias),
        "service_transactions accepted offerSnapshot.moreInformation.technical_information_facts",
    )

    wrong_snapshot_item_alias = copy.deepcopy(snapshot_more_information)
    snapshot_sample = wrong_snapshot_item_alias["offerSnapshot"]["moreInformation"]["sampleLink"]
    snapshot_sample["button_title"] = snapshot_sample.pop("buttonTitle")
    reject(
        lambda: transaction_validator.validate(wrong_snapshot_item_alias),
        "service_transactions accepted offerSnapshot.moreInformation.sampleLink.button_title",
    )

    unknown_snapshot_child = copy.deepcopy(snapshot_more_information)
    unknown_snapshot_child["offerSnapshot"]["moreInformation"]["extraSection"] = []
    reject(
        lambda: transaction_validator.validate(unknown_snapshot_child),
        "service_transactions accepted an unknown offerSnapshot.moreInformation child",
    )

    for malformed_url in (
        "https://user@/path",
        "https://:443/path",
        "https://example.com:bad/path",
    ):
        invalid_snapshot_url = copy.deepcopy(snapshot_more_information)
        invalid_snapshot_url["offerSnapshot"]["moreInformation"]["websiteUrl"] = malformed_url
        reject(
            lambda invalid_snapshot_url=invalid_snapshot_url: transaction_validator.validate(invalid_snapshot_url),
            f"service_transactions accepted malformed offerSnapshot moreInformation URL {malformed_url}",
        )

    valid_snapshot_url = copy.deepcopy(snapshot_more_information)
    valid_snapshot_url["offerSnapshot"]["moreInformation"]["websiteUrl"] = (
        "https://[2001:db8::1]:443/path?q=1#fragment"
    )
    transaction_validator.validate(valid_snapshot_url)

    canonical_tax_snapshot = copy.deepcopy(transaction)
    canonical_tax_snapshot["offerSnapshot"]["commercialTerms"] = {
        "taxAndPaymentPolicy": "Collected by the provider after review."
    }
    transaction_validator.validate(canonical_tax_snapshot)

    wrong_tax_snapshot = copy.deepcopy(canonical_tax_snapshot)
    snapshot_terms = wrong_tax_snapshot["offerSnapshot"]["commercialTerms"]
    snapshot_terms["tax_and_payment_policy"] = snapshot_terms.pop("taxAndPaymentPolicy")
    reject(
        lambda: transaction_validator.validate(wrong_tax_snapshot),
        "service_transactions accepted offerSnapshot.commercialTerms.tax_and_payment_policy",
    )

    slotless_delivered = copy.deepcopy(transaction)
    slotless_delivered["status"] = "delivered"
    transaction_validator.validate(slotless_delivered)

    slotless_delivered_with_report = copy.deepcopy(slotless_delivered)
    slotless_delivered_with_report["outputReports"] = [{"reportCode": "ABC123"}]
    transaction_validator.validate(slotless_delivered_with_report)

    declared_output_missing = copy.deepcopy(slotless_delivered_with_report)
    declared_output_missing["offerSnapshot"]["outputSlots"] = [copy.deepcopy(offer["outputSlots"][0])]
    reject(
        lambda: transaction_validator.validate(declared_output_missing),
        "service_transactions allowed a supplemental report to satisfy a declared output object",
    )

    writer_shaped_input = copy.deepcopy(transaction)
    writer_shaped_input["inputs"] = [{
        "role": "source_report",
        "objectRef": {"objectId": "obj_file_abc123", "revision": 1},
        "objectType": "pgo_pdf_report",
        "fileName": "result.pdf",
        "fileType": "pgo_pdf_report",
        "selectedAt": "2026-09-30T00:00:00Z",
        "reportCode": "ABC123",
        "objectSnapshot": {
            "objectId": "obj_file_abc123",
            "objectType": "pgo_pdf_report",
            "schemaVersion": "1.0.0",
            "revision": 1,
            "createdAt": "2026-09-30T00:00:00Z",
            "createdBy": "user_contract_fixture",
        },
    }]
    transaction_validator.validate(writer_shaped_input)

    open_snapshot = copy.deepcopy(writer_shaped_input)
    open_snapshot["inputs"][0]["objectSnapshot"]["unexpectedField"] = True
    reject(
        lambda: transaction_validator.validate(open_snapshot),
        "service_transactions accepted an open-ended objectSnapshot",
    )

    canonical_form_input = copy.deepcopy(transaction)
    canonical_form_input["inputs"] = [{
        "role": "form",
        "objectRef": {"objectId": "obj_form_abc123", "revision": 1},
        "objectType": "pgo_form",
        "objectCode": "123456789",
        "uploadedObjectId": "uploaded_form_abc123",
        "fileStorageId": "file_form_abc123",
        "objectOwnerId": "owner_form_abc123",
        "objectSnapshot": {
            "objectId": "obj_form_abc123",
            "objectType": "pgo_form",
            "schemaVersion": "1.0.0",
            "revision": 1,
            "createdAt": "2026-09-30T00:00:00Z",
            "createdBy": "user_contract_fixture",
            "data": {
                "formShape": {
                    "fields": [{
                        "key": "answer",
                        "label": "Answer",
                        "type": "text",
                        "required": False,
                    }]
                },
                "fields": [{"key": "answer", "value": "yes"}],
            },
        },
    }]
    for canonical_value in ["yes", 42, True, ["yes", 42]]:
        candidate = copy.deepcopy(canonical_form_input)
        candidate["inputs"][0]["objectSnapshot"]["data"]["fields"][0]["value"] = canonical_value
        transaction_validator.validate(candidate)

    for invalid_value, description in [
        (None, "null"),
        ({"nested": "value"}, "object"),
        ([["nested"]], "nested array"),
        ([True], "boolean array item"),
    ]:
        candidate = copy.deepcopy(canonical_form_input)
        candidate["inputs"][0]["objectSnapshot"]["data"]["fields"][0]["value"] = invalid_value
        reject(
            lambda candidate=candidate: transaction_validator.validate(candidate),
            f"service_transactions accepted a {description} PGO form answer value",
        )

    opaque_timestamp = copy.deepcopy(transaction)
    opaque_timestamp["createdAt"] = {"anything": "used to pass"}
    reject(
        lambda: transaction_validator.validate(opaque_timestamp),
        "service_transactions accepted an unconstrained timestamp object",
    )

    wrong_offer_snapshot = copy.deepcopy(transaction)
    wrong_offer_snapshot["offerSnapshot"]["service_id"] = wrong_offer_snapshot["offerSnapshot"].pop("serviceId")
    reject(lambda: transaction_validator.validate(wrong_offer_snapshot), "service_transactions accepted offerSnapshot.service_id")

    wrong_provider_snapshot = copy.deepcopy(transaction)
    wrong_provider_snapshot["providerSnapshot"]["provider_id"] = wrong_provider_snapshot["providerSnapshot"].pop("id")
    reject(lambda: transaction_validator.validate(wrong_provider_snapshot), "service_transactions accepted providerSnapshot.provider_id")

    structured_issue = copy.deepcopy(transaction)
    structured_issue["issues"] = [{"wrong_key": "not a native string issue"}]
    reject(lambda: transaction_validator.validate(structured_issue), "service_transactions accepted an untyped issue map")

    wrong_form_shape = copy.deepcopy(transaction)
    wrong_form_shape["offerSnapshot"]["formShape"] = copy.deepcopy(offer["formShape"])
    wrong_form_shape["offerSnapshot"]["formShape"]["allow_unknown_fields"] = wrong_form_shape["offerSnapshot"]["formShape"].pop("allowUnknownFields")
    reject(lambda: transaction_validator.validate(wrong_form_shape), "service_transactions accepted formShape.allow_unknown_fields")

    source_slot = offer["inputSlots"][0]
    wrong_input_slot = copy.deepcopy(transaction)
    wrong_input_slot["offerSnapshot"]["inputSlots"] = [{
        "role": source_slot["role"],
        "title": source_slot["role"].replace("_", " ").title(),
        "objectType": source_slot["objectType"],
        "acceptedTypes": source_slot["acceptedTypes"],
        "required": source_slot["required"],
        "cardinality": source_slot["cardinality"],
    }]
    wrong_input_slot["offerSnapshot"]["inputSlots"][0]["object_type"] = wrong_input_slot["offerSnapshot"]["inputSlots"][0].pop("objectType")
    reject(lambda: transaction_validator.validate(wrong_input_slot), "service_transactions accepted inputSlots[].object_type")


check("strict_service_offer_and_transaction_nested_casing", validate_strict_service_boundary_casing)


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
    require("requestedAt" in shared["form_metadata_location"] and "requestedByUserId" in shared["form_metadata_location"] and "requestedByUserEmail" in shared["form_metadata_location"], "Transaction metadata location is unclear")
    require("input_refs" in shared["object_provenance"] and "no input_refs" in shared["object_provenance"], "Standalone provenance rule is missing")
    require("may each be empty" in shared["empty_slot_policy"], "Empty input/output slot policy is missing")
    require("none -> none" in shared["empty_slot_policy"], "Slotless short contract syntax is missing")
    require("no declared outputSlots" in shared["delivery_without_outputs"], "Output-free delivery rule is missing")
    linked_reports = shared["linked_output_reports"]
    for phrase in (
        "service_transactions.outputReports",
        "Omitted, null, or empty",
        "reportCode",
        "report_codes/{reportCode}.uploaded_report_id",
        "There is no inputReports field",
        "never affect transaction status or completeness",
    ):
        require(phrase in linked_reports, f"Shared API linked-output-report contract omits {phrase}")


check("providers_and_shared_api_boundary", validate_provider_catalog)


def validate_field_key_matrix():
    expected = {
        "service_offers": "lower_camel_case",
        "service_transactions": "lower_camel_case",
        "deferred_service_transactions": "snake_case",
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
    convention_by_collection = {
        item["collection"]: item for item in FIELD_KEY_CONVENTIONS["collections"]
    }
    offer_examples = convention_by_collection["service_offers"]["examples"]
    more_information_examples = (
        "moreInformation",
        "frequentQuestions",
        "question",
        "answer",
        "keyInsights",
        "title",
        "description",
        "scientificFacts",
        "usefulLinks",
        "url",
        "sampleLink",
        "buttonTitle",
        "bulletSegments",
        "imageUrl",
        "imageUploadDataUrl",
        "technicalInformationFacts",
        "subitems",
        "biologicalSampleRequirements",
        "instructions",
        "websiteUrl",
    )
    for key in more_information_examples:
        require(key in offer_examples, f"service_offers naming examples omit {key}")
    transaction_examples = convention_by_collection["service_transactions"]["examples"]
    for key in ("offerSnapshot", *more_information_examples):
        require(key in transaction_examples, f"service_transactions naming examples omit {key}")
    require(FIELD_KEY_CONVENTIONS["applies_to_nested_maps"] is True, "Collection casing must cover nested maps and maps inside arrays")
    require(FIELD_KEY_CONVENTIONS["compatibility_aliases_allowed"] is False, "Compatibility aliases must remain forbidden")
    serialized = FIELD_KEY_CONVENTIONS["serialized_pgo_content"]
    require(serialized["field_key_convention"] == "snake_case", "Serialized PGO content must use snake_case")


check("field_key_boundary_matrix", validate_field_key_matrix)


def validate_deferred_service_transaction_contract():
    schema = read("schemas/protocol/deferred-service-transactions.schema.json")
    validator = schema_validator(schema)
    validator.validate({
        "email": "requester@example.com",
        "deferred_transaction_ids": ["pgr_ios_example1", "pgr_ios_example2"],
    })
    service_schema = read("schemas/protocol/service-transaction.schema.json")
    require("requestedByUserId" not in service_schema["required"], "requestedByUserId must remain optional")
    identity_rule = service_schema["allOf"][0]["anyOf"]
    require(identity_rule == [
        {"required": ["requestedByUserId"]},
        {"required": ["requestedByUserEmail"]},
    ], "Service transactions must require a user ID or requester email")


check("deferred_service_transaction_contract", validate_deferred_service_transaction_contract)


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


def validate_deleted_identity_continuity_contract():
    canonical = read_text("docs/deleted-identity-continuity.md")
    root_contract = (ROOT.parent / "DELETED_IDENTITY_CONTINUITY_CONTRACT.txt").read_text()
    require(canonical == root_contract, "Markdown and TXT deleted-identity contracts differ")

    required_phrases = [
        "DeletedUserProvider",
        "person.crop.circle.badge.xmark",
        "#8E8E93",
        "Deleted user",
        "Deleted profile",
        "Deleted organization",
        "Deleted provider",
        "User information unavailable",
        "successful server lookup",
        "Community posts",
        "Rare Friends",
        "Discover feed items",
        "Service offers",
        "Service transactions",
        "Reports, report owners, uploaded objects",
        "Pocket Genes Object content",
        "submitted_by_user_id",
        "provider_id",
        "provider_kind",
        "legacy record with no usable canonical ID",
        "serialized PGO files remain unchanged",
        "iOS, Android, and web",
    ]
    for phrase in required_phrases:
        require(phrase in canonical, f"Deleted-identity contract omits {phrase}")

    for relative_path in [
        "Pocket-Genes-Wiki.md",
        "docs/service-model.md",
        "docs/native-services-current-state.md",
        "docs/ownership-and-service-fulfillment.md",
    ]:
        documentation = read_text(relative_path)
        require("Deleted identity continuity" in documentation, f"{relative_path} omits deleted-identity continuity")
        require("Never add deleted-user flags" in documentation, f"{relative_path} omits the PGO identity boundary")

    for relative_path in [
        "DISCOVER_FEED_PLAN.txt",
        "DISCOVER_BACKOFFICE_REQUIREMENTS.txt",
        "android_ios_parity_mismatch_audit.txt",
    ]:
        documentation = (ROOT.parent / relative_path).read_text()
        require(
            "DELETED_IDENTITY_CONTINUITY_CONTRACT.txt" in documentation,
            f"{relative_path} does not reference the canonical deleted-identity TXT contract",
        )

    forbidden_pgo_keys = {
        "deleted_user",
        "deletedUser",
        "is_deleted_user",
        "isDeletedUser",
        "deleted_identity",
        "deletedIdentity",
        "deleted_avatar",
        "deletedAvatar",
    }
    for type_id in TYPE_IDS:
        properties = set(read(OBJECT_BY_ID[type_id]["schema_path"]).get("properties", {}))
        require(
            properties.isdisjoint(forbidden_pgo_keys),
            f"{type_id} illegally persists deleted-identity presentation metadata",
        )

    field_conventions = {
        entry["collection"]: set(entry["examples"])
        for entry in read("catalog/field-key-conventions.json")["collections"]
    }
    require(
        {"provider_id", "provider_kind", "submitted_by_user_id"}
        <= field_conventions["uploaded_objects"],
        "uploaded_objects omits stable deleted-identity references",
    )
    require(
        {"provider_id", "provider_kind", "submitted_by_user_id"}
        <= field_conventions["file_storage"],
        "file_storage omits stable deleted-identity references",
    )


check("deleted_identity_continuity_contract", validate_deleted_identity_continuity_contract)


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
    native_services = read_text("docs/native-services-current-state.md")
    downloaded_file_updates = read_text("docs/downloaded-file-updates.md")
    package_readme = read_text("README.md")
    backoffice_contract = (ROOT.parent / "DISCOVER_BACKOFFICE_REQUIREMENTS.txt").read_text()
    services_backoffice_contract = backoffice_contract.split("Services Hub Native And Backend Contract", 1)[1]
    for text_name, text in [("package wiki", aggregate), ("root wiki", root_wiki), ("service model", service_model)]:
        require("no compatibility" in text.lower() or "no legacy" in text.lower(), f"{text_name} does not state the strict breaking policy")
        require(
            any(phrase in text.lower() for phrase in ("domain-only", "domain content", "domain payload")),
            f"{text_name} does not explain the content boundary",
        )
        for type_id in TYPE_IDS:
            require(type_id in text, f"{text_name} omits {type_id}")
    require(aggregate == root_wiki, "The two generated aggregate wikis differ")
    require(
        "[downloaded-file update lifecycle](docs/downloaded-file-updates.md)" in package_readme,
        "The package README does not link the downloaded-file update lifecycle",
    )
    for documentation_name, documentation in [
        ("package wiki", aggregate),
        ("service model", service_model),
        ("native-services state", native_services),
    ]:
        for phrase in (
            "`collectionAutomatic`",
            "`currentAutomatic`",
            "`currentManual`",
            "quiet probe proves a newer version",
            "preserves the opt-out",
            "active-content rehydration",
            "no new backend collection or document field",
        ):
            require(
                phrase in documentation,
                f"{documentation_name} omits downloaded-file update summary: {phrase}",
            )
    for phrase in (
        "closed pair `{ kind, code }`",
        "Exactly six uppercase ASCII letters or digits",
        "Exactly nine ASCII digits",
        "`uploaded_reports.upload_version_count`",
        "`uploaded_objects.upload_version_count`",
        "`latestVersion > currentVersion`",
        "`collectionAutomatic`",
        "`currentAutomatic`",
        "`currentManual`",
        "`listOfItemsThatNeedToBeUpdated`",
        "strictly one at a time",
        "one repository-level commit",
        "active parser/model is rehydrated",
        "**Update now** button directly below **Reactivate automatic updates**",
        "bypasses blacklist filtering only for that single run",
        "does not remove the identity",
        "Only one write-capable update run",
        "Late callbacks",
        "bounded watchdog",
        "prior file readable",
        "must not contain payloads",
        "UserDefaults on iOS and SharedPreferences on Android",
        "no new backend collection or document field",
        "never changes a service transaction's status",
        "iOS and Android implement the same",
    ):
        require(
            phrase in downloaded_file_updates,
            f"Downloaded-file update lifecycle omits required contract: {phrase}",
        )
    require("none -> none" in aggregate, "The wiki omits the slotless short contract")
    require("without producing an object" in aggregate, "The wiki omits output-free services")
    require("empty states" in service_model.lower(), "The service model omits native empty states")
    for documentation_name, documentation in [
        ("package wiki", aggregate),
        ("service model", service_model),
    ]:
        for key in (
            "moreInformation",
            "frequentQuestions",
            "keyInsights",
            "scientificFacts",
            "usefulLinks",
            "sampleLink",
            "bulletSegments",
            "technicalInformationFacts",
            "biologicalSampleRequirements",
            "websiteUrl",
        ):
            require(key in documentation, f"{documentation_name} omits {key}")
        require(
            "offerSnapshot.moreInformation" in documentation,
            f"{documentation_name} omits frozen moreInformation snapshot behavior",
        )
        require(
            "all null" in documentation,
            f"{documentation_name} omits all-null moreInformation visibility behavior",
        )
        for phrase in (
            "exact lowercase `https://`",
            "Userinfo is forbidden",
            "bracketed IPv6",
            "one to five digits",
            "Paths, queries, and fragments remain valid",
        ):
            require(
                phrase in documentation,
                f"{documentation_name} omits moreInformation URL rule: {phrase}",
            )
        for phrase in (
            "`service_transactions.outputReports` is the one report-link boundary",
            "may be omitted or explicitly `null`",
            '`{ "reportCode": "ABC123" }`',
            "There is no `inputReports` field",
            "Service-offer `inputSlots`, `outputSlots`",
            "never changes transaction status",
            "`report_codes/{reportCode}`",
            "`uploaded_reports/{uploadedReportId}`",
            "exactly `mdm`, `ag`, `2pq`, `vcf`, and `pdf`",
            '{ "uploaded_report_id": "uploaded-report-123" }',
            '"linked_report_code": "ABC123"',
            "unpadded absolute HTTP(S) `download_url` with a host",
            "**Linked output reports**",
            "download when it is not stored locally",
        ):
            require(
                phrase in documentation,
                f"{documentation_name} omits linked-output-report contract: {phrase}",
            )
    more_information_service_page = read_text("services/pgs_dna_extraction.md")
    require(
        "## More information" in more_information_service_page
        and '"frequentQuestions"' in more_information_service_page
        and '"websiteUrl"' in more_information_service_page,
        "DNA-extraction service page does not show the child-map authoring fixture",
    )
    require("Either may be empty" in services_backoffice_contract, "The backoffice contract omits empty slot arrays")
    require("pgo_empty_outline.png" in services_backoffice_contract, "The backoffice contract omits the empty conversion asset")
    require("outputSlots: non-empty object[]" not in services_backoffice_contract, "The backoffice contract still requires outputs")
    require("is_hidden_from_search" not in services_backoffice_contract, "The service contract still uses a snake-case offer key")
    require("output_objects" not in services_backoffice_contract, "The service contract still uses a snake-case transaction key")
    require(
        "moreInformation: object | null" in services_backoffice_contract,
        "The backoffice contract omits nullable service-offer moreInformation",
    )
    require(
        "offerSnapshot.moreInformation" in services_backoffice_contract,
        "The backoffice contract omits the frozen moreInformation snapshot",
    )
    require(
        "only empty arrays show no action" in services_backoffice_contract,
        "The backoffice contract omits no-content moreInformation visibility",
    )
    for phrase in (
        "outputReports: object[] | null; optional",
        '{ "reportCode": "ABC123" }',
        "There is no inputReports field",
        "inputSlots and outputSlots describe objects only",
        "never changes status or completeness",
        "report_codes/{reportCode}",
        "uploaded_reports/{uploadedReportId}",
        "mdm, ag, 2pq, vcf, and pdf",
        '{ "uploaded_report_id": "uploaded-report-123" }',
        '"linked_report_code": "ABC123"',
        "unpadded absolute HTTP(S) download_url",
        "Linked output reports",
    ):
        require(
            phrase in services_backoffice_contract,
            f"The backoffice contract omits linked-output-report rule: {phrase}",
        )
    for phrase in (
        "lowercase https:// scheme",
        "Userinfo is forbidden",
        "bracketed IPv6",
        "one to five digits",
        "Paths, queries, and fragments are valid",
    ):
        require(
            phrase in services_backoffice_contract,
            f"The backoffice contract omits moreInformation URL rule: {phrase}",
        )
    for type_id in TYPE_IDS:
        page = read_text(f"objects/{type_id}.md")
        for key in CONTRACTS[type_id][0] | CONTRACTS[type_id][1]:
            require(f"`{key}`" in page, f"Object page {type_id} omits {key}")


check("wiki_service_model_and_20_pages", validate_docs_and_breaking_policy)


def validate_all_json_and_mirrors():
    for path in sorted(ROOT.rglob("*.json")):
        json.loads(path.read_text())
    ios_root = ROOT.parent / "mydnamap-ios/mydnamap/Resources"
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
