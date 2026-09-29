import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { adminDbFor } from "../config/firebase.js";
import { isGlobalAdminRole } from "../lib/admin-roles.js";
import type { AdminContext } from "../types/sdk.types.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { deleteTwoPQCaseServiceTransactionForCleanup } from "./support-services.repository.js";
import { deleteTwoPQRecordForContext } from "./two-pq.repository.js";

const adminDb = adminDbFor("mydnamap");

const CASES_COLLECTION = "2pq_case";
const SAMPLINGS_COLLECTION = "2pq_sampling";
const FORMS_COLLECTION = "2pq_forms";
const STATUS_OPERATIONS_COLLECTION = "2pq_case_status_operations";
const SERVICE_TRANSACTIONS_COLLECTION = "service_transactions";
const OBJECT_CODES_COLLECTION = "object_codes";
const UPLOADED_OBJECTS_COLLECTION = "uploaded_objects";
const REPORT_CODES_COLLECTION = "report_codes";
const UPLOADED_REPORTS_COLLECTION = "uploaded_reports";
const FILE_STORAGE_COLLECTION = "file_storage";
const COMMUNITY_USERS_COLLECTION = "community_users";
const TWO_PQ_PROVIDER_ID = "kfFtJlLuyW6deXW2Im3S";
const MAX_RELATED_DOCUMENTS = 100;

export const TWO_PQ_CASE_DELETION_STEPS = [
  "form_links",
  "samplings",
  "service_transaction",
  "files_and_codes",
  "case",
] as const;

export type TwoPQCaseDeletionStep =
  (typeof TWO_PQ_CASE_DELETION_STEPS)[number];
export type TwoPQCaseDeletionScope = "case" | "related";

export interface TwoPQCaseDeletionStepResult {
  step: TwoPQCaseDeletionStep;
  status: "deleted" | "not_found";
  deletedCount: number;
  message: string;
  details?: string[];
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => cleanString(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : [];
}

function requireCaseCleanupAccess(context: AdminContext) {
  if (!isGlobalAdminRole(context.role)) {
    throw new AdminRepositoryError(
      "Only full admins and 2PQ admins can run the staged case cleanup.",
      403,
    );
  }
}

async function caseDocument(caseId: string) {
  const normalizedCaseId = cleanString(caseId);
  if (!normalizedCaseId || normalizedCaseId.includes("/")) {
    throw new AdminRepositoryError("A valid 2PQ case id is required.", 400);
  }
  const snapshot = await adminDb
    .collection(CASES_COLLECTION)
    .doc(normalizedCaseId)
    .get();
  if (!snapshot.exists) {
    throw new AdminRepositoryError("2PQ case not found.", 404);
  }
  return {
    id: snapshot.id,
    data: (snapshot.data() ?? {}) as Record<string, unknown>,
  };
}

function twoPQTransactionId(caseId: string) {
  const normalizedCaseId = caseId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `pgr_2pq_${normalizedCaseId}`;
}

function twoPQPdfFileId(caseId: string) {
  const normalizedCaseId = caseId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `pgo_2pq_${normalizedCaseId}_pdf_report`;
}

function reportCodeForCase(data: Record<string, unknown>) {
  const threeLetterCode = cleanString(data.three_letter_code).toUpperCase();
  return /^[A-Z]{3}$/.test(threeLetterCode)
    ? `${threeLetterCode}XXX`
    : "";
}

async function linkedSamplingIds(caseId: string, data: Record<string, unknown>) {
  const snapshot = await adminDb
    .collection(SAMPLINGS_COLLECTION)
    .where("parent_case", "==", caseId)
    .limit(MAX_RELATED_DOCUMENTS + 1)
    .get();
  if (snapshot.docs.length > MAX_RELATED_DOCUMENTS) {
    throw new AdminRepositoryError(
      `Case ${caseId} has too many linked samplings to clean up safely in one operation.`,
      409,
    );
  }
  return Array.from(
    new Set([
      ...stringArray(data.children_sampling),
      ...stringArray(data.linkedSamplingIds),
      ...snapshot.docs.map((document) => document.id),
    ]),
  );
}

async function matchingFormDocuments(caseId: string) {
  const forms = new Map<
    string,
    { ref: DocumentReference; data: Record<string, unknown> }
  >();
  const queries = [
    adminDb.collection(FORMS_COLLECTION).where("selectedCaseId", "==", caseId),
    adminDb.collection(FORMS_COLLECTION).where("linkedCaseId", "==", caseId),
    adminDb
      .collection(FORMS_COLLECTION)
      .where("linkedCaseIds", "array-contains", caseId),
  ];

  for (const query of queries) {
    const snapshot = await query.limit(MAX_RELATED_DOCUMENTS + 1).get();
    if (snapshot.docs.length > MAX_RELATED_DOCUMENTS) {
      throw new AdminRepositoryError(
        `Case ${caseId} is linked to too many 2PQ forms to clean up safely in one operation.`,
        409,
      );
    }
    for (const document of snapshot.docs) {
      forms.set(document.id, {
        ref: document.ref,
        data: (document.data() ?? {}) as Record<string, unknown>,
      });
    }
  }

  return [...forms.values()];
}

async function deleteFormLinksAndOperations(
  context: AdminContext,
  caseId: string,
  data: Record<string, unknown>,
): Promise<TwoPQCaseDeletionStepResult> {
  const samplingIds = await linkedSamplingIds(caseId, data);
  const [forms, operationSnapshot] = await Promise.all([
    matchingFormDocuments(caseId),
    adminDb
      .collection(STATUS_OPERATIONS_COLLECTION)
      .where("caseId", "==", caseId)
      .limit(MAX_RELATED_DOCUMENTS + 1)
      .get(),
  ]);
  if (operationSnapshot.docs.length > MAX_RELATED_DOCUMENTS) {
    throw new AdminRepositoryError(
      `Case ${caseId} has too many status-operation logs to clean up safely in one operation.`,
      409,
    );
  }

  const now = new Date().toISOString();
  const batch = adminDb.batch();
  for (const form of forms) {
    const update: Record<string, unknown> = {
      updatedAt: now,
      updatedByEmail: context.email,
    };
    if (cleanString(form.data.selectedCaseId) === caseId) {
      update.selectedCaseId = null;
    }
    if (cleanString(form.data.linkedCaseId) === caseId) {
      update.linkedCaseId = null;
    }
    if (stringArray(form.data.linkedCaseIds).includes(caseId)) {
      update.linkedCaseIds = FieldValue.arrayRemove(caseId);
    }
    const linkedSamplingIdsInForm = stringArray(form.data.linkedSamplingIds);
    const samplingIdsToRemove = samplingIds.filter((id) =>
      linkedSamplingIdsInForm.includes(id),
    );
    if (samplingIdsToRemove.length > 0) {
      update.linkedSamplingIds = FieldValue.arrayRemove(
        ...samplingIdsToRemove,
      );
    }
    batch.set(form.ref, update, { merge: true });
  }
  for (const operation of operationSnapshot.docs) {
    batch.delete(operation.ref);
  }
  if (forms.length > 0 || operationSnapshot.docs.length > 0) {
    await batch.commit();
  }

  const changedCount = forms.length + operationSnapshot.docs.length;
  return {
    step: "form_links",
    status: changedCount > 0 ? "deleted" : "not_found",
    deletedCount: changedCount,
    message:
      changedCount > 0
        ? `Detached ${forms.length} form link(s) and deleted ${operationSnapshot.docs.length} case-status operation log(s).`
        : "No linked forms or case-status operation logs were available.",
    details: [
      `${forms.length} form link(s) detached`,
      `${operationSnapshot.docs.length} status-operation log(s) deleted`,
    ],
  };
}

async function deleteSamplingDocuments(
  caseId: string,
  data: Record<string, unknown>,
): Promise<TwoPQCaseDeletionStepResult> {
  const samplingIds = await linkedSamplingIds(caseId, data);
  let deletedCount = 0;
  for (const samplingId of samplingIds) {
    const reference = adminDb.collection(SAMPLINGS_COLLECTION).doc(samplingId);
    const snapshot = await reference.get();
    if (!snapshot.exists) {
      continue;
    }
    const samplingData = snapshot.data() ?? {};
    if (
      cleanString(samplingData.parent_case) !== caseId &&
      cleanString(samplingData.caseId) !== caseId
    ) {
      throw new AdminRepositoryError(
        `Sampling ${samplingId} no longer belongs to case ${caseId}.`,
        409,
      );
    }
    await reference.delete();
    deletedCount += 1;
  }

  return {
    step: "samplings",
    status: deletedCount > 0 ? "deleted" : "not_found",
    deletedCount,
    message:
      deletedCount > 0
        ? `Deleted ${deletedCount} sampling record(s) linked to case ${caseId}.`
        : "No linked sampling records were available.",
  };
}

async function deleteServiceTransactionArtifacts(
  context: AdminContext,
  caseId: string,
): Promise<TwoPQCaseDeletionStepResult> {
  const transactionId = twoPQTransactionId(caseId);
  const transactionSnapshot = await adminDb
    .collection(SERVICE_TRANSACTIONS_COLLECTION)
    .doc(transactionId)
    .get();
  const uploadedObjectsSnapshot = await adminDb
    .collection(UPLOADED_OBJECTS_COLLECTION)
    .where("service_transaction_id", "==", transactionId)
    .limit(21)
    .get();
  if (uploadedObjectsSnapshot.docs.length > 20) {
    throw new AdminRepositoryError(
      `Service transaction ${transactionId} has too many output objects to clean up safely.`,
      409,
    );
  }

  const uploadedObjectById = new Map<string, DocumentSnapshot>(
    uploadedObjectsSnapshot.docs.map((document) => [document.id, document]),
  );
  const codeRefs = new Map<string, DocumentReference>();
  const validatedObjectCodes = new Set<string>();
  const outputCodes = transactionSnapshot.exists
    ? (Array.isArray(transactionSnapshot.data()?.outputObjects)
        ? (transactionSnapshot.data()?.outputObjects as unknown[])
        : [])
        .map((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? cleanString((entry as Record<string, unknown>).objectCode)
            : "",
        )
        .filter(Boolean)
    : [];

  for (const objectCode of outputCodes) {
    const codeRef = adminDb
      .collection(OBJECT_CODES_COLLECTION)
      .doc(objectCode);
    const codeSnapshot = await codeRef.get();
    const uploadedObjectId = cleanString(
      codeSnapshot.data()?.uploaded_object_id,
    );
    if (codeSnapshot.exists) {
      codeRefs.set(codeRef.path, codeRef);
      validatedObjectCodes.add(objectCode);
    }
    if (codeSnapshot.exists && uploadedObjectId) {
      const objectSnapshot = await adminDb
        .collection(UPLOADED_OBJECTS_COLLECTION)
        .doc(uploadedObjectId)
        .get();
      if (objectSnapshot.exists) {
        uploadedObjectById.set(objectSnapshot.id, objectSnapshot);
      }
    }
  }

  const objectRefs: DocumentReference[] = [];
  const fileRefs = new Map<string, DocumentReference>();
  const ownerObjectIds = new Map<string, string[]>();
  for (const objectSnapshot of uploadedObjectById.values()) {
    const objectData = objectSnapshot.data() ?? {};
    if (cleanString(objectData.service_transaction_id) !== transactionId) {
      throw new AdminRepositoryError(
        `Uploaded object ${objectSnapshot.id} is not owned by service transaction ${transactionId}.`,
        409,
      );
    }
    const objectCode = cleanString(objectData.object_code);
    if (!objectCode) {
      throw new AdminRepositoryError(
        `Uploaded object ${objectSnapshot.id} has no object code.`,
        409,
      );
    }
    const codeRef = adminDb.collection(OBJECT_CODES_COLLECTION).doc(objectCode);
    const codeSnapshot = await codeRef.get();
    if (
      codeSnapshot.exists &&
      cleanString(codeSnapshot.data()?.uploaded_object_id) !== objectSnapshot.id
    ) {
      throw new AdminRepositoryError(
        `Object code ${objectCode} points to another uploaded object.`,
        409,
      );
    }
    validatedObjectCodes.add(objectCode);
    if (codeSnapshot.exists) {
      codeRefs.set(codeRef.path, codeRef);
    }
    objectRefs.push(objectSnapshot.ref);

    const linkedFileId = cleanString(objectData.linked_file_id);
    if (linkedFileId) {
      const fileRef = adminDb.collection(FILE_STORAGE_COLLECTION).doc(linkedFileId);
      const fileSnapshot = await fileRef.get();
      if (
        fileSnapshot.exists &&
        cleanString(fileSnapshot.data()?.linked_object_code) !== objectCode
      ) {
        throw new AdminRepositoryError(
          `Stored file ${linkedFileId} no longer belongs to object code ${objectCode}.`,
          409,
        );
      }
      if (fileSnapshot.exists) {
        fileRefs.set(fileRef.path, fileRef);
      }
    }

    const ownerId = cleanString(objectData.object_owner_id);
    if (ownerId) {
      ownerObjectIds.set(ownerId, [
        ...(ownerObjectIds.get(ownerId) ?? []),
        objectSnapshot.id,
      ]);
    }
  }

  const deterministicFileRef = adminDb
    .collection(FILE_STORAGE_COLLECTION)
    .doc(twoPQPdfFileId(caseId));
  const deterministicFileSnapshot = await deterministicFileRef.get();
  if (deterministicFileSnapshot.exists) {
    const fileData = deterministicFileSnapshot.data() ?? {};
    if (
      cleanString(fileData.file_type) !== "pgo_pdf_report" ||
      (cleanString(fileData.provider_id) &&
        cleanString(fileData.provider_id) !== TWO_PQ_PROVIDER_ID)
    ) {
      throw new AdminRepositoryError(
        `Deterministic PDF file ${deterministicFileRef.id} does not match case ${caseId}.`,
        409,
      );
    }
    const linkedObjectCode = cleanString(fileData.linked_object_code);
    if (linkedObjectCode && !validatedObjectCodes.has(linkedObjectCode)) {
      throw new AdminRepositoryError(
        `Deterministic PDF file ${deterministicFileRef.id} is linked to an object outside the case transaction.`,
        409,
      );
    }
    fileRefs.set(deterministicFileRef.path, deterministicFileRef);
  }

  const batch = adminDb.batch();
  for (const reference of codeRefs.values()) batch.delete(reference);
  for (const reference of objectRefs) batch.delete(reference);
  for (const reference of fileRefs.values()) batch.delete(reference);
  for (const [ownerId, uploadedObjectIds] of ownerObjectIds) {
    const ownerRef = adminDb
      .collection(COMMUNITY_USERS_COLLECTION)
      .doc(ownerId);
    const ownerSnapshot = await ownerRef.get();
    if (ownerSnapshot.exists) {
      batch.set(
        ownerRef,
        {
          owned_objects: FieldValue.arrayRemove(...uploadedObjectIds),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }
  const artifactCount =
    codeRefs.size + objectRefs.length + fileRefs.size;
  if (artifactCount > 0) {
    await batch.commit();
  }

  const transactionResult =
    await deleteTwoPQCaseServiceTransactionForCleanup(context, caseId);
  const deletedCount =
    artifactCount + (transactionResult.status === "deleted" ? 1 : 0);
  return {
    step: "service_transaction",
    status: deletedCount > 0 ? "deleted" : "not_found",
    deletedCount,
    message:
      deletedCount > 0
        ? `Deleted the case service transaction and ${artifactCount} PDF output artifact(s).`
        : "No case service transaction or PDF output artifacts were available.",
    details: [
      `${objectRefs.length} uploaded object(s) deleted`,
      `${codeRefs.size} object code(s) deleted`,
      `${fileRefs.size} PDF stored file(s) deleted`,
      ...transactionResult.cleanupWarnings,
    ],
  };
}

function assertCaseSnapshotFile(
  caseId: string,
  fileId: string,
  data: Record<string, unknown>,
) {
  if (cleanString(data.file_type) !== "2pq") {
    throw new AdminRepositoryError(
      `Stored file ${fileId} is not a 2PQ case snapshot.`,
      409,
    );
  }
  const fileContent = cleanString(data.file_content);
  try {
    const parsed = JSON.parse(fileContent) as Record<string, unknown>;
    const mainCase =
      parsed.main_case &&
      typeof parsed.main_case === "object" &&
      !Array.isArray(parsed.main_case)
        ? (parsed.main_case as Record<string, unknown>)
        : null;
    if (cleanString(mainCase?.id) !== caseId) {
      throw new Error("case mismatch");
    }
  } catch {
    throw new AdminRepositoryError(
      `Stored file ${fileId} does not contain the snapshot for case ${caseId}.`,
      409,
    );
  }
}

async function deleteCaseFilesAndCodes(
  caseId: string,
  data: Record<string, unknown>,
): Promise<TwoPQCaseDeletionStepResult> {
  const reportCode = reportCodeForCase(data);
  const storedFileIds = new Set<string>();
  const directStoredFileId = cleanString(data.stored_file_id);
  if (directStoredFileId) storedFileIds.add(directStoredFileId);

  const reportCodeRef = reportCode
    ? adminDb.collection(REPORT_CODES_COLLECTION).doc(reportCode)
    : null;
  const reportCodeSnapshot = reportCodeRef
    ? await reportCodeRef.get()
    : null;
  const uploadedReportId = cleanString(
    reportCodeSnapshot?.data()?.uploaded_report_id,
  );
  const uploadedReportRef = uploadedReportId
    ? adminDb.collection(UPLOADED_REPORTS_COLLECTION).doc(uploadedReportId)
    : null;
  const uploadedReportSnapshot = uploadedReportRef
    ? await uploadedReportRef.get()
    : null;
  if (uploadedReportSnapshot?.exists) {
    const uploadedReportData = uploadedReportSnapshot.data() ?? {};
    if (
      cleanString(uploadedReportData.report_code) &&
      cleanString(uploadedReportData.report_code) !== reportCode
    ) {
      throw new AdminRepositoryError(
        `Uploaded report ${uploadedReportId} no longer belongs to ${reportCode}.`,
        409,
      );
    }
    const linkedFileId = cleanString(uploadedReportData.linked_file_id);
    if (linkedFileId) storedFileIds.add(linkedFileId);
  }
  if (storedFileIds.size > 1) {
    throw new AdminRepositoryError(
      `Case ${caseId} points to conflicting report snapshot files.`,
      409,
    );
  }

  const storedFileRefs: DocumentReference[] = [];
  for (const fileId of storedFileIds) {
    const reference = adminDb.collection(FILE_STORAGE_COLLECTION).doc(fileId);
    const snapshot = await reference.get();
    if (snapshot.exists) {
      assertCaseSnapshotFile(caseId, fileId, snapshot.data() ?? {});
      storedFileRefs.push(reference);
    }
  }

  const batch = adminDb.batch();
  if (reportCodeSnapshot?.exists && reportCodeRef) batch.delete(reportCodeRef);
  if (uploadedReportSnapshot?.exists && uploadedReportRef) {
    batch.delete(uploadedReportRef);
    const ownerId =
      cleanString(uploadedReportSnapshot.data()?.report_owner_id) ||
      cleanString(reportCodeSnapshot?.data()?.owner_id);
    if (ownerId) {
      const ownerRef = adminDb
        .collection(COMMUNITY_USERS_COLLECTION)
        .doc(ownerId);
      const ownerSnapshot = await ownerRef.get();
      if (ownerSnapshot.exists) {
        batch.set(
          ownerRef,
          {
            owned_reports: FieldValue.arrayRemove(uploadedReportId),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }
  }
  for (const reference of storedFileRefs) batch.delete(reference);

  const deletedCount =
    (reportCodeSnapshot?.exists ? 1 : 0) +
    (uploadedReportSnapshot?.exists ? 1 : 0) +
    storedFileRefs.length;
  if (deletedCount > 0) {
    await batch.commit();
  }
  return {
    step: "files_and_codes",
    status: deletedCount > 0 ? "deleted" : "not_found",
    deletedCount,
    message:
      deletedCount > 0
        ? `Deleted ${deletedCount} case snapshot, report, and code artifact(s).`
        : "No case snapshot, uploaded report, or report code was available.",
    details: [
      `${storedFileRefs.length} 2PQ snapshot file(s) deleted`,
      `${reportCodeSnapshot?.exists ? 1 : 0} report code(s) deleted`,
      `${uploadedReportSnapshot?.exists ? 1 : 0} uploaded report(s) deleted`,
    ],
  };
}

export async function deleteTwoPQCaseStepForContext(
  context: AdminContext,
  caseId: string,
  scope: TwoPQCaseDeletionScope,
  step: TwoPQCaseDeletionStep,
): Promise<TwoPQCaseDeletionStepResult> {
  requireCaseCleanupAccess(context);
  const currentCase = await caseDocument(caseId);

  if (scope === "case" && step !== "case") {
    throw new AdminRepositoryError(
      `Cleanup step ${step} is not available when deleting only the case.`,
      400,
    );
  }
  if (step === "form_links") {
    return deleteFormLinksAndOperations(
      context,
      currentCase.id,
      currentCase.data,
    );
  }
  if (step === "samplings") {
    return deleteSamplingDocuments(currentCase.id, currentCase.data);
  }
  if (step === "service_transaction") {
    return deleteServiceTransactionArtifacts(context, currentCase.id);
  }
  if (step === "files_and_codes") {
    return deleteCaseFilesAndCodes(currentCase.id, currentCase.data);
  }

  const deletion = await deleteTwoPQRecordForContext(
    context,
    "cases",
    currentCase.id,
    { deleteLinkedSamplings: scope === "related" },
  );
  const relatedSamplingCount =
    deletion.deletedLinkedSamplingIds?.length ??
    deletion.unlinkedSamplingIds?.length ??
    0;
  return {
    step: "case",
    status: "deleted",
    deletedCount: 1,
    message:
      scope === "related"
        ? `Deleted case ${currentCase.id} after its related cleanup completed.`
        : `Deleted only case ${currentCase.id}; ${relatedSamplingCount} sampling record(s) were preserved and unlinked.`,
    details:
      scope === "case"
        ? [
            `${relatedSamplingCount} sampling record(s) preserved`,
            "Files, codes, forms, and the service transaction were preserved",
          ]
        : undefined,
  };
}
