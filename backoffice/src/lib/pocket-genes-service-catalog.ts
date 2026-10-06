import objectsCatalog from "../../../Pocket-Genes-Catalog-Wiki/catalog/objects.json";
import providersCatalog from "../../../Pocket-Genes-Catalog-Wiki/catalog/providers.json";
import servicesCatalog from "../../../Pocket-Genes-Catalog-Wiki/catalog/services.json";
import type {
  SupportServiceFormFieldType,
  SupportServiceFormShape,
  SupportServiceInputSlot,
  SupportServiceMoreInformation,
  SupportServiceOfferInput,
  SupportServiceOutputSlot,
  SupportServicePricingModel,
  SupportServiceStage,
} from "@/lib/support-services";
import { isSupportServiceMoreInformationHttpsUrl } from "@/lib/support-services";
import {
  isSupportServiceCategoryKey,
  type SupportServiceCategoryKey,
} from "@/lib/support-service-categories";

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

function booleanWithDefault(
  value: unknown,
  defaultValue: boolean,
  fieldName: string,
) {
  return value === undefined
    ? defaultValue
    : requiredBoolean(value, fieldName);
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

function requiredCatalogString(value: unknown, fieldName: string) {
  const text = cleanString(value);
  if (!text) {
    throw new Error(`${fieldName} must be a nonempty string.`);
  }
  return text;
}

function requiredCatalogHttpsUrl(value: unknown, fieldName: string) {
  const url = requiredCatalogString(value, fieldName);
  if (!isSupportServiceMoreInformationHttpsUrl(url)) {
    throw new Error(`${fieldName} must be a valid lowercase HTTPS URL.`);
  }
  return url;
}

function assertCatalogKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  fieldName: string,
) {
  const unknownKeys = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unknownKeys.length) {
    throw new Error(
      `${fieldName} contains unsupported keys: ${unknownKeys.join(", ")}.`,
    );
  }
}

function optionalCatalogArray<T>(
  value: unknown,
  fieldName: string,
  normalize: (item: Record<string, unknown>, index: number) => T,
) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${fieldName}[${index}] must be an object.`);
    }
    return normalize(item as Record<string, unknown>, index);
  });
}

export function normalizePocketGenesCatalogMoreInformation(
  value: unknown,
): SupportServiceMoreInformation | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("moreInformation must be an object.");
  }
  const information = value as Record<string, unknown>;
  assertCatalogKeys(
    information,
    [
      "frequentQuestions",
      "keyInsights",
      "scientificFacts",
      "usefulLinks",
      "sampleLink",
      "bulletSegments",
      "technicalInformationFacts",
      "biologicalSampleRequirements",
      "websiteUrl",
    ],
    "moreInformation",
  );
  const titleDescriptionItems = (fieldName: string, fieldValue: unknown) =>
    optionalCatalogArray(fieldValue, fieldName, (item, index) => {
      assertCatalogKeys(item, ["title", "description"], `${fieldName}[${index}]`);
      return {
        title: requiredCatalogString(
          item.title,
          `${fieldName}[${index}].title`,
        ),
        description: requiredCatalogString(
          item.description,
          `${fieldName}[${index}].description`,
        ),
      };
    });

  return {
    frequentQuestions: optionalCatalogArray(
      information.frequentQuestions,
      "moreInformation.frequentQuestions",
      (item, index) => {
        assertCatalogKeys(
          item,
          ["question", "answer"],
          `moreInformation.frequentQuestions[${index}]`,
        );
        return {
          question: requiredCatalogString(
            item.question,
            `moreInformation.frequentQuestions[${index}].question`,
          ),
          answer: requiredCatalogString(
            item.answer,
            `moreInformation.frequentQuestions[${index}].answer`,
          ),
        };
      },
    ),
    keyInsights: titleDescriptionItems(
      "moreInformation.keyInsights",
      information.keyInsights,
    ),
    scientificFacts: titleDescriptionItems(
      "moreInformation.scientificFacts",
      information.scientificFacts,
    ),
    usefulLinks: optionalCatalogArray(
      information.usefulLinks,
      "moreInformation.usefulLinks",
      (item, index) => {
        assertCatalogKeys(
          item,
          ["title", "url"],
          `moreInformation.usefulLinks[${index}]`,
        );
        return {
          title: requiredCatalogString(
            item.title,
            `moreInformation.usefulLinks[${index}].title`,
          ),
          url: requiredCatalogHttpsUrl(
            item.url,
            `moreInformation.usefulLinks[${index}].url`,
          ),
        };
      },
    ),
    sampleLink:
      information.sampleLink == null
        ? undefined
        : (() => {
            const item = record(information.sampleLink);
            assertCatalogKeys(
              item,
              ["title", "description", "buttonTitle", "url"],
              "moreInformation.sampleLink",
            );
            return {
              title: requiredCatalogString(
                item.title,
                "moreInformation.sampleLink.title",
              ),
              description: requiredCatalogString(
                item.description,
                "moreInformation.sampleLink.description",
              ),
              buttonTitle: requiredCatalogString(
                item.buttonTitle,
                "moreInformation.sampleLink.buttonTitle",
              ),
              url: requiredCatalogHttpsUrl(
                item.url,
                "moreInformation.sampleLink.url",
              ),
            };
          })(),
    bulletSegments: optionalCatalogArray(
      information.bulletSegments,
      "moreInformation.bulletSegments",
      (item, index) => {
        assertCatalogKeys(
          item,
          ["title", "description", "imageUrl"],
          `moreInformation.bulletSegments[${index}]`,
        );
        return {
          title: requiredCatalogString(
            item.title,
            `moreInformation.bulletSegments[${index}].title`,
          ),
          description: requiredCatalogString(
            item.description,
            `moreInformation.bulletSegments[${index}].description`,
          ),
          imageUrl: requiredCatalogHttpsUrl(
            item.imageUrl,
            `moreInformation.bulletSegments[${index}].imageUrl`,
          ),
        };
      },
    ),
    technicalInformationFacts: optionalCatalogArray(
      information.technicalInformationFacts,
      "moreInformation.technicalInformationFacts",
      (item, index) => {
        const fieldName = `moreInformation.technicalInformationFacts[${index}]`;
        assertCatalogKeys(
          item,
          ["title", "description", "subitems"],
          fieldName,
        );
        if (!Array.isArray(item.subitems)) {
          throw new Error(`${fieldName}.subitems must be an array.`);
        }
        return {
          title: requiredCatalogString(item.title, `${fieldName}.title`),
          description: requiredCatalogString(
            item.description,
            `${fieldName}.description`,
          ),
          subitems: item.subitems.map((subitem, subitemIndex) =>
            requiredCatalogString(
              subitem,
              `${fieldName}.subitems[${subitemIndex}]`,
            ),
          ),
        };
      },
    ),
    biologicalSampleRequirements: optionalCatalogArray(
      information.biologicalSampleRequirements,
      "moreInformation.biologicalSampleRequirements",
      (item, index) => {
        const fieldName = `moreInformation.biologicalSampleRequirements[${index}]`;
        assertCatalogKeys(
          item,
          ["title", "description", "instructions"],
          fieldName,
        );
        return {
          title: requiredCatalogString(item.title, `${fieldName}.title`),
          description: requiredCatalogString(
            item.description,
            `${fieldName}.description`,
          ),
          instructions: requiredCatalogString(
            item.instructions,
            `${fieldName}.instructions`,
          ),
        };
      },
    ),
    websiteUrl:
      information.websiteUrl == null
        ? undefined
        : requiredCatalogHttpsUrl(
            information.websiteUrl,
            "moreInformation.websiteUrl",
          ),
  };
}

function normalizeStage(value: string): SupportServiceStage {
  return value === "wet_lab" || value === "bioinformatics"
    ? value
    : "test_planning";
}

function normalizeServiceCategory(value: unknown): SupportServiceCategoryKey {
  const category = typeof value === "string" ? value : "";
  if (!isSupportServiceCategoryKey(category)) {
    throw new Error(`Unknown serviceCategory: ${category || "empty"}.`);
  }
  return category;
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
    serviceCategory: normalizeServiceCategory(service.serviceCategory),
    providerId: cleanString(service.providerId),
    stages: stringArray(service.stages).map(normalizeStage),
    isHiddenFromSearch: requiredBoolean(
      service.isHiddenFromSearch,
      "isHiddenFromSearch",
    ),
    isHighlightedOffer: booleanWithDefault(
      service.isHighlightedOffer,
      false,
      "isHighlightedOffer",
    ),
    isProfessionalOffer: booleanWithDefault(
      service.isProfessionalOffer,
      true,
      "isProfessionalOffer",
    ),
    promotionalBannerImageUrl:
      cleanString(service.promotionalBannerImageUrl) || null,
    promotionalBannerImageUploadDataUrl:
      cleanString(service.promotionalBannerImageUploadDataUrl) || null,
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
    moreInformation: normalizePocketGenesCatalogMoreInformation(
      service.moreInformation,
    ),
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
