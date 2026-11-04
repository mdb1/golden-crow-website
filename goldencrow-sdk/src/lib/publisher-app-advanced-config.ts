import type {
  PublisherAppAdvancedConfiguration,
  PublisherAppConfigColors,
  PublisherAppLearnConfiguration,
  PublisherAppLearnLesson,
  PublisherAppPublisherKind,
  PublisherAppSemanticColors,
} from "../types/sdk.types.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import {
  getPublisherAppColorCatalogOption,
  getPublisherAppTextCatalogOption,
} from "./publisher-app-customization-catalog.js";

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

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const LESSON_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const OVERRIDE_HEX_COLOR_PATTERN = /^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/;
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
    colorOverrides: {},
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
    },
    textOverrides: [
      {
        key: "Only on Pocket Genes",
        en: `Only on ${identity.name}`,
        es: `Solo en ${identity.name}`,
      },
      {
        key: "Contact Pocket Genes",
        en: `Contact ${identity.name}`,
        es: `Contactá a ${identity.name}`,
      },
    ],
    learn: { mode: "base" },
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

function normalizedText(value: unknown, label: string, statusCode: number) {
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

function normalizedOverrideColor(
  value: unknown,
  label: string,
  statusCode: number,
) {
  const normalized = normalizedText(value, label, statusCode).toUpperCase();
  if (!OVERRIDE_HEX_COLOR_PATTERN.test(normalized)) {
    invalid(`${label} must use #RRGGBB or #RRGGBBAA.`, statusCode);
  }
  return normalized;
}

function normalizedColorOverrides(value: unknown, statusCode: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Color overrides must be a keyed object.", statusCode);
  }
  const result: PublisherAppAdvancedConfiguration["colorOverrides"] = {};
  for (const [key, modes] of Object.entries(value)) {
    if (!getPublisherAppColorCatalogOption(key)) {
      invalid(`Color override key “${key}” is not in catalog 1.`, statusCode);
    }
    if (!modes || typeof modes !== "object" || Array.isArray(modes)) {
      invalid(`Color override “${key}” must define light or dark.`, statusCode);
    }
    const rawModes = modes as { light?: unknown; dark?: unknown };
    const normalizedModes: { light?: string; dark?: string } = {};
    if (rawModes.light !== undefined) {
      normalizedModes.light = normalizedOverrideColor(
        rawModes.light,
        `Light color for ${key}`,
        statusCode,
      );
    }
    if (rawModes.dark !== undefined) {
      normalizedModes.dark = normalizedOverrideColor(
        rawModes.dark,
        `Dark color for ${key}`,
        statusCode,
      );
    }
    if (!normalizedModes.light && !normalizedModes.dark) {
      invalid(`Color override “${key}” must define light or dark.`, statusCode);
    }
    result[key] = normalizedModes;
  }
  return result;
}

function formattingArguments(value: string) {
  return value.match(/%(?:\d+\$)?(?:\.\d+)?[@df]/g) ?? [];
}

function escapedPercentCount(value: string) {
  return value.match(/%%/g)?.length ?? 0;
}

function normalizedTextOverrides(
  value: unknown,
  legacyCopyOverrides: unknown,
  statusCode: number,
) {
  let rows: unknown[];
  if (Array.isArray(value)) {
    rows = value;
  } else {
    const legacy = legacyCopyOverrides as
      | { en?: Record<string, unknown>; es?: Record<string, unknown> }
      | undefined;
    const english = legacy?.en ?? {};
    const spanish = legacy?.es ?? {};
    rows = Object.keys(english).map((key) => ({
      key,
      en: english[key],
      es: spanish[key],
    }));
  }

  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      invalid(`Text override ${index + 1} must be an object.`, statusCode);
    }
    const candidate = row as { key?: unknown; en?: unknown; es?: unknown };
    const key = normalizedText(
      candidate.key,
      `Text override ${index + 1} key`,
      statusCode,
    );
    if (seen.has(key)) {
      invalid(`Text override key “${key}” is duplicated.`, statusCode);
    }
    seen.add(key);
    const option = getPublisherAppTextCatalogOption(key);
    if (!option) {
      invalid(`Text override key “${key}” is not in catalog 1.`, statusCode);
    }
    const en = normalizedText(
      candidate.en,
      `English text for ${key}`,
      statusCode,
    );
    const es = normalizedText(
      candidate.es,
      `Spanish text for ${key}`,
      statusCode,
    );
    for (const [language, replacement] of [
      ["English", en],
      ["Spanish", es],
    ] as const) {
      if (
        formattingArguments(replacement).join("\u0000") !==
          option.formatArguments.join("\u0000") ||
        escapedPercentCount(replacement) !==
          escapedPercentCount(option.defaultEnglishText)
      ) {
        invalid(
          `${language} text for “${key}” must preserve its formatting arguments.`,
          statusCode,
        );
      }
    }
    return { key, en, es };
  });
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
              invalid(
                `Lesson ID “${lessonIdentifier}” is duplicated.`,
                statusCode,
              );
            }
            lessonIds.add(lessonIdentifier);
            if (
              !Array.isArray(lesson.paragraphs) ||
              lesson.paragraphs.length === 0
            ) {
              invalid(
                `Lesson “${lessonIdentifier}” needs a paragraph.`,
                statusCode,
              );
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
              paragraphs: lesson.paragraphs.map(
                (paragraph, paragraphIndex) => ({
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
                }),
              ),
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
    topics[topic] = [
      ...new Set(
        assignments.map((assignment) =>
          normalizedText(
            assignment,
            `Subject assignment for ${topic}`,
            statusCode,
          ),
        ),
      ),
    ];
    for (const subjectId of topics[topic]) {
      if (!subjectIds.has(subjectId)) {
        invalid(
          `Learn topic “${topic}” references unknown subject “${subjectId}”.`,
          statusCode,
        );
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

  const legacyValue = value as PublisherAppAdvancedConfiguration & {
    localization?: PublisherAppAdvancedConfiguration["localization"] & {
      copyOverrides?: unknown;
    };
  };

  const semanticColors = value.semanticColors
    ? {
        primary: normalizedColor(
          value.semanticColors.primary,
          "Primary color",
          statusCode,
        ),
        primaryStrong: normalizedColor(
          value.semanticColors.primaryStrong,
          "Strong primary color",
          statusCode,
        ),
        primaryDeep: normalizedColor(
          value.semanticColors.primaryDeep,
          "Deep primary color",
          statusCode,
        ),
        primarySoft: normalizedColor(
          value.semanticColors.primarySoft,
          "Soft primary color",
          statusCode,
        ),
        secondary: normalizedColor(
          value.semanticColors.secondary,
          "Secondary color",
          statusCode,
        ),
        accent: normalizedColor(
          value.semanticColors.accent,
          "Accent color",
          statusCode,
        ),
        accentTextLight: normalizedColor(
          value.semanticColors.accentTextLight,
          "Light accent text color",
          statusCode,
        ),
        accentTextDark: normalizedColor(
          value.semanticColors.accentTextDark,
          "Dark accent text color",
          statusCode,
        ),
        accentSurfaceLight: normalizedColor(
          value.semanticColors.accentSurfaceLight,
          "Light accent surface color",
          statusCode,
        ),
      }
    : null;
  const colorOverrides = normalizedColorOverrides(
    value.colorOverrides ?? {},
    statusCode,
  );

  if (
    typeof value.catalogEnabled !== "boolean" ||
    typeof value.feedEnabled !== "boolean"
  ) {
    invalid(
      "Catalog and Discover availability must be true or false.",
      statusCode,
    );
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
  ].filter(
    (language): language is "en" | "es" =>
      language === "en" || language === "es",
  );
  if (
    availableLanguages.length === 0 ||
    !availableLanguages.includes(value.localization?.defaultLanguage)
  ) {
    invalid(
      "The default language must be one of the available languages.",
      statusCode,
    );
  }
  const textOverrides = normalizedTextOverrides(
    value.textOverrides,
    legacyValue.localization?.copyOverrides,
    statusCode,
  );

  const supportEmail = normalizedText(
    value.links?.supportEmail,
    "Support email",
    statusCode,
  ).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    invalid("Support email must be valid.", statusCode);
  }

  return {
    displayName: normalizedText(
      value.displayName,
      "Experience name",
      statusCode,
    ),
    semanticColors,
    colorOverrides,
    catalogEnabled: value.catalogEnabled,
    feedEnabled: value.feedEnabled,
    discoverScope,
    serviceScope,
    localization: {
      defaultLanguage: value.localization.defaultLanguage,
      availableLanguages,
    },
    textOverrides,
    learn: normalizedLearnConfiguration(value.learn, statusCode),
    links: {
      joinUs: {
        en: normalizedHttps(
          value.links?.joinUs?.en,
          "English Join Us URL",
          statusCode,
        ),
        es: normalizedHttps(
          value.links?.joinUs?.es,
          "Spanish Join Us URL",
          statusCode,
        ),
      },
      supportEmail,
      privacyUrl: normalizedHttps(
        value.links?.privacyUrl,
        "Privacy URL",
        statusCode,
      ),
      termsUrl: normalizedHttps(value.links?.termsUrl, "Terms URL", statusCode),
    },
  };
}
