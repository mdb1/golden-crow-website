import { adminDbFor } from "../config/firebase.js";
import {
  TWO_PQ_REPORT_OWNER_EMAIL,
  TWO_PQ_REPORT_OWNER_ID,
} from "../lib/two-pq-report-owner.js";
import {
  createIdempotentStoredFileDocument,
  createStoredFileDocument,
  updateStoredFileDocument,
} from "./file-storage.repository.js";
import { publishStoredFileAsReportCode } from "./reports.repository.js";
import type { TwoPQCaseStatusProgressReporter } from "./two-pq-case-status-operation.repository.js";
import { AdminRepositoryError } from "./admin-errors.js";
import { completeTwoPQCaseServiceTransactionOutput } from "./support-services.repository.js";

const adminDb = adminDbFor("mydnamap");

const CASES_COLLECTION = "2pq_case";
const BATCHES_COLLECTION = "2pq_sequencing";
const SAMPLINGS_COLLECTION = "2pq_sampling";
const INSTITUTIONS_COLLECTION = "institutions";
const DOCTORS_COLLECTION = "doctors";
const PATIENTS_COLLECTION = "patients";
const REPORT_CODES_COLLECTION = "report_codes";
const UPLOADED_REPORTS_COLLECTION = "uploaded_reports";
const REPORT_OWNERS_COLLECTION = "report_owners";

type FirestoreRecord = {
  id: string;
  data: Record<string, unknown>;
};

type TwoPQScopeNames = {
  institutionName: string | null;
  doctorName: string | null;
  patientName: string | null;
};

export interface TwoPQFileStorageSnapshot {
  main_case: {
    id: string;
    download_url: string | null;
    sibling_case_ids: string[];
    parent_batch_id: string | null;
    children_sampling_ids: string[];
    last_updated: string | null;
  };
  entities: {
    batches: Record<string, unknown>[];
    cases: Record<string, unknown>[];
    samplings: Record<string, unknown>[];
  };
}

export type TwoPQCaseAutoSyncResult =
  | {
      status: "skipped";
      caseId: string;
      reason: "case_not_found" | "disabled" | "missing_three_letter_code";
    }
  | {
      status: "synchronized";
      caseId: string;
      storedFileId: string;
      reportCode: string;
      createdStoredFile: boolean;
    };

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function nullableString(value: unknown): string | null {
  return normalizeString(value) ?? null;
}

function normalizeDateValue(value: unknown): string | null {
  const direct = normalizeString(value);
  if (direct) {
    return direct;
  }

  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = value.toDate;
    if (typeof toDate === "function") {
      const date = toDate.call(value);
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  return null;
}

function normalizeCaseStatus(value: unknown) {
  const normalized = normalizeString(value) ?? "";
  const aliases: Record<string, string> = {
    active: "in_transit",
    samples_received_2pq: "samples_received",
    samples_received_by_2pq: "samples_received",
    sample_processing_in_lab: "lab_processing",
    reporting: "bioinformatics",
    bioinformatics_analysis: "bioinformatics",
    delivered: "report_ready",
    report_ready_to_download: "report_ready",
  };

  return aliases[normalized] ?? normalized;
}

function scope(record: FirestoreRecord, names: TwoPQScopeNames) {
  return {
    institutionId: normalizeString(record.data.institutionId) ?? "",
    institutionName: names.institutionName,
    doctorId: normalizeString(record.data.doctorId) ?? "",
    doctorName: names.doctorName,
    patientId: nullableString(record.data.patientId),
    patientName: names.patientName,
  };
}

function timestamps(record: FirestoreRecord) {
  return {
    createdAt: normalizeDateValue(record.data.createdAt),
    updatedAt: normalizeDateValue(record.data.updatedAt),
  };
}

function audit(record: FirestoreRecord) {
  return {
    createdByEmail: nullableString(record.data.createdByEmail),
    updatedByEmail: nullableString(record.data.updatedByEmail),
  };
}

function caseSnapshot(
  record: FirestoreRecord,
  samplingIds: string[],
  scopeNames: TwoPQScopeNames,
) {
  return {
    id: record.id,
    kind: "case",
    download_url: nullableString(record.data.download_url),
    scope: scope(record, scopeNames),
    identity: {
      caseLabel: nullableString(record.data.caseLabel),
    },
    classification: {
      caseType: nullableString(record.data.caseType),
    },
    status: {
      caseStatus: nullableString(normalizeCaseStatus(record.data.caseStatus)),
      priority: nullableString(record.data.priority),
    },
    logistics: {
      trackingNumber: nullableString(record.data.trackingNumber),
      requestedAt: nullableString(record.data.requestedAt),
      dueAt: nullableString(record.data.dueAt),
    },
    relations: {
      batchId: nullableString(record.data.parent_batch ?? record.data.batchId),
      samplingIds,
    },
    notes: nullableString(record.data.notes),
    timestamps: timestamps(record),
    audit: audit(record),
  };
}

function batchSnapshot(record: FirestoreRecord) {
  return {
    id: record.id,
    kind: "batch",
    batchLabel:
      normalizeString(record.data.caseLabel) ??
      normalizeString(record.data.runId) ??
      record.id,
    runId: nullableString(record.data.runId),
    institutionId: nullableString(record.data.institutionId),
    analysisStatus: nullableString(record.data.analysisStatus),
    platform: nullableString(record.data.platform),
    scheduling: nullableString(record.data.scheduling),
    providerName: nullableString(record.data.providerName),
    updatedAt: normalizeDateValue(record.data.updatedAt),
  };
}

function samplingSnapshot(
  record: FirestoreRecord,
  scopeNames: TwoPQScopeNames,
) {
  return {
    id: record.id,
    kind: "sampling",
    scope: scope(record, scopeNames),
    identity: {
      sampleId: nullableString(record.data.sampleId),
      caseLabelSnapshot: nullableString(record.data.caseLabel),
    },
    specimen: {
      sampleType: nullableString(record.data.sampleType),
    },
    status: {
      processingStatus: nullableString(record.data.processingStatus),
      qcStatus: nullableString(record.data.qcStatus),
    },
    dates: {
      collectionDate: nullableString(record.data.collectionDate),
      receptionDate: nullableString(record.data.receptionDate),
      runId: nullableString(record.data.runId),
    },
    relations: {
      caseId: nullableString(record.data.parent_case ?? record.data.caseId),
    },
    notes: nullableString(record.data.notes),
    timestamps: timestamps(record),
    audit: audit(record),
  };
}

async function getRecord(collectionName: string, id: string) {
  const snapshot = await adminDb.collection(collectionName).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return {
    id: snapshot.id,
    data: (snapshot.data() ?? {}) as Record<string, unknown>,
  } satisfies FirestoreRecord;
}

async function getCaseScopeNames(record: FirestoreRecord) {
  const institutionId = normalizeString(record.data.institutionId);
  const doctorId = normalizeString(record.data.doctorId);
  const patientId = normalizeString(record.data.patientId);
  const [institution, doctor, patient] = await Promise.all([
    institutionId
      ? getRecord(INSTITUTIONS_COLLECTION, institutionId)
      : Promise.resolve(null),
    doctorId ? getRecord(DOCTORS_COLLECTION, doctorId) : Promise.resolve(null),
    patientId
      ? getRecord(PATIENTS_COLLECTION, patientId)
      : Promise.resolve(null),
  ]);

  return {
    institutionName: nullableString(institution?.data.name),
    doctorName: nullableString(doctor?.data.fullName),
    patientName: nullableString(patient?.data.fullName),
  } satisfies TwoPQScopeNames;
}

async function getStoredFileIdLinkedToReportCode(reportCode: string) {
  const reportCodeSnapshot = await adminDb
    .collection("report_codes")
    .doc(reportCode)
    .get();
  if (!reportCodeSnapshot.exists) {
    return undefined;
  }

  const uploadedReportId = normalizeString(
    reportCodeSnapshot.data()?.uploaded_report_id,
  );
  if (!uploadedReportId) {
    return undefined;
  }

  const uploadedReportSnapshot = await adminDb
    .collection("uploaded_reports")
    .doc(uploadedReportId)
    .get();
  const linkedFileId = normalizeString(
    uploadedReportSnapshot.data()?.linked_file_id,
  );
  if (!uploadedReportSnapshot.exists || !linkedFileId) {
    return undefined;
  }

  const storedFileSnapshot = await adminDb
    .collection("file_storage")
    .doc(linkedFileId)
    .get();
  return storedFileSnapshot.exists ? linkedFileId : undefined;
}

async function getRecordsByIds(collectionName: string, ids: string[]) {
  const records = await Promise.all(
    uniqueStrings(ids).map((id) => getRecord(collectionName, id)),
  );
  return records.filter((record): record is FirestoreRecord => Boolean(record));
}

async function getRecordsByParent(
  collectionName: string,
  field: "parent_batch" | "parent_case",
  parentId: string,
) {
  const snapshot = await adminDb
    .collection(collectionName)
    .where(field, "==", parentId)
    .get();
  return snapshot.docs.map((document) => ({
    id: document.id,
    data: (document.data() ?? {}) as Record<string, unknown>,
  }));
}

function mergeRecords(records: FirestoreRecord[]) {
  const byId = new Map<string, FirestoreRecord>();
  for (const record of records) {
    byId.set(record.id, record);
  }
  return Array.from(byId.values());
}

function recordSortLabel(record: FirestoreRecord) {
  return (
    normalizeString(record.data.caseLabel) ??
    normalizeString(record.data.sampleId) ??
    normalizeString(record.data.runId) ??
    record.id
  );
}

export async function buildTwoPQCaseFileStorageSnapshot(
  caseId: string,
): Promise<TwoPQFileStorageSnapshot | null> {
  const currentCase = await getRecord(CASES_COLLECTION, caseId);
  if (!currentCase) {
    return null;
  }

  const batchId = normalizeString(
    currentCase.data.parent_batch ?? currentCase.data.batchId,
  );
  const samplingIds = uniqueStrings([
    ...normalizeStringArray(currentCase.data.children_sampling),
    ...normalizeStringArray(currentCase.data.linkedSamplingIds),
  ]);

  const [linkedBatch, samplingsById, samplingsByParent, scopeNames] =
    await Promise.all([
      batchId ? getRecord(BATCHES_COLLECTION, batchId) : Promise.resolve(null),
      getRecordsByIds(SAMPLINGS_COLLECTION, samplingIds),
      getRecordsByParent(SAMPLINGS_COLLECTION, "parent_case", currentCase.id),
      getCaseScopeNames(currentCase),
    ]);
  const linkedSamplings = mergeRecords([
    ...samplingsById,
    ...samplingsByParent,
  ]).sort((left, right) =>
    recordSortLabel(left).localeCompare(recordSortLabel(right)),
  );

  const linkedSamplingIds = linkedSamplings.map((record) => record.id);

  return {
    main_case: {
      id: currentCase.id,
      download_url: nullableString(currentCase.data.download_url),
      sibling_case_ids: [],
      parent_batch_id: batchId ?? null,
      children_sampling_ids: linkedSamplingIds,
      last_updated: normalizeDateValue(currentCase.data.updatedAt),
    },
    entities: {
      batches: linkedBatch ? [batchSnapshot(linkedBatch)] : [],
      cases: [caseSnapshot(currentCase, linkedSamplingIds, scopeNames)],
      samplings: linkedSamplings.map((record) =>
        samplingSnapshot(record, scopeNames),
      ),
    },
  };
}

function isValidEmail(value: string | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

async function reportOwnerForCode(reportCode: string) {
  const reportCodeSnapshot = await adminDb
    .collection(REPORT_CODES_COLLECTION)
    .doc(reportCode)
    .get();
  if (!reportCodeSnapshot.exists) {
    throw new AdminRepositoryError(
      `2PQ report code ${reportCode} must exist before delivering its PDF service output.`,
      409,
    );
  }
  const reportCodeData = reportCodeSnapshot.data() ?? {};
  const directOwnerId = normalizeString(reportCodeData.owner_id);
  const uploadedReportId = normalizeString(reportCodeData.uploaded_report_id);
  const uploadedReportSnapshot = uploadedReportId
    ? await adminDb
        .collection(UPLOADED_REPORTS_COLLECTION)
        .doc(uploadedReportId)
        .get()
    : null;
  const uploadedOwnerId = uploadedReportSnapshot?.exists
    ? normalizeString(uploadedReportSnapshot.data()?.report_owner_id)
    : undefined;
  if (
    directOwnerId &&
    uploadedOwnerId &&
    directOwnerId !== uploadedOwnerId
  ) {
    throw new AdminRepositoryError(
      `2PQ report code ${reportCode} has conflicting owner references.`,
      409,
    );
  }
  const ownerId = directOwnerId ?? uploadedOwnerId;
  if (!ownerId) {
    throw new AdminRepositoryError(
      `2PQ report code ${reportCode} has no report owner.`,
      409,
    );
  }
  if (ownerId !== TWO_PQ_REPORT_OWNER_ID) {
    throw new AdminRepositoryError(
      `2PQ report code ${reportCode} must belong to the canonical 2PQ publisher ${TWO_PQ_REPORT_OWNER_ID}.`,
      409,
    );
  }
  const reportOwnerSnapshot = await adminDb
    .collection(REPORT_OWNERS_COLLECTION)
    .doc(ownerId)
    .get();
  const ownerEmail =
    normalizeString(reportOwnerSnapshot.data()?.owner_contact_email)?.toLowerCase() ??
    TWO_PQ_REPORT_OWNER_EMAIL;
  if (!isValidEmail(ownerEmail)) {
    throw new AdminRepositoryError(
      `2PQ report owner ${ownerId} must have a valid contact email.`,
      409,
    );
  }
  return { ownerId, ownerEmail };
}

function twoPQPdfOutputFileId(caseId: string) {
  const normalizedCaseId = caseId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `pgo_2pq_${normalizedCaseId}_pdf_report`;
}

async function completeTwoPQCaseServiceOutputIfReady(
  caseRecord: FirestoreRecord,
  reportCode: string,
  actorEmail?: string,
) {
  const caseStatus = normalizeCaseStatus(caseRecord.data.caseStatus);
  const downloadUrl = normalizeString(caseRecord.data.download_url);
  if (caseStatus !== "report_ready" || !downloadUrl) {
    return { status: "not_ready" as const };
  }
  let parsedDownloadUrl: URL;
  try {
    parsedDownloadUrl = new URL(downloadUrl);
  } catch {
    throw new AdminRepositoryError(
      "The completed 2PQ case must contain a valid report download URL.",
      400,
    );
  }
  if (parsedDownloadUrl.protocol !== "https:") {
    throw new AdminRepositoryError(
      "The completed 2PQ case report download URL must use HTTPS.",
      400,
    );
  }
  const doctorId = normalizeString(caseRecord.data.doctorId);
  if (!doctorId) {
    throw new AdminRepositoryError(
      "The completed 2PQ case must reference its requesting doctor.",
      409,
    );
  }
  const doctorSnapshot = await adminDb
    .collection(DOCTORS_COLLECTION)
    .doc(doctorId)
    .get();
  const doctorEmail = normalizeString(
    doctorSnapshot.data()?.authEmail,
  )?.toLowerCase();
  if (!doctorSnapshot.exists || !isValidEmail(doctorEmail)) {
    throw new AdminRepositoryError(
      "The completed 2PQ case doctor must have a valid email.",
      409,
    );
  }

  const reportOwner = await reportOwnerForCode(reportCode);
  const title = `Informe PGT ${reportCode}`;
  const fileStorageId = twoPQPdfOutputFileId(caseRecord.id);
  await createIdempotentStoredFileDocument(fileStorageId, {
    file_name: title,
    creator_email: reportOwner.ownerEmail,
    file_type: "pgo_pdf_report",
    file_content: JSON.stringify({
      title,
      download_url: downloadUrl,
    }),
  });
  const completion = await completeTwoPQCaseServiceTransactionOutput({
    caseId: caseRecord.id,
    doctorEmail: doctorEmail!,
    fileStorageId,
    reportOwnerId: reportOwner.ownerId,
    actorEmail: actorEmail ?? reportOwner.ownerEmail,
  });
  return {
    status: completion.status,
    fileStorageId,
    serviceTransactionId: completion.transaction.requestId,
  };
}

export async function synchronizeTwoPQCaseFilesAndCodes(
  caseId: string,
  actorEmail?: string,
  reportProgress?: TwoPQCaseStatusProgressReporter,
): Promise<TwoPQCaseAutoSyncResult> {
  const caseRecord = await getRecord(CASES_COLLECTION, caseId);
  if (!caseRecord) {
    await reportProgress?.({
      step: "file_storage",
      status: "skipped",
      detail: "Case not found; File Storage was not synchronized.",
    });
    await reportProgress?.({
      step: "report_code",
      status: "skipped",
      detail: "Case not found; the report code was not synchronized.",
    });
    return { status: "skipped", caseId, reason: "case_not_found" };
  }

  const threeLetterCode = normalizeString(
    caseRecord.data.three_letter_code,
  )?.toUpperCase();
  if (!threeLetterCode || !/^[A-Z]{3}$/.test(threeLetterCode)) {
    await reportProgress?.({
      step: "file_storage",
      status: "skipped",
      detail: "The case has no valid three-letter code.",
    });
    await reportProgress?.({
      step: "report_code",
      status: "skipped",
      detail: "The case has no valid three-letter code.",
    });
    return { status: "skipped", caseId, reason: "missing_three_letter_code" };
  }

  const reportCode = `${threeLetterCode}XXX`;
  if (caseRecord.data.should_automatically_sync_files_and_codes === false) {
    await reportProgress?.({
      step: "file_storage",
      status: "skipped",
      detail: "Automatic file and report-code synchronization is disabled.",
    });
    await reportProgress?.({
      step: "report_code",
      status: "skipped",
      detail: "Automatic file and report-code synchronization is disabled.",
    });
    await completeTwoPQCaseServiceOutputIfReady(
      caseRecord,
      reportCode,
      actorEmail,
    );
    return { status: "skipped", caseId, reason: "disabled" };
  }

  await reportProgress?.({
    step: "file_storage",
    status: "running",
    detail: "Building and saving the current case snapshot.",
  });
  const snapshot = await buildTwoPQCaseFileStorageSnapshot(caseId);
  if (!snapshot) {
    await reportProgress?.({
      step: "file_storage",
      status: "skipped",
      detail: "Case not found; File Storage was not synchronized.",
    });
    await reportProgress?.({
      step: "report_code",
      status: "skipped",
      detail: "Case not found; the report code was not synchronized.",
    });
    return { status: "skipped", caseId, reason: "case_not_found" };
  }

  const fileContent = JSON.stringify(snapshot, null, 2);
  const previousStoredFileId = normalizeString(caseRecord.data.stored_file_id);
  const reportLinkedStoredFileId = await getStoredFileIdLinkedToReportCode(
    reportCode,
  );
  let storedFileId = reportLinkedStoredFileId ?? previousStoredFileId;
  let createdStoredFile = false;
  let storedFileUpdated = false;

  if (storedFileId) {
    const updateResult = await updateStoredFileDocument(storedFileId, {
      file_name: reportCode,
      file_type: "2pq",
      file_content: fileContent,
    });
    if (!updateResult.document) {
      storedFileId = undefined;
    } else {
      storedFileUpdated = true;
    }
  }

  if (storedFileId && !storedFileUpdated) {
    const updateResult = await updateStoredFileDocument(storedFileId, {
      file_name: reportCode,
      file_type: "2pq",
      file_content: fileContent,
    });
    if (!updateResult.document) {
      storedFileId = undefined;
    }
  }

  if (!storedFileId) {
    const created = await createStoredFileDocument({
      file_name: reportCode,
      creator_email: isValidEmail(actorEmail)
        ? actorEmail!.trim().toLowerCase()
        : TWO_PQ_REPORT_OWNER_EMAIL,
      file_type: "2pq",
      file_content: fileContent,
    });
    storedFileId = created.document.id;
    createdStoredFile = true;
  }

  if (storedFileId !== previousStoredFileId) {
    await adminDb.collection(CASES_COLLECTION).doc(caseId).set(
      { stored_file_id: storedFileId },
      { merge: true },
    );
  }

  await reportProgress?.({
    step: "file_storage",
    status: "success",
    detail: `File Storage ${storedFileId} is up to date.`,
  });
  await reportProgress?.({
    step: "report_code",
    status: "running",
    detail: `Publishing ${reportCode} from the updated stored file.`,
  });
  await publishStoredFileAsReportCode({
    fileId: storedFileId,
    reportCode,
  });
  await completeTwoPQCaseServiceOutputIfReady(
    caseRecord,
    reportCode,
    actorEmail,
  );
  await reportProgress?.({
    step: "report_code",
    status: "success",
    detail: `Report code ${reportCode} and any ready PDF service output are up to date.`,
  });

  return {
    status: "synchronized",
    caseId,
    storedFileId,
    reportCode,
    createdStoredFile,
  };
}

export async function synchronizeTwoPQCasesFilesAndCodes(
  caseIds: Array<string | null | undefined>,
  actorEmail?: string,
  reportProgress?: TwoPQCaseStatusProgressReporter,
) {
  const results: TwoPQCaseAutoSyncResult[] = [];
  const uniqueCaseIds = uniqueStrings(caseIds);
  for (const caseId of uniqueCaseIds) {
    results.push(
      await synchronizeTwoPQCaseFilesAndCodes(
        caseId,
        actorEmail,
        uniqueCaseIds.length === 1 ? reportProgress : undefined,
      ),
    );
  }
  return results;
}
