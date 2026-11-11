import { z } from "zod";
import type { PartnerInput } from "@/lib/connected-partners";
import type {
  DiscoverIndividualRecord,
  DiscoverOrganizationRecord,
} from "@/lib/discover";
import {
  PARTNER_CSV_COLUMNS,
  PARTNER_CSV_MAX_BYTES,
  PARTNER_CSV_MAX_ROWS,
} from "@/lib/partner-csv-import";

export type PartnerExportPublisherKind = "organization" | "individual";
export type PartnerExportPublisher = Pick<
  DiscoverOrganizationRecord,
  "id" | "name" | "contactEmail" | "internalNotes"
> &
  Partial<Pick<DiscoverIndividualRecord, "linkedParentOrganizationId">>;

export type PartnerCsvExportReview = {
  publisherId: string;
  name: string;
  fields: string[];
};

export type PartnerCsvExportFile = {
  name: string;
  csv: string;
  rowCount: number;
  reviewCount: number;
};

export type DiscoverPartnerCsvExport = {
  files: PartnerCsvExportFile[];
  total: number;
  reviewCount: number;
  duplicateEmails: number;
  reviewSample: PartnerCsvExportReview[];
};

// Mirror the import's editable field limits without filling unknown contact data.
const ExportContactSchema = z.object({
  companyName: z.string().min(1).max(180),
  firstName: z.string().max(140),
  lastName: z.string().max(140),
  email: z.string().email().max(254),
  notes: z.string().max(10_000).nullable(),
});

export function discoverPublisherPartnerRow(
  kind: PartnerExportPublisherKind,
  publisher: PartnerExportPublisher,
): { input: PartnerInput; review: PartnerCsvExportReview | null } {
  const name = publisher.name.trim();
  const nameParts = kind === "individual" ? name.split(/\s+/) : [];
  const input: PartnerInput = {
    companyName: name,
    firstName: nameParts[0] ?? "",
    lastName: nameParts.slice(1).join(" "),
    email: publisher.contactEmail?.trim().toLowerCase() ?? "",
    phoneNumber: "",
    meetingDate: null,
    notes: publisher.internalNotes?.trim() || null,
    linkedOrganizationId:
      kind === "organization"
        ? publisher.id
        : publisher.linkedParentOrganizationId?.trim() || null,
    linkedIndividualPublisherId: kind === "individual" ? publisher.id : null,
    linkedAppId: null,
  };
  const parsed = ExportContactSchema.safeParse(input);
  return {
    input,
    review: parsed.success
      ? null
      : {
          publisherId: publisher.id,
          name,
          fields: [
            ...new Set(
              parsed.error.issues.map((issue) => String(issue.path[0])),
            ),
          ],
        },
  };
}

export function serializePartnerCsvRow(input: PartnerInput) {
  return `${PARTNER_CSV_COLUMNS.map(
    ({ key }) => `"${(input[key] ?? "").replace(/"/g, '""')}"`,
  ).join(",")}\r\n`;
}

export async function collectDiscoverPartnerCsvExport({
  kind,
  fetchPage,
  signal,
  onProgress,
  date = new Date(),
}: {
  kind: PartnerExportPublisherKind;
  fetchPage: (
    cursor: string | null,
    signal: AbortSignal,
  ) => Promise<{
    items: PartnerExportPublisher[];
    nextCursor: string | null;
  }>;
  signal: AbortSignal;
  onProgress?: (total: number) => void;
  date?: Date;
}): Promise<DiscoverPartnerCsvExport> {
  const header = `\uFEFF${PARTNER_CSV_COLUMNS.map(({ key }) => key).join(",")}\r\n`;
  const headerBytes = new Blob([header]).size;
  const result: DiscoverPartnerCsvExport = {
    files: [],
    total: 0,
    reviewCount: 0,
    duplicateEmails: 0,
    reviewSample: [],
  };
  const seenCursors = new Set<string>();
  const seenPublishers = new Set<string>();
  const seenEmails = new Set<string>();
  let cursor: string | null = null;
  let csv = header;
  let bytes = headerBytes;
  let rowCount = 0;
  let reviewCount = 0;

  function finishFile() {
    if (!rowCount) return;
    const source = kind === "organization" ? "organizations" : "individuals";
    result.files.push({
      name: `${source}-as-partners-${date.toISOString().slice(0, 10)}-${String(result.files.length + 1).padStart(2, "0")}.csv`,
      csv,
      rowCount,
      reviewCount,
    });
    csv = header;
    bytes = headerBytes;
    rowCount = 0;
    reviewCount = 0;
  }

  do {
    signal.throwIfAborted();
    const page = await fetchPage(cursor, signal);
    signal.throwIfAborted();
    for (const publisher of page.items) {
      if (seenPublishers.has(publisher.id)) continue;
      seenPublishers.add(publisher.id);
      const { input, review } = discoverPublisherPartnerRow(kind, publisher);
      const line = serializePartnerCsvRow(input);
      const lineBytes = new Blob([line]).size;
      if (headerBytes + lineBytes > PARTNER_CSV_MAX_BYTES) {
        throw new Error(
          "A publisher exceeds the CSV file size limit. Shorten its internal notes and try again.",
        );
      }
      if (
        rowCount === PARTNER_CSV_MAX_ROWS ||
        bytes + lineBytes > PARTNER_CSV_MAX_BYTES
      ) {
        finishFile();
      }
      csv += line;
      bytes += lineBytes;
      rowCount++;
      result.total++;
      if (review) {
        reviewCount++;
        result.reviewCount++;
        if (result.reviewSample.length < 10) result.reviewSample.push(review);
      }
      if (input.email) {
        if (seenEmails.has(input.email)) result.duplicateEmails++;
        seenEmails.add(input.email);
      }
    }
    onProgress?.(result.total);
    cursor = page.nextCursor;
    if (cursor) {
      if (seenCursors.has(cursor))
        throw new Error("The export could not read the next page. Try again.");
      seenCursors.add(cursor);
    }
  } while (cursor);
  finishFile();
  return result;
}
