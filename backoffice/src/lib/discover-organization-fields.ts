import type { AppLanguage } from "./language";

export type DiscoverOrganizationCountryOption = {
  code: string;
  label: string;
};

export type DiscoverRegionCountryOption = {
  regionCode: string;
  label: string;
};

export type DiscoverOrganizationCountryGroup = {
  key: "recommended" | "all";
  label: string;
  options: DiscoverOrganizationCountryOption[];
};

export type DiscoverRegionCountryGroup = {
  key: "recommended" | "all";
  label: string;
  options: DiscoverRegionCountryOption[];
};

const RECOMMENDED_COUNTRY_CODES = ["AR", "US", "AU", "NZ"] as const;
const RECOMMENDED_REGION_COUNTRY_CODES = [
  "ARG",
  "ESP",
  "ENG",
  "USA",
  "AUS",
  "NZL",
] as const;

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

type DiscoverOrganizationCountryCode =
  (typeof DISCOVER_ORGANIZATION_COUNTRY_CODES)[number];

const COUNTRY_ALPHA2_TO_ALPHA3: Record<DiscoverOrganizationCountryCode, string> = {
  AD: "AND",
  AE: "ARE",
  AF: "AFG",
  AG: "ATG",
  AI: "AIA",
  AL: "ALB",
  AM: "ARM",
  AO: "AGO",
  AQ: "ATA",
  AR: "ARG",
  AS: "ASM",
  AT: "AUT",
  AU: "AUS",
  AW: "ABW",
  AX: "ALA",
  AZ: "AZE",
  BA: "BIH",
  BB: "BRB",
  BD: "BGD",
  BE: "BEL",
  BF: "BFA",
  BG: "BGR",
  BH: "BHR",
  BI: "BDI",
  BJ: "BEN",
  BL: "BLM",
  BM: "BMU",
  BN: "BRN",
  BO: "BOL",
  BQ: "BES",
  BR: "BRA",
  BS: "BHS",
  BT: "BTN",
  BV: "BVT",
  BW: "BWA",
  BY: "BLR",
  BZ: "BLZ",
  CA: "CAN",
  CC: "CCK",
  CD: "COD",
  CF: "CAF",
  CG: "COG",
  CH: "CHE",
  CI: "CIV",
  CK: "COK",
  CL: "CHL",
  CM: "CMR",
  CN: "CHN",
  CO: "COL",
  CR: "CRI",
  CU: "CUB",
  CV: "CPV",
  CW: "CUW",
  CX: "CXR",
  CY: "CYP",
  CZ: "CZE",
  DE: "DEU",
  DJ: "DJI",
  DK: "DNK",
  DM: "DMA",
  DO: "DOM",
  DZ: "DZA",
  EC: "ECU",
  EE: "EST",
  EG: "EGY",
  EH: "ESH",
  ER: "ERI",
  ES: "ESP",
  ET: "ETH",
  FI: "FIN",
  FJ: "FJI",
  FK: "FLK",
  FM: "FSM",
  FO: "FRO",
  FR: "FRA",
  GA: "GAB",
  GB: "GBR",
  GD: "GRD",
  GE: "GEO",
  GF: "GUF",
  GG: "GGY",
  GH: "GHA",
  GI: "GIB",
  GL: "GRL",
  GM: "GMB",
  GN: "GIN",
  GP: "GLP",
  GQ: "GNQ",
  GR: "GRC",
  GS: "SGS",
  GT: "GTM",
  GU: "GUM",
  GW: "GNB",
  GY: "GUY",
  HK: "HKG",
  HM: "HMD",
  HN: "HND",
  HR: "HRV",
  HT: "HTI",
  HU: "HUN",
  ID: "IDN",
  IE: "IRL",
  IL: "ISR",
  IM: "IMN",
  IN: "IND",
  IO: "IOT",
  IQ: "IRQ",
  IR: "IRN",
  IS: "ISL",
  IT: "ITA",
  JE: "JEY",
  JM: "JAM",
  JO: "JOR",
  JP: "JPN",
  KE: "KEN",
  KG: "KGZ",
  KH: "KHM",
  KI: "KIR",
  KM: "COM",
  KN: "KNA",
  KP: "PRK",
  KR: "KOR",
  KW: "KWT",
  KY: "CYM",
  KZ: "KAZ",
  LA: "LAO",
  LB: "LBN",
  LC: "LCA",
  LI: "LIE",
  LK: "LKA",
  LR: "LBR",
  LS: "LSO",
  LT: "LTU",
  LU: "LUX",
  LV: "LVA",
  LY: "LBY",
  MA: "MAR",
  MC: "MCO",
  MD: "MDA",
  ME: "MNE",
  MF: "MAF",
  MG: "MDG",
  MH: "MHL",
  MK: "MKD",
  ML: "MLI",
  MM: "MMR",
  MN: "MNG",
  MO: "MAC",
  MP: "MNP",
  MQ: "MTQ",
  MR: "MRT",
  MS: "MSR",
  MT: "MLT",
  MU: "MUS",
  MV: "MDV",
  MW: "MWI",
  MX: "MEX",
  MY: "MYS",
  MZ: "MOZ",
  NA: "NAM",
  NC: "NCL",
  NE: "NER",
  NF: "NFK",
  NG: "NGA",
  NI: "NIC",
  NL: "NLD",
  NO: "NOR",
  NP: "NPL",
  NR: "NRU",
  NU: "NIU",
  NZ: "NZL",
  OM: "OMN",
  PA: "PAN",
  PE: "PER",
  PF: "PYF",
  PG: "PNG",
  PH: "PHL",
  PK: "PAK",
  PL: "POL",
  PM: "SPM",
  PN: "PCN",
  PR: "PRI",
  PS: "PSE",
  PT: "PRT",
  PW: "PLW",
  PY: "PRY",
  QA: "QAT",
  RE: "REU",
  RO: "ROU",
  RS: "SRB",
  RU: "RUS",
  RW: "RWA",
  SA: "SAU",
  SB: "SLB",
  SC: "SYC",
  SD: "SDN",
  SE: "SWE",
  SG: "SGP",
  SH: "SHN",
  SI: "SVN",
  SJ: "SJM",
  SK: "SVK",
  SL: "SLE",
  SM: "SMR",
  SN: "SEN",
  SO: "SOM",
  SR: "SUR",
  SS: "SSD",
  ST: "STP",
  SV: "SLV",
  SX: "SXM",
  SY: "SYR",
  SZ: "SWZ",
  TC: "TCA",
  TD: "TCD",
  TF: "ATF",
  TG: "TGO",
  TH: "THA",
  TJ: "TJK",
  TK: "TKL",
  TL: "TLS",
  TM: "TKM",
  TN: "TUN",
  TO: "TON",
  TR: "TUR",
  TT: "TTO",
  TV: "TUV",
  TW: "TWN",
  TZ: "TZA",
  UA: "UKR",
  UG: "UGA",
  UM: "UMI",
  US: "USA",
  UY: "URY",
  UZ: "UZB",
  VA: "VAT",
  VC: "VCT",
  VE: "VEN",
  VG: "VGB",
  VI: "VIR",
  VN: "VNM",
  VU: "VUT",
  WF: "WLF",
  WS: "WSM",
  YE: "YEM",
  YT: "MYT",
  ZA: "ZAF",
  ZM: "ZMB",
  ZW: "ZWE",
};

const COUNTRY_ALPHA3_TO_ALPHA2 = new Map(
  Object.entries(COUNTRY_ALPHA2_TO_ALPHA3).map(([alpha2, alpha3]) => [
    alpha3,
    alpha2,
  ]),
);

const DISCOVER_REGION_EXTRA_OPTIONS = [
  {
    regionCode: "ENG",
    name: {
      en: "England",
      es: "Inglaterra",
    },
  },
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

function isAlpha2CountryCode(
  value: string,
): value is DiscoverOrganizationCountryCode {
  return Object.hasOwn(COUNTRY_ALPHA2_TO_ALPHA3, value);
}

function isExtraRegionCode(value: string) {
  return DISCOVER_REGION_EXTRA_OPTIONS.some(
    (option) => option.regionCode === value,
  );
}

function regionCountryOptionFromAlpha2(
  alpha2: DiscoverOrganizationCountryCode,
  language: AppLanguage,
): DiscoverRegionCountryOption {
  const regionCode = COUNTRY_ALPHA2_TO_ALPHA3[alpha2];
  return {
    regionCode,
    label: `${countryNameForCode(alpha2, language)} (${regionCode})`,
  };
}

function regionCountryOptionFromCode(
  regionCode: string,
  language: AppLanguage,
): DiscoverRegionCountryOption | null {
  const normalizedCode = regionCode.trim().toUpperCase();
  const extraOption = DISCOVER_REGION_EXTRA_OPTIONS.find(
    (option) => option.regionCode === normalizedCode,
  );

  if (extraOption) {
    return {
      regionCode: extraOption.regionCode,
      label: `${extraOption.name[language]} (${extraOption.regionCode})`,
    };
  }

  const alpha2 = COUNTRY_ALPHA3_TO_ALPHA2.get(normalizedCode);
  if (!alpha2 || !isAlpha2CountryCode(alpha2)) {
    return null;
  }

  return regionCountryOptionFromAlpha2(alpha2, language);
}

export function parseDiscoverRegionCodes(region: string) {
  const seen = new Set<string>();
  return region
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .map((token) => {
      if (isAlpha2CountryCode(token)) {
        return COUNTRY_ALPHA2_TO_ALPHA3[token];
      }
      if (COUNTRY_ALPHA3_TO_ALPHA2.has(token) || isExtraRegionCode(token)) {
        return token;
      }
      return null;
    })
    .filter((code): code is string => {
      if (!code || seen.has(code)) {
        return false;
      }
      seen.add(code);
      return true;
    });
}

export function formatDiscoverRegionCodes(regionCodes: readonly string[]) {
  return parseDiscoverRegionCodes(regionCodes.join(",")).join(", ");
}

export function getDiscoverRegionCountryGroups(
  language: AppLanguage,
): DiscoverRegionCountryGroup[] {
  const recommended = new Set<string>(RECOMMENDED_REGION_COUNTRY_CODES);
  const collator = new Intl.Collator(language, { sensitivity: "base" });
  const recommendedOptions = RECOMMENDED_REGION_COUNTRY_CODES.map((code) =>
    regionCountryOptionFromCode(code, language),
  ).filter((option): option is DiscoverRegionCountryOption => Boolean(option));
  const allOptions = DISCOVER_ORGANIZATION_COUNTRY_CODES.map((code) =>
    regionCountryOptionFromAlpha2(code, language),
  )
    .filter((option) => !recommended.has(option.regionCode))
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
