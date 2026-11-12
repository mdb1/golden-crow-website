import {
  collectDiscoverPartnerCsvExport,
  discoverPublisherPartnerRow,
  serializePartnerCsvRow,
  type PartnerExportPublisher,
} from "@/lib/discover-partner-csv-export";
import {
  PARTNER_CSV_COLUMNS,
  PARTNER_CSV_MAX_BYTES,
} from "@/lib/partner-csv-import";

const publisher: PartnerExportPublisher = {
  id: "publisher-1",
  name: "Ada Rivera",
  contactEmail: " ADA@EXAMPLE.COM ",
  internalNotes: ' Interest in "genetics", apps; next week.\nContact Ada. ',
};
const date = new Date("2026-11-11T12:00:00Z");

function collect(
  items: PartnerExportPublisher[],
  kind: "organization" | "individual" = "individual",
) {
  return collectDiscoverPartnerCsvExport({
    kind,
    date,
    signal: new AbortController().signal,
    fetchPage: async () => ({ items, nextCursor: null }),
  });
}

it("maps organizations without inventing contact names, phone, appointments or app links", () => {
  const { input, review } = discoverPublisherPartnerRow(
    "organization",
    publisher,
  );
  expect(input).toEqual({
    companyName: "Ada Rivera",
    firstName: "",
    lastName: "",
    email: "ada@example.com",
    phoneNumber: "",
    meetingDate: null,
    notes: publisher.internalNotes!.trim(),
    linkedOrganizationId: "publisher-1",
    linkedIndividualPublisherId: null,
    linkedAppId: null,
  });
  expect(review).toBeNull();
});

it("maps individual names and preserves both existing publisher links", () => {
  const { input, review } = discoverPublisherPartnerRow("individual", {
    ...publisher,
    name: "  María   de la Cruz  ",
    linkedParentOrganizationId: "org-1",
  });
  expect(input).toMatchObject({
    companyName: "María   de la Cruz",
    firstName: "María",
    lastName: "de la Cruz",
    linkedOrganizationId: "org-1",
    linkedIndividualPublisherId: publisher.id,
  });
  expect(review).toBeNull();
});

it.each(["organization", "individual"] as const)(
  "exports the resolved %s app document ID in the importer's app column",
  (kind) => {
    const linkedAppId = `${kind}_${publisher.id}`;
    const { input, review } = discoverPublisherPartnerRow(kind, {
      ...publisher,
      linkedAppId,
    });
    expect(input.linkedAppId).toBe(linkedAppId);
    expect(serializePartnerCsvRow(input)).toMatch(
      new RegExp(`,"${linkedAppId}"\\r\\n$`),
    );
    expect(review).toBeNull();
  },
);

it("flags missing or invalid required data and overlong fields without removing or truncating rows", async () => {
  const items = [
    { ...publisher, name: "Prince", contactEmail: "" },
    { ...publisher, id: "invalid-email", contactEmail: "not-an-email" },
    {
      ...publisher,
      id: "long-name",
      name: "x".repeat(181),
      internalNotes: "n".repeat(10_001),
    },
  ];
  const result = await collect(items);
  expect(result.total).toBe(3);
  expect(result.reviewCount).toBe(3);
  expect(result.reviewSample.map((item) => item.fields)).toEqual([
    ["email"],
    ["email"],
    ["companyName", "firstName", "notes"],
  ]);
  expect(result.files[0].csv).toContain("n".repeat(10_001));
});

it("writes only canonical headers and escapes commas, semicolons, quotes, line breaks and accents", async () => {
  const row = discoverPublisherPartnerRow("individual", {
    ...publisher,
    name: "María Rivera",
  }).input;
  expect(serializePartnerCsvRow(row)).toBe(
    '"María Rivera","María","Rivera","ada@example.com","","","Interest in ""genetics"", apps; next week.\nContact Ada.","","publisher-1",""\r\n',
  );
  const result = await collect([publisher]);
  expect(
    result.files[0].csv.startsWith(
      `\uFEFF${PARTNER_CSV_COLUMNS.map((item) => item.key).join(",")}\r\n`,
    ),
  ).toBe(true);
  expect(result.files[0].name).toBe(
    "individuals-as-partners-2026-11-11-01.csv",
  );
});

it("exports every page, deduplicates repeated publisher IDs and reports shared emails", async () => {
  const fetchPage = jest
    .fn()
    .mockResolvedValueOnce({ items: [publisher], nextCursor: "next / page" })
    .mockResolvedValueOnce({
      items: [publisher, { ...publisher, id: "publisher-2" }],
      nextCursor: null,
    });
  const onProgress = jest.fn();
  const signal = new AbortController().signal;
  const result = await collectDiscoverPartnerCsvExport({
    kind: "organization",
    date,
    signal,
    fetchPage,
    onProgress,
  });
  expect(
    fetchPage.mock.calls.map(([cursor, passedSignal]) => [
      cursor,
      passedSignal,
    ]),
  ).toEqual([
    [null, signal],
    ["next / page", signal],
  ]);
  expect(result).toMatchObject({
    total: 2,
    duplicateEmails: 1,
    reviewCount: 0,
  });
  expect(result.files[0].rowCount).toBe(2);
  expect(onProgress.mock.calls).toEqual([[1], [2]]);
});

it("splits at 200 rows without losing publishers", async () => {
  const result = await collect(
    Array.from({ length: 401 }, (_, i) => ({ ...publisher, id: `p-${i}` })),
  );
  expect(result.files.map((file) => file.rowCount)).toEqual([200, 200, 1]);
  expect(result.total).toBe(401);
  expect(result.reviewSample).toHaveLength(0);
});

it("also splits by UTF-8 bytes, including the BOM, header and escaped quotes", async () => {
  const result = await collect(
    Array.from({ length: 40 }, (_, i) => ({
      ...publisher,
      id: `p-${i}`,
      internalNotes: '🌱"'.repeat(3000),
    })),
  );
  expect(result.files.length).toBeGreaterThan(1);
  expect(result.files.reduce((sum, file) => sum + file.rowCount, 0)).toBe(40);
  for (const file of result.files)
    expect(new Blob([file.csv]).size).toBeLessThanOrEqual(
      PARTNER_CSV_MAX_BYTES,
    );
});

it("keeps the review sample bounded while counting every incomplete publisher", async () => {
  const result = await collect(
    Array.from({ length: 25 }, (_, i) => ({
      ...publisher,
      id: `p-${i}`,
      contactEmail: "",
    })),
    "organization",
  );
  expect(result.reviewSample).toHaveLength(10);
  expect(result.reviewCount).toBe(25);
});

it("exports mononym professionals without requiring a surname", () => {
  const { input, review } = discoverPublisherPartnerRow("individual", {
    ...publisher,
    name: "Prince",
  });
  expect(input).toMatchObject({ firstName: "Prince", lastName: "" });
  expect(review).toBeNull();
  expect(
    PARTNER_CSV_COLUMNS.filter((column) => column.required).map(
      (column) => column.key,
    ),
  ).toEqual(["companyName", "email"]);
});

it("returns no files for an empty collection", async () => {
  expect(await collect([])).toEqual({
    files: [],
    total: 0,
    reviewCount: 0,
    duplicateEmails: 0,
    reviewSample: [],
  });
});

it("rejects a repeated cursor or oversized publisher instead of offering a partial export", async () => {
  await expect(
    collectDiscoverPartnerCsvExport({
      kind: "individual",
      signal: new AbortController().signal,
      fetchPage: async () => ({ items: [publisher], nextCursor: "same" }),
    }),
  ).rejects.toThrow("next page");
  await expect(
    collect([
      { ...publisher, internalNotes: "x".repeat(PARTNER_CSV_MAX_BYTES) },
    ]),
  ).rejects.toThrow("size limit");
});

it("honors cancellation before starting and after an in-flight page resolves", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchPage = jest.fn();
  await expect(
    collectDiscoverPartnerCsvExport({
      kind: "individual",
      signal: controller.signal,
      fetchPage,
    }),
  ).rejects.toThrow();
  expect(fetchPage).not.toHaveBeenCalled();

  const inFlight = new AbortController();
  const progress = jest.fn();
  await expect(
    collectDiscoverPartnerCsvExport({
      kind: "individual",
      signal: inFlight.signal,
      onProgress: progress,
      fetchPage: async () => {
        inFlight.abort();
        return { items: [publisher], nextCursor: "more" };
      },
    }),
  ).rejects.toThrow();
  expect(progress).not.toHaveBeenCalled();
});
