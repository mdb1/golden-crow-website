import type {
  PublisherAppConfigRecord,
  PublisherAppRuntimeConfig,
} from "../types/sdk.types.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";
import { derivePublisherAppSemanticColors } from "./publisher-app-advanced-config.js";
import { isPublisherAppRuntimeEnabled } from "./publisher-app-status.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const QUICK_ACTION_TEXT_ROLES = ["friends", "genes", "circles", "search"]
  .map(action => `community.quickActions.${action}.foreground`);

type RuntimeConfigSource = Omit<PublisherAppConfigRecord, "colors"> & {
  colors: Pick<PublisherAppConfigRecord["colors"], "primary" | "secondary" | "tertiary"> &
    Partial<Pick<PublisherAppConfigRecord["colors"], "counterpointClockwise" | "counterpointAnticlockwise">>;
};

function httpsLogoUrl(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function buildPublisherAppRuntimeConfig(
  config: RuntimeConfigSource,
): PublisherAppRuntimeConfig {
  const identifier = config.appProviderIdentifier?.trim();
  if (!identifier || !IDENTIFIER_PATTERN.test(identifier)) {
    throw new AdminRepositoryError(
      "Create a valid app identifier before exporting the runtime config.",
      409,
    );
  }
  if (!isPublisherAppRuntimeEnabled(config.status)) {
    throw new AdminRepositoryError(
      "The app runtime config is not active.",
      409,
    );
  }

  const primary = config.colors.primary;
  const publisherName = config.publisherName;
  const advanced = config.advancedConfiguration;
  // These roles are consumed by the title and Open labels only. Illustrations
  // retain their original rendering and all other overrides stay unchanged.
  const colorOverrides = { ...advanced.colorOverrides };
  for (const role of QUICK_ACTION_TEXT_ROLES) {
    colorOverrides[role] = { light: "#FFFFFF", dark: "#FFFFFF" };
  }
  const learn: PublisherAppRuntimeConfig["learn"] =
    advanced.learn.mode === "base"
      ? { mode: "base" }
      : {
          mode: "replace",
          curriculumId: advanced.learn.curriculumId,
          curriculumRevision: advanced.learn.curriculumRevision,
          defaultLanguage: advanced.learn.defaultLanguage,
          lessonReference: {
            subjects: advanced.learn.subjects.map((subject) => ({
              subjectIdentifier: subject.subjectIdentifier,
              subjectTitle: subject.subjectTitle,
              chapters: subject.chapters.map((chapter) => ({
                chapterTitle: chapter.chapterTitle,
                lessons: chapter.lessons.map((lesson) => ({
                  lessonIdentifier: lesson.lessonIdentifier,
                  lessonTitle: lesson.lessonTitle,
                  imageURL: lesson.imageUrl,
                  lessonColor: lesson.lessonColor,
                })),
              })),
            })),
          },
          lessonDictionary: Object.fromEntries(
            advanced.learn.subjects.flatMap((subject) =>
              subject.chapters.flatMap((chapter) =>
                chapter.lessons.map((lesson) => [
                  lesson.lessonIdentifier,
                  {
                    lessonIdentifier: lesson.lessonIdentifier,
                    lessonTitle: lesson.lessonTitle,
                    imageURL: lesson.imageUrl,
                    lessonColor: lesson.lessonColor,
                    paragraphs: lesson.paragraphs,
                    useful_links: lesson.usefulLinks,
                    related_lessons: lesson.relatedLessons,
                  },
                ]),
              ),
            ),
          ),
          topics: advanced.learn.topics,
        };
  return {
    schemaVersion: 3,
    appProviderIdentifier: identifier,
    revision: config.runtimeRevision ?? 1,
    status: "published",
    baseContentVersion: "pg-core-v1",
    publisher: {
      kind: config.publisherKind,
      id: config.publisherId,
      name: publisherName,
    },
    branding: {
      displayName: advanced.displayName,
      logoURL: httpsLogoUrl(config.iconImageUrl),
      ...(config.iconImageUploadDataUrl
        ? { logoUploadDataUrl: config.iconImageUploadDataUrl }
        : {}),
      colors: {
        ...(advanced.semanticColors ??
          derivePublisherAppSemanticColors({
            primary,
            secondary: config.colors.secondary,
            tertiary: config.colors.tertiary,
          })),
        ...(config.colors.counterpointClockwise
          ? { counterpointClockwise: config.colors.counterpointClockwise }
          : {}),
        ...(config.colors.counterpointAnticlockwise
          ? { counterpointAnticlockwise: config.colors.counterpointAnticlockwise }
          : {}),
      },
      colorOverrides,
    },
    features: {
      catalogEnabled: advanced.catalogEnabled,
      feedEnabled: advanced.feedEnabled,
      connectEnabled: config.connectEnabled,
      // Runtime v2 accepts these flags for compatibility, but the native apps
      // deliberately keep Profile and Learn available in every experience.
      profileEnabled: true,
      learnEnabled: true,
    },
    discoverScope: advanced.discoverScope,
    serviceScope: advanced.serviceScope,
    localization: {
      defaultLanguage: advanced.localization.defaultLanguage,
      availableLanguages: advanced.localization.availableLanguages,
    },
    learn,
    textOverrides: advanced.textOverrides,
    links: {
      joinUs: advanced.links.joinUs,
      supportEmail: advanced.links.supportEmail,
      privacyURL: advanced.links.privacyUrl,
      termsURL: advanced.links.termsUrl,
    },
  };
}
