import type {
  PublisherAppConfigRecord,
  PublisherAppRuntimeConfig,
} from "../types/sdk.types.js";
import { AdminRepositoryError } from "../repositories/admin-errors.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

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
  config: PublisherAppConfigRecord,
): PublisherAppRuntimeConfig {
  const identifier = config.appProviderIdentifier?.trim();
  if (!identifier || !IDENTIFIER_PATTERN.test(identifier)) {
    throw new AdminRepositoryError(
      "Create a valid app identifier before exporting the runtime config.",
      409,
    );
  }
  if (config.status !== "active") {
    throw new AdminRepositoryError(
      "The app runtime config is not active.",
      409,
    );
  }

  const primary = config.colors.primary;
  const secondary = config.colors.secondary;
  const accent = config.colors.tertiary;
  const publisherName = config.publisherName;

  return {
    schemaVersion: 2,
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
      displayName: publisherName,
      logoURL: httpsLogoUrl(config.iconImageUrl),
      colors: {
        primary,
        primaryStrong: mixHex(primary, "#000000", 0.12),
        primaryDeep: mixHex(primary, "#000000", 0.26),
        primarySoft: mixHex(primary, "#FFFFFF", 0.48),
        secondary,
        accent,
        accentTextLight: mixHex(accent, "#000000", 0.28),
        accentTextDark: mixHex(accent, "#FFFFFF", 0.38),
        accentSurfaceLight: mixHex(accent, "#FFFFFF", 0.9),
      },
    },
    features: {
      catalogEnabled: config.catalogEnabled,
      feedEnabled: config.feedEnabled,
      connectEnabled: config.connectEnabled,
      profileEnabled: config.profileEnabled,
      learnEnabled: config.learnCustomizationEnabled,
    },
    discoverScope:
      config.publisherKind === "organization"
        ? {
            mode: "organization",
            publisherOrganizationId: config.publisherId,
          }
        : { mode: "all" },
    serviceScope: {
      mode: "provider",
      providerId: config.publisherId,
      providerKind: config.publisherKind,
    },
    localization: {
      defaultLanguage: "es",
      availableLanguages: ["en", "es"],
      copyOverrides: {
        en: {
          "Only on Pocket Genes": `Only on ${publisherName}`,
          "Contact Pocket Genes": `Contact ${publisherName}`,
        },
        es: {
          "Only on Pocket Genes": `Solo en ${publisherName}`,
          "Contact Pocket Genes": `Contactá a ${publisherName}`,
        },
      },
    },
    // The editor currently requests Learn customization but does not author a
    // complete replacement curriculum. The v2 contract requires that complete
    // graph, so the runtime safely keeps the canonical base curriculum.
    learn: { mode: "base" },
    resourceOverrides: {},
    links: {
      joinUs: {
        en: "https://goldencrowvs.com/en/pocket-genes/join-us/",
        es: "https://goldencrowvs.com/pocket-genes/join-us/",
      },
      supportEmail: "support@goldencrowvs.com",
      privacyURL: "https://goldencrowvs.com/privacy/",
      termsURL: "https://goldencrowvs.com/terms/",
    },
  };
}
