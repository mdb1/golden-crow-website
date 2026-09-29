import { adminDbFor } from "../config/firebase.js";
import { TWO_PQ_REPORT_OWNER_EMAIL } from "../lib/two-pq-report-owner.js";
import {
  createStoredFileDocument,
  updateStoredFileDocument,
} from "./file-storage.repository.js";
import { publishStoredFileAsReportCode } from "./reports.repository.js";

const adminDb = adminDbFor("mydnamap");

const CASES_COLLECTION = "2pq_case";
const BATCHES_COLLECTION = "2pq_sequencing";
const SAMPLINGS_COLLECTION = "2pq_sampling";

type FirestoreRecord = {
  id: string;
  data: Record<string, unknown>;
};

export interface TwoPQFileStorageSnapshot {
  main_case: {
    id: string;
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

function scope(record: FirestoreRecord) {
  return {
    institutionId: normalizeString(record.data.institutionId) ?? "",
    doctorId: normalizeString(record.data.doctorId) ?? "",
    patientId: nullableString(record.data.patientId),
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

function caseSnapshot(record: FirestoreRecord, samplingIds: string[]) {
  return {
    id: record.id,
    kind: "case",
    scope: scope(record),
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

function batchSnapshot(record: FirestoreRecord, caseIds: string[]) {
  return {
    id: record.id,
    kind: "batch",
    scope: scope(record),
    identity: {
      batchLabel:
        normalizeString(record.data.caseLabel) ??
        normalizeString(record.data.runId) ??
        record.id,
      runId: nullableString(record.data.runId),
    },
    status: {
      analysisStatus: nullableString(record.data.analysisStatus),
    },
    execution: {
      platform: nullableString(record.data.platform),
      scheduling: nullableString(record.data.scheduling),
      providerName: nullableString(record.data.providerName),
      providerFormat: nullableString(record.data.providerFormat),
      contactName: nullableString(record.data.contactName),
      contactEmail: nullableString(record.data.contactEmail),
      phoneNumber: nullableString(record.data.phoneNumber),
    },
    relations: { caseIds },
    notes: nullableString(record.data.notes),
    timestamps: timestamps(record),
    audit: audit(record),
  };
}

function samplingSnapshot(record: FirestoreRecord) {
  return {
    id: record.id,
    kind: "sampling",
    scope: scope(record),
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

  const [linkedBatch, samplingsById, samplingsByParent] = await Promise.all([
    batchId ? getRecord(BATCHES_COLLECTION, batchId) : Promise.resolve(null),
    getRecordsByIds(SAMPLINGS_COLLECTION, samplingIds),
    getRecordsByParent(SAMPLINGS_COLLECTION, "parent_case", currentCase.id),
  ]);
  const linkedSamplings = mergeRecords([
    ...samplingsById,
    ...samplingsByParent,
  ]).sort((left, right) =>
    recordSortLabel(left).localeCompare(recordSortLabel(right)),
  );

  let siblingCases: FirestoreRecord[] = [];
  if (linkedBatch) {
    const batchCaseIds = uniqueStrings([
      ...normalizeStringArray(linkedBatch.data.children_cases),
      ...normalizeStringArray(linkedBatch.data.linkedCaseIds),
    ]);
    const [casesById, casesByParent] = await Promise.all([
      getRecordsByIds(CASES_COLLECTION, batchCaseIds),
      getRecordsByParent(CASES_COLLECTION, "parent_batch", linkedBatch.id),
    ]);
    siblingCases = mergeRecords([...casesById, ...casesByParent])
      .filter((record) => record.id !== currentCase.id)
      .sort((left, right) =>
        recordSortLabel(left).localeCompare(recordSortLabel(right)),
      );
  }

  const linkedSamplingIds = linkedSamplings.map((record) => record.id);
  const allCases = [currentCase, ...siblingCases];
  const allCaseIds = allCases.map((record) => record.id);

  return {
    main_case: {
      id: currentCase.id,
      sibling_case_ids: siblingCases.map((record) => record.id),
      parent_batch_id: batchId ?? null,
      children_sampling_ids: linkedSamplingIds,
      last_updated: normalizeDateValue(currentCase.data.updatedAt),
    },
    entities: {
      batches: linkedBatch ? [batchSnapshot(linkedBatch, allCaseIds)] : [],
      cases: allCases.map((record) =>
        caseSnapshot(
          record,
          record.id === currentCase.id
            ? linkedSamplingIds
            : uniqueStrings([
                ...normalizeStringArray(record.data.children_sampling),
                ...normalizeStringArray(record.data.linkedSamplingIds),
              ]),
        ),
      ),
      samplings: linkedSamplings.map(samplingSnapshot),
    },
  };
}

function isValidEmail(value: string | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export async function synchronizeTwoPQCaseFilesAndCodes(
  caseId: string,
  actorEmail?: string,
): Promise<TwoPQCaseAutoSyncResult> {
  const caseRecord = await getRecord(CASES_COLLECTION, caseId);
  if (!caseRecord) {
    return { status: "skipped", caseId, reason: "case_not_found" };
  }

  if (caseRecord.data.should_automatically_sync_files_and_codes === false) {
    return { status: "skipped", caseId, reason: "disabled" };
  }

  const threeLetterCode = normalizeString(
    caseRecord.data.three_letter_code,
  )?.toUpperCase();
  if (!threeLetterCode || !/^[A-Z]{3}$/.test(threeLetterCode)) {
    return { status: "skipped", caseId, reason: "missing_three_letter_code" };
  }

  const snapshot = await buildTwoPQCaseFileStorageSnapshot(caseId);
  if (!snapshot) {
    return { status: "skipped", caseId, reason: "case_not_found" };
  }

  const reportCode = `${threeLetterCode}XXX`;
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

  await publishStoredFileAsReportCode({
    fileId: storedFileId,
    reportCode,
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
) {
  const results: TwoPQCaseAutoSyncResult[] = [];
  for (const caseId of uniqueStrings(caseIds)) {
    results.push(await synchronizeTwoPQCaseFilesAndCodes(caseId, actorEmail));
  }
  return results;
}
