export const PGFLEX_ADDRESS_COUNTRY = "Argentina" as const;
export const PGFLEX_2PQ_DESTINATION =
  "Humboldt 2433 (PB 10), Palermo, Ciudad Autónoma de Buenos Aires, Argentina" as const;
export const PGFLEX_CAPITAL_FEDERAL_ROUTE_NAME = "Ciudad Autónoma de Buenos Aires";
export const PGFLEX_ADDRESS_PROVINCE_DISTRICTS = [
  "Capital Federal",
  "Provincia de Buenos Aires",
] as const;

export type PGFlexAddressProvinceDistrict =
  (typeof PGFLEX_ADDRESS_PROVINCE_DISTRICTS)[number];

export type PGFlexInstitutionAddress = {
  address: string;
  city: string;
  state: PGFlexAddressProvinceDistrict;
  country: typeof PGFLEX_ADDRESS_COUNTRY;
};

export type PGFlexInstitutionAddressResult =
  | { ok: true; value: PGFlexInstitutionAddress }
  | { ok: false; message: string };

const PGFLEX_ADDRESS_TEXT_PART_MIN_LENGTH = 3;

export function sanitizePGFlexAddressTextPart(value: unknown) {
  return typeof value === "string"
    ? value.replace(/,+/g, " ").replace(/\s{2,}/g, " ").trim()
    : "";
}

export function normalizePGFlexInstitutionAddress(input: {
  address?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
}): PGFlexInstitutionAddressResult {
  const address = sanitizePGFlexAddressTextPart(input.address);
  const city = sanitizePGFlexAddressTextPart(input.city);
  if (
    address.length < PGFLEX_ADDRESS_TEXT_PART_MIN_LENGTH ||
    city.length < PGFLEX_ADDRESS_TEXT_PART_MIN_LENGTH
  ) {
    return {
      ok: false,
      message:
        "Address and neighborhood/locality must each have at least 3 characters.",
    };
  }

  const state = sanitizePGFlexAddressTextPart(input.state);
  if (
    !PGFLEX_ADDRESS_PROVINCE_DISTRICTS.includes(
      state as PGFlexAddressProvinceDistrict,
    )
  ) {
    return {
      ok: false,
      message:
        "Province / district must be Capital Federal or Provincia de Buenos Aires.",
    };
  }

  const country = sanitizePGFlexAddressTextPart(input.country);
  if (country !== PGFLEX_ADDRESS_COUNTRY) {
    return {
      ok: false,
      message: "Country must be Argentina.",
    };
  }

  return {
    ok: true,
    value: {
      address,
      city,
      state: state as PGFlexAddressProvinceDistrict,
      country: PGFLEX_ADDRESS_COUNTRY,
    },
  };
}

export function normalizePGFlexPickupOrigin(
  origin: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const parts = origin.split(",").map(sanitizePGFlexAddressTextPart);
  if (parts.length !== 4) {
    return {
      ok: false,
      message: "Enter the pickup address, neighborhood/locality, province / district, and country.",
    };
  }

  const [address, city, province, country] = parts;
  const result = normalizePGFlexInstitutionAddress({
    address,
    city,
    state: province === PGFLEX_CAPITAL_FEDERAL_ROUTE_NAME ? "Capital Federal" : province,
    country,
  });
  if (!result.ok) return result;

  const { state } = result.value;
  return {
    ok: true,
    value: [
      result.value.address,
      result.value.city,
      state === "Capital Federal" ? PGFLEX_CAPITAL_FEDERAL_ROUTE_NAME : state,
      result.value.country,
    ].join(", "),
  };
}
