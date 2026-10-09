export const PGFLEX_ADDRESS_COUNTRY = "Argentina" as const;
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
