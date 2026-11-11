import { parsePartnerCsv, PARTNER_CSV_MAX_BYTES } from "../lib/partner-csv.js";

const header = "companyName,firstName,lastName,email";

it("accepts UTF-8 BOM, reordered headers, surrounding whitespace, semicolons and blank rows", () => {
  const result = parsePartnerCsv(
    "\uFEFF email ;lastName;companyName;firstName;phoneNumber;meetingDate;notes\r\n\r\n ADA@EXAMPLE.COM ; Rivera ; Genome Studio ; Ada ; ;2026-11-11; \r\n",
  );
  expect(result).toMatchObject({
    summary: { total: 1, ready: 1, duplicates: 0, invalid: 0 },
  });
  expect(result.rows[0]).toMatchObject({
    rowNumber: 3,
    input: {
      companyName: "Genome Studio",
      firstName: "Ada",
      lastName: "Rivera",
      email: "ada@example.com",
      phoneNumber: "",
      meetingDate: "2026-11-11",
      notes: null,
      linkedOrganizationId: null,
      linkedIndividualPublisherId: null,
      linkedAppId: null,
    },
  });
});

it("handles quoted separators, escaped quotes and multiline fields with physical line numbers", () => {
  const result = parsePartnerCsv(
    `${header},notes\r\n"Genome, Studio",Ada,Rivera,ada@example.com,"Line one\r\nA ""quoted"" note"\r\nAtlas,Lucas,Diaz,lucas@example.com,Plain`,
  );
  expect(result.rows[0]?.input?.companyName).toBe("Genome, Studio");
  expect(result.rows[0]?.input?.notes).toBe('Line one\r\nA "quoted" note');
  expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
});

it("detects semicolons after leading blank lines without losing physical line numbers", () => {
  const result = parsePartnerCsv(
    "\uFEFF\r\n \r\n;;;\r\ncompanyName;firstName;lastName;email\r\nAcme;Ada;Rivera;ada@example.com",
  );
  expect(result.rows[0]?.rowNumber).toBe(5);
  expect(result.summary.ready).toBe(1);
});

it("ignores quoted empty records before a reordered header when detecting the delimiter", () => {
  const result = parsePartnerCsv(
    '"";"";"";""\nemail;lastName;firstName;companyName\nada@example.com;Rivera;Ada;Acme',
  );
  expect(result.rows[0]?.rowNumber).toBe(3);
  expect(result.summary.ready).toBe(1);
});

it.each([
  "",
  header,
  "companyName,firstName,lastName\nAcme,Ada,Rivera",
  `${header},email\nAcme,Ada,Rivera,a@example.com,a@example.com`,
  `${header},company_name\nAcme,Ada,Rivera,a@example.com,Alias`,
  `${header},linkedOrganizationSnapshot\nAcme,Ada,Rivera,a@example.com,{}`,
  `${header},CompanyName\nAcme,Ada,Rivera,a@example.com,Wrong case`,
  `${header}\n"Acme,Ada,Rivera,a@example.com`,
  `${header}\n"Acme"suffix,Ada,Rivera,a@example.com`,
  `${header}\nAc"me,Ada,Rivera,a@example.com`,
  `${header}\nAcme,Ada,Rivera,a@example.com\0`,
])("rejects malformed files and non-canonical headers: %s", (text) => {
  expect(() => parsePartnerCsv(text)).toThrow();
});

it("reports invalid cells, required values, email, impossible civil dates and phone limits per row", () => {
  const result = parsePartnerCsv(
    `${header},meetingDate,phoneNumber\nAcme,Ada,Rivera,ada@example.com,2026-02-30,\nAcme,,Rivera,bad,,\nAcme,Ada,Rivera,ada@example.com,,${"1".repeat(51)}\nAcme,Ada`,
  );
  expect(result.summary.invalid).toBe(4);
  expect(result.rows.map((row) => row.errors.join(" "))).toEqual([
    expect.stringContaining("meetingDate"),
    expect.stringContaining("email"),
    expect.stringContaining("phoneNumber"),
    expect.stringContaining("Expected 6 cells"),
  ]);
});

it("accepts exported organizations without contact names and individuals without surnames", () => {
  const result = parsePartnerCsv(`${header}\nGenome Studio,,,hello@example.com\nPrince,Prince,,prince@example.com`);
  expect(result.summary).toEqual({ total: 2, ready: 2, duplicates: 0, invalid: 0 });
  expect(result.rows[0]?.input).toMatchObject({ firstName: "", lastName: "" });
  expect(result.rows[1]?.input).toMatchObject({ firstName: "Prince", lastName: "" });
  expect(parsePartnerCsv("companyName,email\nGenome Studio,hello@example.com").rows[0]?.input).toMatchObject({ firstName: "", lastName: "" });
});

it("bounds both the UTF-8 byte size and data row count", () => {
  const row = "Acme,Ada,Rivera,ada@example.com";
  expect(
    parsePartnerCsv(`${header}\n${Array(200).fill(row).join("\n")}`).rows,
  ).toHaveLength(200);
  expect(() =>
    parsePartnerCsv(`${header}\n${Array(201).fill(row).join("\n")}`),
  ).toThrow("200 partner row");
  expect(() =>
    parsePartnerCsv("é".repeat(PARTNER_CSV_MAX_BYTES / 2 + 1)),
  ).toThrow("256 KiB");
});
