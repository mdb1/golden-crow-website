import { adminDbFor } from "../config/firebase.js";

const adminDb = adminDbFor("mydnamap");

const CASES_COLLECTION = "2pq_case";
const SAMPLINGS_COLLECTION = "2pq_sampling";

const CASE_STATUS_ALIASES: Record<string, string> = {
  active: "in_transit",
  samples_received_2pq: "samples_received",
  samples_received_by_2pq: "samples_received",
  sample_processing_in_lab: "lab_processing",
  reporting: "bioinformatics",
  bioinformatics_analysis: "bioinformatics",
  delivered: "report_ready",
  report_ready_to_download: "report_ready",
};

const SAMPLING_STATUS_BY_CASE_STATUS: Record<string, string> = {
  intake: "awaiting_reception",
  awaiting_pick_up: "awaiting_reception",
  in_transit: "awaiting_reception",
  samples_received: "received",
  lab_processing: "processing",
  bioinformatics: "ready_for_sequencing",
  report_ready: "ready_for_sequencing",
};

type SamplingRecord = {
  id: string;
  data: Record<string, unknown>;
};

export interface TwoPQSamplingStatusCascadeResult {
  caseId: string;
  caseStatus: string;
  processingStatus?: string;
  changed: boolean;
  updatedSamplingIds: string[];
  unchangedSamplingIds: string[];
}

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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

export function normalizeTwoPQCaseStatusForSampling(value: unknown) {
  const normalized = normalizeString(value)?.toLowerCase() ?? "";
  return CASE_STATUS_ALIASES[normalized] ?? normalized;
}

export function samplingProcessingStatusForCaseStatus(value: unknown) {
  return SAMPLING_STATUS_BY_CASE_STATUS[
    normalizeTwoPQCaseStatusForSampling(value)
  ];
}

export function didTwoPQCaseStatusChange(
  previousStatus: unknown,
  nextStatus: unknown,
) {
  return (
    normalizeTwoPQCaseStatusForSampling(previousStatus) !==
    normalizeTwoPQCaseStatusForSampling(nextStatus)
  );
}

async function getSamplingById(samplingId: string) {
  const snapshot = await adminDb
    .collection(SAMPLINGS_COLLECTION)
    .doc(samplingId)
    .get();
  if (!snapshot.exists) {
    return null;
  }

  return {
    id: snapshot.id,
    data: (snapshot.data() ?? {}) as Record<string, unknown>,
  } satisfies SamplingRecord;
}

async function loadSamplingChildren(caseId: string) {
  const caseSnapshot = await adminDb
    .collection(CASES_COLLECTION)
    .doc(caseId)
    .get();
  if (!caseSnapshot.exists) {
    return [] as SamplingRecord[];
  }

  const caseData = (caseSnapshot.data() ?? {}) as Record<string, unknown>;
  const linkedSamplingIds = uniqueStrings([
    ...normalizeStringArray(caseData.children_sampling),
    ...normalizeStringArray(caseData.linkedSamplingIds),
  ]);
  const [samplingsById, samplingsByParent] = await Promise.all([
    Promise.all(linkedSamplingIds.map(getSamplingById)),
    adminDb
      .collection(SAMPLINGS_COLLECTION)
      .where("parent_case", "==", caseId)
      .get(),
  ]);
  const byId = new Map<string, SamplingRecord>();

  for (const sampling of samplingsById) {
    if (!sampling) {
      continue;
    }
    const parentCaseId = normalizeString(
      sampling.data.parent_case ?? sampling.data.caseId,
    );
    if (parentCaseId && parentCaseId !== caseId) {
      continue;
    }
    byId.set(sampling.id, sampling);
  }

  for (const document of samplingsByParent.docs) {
    byId.set(document.id, {
      id: document.id,
      data: (document.data() ?? {}) as Record<string, unknown>,
    });
  }

  return Array.from(byId.values()).sort((left, right) => {
    const leftLabel = normalizeString(left.data.sampleId) ?? left.id;
    const rightLabel = normalizeString(right.data.sampleId) ?? right.id;
    return leftLabel.localeCompare(rightLabel);
  });
}

export async function cascadeTwoPQCaseStatusToSamplingChildren(input: {
  caseId: string;
  previousCaseStatus: unknown;
  nextCaseStatus: unknown;
  actorEmail: string;
}): Promise<TwoPQSamplingStatusCascadeResult> {
  const normalizedCaseStatus = normalizeTwoPQCaseStatusForSampling(
    input.nextCaseStatus,
  );
  if (
    !didTwoPQCaseStatusChange(
      input.previousCaseStatus,
      input.nextCaseStatus,
    )
  ) {
    return {
      caseId: input.caseId,
      caseStatus: normalizedCaseStatus,
      changed: false,
      updatedSamplingIds: [],
      unchangedSamplingIds: [],
    };
  }

  const processingStatus = samplingProcessingStatusForCaseStatus(
    normalizedCaseStatus,
  );
  if (!processingStatus) {
    return {
      caseId: input.caseId,
      caseStatus: normalizedCaseStatus,
      changed: true,
      updatedSamplingIds: [],
      unchangedSamplingIds: [],
    };
  }

  const samplings = await loadSamplingChildren(input.caseId);
  const updatedSamplingIds: string[] = [];
  const unchangedSamplingIds: string[] = [];

  for (const sampling of samplings) {
    if (normalizeString(sampling.data.processingStatus) === processingStatus) {
      unchangedSamplingIds.push(sampling.id);
      continue;
    }

    await adminDb.collection(SAMPLINGS_COLLECTION).doc(sampling.id).set(
      {
        processingStatus,
        updatedAt: new Date().toISOString(),
        updatedByEmail: input.actorEmail.trim().toLowerCase(),
      },
      { merge: true },
    );
    updatedSamplingIds.push(sampling.id);
  }

  return {
    caseId: input.caseId,
    caseStatus: normalizedCaseStatus,
    processingStatus,
    changed: true,
    updatedSamplingIds,
    unchangedSamplingIds,
  };
}
