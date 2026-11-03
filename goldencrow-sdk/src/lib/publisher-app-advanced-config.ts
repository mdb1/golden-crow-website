import type {
  PublisherAppAdvancedConfiguration,
  PublisherAppConfigColors,
  PublisherAppLearnConfiguration,
  PublisherAppLearnLesson,
  PublisherAppPublisherKind,
  PublisherAppSemanticColors,
  PublisherAppSpanishResourceKey,
} from "../types/sdk.types.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";

export const PUBLISHER_APP_TOPIC_IDS = [
  "genetics_and_genomics",
  "health_and_wellness",
  "personalized_medicine",
  "genetic_diseases",
  "variants_and_vcf",
  "bioinformatics",
  "diagnosis_and_interpretation",
  "research_and_technology",
  "infrastructure_and_pipelines",
  "pocket_genes_files_services",
] as const;

export const PUBLISHER_APP_SPANISH_RESOURCE_KEYS = [
  "SpanishInternalContent.json",
  "SpanishLearnContent.json",
  "SpanishObjectAdminContent.json",
  "SpanishPGOExploreContent.json",
  "SpanishPGOSchema1Content.json",
  "SpanishServicesContent.json",
] as const satisfies readonly PublisherAppSpanishResourceKey[];

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const LESSON_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const DEFAULT_JOIN_US_EN = "https://goldencrowvs.com/en/pocket-genes/join-us/";
const DEFAULT_JOIN_US_ES = "https://goldencrowvs.com/pocket-genes/join-us/";
const DEFAULT_SUPPORT_EMAIL = "support@goldencrowvs.com";
const DEFAULT_PRIVACY_URL = "https://goldencrowvs.com/privacy/";
const DEFAULT_TERMS_URL = "https://goldencrowvs.com/terms/";

type PublisherIdentitySeed = {
  name: string;
  kind: PublisherAppPublisherKind;
  id: string;
};

function mixHex(left: string, right: string, rightWeight: number) {
  const weight = Math.min(1, Math.max(0, rightWeight));
  const channel = (offset: number) => {
    const from = Number.parseInt(left.slice(offset, offset + 2), 16);
    const to = Number.parseInt(right.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * weight)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

export function derivePublisherAppSemanticColors(
  colors: PublisherAppConfigColors,
): PublisherAppSemanticColors {
  const primary = colors.primary.toUpperCase();
  const secondary = colors.secondary.toUpperCase();
  const accent = colors.tertiary.toUpperCase();
  return {
    primary,
    primaryStrong: mixHex(primary, "#000000", 0.12),
    primaryDeep: mixHex(primary, "#000000", 0.26),
    primarySoft: mixHex(primary, "#FFFFFF", 0.48),
    secondary,
    accent,
    accentTextLight: mixHex(accent, "#000000", 0.28),
    accentTextDark: mixHex(accent, "#FFFFFF", 0.38),
    accentSurfaceLight: mixHex(accent, "#FFFFFF", 0.9),
  };
}

export function defaultPublisherAppAdvancedConfiguration(
  identity: PublisherIdentitySeed,
): PublisherAppAdvancedConfiguration {
  return {
    displayName: identity.name,
    semanticColors: null,
    catalogEnabled: true,
    feedEnabled: true,
    discoverScope:
      identity.kind === "organization"
        ? {
            mode: "organization",
            publisherOrganizationId: identity.id,
          }
        : { mode: "all" },
    serviceScope: {
      mode: "provider",
      providerId: identity.id,
      providerKind: identity.kind,
    },
    localization: {
      defaultLanguage: "es",
      availableLanguages: ["en", "es"],
      copyOverrides: {
        en: {
          "Only on Pocket Genes": `Only on ${identity.name}`,
          "Contact Pocket Genes": `Contact ${identity.name}`,
        },
        es: {
          "Only on Pocket Genes": `Solo en ${identity.name}`,
          "Contact Pocket Genes": `Contactá a ${identity.name}`,
        },
      },
    },
    learn: { mode: "base" },
    resourceOverrides: { spanishResources: {} },
    links: {
      joinUs: { en: DEFAULT_JOIN_US_EN, es: DEFAULT_JOIN_US_ES },
      supportEmail: DEFAULT_SUPPORT_EMAIL,
      privacyUrl: DEFAULT_PRIVACY_URL,
      termsUrl: DEFAULT_TERMS_URL,
    },
  };
}

function invalid(message: string, statusCode: number): never {
  throw new AdminRepositoryError(message, statusCode);
}

function normalizedText(
  value: unknown,
  label: string,
  statusCode: number,
) {
  if (typeof value !== "string" || !value.trim()) {
    invalid(`${label} is required.`, statusCode);
  }
  return value.trim();
}

function normalizedIdentifier(
  value: unknown,
  label: string,
  pattern: RegExp,
  statusCode: number,
) {
  const normalized = normalizedText(value, label, statusCode);
  if (!pattern.test(normalized)) {
    invalid(`${label} has an unsupported format.`, statusCode);
  }
  return normalized;
}

function normalizedColor(value: unknown, label: string, statusCode: number) {
  const normalized = normalizedText(value, label, statusCode).toUpperCase();
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    invalid(`${label} must use the #RRGGBB format.`, statusCode);
  }
  return normalized;
}

function normalizedHttps(value: unknown, label: string, statusCode: number) {
  const normalized = normalizedText(value, label, statusCode);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    invalid(`${label} must be a valid HTTPS URL.`, statusCode);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    invalid(`${label} must be a credential-free HTTPS URL.`, statusCode);
  }
  return parsed.toString();
}

function normalizedStringMap(
  value: unknown,
  label: string,
  statusCode: number,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} must be a wording map.`, statusCode);
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = normalizedText(key, `${label} key`, statusCode);
    result[normalizedKey] = normalizedText(
      entry,
      `${label} value for ${normalizedKey}`,
      statusCode,
    );
  }
  return result;
}

function placeholders(value: string) {
  return value.match(/%(?:\d+\$)?[@df]/g) ?? [];
}

function validateCopyOverridePlaceholders(
  map: Record<string, string>,
  label: string,
  statusCode: number,
) {
  for (const [key, value] of Object.entries(map)) {
    const expected = placeholders(key).sort().join("|");
    const received = placeholders(value).sort().join("|");
    if (expected !== received) {
      invalid(
        `${label} must preserve formatting placeholders for “${key}”.`,
        statusCode,
      );
    }
  }
}

function normalizedLearnConfiguration(
  value: PublisherAppLearnConfiguration,
  statusCode: number,
): PublisherAppLearnConfiguration {
  if (!value || typeof value !== "object") {
    invalid("Learn configuration is required.", statusCode);
  }
  if (value.mode === "base") return { mode: "base" };
  if (value.mode !== "replace") {
    invalid("Choose a supported Learn mode.", statusCode);
  }
  const curriculumId = normalizedIdentifier(
    value.curriculumId,
    "Curriculum ID",
    IDENTIFIER_PATTERN,
    statusCode,
  );
  if (
    !Number.isInteger(value.curriculumRevision) ||
    value.curriculumRevision < 1 ||
    value.curriculumRevision > 2_147_483_647
  ) {
    invalid("Curriculum revision must be a positive integer.", statusCode);
  }
  const defaultLanguage = normalizedText(
    value.defaultLanguage,
    "Curriculum language",
    statusCode,
  );
  if (!LANGUAGE_TAG_PATTERN.test(defaultLanguage)) {
    invalid("Curriculum language must be a valid language tag.", statusCode);
  }
  if (!Array.isArray(value.subjects) || value.subjects.length === 0) {
    invalid("A replacement curriculum needs at least one subject.", statusCode);
  }

  const subjectIds = new Set<string>();
  const chapterTitles = new Set<string>();
  const lessonIds = new Set<string>();
  const lessons: PublisherAppLearnLesson[] = [];
  const subjects = value.subjects.map((subject, subjectIndex) => {
    const subjectIdentifier = normalizedText(
      subject.subjectIdentifier,
      `Subject ${subjectIndex + 1} ID`,
      statusCode,
    );
    if (subjectIds.has(subjectIdentifier)) {
      invalid(`Subject ID “${subjectIdentifier}” is duplicated.`, statusCode);
    }
    subjectIds.add(subjectIdentifier);
    if (!Array.isArray(subject.chapters) || subject.chapters.length === 0) {
      invalid(`Subject “${subjectIdentifier}” needs a chapter.`, statusCode);
    }
    return {
      subjectIdentifier,
      subjectTitle: normalizedText(
        subject.subjectTitle,
        `Subject ${subjectIndex + 1} title`,
        statusCode,
      ),
      chapters: subject.chapters.map((chapter, chapterIndex) => {
        const chapterTitle = normalizedText(
          chapter.chapterTitle,
          `Chapter ${chapterIndex + 1} title`,
          statusCode,
        );
        if (chapterTitles.has(chapterTitle)) {
          invalid(`Chapter title “${chapterTitle}” is duplicated.`, statusCode);
        }
        chapterTitles.add(chapterTitle);
        if (!Array.isArray(chapter.lessons) || chapter.lessons.length === 0) {
          invalid(`Chapter “${chapterTitle}” needs a lesson.`, statusCode);
        }
        return {
          chapterTitle,
          lessons: chapter.lessons.map((lesson, lessonIndex) => {
            const lessonIdentifier = normalizedIdentifier(
              lesson.lessonIdentifier,
              `Lesson ${lessonIndex + 1} ID`,
              LESSON_IDENTIFIER_PATTERN,
              statusCode,
            );
            if (lessonIds.has(lessonIdentifier)) {
              invalid(`Lesson ID “${lessonIdentifier}” is duplicated.`, statusCode);
            }
            lessonIds.add(lessonIdentifier);
            if (!Array.isArray(lesson.paragraphs) || lesson.paragraphs.length === 0) {
              invalid(`Lesson “${lessonIdentifier}” needs a paragraph.`, statusCode);
            }
            const normalizedLesson: PublisherAppLearnLesson = {
              lessonIdentifier,
              lessonTitle: normalizedText(
                lesson.lessonTitle,
                `Lesson ${lessonIdentifier} title`,
                statusCode,
              ),
              imageUrl: lesson.imageUrl
                ? normalizedHttps(
                    lesson.imageUrl,
                    `Lesson ${lessonIdentifier} image`,
                    statusCode,
                  )
                : null,
              lessonColor: normalizedColor(
                lesson.lessonColor,
                `Lesson ${lessonIdentifier} color`,
                statusCode,
              ),
              paragraphs: lesson.paragraphs.map((paragraph, paragraphIndex) => ({
                paragraphTitle: normalizedText(
                  paragraph.paragraphTitle,
                  `Paragraph ${paragraphIndex + 1} title`,
                  statusCode,
                ),
                icon: normalizedText(
                  paragraph.icon,
                  `Paragraph ${paragraphIndex + 1} icon`,
                  statusCode,
                ),
                contentText: normalizedText(
                  paragraph.contentText,
                  `Paragraph ${paragraphIndex + 1} content`,
                  statusCode,
                ),
              })),
              usefulLinks: (lesson.usefulLinks ?? []).map((link, linkIndex) =>
                normalizedHttps(
                  link,
                  `Lesson ${lessonIdentifier} useful link ${linkIndex + 1}`,
                  statusCode,
                ),
              ),
              relatedLessons: (lesson.relatedLessons ?? []).map((related) =>
                normalizedIdentifier(
                  related,
                  `Related lesson for ${lessonIdentifier}`,
                  LESSON_IDENTIFIER_PATTERN,
                  statusCode,
                ),
              ),
            };
            lessons.push(normalizedLesson);
            return normalizedLesson;
          }),
        };
      }),
    };
  });

  for (const lesson of lessons) {
    for (const related of lesson.relatedLessons) {
      if (!lessonIds.has(related)) {
        invalid(
          `Lesson “${lesson.lessonIdentifier}” references unknown lesson “${related}”.`,
          statusCode,
        );
      }
    }
  }

  const topics: Record<string, string[]> = {};
  for (const [topic, assignments] of Object.entries(value.topics ?? {})) {
    if (!(PUBLISHER_APP_TOPIC_IDS as readonly string[]).includes(topic)) {
      invalid(`Learn topic “${topic}” is not supported.`, statusCode);
    }
    if (!Array.isArray(assignments)) {
      invalid(`Learn topic “${topic}” must contain subject IDs.`, statusCode);
    }
    topics[topic] = [...new Set(assignments.map((assignment) =>
      normalizedText(assignment, `Subject assignment for ${topic}`, statusCode),
    ))];
    for (const subjectId of topics[topic]) {
      if (!subjectIds.has(subjectId)) {
        invalid(`Learn topic “${topic}” references unknown subject “${subjectId}”.`, statusCode);
      }
    }
  }

  return {
    mode: "replace",
    curriculumId,
    curriculumRevision: value.curriculumRevision,
    defaultLanguage,
    subjects,
    topics,
  };
}

export function normalizePublisherAppAdvancedConfiguration(
  value: PublisherAppAdvancedConfiguration | undefined,
  identity: PublisherIdentitySeed,
  statusCode = 400,
): PublisherAppAdvancedConfiguration {
  if (!value) return defaultPublisherAppAdvancedConfiguration(identity);

  const semanticColors = value.semanticColors
    ? {
        primary: normalizedColor(value.semanticColors.primary, "Primary color", statusCode),
        primaryStrong: normalizedColor(value.semanticColors.primaryStrong, "Strong primary color", statusCode),
        primaryDeep: normalizedColor(value.semanticColors.primaryDeep, "Deep primary color", statusCode),
        primarySoft: normalizedColor(value.semanticColors.primarySoft, "Soft primary color", statusCode),
        secondary: normalizedColor(value.semanticColors.secondary, "Secondary color", statusCode),
        accent: normalizedColor(value.semanticColors.accent, "Accent color", statusCode),
        accentTextLight: normalizedColor(value.semanticColors.accentTextLight, "Light accent text color", statusCode),
        accentTextDark: normalizedColor(value.semanticColors.accentTextDark, "Dark accent text color", statusCode),
        accentSurfaceLight: normalizedColor(value.semanticColors.accentSurfaceLight, "Light accent surface color", statusCode),
      }
    : null;

  if (typeof value.catalogEnabled !== "boolean" || typeof value.feedEnabled !== "boolean") {
    invalid("Catalog and Discover availability must be true or false.", statusCode);
  }

  const discoverScope =
    value.discoverScope?.mode === "all"
      ? ({ mode: "all" } as const)
      : value.discoverScope?.mode === "organization"
        ? ({
            mode: "organization" as const,
            publisherOrganizationId: normalizedText(
              value.discoverScope.publisherOrganizationId,
              "Discover organization ID",
              statusCode,
            ),
          } as const)
        : invalid("Choose a supported Discover scope.", statusCode);

  const serviceScope =
    value.serviceScope?.mode === "all"
      ? ({ mode: "all" } as const)
      : value.serviceScope?.mode === "provider" &&
          (value.serviceScope.providerKind === "organization" ||
            value.serviceScope.providerKind === "individual")
        ? ({
            mode: "provider" as const,
            providerId: normalizedText(
              value.serviceScope.providerId,
              "Service provider ID",
              statusCode,
            ),
            providerKind: value.serviceScope.providerKind,
          } as const)
        : invalid("Choose a supported service scope.", statusCode);

  const availableLanguages = [
    ...new Set(value.localization?.availableLanguages ?? []),
  ].filter((language): language is "en" | "es" => language === "en" || language === "es");
  if (
    availableLanguages.length === 0 ||
    !availableLanguages.includes(value.localization?.defaultLanguage)
  ) {
    invalid("The default language must be one of the available languages.", statusCode);
  }
  const copyOverrides = {
    en: normalizedStringMap(
      value.localization?.copyOverrides?.en ?? {},
      "English wording overrides",
      statusCode,
    ),
    es: normalizedStringMap(
      value.localization?.copyOverrides?.es ?? {},
      "Spanish wording overrides",
      statusCode,
    ),
  };
  const englishKeys = Object.keys(copyOverrides.en).sort();
  const spanishKeys = Object.keys(copyOverrides.es).sort();
  if (englishKeys.join("\u0000") !== spanishKeys.join("\u0000")) {
    invalid("English and Spanish wording overrides must use the same keys.", statusCode);
  }
  validateCopyOverridePlaceholders(copyOverrides.en, "English wording", statusCode);
  validateCopyOverridePlaceholders(copyOverrides.es, "Spanish wording", statusCode);

  const resourceOverrides: PublisherAppAdvancedConfiguration["resourceOverrides"] = {
    spanishResources: {},
  };
  if (value.resourceOverrides?.discoverBannerTitles) {
    resourceOverrides.discoverBannerTitles = {
      lessonTitles: normalizedStringMap(
        value.resourceOverrides.discoverBannerTitles.lessonTitles,
        "Discover lesson titles",
        statusCode,
      ),
      specialItemTitles: normalizedStringMap(
        value.resourceOverrides.discoverBannerTitles.specialItemTitles,
        "Discover special item titles",
        statusCode,
      ),
    };
  }
  for (const [resource, strings] of Object.entries(
    value.resourceOverrides?.spanishResources ?? {},
  )) {
    if (!(PUBLISHER_APP_SPANISH_RESOURCE_KEYS as readonly string[]).includes(resource)) {
      invalid(`Translation resource “${resource}” is not supported.`, statusCode);
    }
    resourceOverrides.spanishResources[
      resource as PublisherAppSpanishResourceKey
    ] = normalizedStringMap(strings, resource, statusCode);
  }

  const supportEmail = normalizedText(
    value.links?.supportEmail,
    "Support email",
    statusCode,
  ).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    invalid("Support email must be valid.", statusCode);
  }

  return {
    displayName: normalizedText(value.displayName, "Experience name", statusCode),
    semanticColors,
    catalogEnabled: value.catalogEnabled,
    feedEnabled: value.feedEnabled,
    discoverScope,
    serviceScope,
    localization: {
      defaultLanguage: value.localization.defaultLanguage,
      availableLanguages,
      copyOverrides,
    },
    learn: normalizedLearnConfiguration(value.learn, statusCode),
    resourceOverrides,
    links: {
      joinUs: {
        en: normalizedHttps(value.links?.joinUs?.en, "English Join Us URL", statusCode),
        es: normalizedHttps(value.links?.joinUs?.es, "Spanish Join Us URL", statusCode),
      },
      supportEmail,
      privacyUrl: normalizedHttps(value.links?.privacyUrl, "Privacy URL", statusCode),
      termsUrl: normalizedHttps(value.links?.termsUrl, "Terms URL", statusCode),
    },
  };
}
