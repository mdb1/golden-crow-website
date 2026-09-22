import objectsCatalog from "../../../Pocket-Genes-Catalog-Wiki/catalog/objects.json";
import providersCatalog from "../../../Pocket-Genes-Catalog-Wiki/catalog/providers.json";
import servicesCatalog from "../../../Pocket-Genes-Catalog-Wiki/catalog/services.json";
import type {
  SupportServiceFormFieldType,
  SupportServiceFormShape,
  SupportServiceInputSlot,
  SupportServiceOfferInput,
  SupportServiceOutputSlot,
  SupportServicePricingModel,
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

function requiredBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }
  return value;
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
  const acceptedTypes = stringArray(slot.acceptedTypes);
  const objectType = cleanString(slot.objectType) || acceptedTypes[0] || "";

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
    objectType: cleanString(slot.objectType),
    mutationMode:
      cleanString(slot.mutationMode) === "new_revision"
        ? "new_revision"
        : "new_object",
    sameIdentityAsInput:
      cleanString(slot.sameIdentityAsInput) || undefined,
  };
}

export function normalizePocketGenesCatalogFormShape(
  value: unknown,
): SupportServiceFormShape | undefined {
  const formShape = record(value);
  if (Object.keys(formShape).length === 0) {
    return undefined;
  }
  if (
    !Number.isInteger(formShape.version) ||
    Number(formShape.version) < 1
  ) {
    throw new Error("formShape.version must be a positive integer.");
  }

  return {
    id: cleanString(formShape.id),
    version: Number(formShape.version),
    allowUnknownFields: requiredBoolean(
      formShape.allowUnknownFields,
      "formShape.allowUnknownFields",
    ),
    fields: recordArray(formShape.fields).map((field) => {
      const type =
        (cleanString(field.type) as SupportServiceFormFieldType) || "text";
      const usesOptions = type === "enum" || type === "multi_enum";
      return {
        key: cleanString(field.key),
        label: cleanString(field.label),
        type,
        required: Boolean(field.required),
        helpInfoText: cleanString(field.helpInfoText) || undefined,
        ...(usesOptions
          ? {
              options: recordArray(field.options).map((option) => ({
                value: cleanString(option.value),
                label: cleanString(option.label),
              })),
            }
          : {}),
      };
    }),
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
  value: cleanString(provider.provider_id ?? provider.providerId),
  label: cleanString(provider.name),
  kind: cleanString(provider.kind),
  serviceIds: stringArray(provider.service_ids ?? provider.serviceIds),
}));

export const POCKET_GENES_SERVICE_OPTIONS = rawServices.map((service) => {
  const commercialTerms = record(service.commercialTerms);
  const commercialPrice = record(commercialTerms.price);
  const pricingModel = cleanString(commercialTerms.pricingModel);
  const priceAmount = Number(commercialPrice.amount);
  const priceCurrency = cleanString(commercialPrice.currency);
  const priceSummary = cleanString(commercialPrice.summary);

  return {
    value: cleanString(service.serviceId),
    label: cleanString(service.name),
    serviceId: cleanString(service.serviceId),
    serviceVersion: versionNumber(service.serviceVersion),
    name: cleanString(service.name),
    providerId: cleanString(service.providerId),
    stages: stringArray(service.stages).map(normalizeStage),
    isHiddenFromSearch: requiredBoolean(
      service.isHiddenFromSearch,
      "isHiddenFromSearch",
    ),
    description: cleanString(service.description),
    shortContract: cleanString(service.shortContract),
    providerWork: cleanString(service.providerWork),
    formShape: normalizePocketGenesCatalogFormShape(service.formShape),
    inputSlots: recordArray(service.inputSlots).map(normalizeInputSlot),
    outputSlots: recordArray(service.outputSlots).map(normalizeOutputSlot),
    acceptedConditions: stringArray(service.acceptedConditions),
    scopeRules: stringArray(service.scopeRules),
    commercialTerms: {
      pricingModel: (pricingModel as SupportServicePricingModel) || undefined,
      price:
        Number.isFinite(priceAmount) || priceCurrency || priceSummary
          ? {
              summary: priceSummary || undefined,
              amount: Number.isFinite(priceAmount) ? priceAmount : undefined,
              currency: priceCurrency || undefined,
            }
          : undefined,
      turnaround: cleanString(commercialTerms.turnaround),
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
