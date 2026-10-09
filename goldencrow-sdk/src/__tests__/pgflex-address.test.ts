import {
  normalizePGFlexInstitutionAddress,
  PGFLEX_ADDRESS_COUNTRY,
} from "../lib/pgflex-address.js";

describe("PGFlex institution address contract", () => {
  it("normalizes the shared street and locality text format", () => {
    expect(
      normalizePGFlexInstitutionAddress({
        address: "  Av. Corrientes 123,, piso 2  ",
        city: "  Almagro  ",
        state: "Capital Federal",
        country: PGFLEX_ADDRESS_COUNTRY,
      }),
    ).toEqual({
      ok: true,
      value: {
        address: "Av. Corrientes 123 piso 2",
        city: "Almagro",
        state: "Capital Federal",
        country: "Argentina",
      },
    });
  });

  it.each([
    [
      {
        address: "Av",
        city: "Almagro",
        state: "Capital Federal",
        country: "Argentina",
      },
      "Address and neighborhood/locality must each have at least 3 characters.",
    ],
    [
      {
        address: "Av. Corrientes 123",
        city: "Almagro",
        state: "Santa Fe",
        country: "Argentina",
      },
      "Province / district must be Capital Federal or Provincia de Buenos Aires.",
    ],
    [
      {
        address: "Av. Corrientes 123",
        city: "Almagro",
        state: "Capital Federal",
        country: "Uruguay",
      },
      "Country must be Argentina.",
    ],
  ])("rejects an address outside the PGFlex contract", (input, message) => {
    expect(normalizePGFlexInstitutionAddress(input)).toEqual({
      ok: false,
      message,
    });
  });
});
