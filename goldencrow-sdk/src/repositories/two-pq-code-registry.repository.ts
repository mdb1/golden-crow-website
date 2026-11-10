import type { Transaction } from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { AdminRepositoryError } from "./admin-errors.js";

const adminDb = adminDbFor("mydnamap");

export const TWO_PQ_CODE_RESERVATIONS_COLLECTION = "2pq_case_code_reservations";

function normalizedCode(value?: string) {
  const code = value?.trim().toUpperCase();
  if (code && !/^[A-Z]{3}$/.test(code)) {
    throw new AdminRepositoryError("three_letter_code must contain exactly 3 letters.", 400);
  }
  return code;
}

function codeVariants(code: string): string[] {
  return [...code].reduce<string[]>(
    (variants, letter) => variants.flatMap((prefix) => [prefix + letter, prefix + letter.toLowerCase()]),
    [""],
  );
}

function codeConflict(code: string) {
  return new AdminRepositoryError(
    `three_letter_code ${code} has already been used and cannot be assigned to another case.`,
    409,
  );
}

/** Read before any transaction writes, then commit the reservation with the case. */
export async function prepareTwoPQCaseCodeReservation(
  transaction: Transaction,
  value: string | undefined,
  caseId: string,
  actorEmail: string,
): Promise<(() => void) | undefined> {
  const code = normalizedCode(value);
  if (!code) return;

  const reference = adminDb.collection(TWO_PQ_CODE_RESERVATIONS_COLLECTION).doc(code);
  const reservation = await transaction.get(reference);
  if (reservation.exists) {
    if (reservation.data()?.caseId !== caseId) throw codeConflict(code);
    return;
  }

  // Bounded legacy checks protect records created before the registry existed,
  // including archived biopsy forms and report codes left after case deletion.
  const variants = codeVariants(code);
  const legacyLabels = [...variants, ...codeVariants(`${code}XXX`)];
  const labelQueries = [];
  // Each `in` query stays within Firestore's disjunction limit.
  for (let offset = 0; offset < legacyLabels.length; offset += 24) {
    labelQueries.push(adminDb.collection("2pq_case")
      .where("caseLabel", "in", legacyLabels.slice(offset, offset + 24))
      .limit(2));
  }
  const [cases, ...legacyCases] = await Promise.all([
    transaction.get(adminDb.collection("2pq_case").where("three_letter_code", "in", variants).limit(2)),
    ...labelQueries.map((query) => transaction.get(query)),
  ]);
  const caseDocuments = [...cases.docs, ...legacyCases.flatMap((result) => result.docs)];
  if (caseDocuments.some((document) => document.id !== caseId)) throw codeConflict(code);

  const ownsExistingCase = caseDocuments.some((document) => document.id === caseId);
  if (!ownsExistingCase) {
    const [forms, reportCode] = await Promise.all([
      transaction.get(
        adminDb.collection("2pq_forms").where("sampleInformation.boxCode", "in", variants).limit(1),
      ),
      transaction.get(adminDb.collection("report_codes").doc(`${code}XXX`)),
    ]);
    if (!forms.empty || reportCode.exists) throw codeConflict(code);
  }

  return () => {
    transaction.create(reference, {
      code,
      caseId,
      reservedAt: new Date().toISOString(),
      reservedByEmail: actorEmail.trim().toLowerCase(),
    });
  };
}

/** Preserve the old code before an existing case is changed or removed. */
export async function retainTwoPQCaseCode(
  value: string | undefined,
  caseId: string,
  actorEmail: string,
) {
  const code = normalizedCode(value);
  if (!code) return;

  const reference = adminDb.collection(TWO_PQ_CODE_RESERVATIONS_COLLECTION).doc(code);
  await adminDb.runTransaction(async (transaction) => {
    if ((await transaction.get(reference)).exists) return;
    transaction.set(reference, {
      code,
      caseId,
      reservedAt: new Date().toISOString(),
      reservedByEmail: actorEmail.trim().toLowerCase(),
    });
  });
}
