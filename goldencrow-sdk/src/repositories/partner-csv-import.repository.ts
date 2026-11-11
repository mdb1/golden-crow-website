import { createHash } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDbFor } from "../config/firebase.js";
import {
  CONNECTED_PARTNERS_COLLECTION,
  PartnerIdSchema,
  type StoredPartner,
} from "../contracts/connected-partners.js";
import {
  parsePartnerCsv,
  summarizePartnerCsv,
  type PartnerCsvImportResult,
  type PartnerCsvPreview,
} from "../lib/partner-csv.js";
import type { AdminContext } from "../types/sdk.types.js";
import {
  AdminRepositoryError,
  isAdminRepositoryError,
} from "./admin-errors.js";
import {
  partnerLinkReader,
  preparePartner,
  type PartnerLinkReader,
} from "./connected-partners.repository.js";

export const PARTNER_IMPORTS_COLLECTION = "connected-partner-imports";
export const PARTNER_IMPORT_EMAILS_COLLECTION =
  "connected-partner-import-emails";
const ImportIdSchema = z.uuid();
const StoredImportSchema = z
  .object({
    csvHash: z.string().regex(/^[a-f0-9]{64}$/),
    importedCount: z.number().int().min(0).max(200),
    skippedCount: z.number().int().min(0).max(200),
    partnerIds: z.array(PartnerIdSchema).max(200),
  })
  .strict();

export class PartnerCsvValidationError extends AdminRepositoryError {
  constructor(public readonly preview: PartnerCsvPreview) {
    super(
      "Fix every invalid CSV row before importing. No partners were created.",
      400,
    );
  }
}

function requireGodMode(context: AdminContext) {
  if (!context.isBootstrap)
    throw new AdminRepositoryError("GOD MODE access required", 403);
}

function emailHash(email: string) {
  return createHash("sha256").update(email).digest("hex");
}

function importedPartnerId(importId: string, email: string) {
  return `csv_${importId.replaceAll("-", "")}_${emailHash(email).slice(0, 32)}`;
}

async function resolveAppId(
  id: string,
  reader: PartnerLinkReader,
  transaction?: Transaction,
) {
  const direct = await reader.app(id);
  if (direct) return direct.id;
  const query = adminDbFor("mydnamap")
    .collection("app_configs")
    .where("appProviderIdentifier", "==", id)
    .limit(2);
  const matches = transaction
    ? await transaction.get(query)
    : await query.get();
  if (matches.docs.length > 1) {
    throw new AdminRepositoryError(
      "This app ID matches more than one app. Use the app document ID.",
      400,
    );
  }
  return matches.docs[0]?.id ?? id;
}

async function prepareCsv(
  context: AdminContext,
  csv: string,
  transaction?: Transaction,
) {
  requireGodMode(context);
  const preview = parsePartnerCsv(csv);
  const db = adminDbFor("mydnamap");
  const partners = db.collection(CONNECTED_PARTNERS_COLLECTION);
  const reader = partnerLinkReader(transaction);
  const prepared = new Map<number, StoredPartner>();
  const existingByEmail = new Map<string, Promise<string | null>>();
  const existingPartnerIds = new Map<string, string>();
  function existing(email: string) {
    if (!existingByEmail.has(email))
      existingByEmail.set(
        email,
        (async () => {
          const indexRef = db
            .collection(PARTNER_IMPORT_EMAILS_COLLECTION)
            .doc(emailHash(email));
          const index = transaction
            ? await transaction.get(indexRef)
            : await indexRef.get();
          if (index.exists) {
            const data = index.data();
            const parsedId = PartnerIdSchema.safeParse(data?.partnerId);
            if (data?.email !== email || !parsedId.success) {
              throw new AdminRepositoryError(
                "The partner import email index is invalid.",
                409,
              );
            }
            const ref = partners.doc(parsedId.data);
            const target = transaction
              ? await transaction.get(ref)
              : await ref.get();
            if (target.exists && target.data()?.email === email)
              return target.id;
          }
          const query = partners.where("email", "==", email).limit(1);
          const snapshot = transaction
            ? await transaction.get(query)
            : await query.get();
          return snapshot.docs[0]?.id ?? null;
        })(),
      );
    return existingByEmail.get(email)!;
  }
  // At most 200 records are accepted; repeated publisher documents and emails
  // share their reads. All reads finish before the transaction stages any write.
  const duplicateEmails = new Set<string>();
  await Promise.all(
    preview.rows.map(async (row) => {
      if (!row.input) return;
      try {
        const input = { ...row.input };
        if (input.linkedAppId)
          input.linkedAppId = await resolveAppId(
            input.linkedAppId,
            reader,
            transaction,
          );
        const data = await preparePartner(input, reader);
        row.input = {
          ...input,
          linkedOrganizationId: data.linkedOrganizationId,
          linkedIndividualPublisherId: data.linkedIndividualPublisherId,
        };
        prepared.set(row.rowNumber, data);
        const existingId = await existing(input.email);
        if (existingId) {
          duplicateEmails.add(input.email);
          existingPartnerIds.set(input.email, existingId);
        }
      } catch (error) {
        if (!isAdminRepositoryError(error) || error.statusCode !== 400)
          throw error;
        row.status = "invalid";
        row.errors.push(error.message);
      }
    }),
  );
  const seen = new Set<string>();
  for (const row of preview.rows) {
    if (row.status === "invalid" || !row.input) continue;
    const email = row.input.email;
    if (seen.has(email)) {
      row.status = "duplicate";
      row.duplicateReason = "Email appears earlier in this file.";
    } else if (duplicateEmails.has(email)) {
      row.status = "duplicate";
      row.duplicateReason = "A partner with this email already exists.";
    }
    seen.add(email);
  }
  return {
    preview: summarizePartnerCsv(preview.rows),
    prepared,
    existingPartnerIds,
  };
}

export async function previewPartnerCsv(
  context: AdminContext,
  csv: string,
): Promise<PartnerCsvPreview> {
  return (await prepareCsv(context, csv)).preview;
}

export async function importPartnerCsv(
  context: AdminContext,
  csv: string,
  importId: string,
): Promise<PartnerCsvImportResult> {
  requireGodMode(context);
  const parsedId = ImportIdSchema.safeParse(importId);
  if (!parsedId.success)
    throw new AdminRepositoryError("Invalid partner import ID", 400);
  const db = adminDbFor("mydnamap");
  const importRef = db
    .collection(PARTNER_IMPORTS_COLLECTION)
    .doc(parsedId.data.toLowerCase());
  const csvHash = createHash("sha256").update(csv, "utf8").digest("hex");
  return db.runTransaction(async (transaction) => {
    const completed = await transaction.get(importRef);
    if (completed.exists) {
      const prior = StoredImportSchema.parse(completed.data());
      if (prior.csvHash !== csvHash)
        throw new AdminRepositoryError(
          "This import ID was already used for a different CSV file.",
          409,
        );
      return {
        importedCount: prior.importedCount,
        skippedCount: prior.skippedCount,
        partnerIds: prior.partnerIds,
      };
    }
    const { preview, prepared, existingPartnerIds } = await prepareCsv(
      context,
      csv,
      transaction,
    );
    if (preview.summary.invalid) throw new PartnerCsvValidationError(preview);
    const ready = preview.rows.filter((row) => row.status === "ready");
    const partnerIds = ready.map((row) =>
      importedPartnerId(parsedId.data.toLowerCase(), row.input!.email),
    );
    const result = {
      importedCount: ready.length,
      skippedCount: preview.summary.duplicates,
      partnerIds,
    };
    for (const row of ready) {
      transaction.create(
        db
          .collection(CONNECTED_PARTNERS_COLLECTION)
          .doc(
            importedPartnerId(parsedId.data.toLowerCase(), row.input!.email),
          ),
        prepared.get(row.rowNumber)!,
      );
    }
    const indexedEmails = new Set<string>();
    for (const row of preview.rows) {
      const email = row.input!.email;
      if (indexedEmails.has(email)) continue;
      indexedEmails.add(email);
      transaction.set(
        db.collection(PARTNER_IMPORT_EMAILS_COLLECTION).doc(emailHash(email)),
        {
          email,
          partnerId:
            existingPartnerIds.get(email) ??
            importedPartnerId(parsedId.data.toLowerCase(), email),
        },
      );
    }
    transaction.create(importRef, { csvHash, ...result });
    return result;
  });
}
