import objectsCatalog from "../../../Pocket-Genes-Wiki/catalog/objects.json";
import providersCatalog from "../../../Pocket-Genes-Wiki/catalog/providers.json";
import servicesCatalog from "../../../Pocket-Genes-Wiki/catalog/services.json";
import type {
  SupportServiceFormFieldType,
  SupportServiceInputSlot,
  SupportServiceOfferInput,
  SupportServiceOutputSlot,
  SupportServiceStage,
} from "@/lib/support-services";

type RawCatalog = Record<string, unknown>;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function versionNumber(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  const text = cleanString(value);
  const match = text.match(/^([1-9]\d*)(?:\.0\.0)?$/);
  return match ? Number(match[1]) : 1;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(cleanString).filter((item) => item.length > 0)
    : [];
}

function recordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeStage(value: string): SupportServiceStage {
  return value === "wet_lab" || value === "bioinformatics"
    ? value
    : "test_planning";
}

function normalizeInputSlot(slot: Record<string, unknown>): SupportServiceInputSlot {
  const cardinality = record(slot.cardinality);
  const min = Number(cardinality.min ?? (slot.required ? 1 : 0));
  const max = Number(cardinality.max ?? 1);
  const acceptedTypes = stringArray(slot.accepted_types ?? slot.acceptedTypes);
  const objectType = cleanString(slot.object_type ?? slot.objectType) || acceptedTypes[0] || "";

  return {
    role: cleanString(slot.role),
    objectType,
    acceptedTypes: objectType ? [objectType] : [],
    required: Boolean(slot.required),
    cardinality: {
      min: Number.isFinite(min) ? min : slot.required ? 1 : 0,
      max: Number.isFinite(max) ? max : 1,
    },
  };
}

function normalizeOutputSlot(slot: Record<string, unknown>): SupportServiceOutputSlot {
  return {
    role: cleanString(slot.role),
    objectType: cleanString(slot.object_type ?? slot.objectType),
    mutationMode:
      cleanString(slot.mutation_mode ?? slot.mutationMode) ===
      "new_revision"
        ? "new_revision"
        : "new_object",
  };
}

const rawServices = recordArray((servicesCatalog as RawCatalog).services);
const rawProviders = recordArray((providersCatalog as RawCatalog).providers);
const rawObjects = recordArray((objectsCatalog as RawCatalog).objects);

export const POCKET_GENES_OBJECT_OPTIONS = rawObjects.map((object) => ({
  value: cleanString(object.id),
  label: cleanString(object.name),
  stages: stringArray(object.stages),
  description: cleanString(object.description),
}));

export const POCKET_GENES_PROVIDER_OPTIONS = rawProviders.map((provider) => ({
  value: cleanString(provider.provider_id),
  label: cleanString(provider.name),
  kind: cleanString(provider.kind),
  serviceIds: stringArray(provider.service_ids),
}));

export const POCKET_GENES_SERVICE_OPTIONS = rawServices.map((service) => {
  const formShape = record(service.form_shape);
  const commercialTerms = record(service.mock_commercial_terms);

  return {
    value: cleanString(service.service_id),
    label: cleanString(service.name),
    serviceId: cleanString(service.service_id),
    serviceVersion: versionNumber(service.service_version),
    name: cleanString(service.name),
    providerId: cleanString(service.provider_id),
    stages: stringArray(service.stages).map(normalizeStage),
    availability: cleanString(service.availability),
    description: cleanString(service.description),
    shortContract: cleanString(service.short_contract),
    providerWork: cleanString(service.provider_work),
    formShape: {
      id: cleanString(formShape.id),
      version: versionNumber(formShape.version),
      allowUnknownFields: Boolean(formShape.allow_unknown_fields),
      fields: recordArray(formShape.fields).map((field) => ({
        key: cleanString(field.key),
        label: cleanString(field.label),
        type:
          (cleanString(field.type) as SupportServiceFormFieldType) || "text",
        required: Boolean(field.required),
        options: recordArray(field.options).map((option) => ({
          value: cleanString(option.value),
          label: cleanString(option.label),
        })),
      })),
    },
    inputSlots: recordArray(service.input_slots).map(normalizeInputSlot),
    outputSlots: recordArray(service.output_slots).map(normalizeOutputSlot),
    acceptedConditions: stringArray(service.accepted_conditions),
    scopeRules: stringArray(service.scope_rules),
    commercialTerms: {
      price: {
        amount: Number(record(commercialTerms.price).amount ?? 0),
        currency: cleanString(record(commercialTerms.price).currency) || "ARS",
        basis: cleanString(record(commercialTerms.price).basis),
        isMock: Boolean(record(commercialTerms.price).is_mock),
      },
      turnaround: cleanString(commercialTerms.turnaround),
      turnaroundStartsAt: cleanString(commercialTerms.turnaround_starts_at),
      taxAndPaymentPolicy: cleanString(
        commercialTerms.tax_and_payment_policy,
      ),
      failurePolicy: cleanString(commercialTerms.failure_policy),
    },
  } satisfies SupportServiceOfferInput & {
    value: string;
    label: string;
  };
});

export type PocketGenesServiceCatalogOption =
  (typeof POCKET_GENES_SERVICE_OPTIONS)[number];

export function catalogServiceById(serviceId: string) {
  return (
    POCKET_GENES_SERVICE_OPTIONS.find((service) => service.value === serviceId) ??
    null
  );
}

export function catalogProviderById(providerId: string) {
  return (
    POCKET_GENES_PROVIDER_OPTIONS.find(
      (provider) => provider.value === providerId,
    ) ?? null
  );
}

export function objectLabel(objectType: string) {
  return (
    POCKET_GENES_OBJECT_OPTIONS.find((object) => object.value === objectType)
      ?.label ?? objectType
  );
}
