import type { AppLanguage } from "./language";

export type DiscoverOrganizationCountryOption = {
  code: string;
  label: string;
};

export type DiscoverOrganizationCountryGroup = {
  key: "recommended" | "all";
  label: string;
  options: DiscoverOrganizationCountryOption[];
};

const RECOMMENDED_COUNTRY_CODES = ["AR", "US", "AU", "NZ"] as const;

export const DISCOVER_ORGANIZATION_COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR",
  "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE",
  "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ",
  "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD",
  "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR",
  "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
  "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI",
  "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS",
  "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
  "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK",
  "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME",
  "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ",
  "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU",
  "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
  "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS",
  "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI",
  "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV",
  "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK",
  "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA",
  "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

const countryNameCache = new Map<string, string>();

function countryNameForCode(code: string, language: AppLanguage) {
  const normalizedCode = code.trim().toUpperCase();
  const cacheKey = `${language}:${normalizedCode}`;
  const cached = countryNameCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let name = normalizedCode;
  try {
    name =
      new Intl.DisplayNames([language], { type: "region" }).of(normalizedCode) ??
      normalizedCode;
  } catch {
    name = normalizedCode;
  }

  countryNameCache.set(cacheKey, name);
  return name;
}

function countryOption(
  code: string,
  language: AppLanguage,
): DiscoverOrganizationCountryOption {
  const normalizedCode = code.trim().toUpperCase();
  const name = countryNameForCode(normalizedCode, language);
  return {
    code: normalizedCode,
    label: `${name} (${normalizedCode})`,
  };
}

export function formatDiscoverOrganizationCountry(
  countryCode: string,
  language: AppLanguage,
) {
  const normalizedCode = countryCode.trim().toUpperCase();
  return normalizedCode ? countryOption(normalizedCode, language).label : null;
}

export function getDiscoverOrganizationCountryGroups(
  language: AppLanguage,
): DiscoverOrganizationCountryGroup[] {
  const recommended = new Set<string>(RECOMMENDED_COUNTRY_CODES);
  const collator = new Intl.Collator(language, { sensitivity: "base" });
  const recommendedOptions = RECOMMENDED_COUNTRY_CODES.map((code) =>
    countryOption(code, language),
  );
  const allOptions = DISCOVER_ORGANIZATION_COUNTRY_CODES.filter(
    (code) => !recommended.has(code),
  )
    .map((code) => countryOption(code, language))
    .sort((a, b) => collator.compare(a.label, b.label));

  return [
    {
      key: "recommended",
      label: "Recommended countries",
      options: recommendedOptions,
    },
    {
      key: "all",
      label: "All other countries",
      options: allOptions,
    },
  ];
}

export function slugifyDiscoverOrganizationName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || "organization"
  );
}
