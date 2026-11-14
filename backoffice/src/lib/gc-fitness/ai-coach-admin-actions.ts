"use server";

// ai-coach-admin-actions.ts — the reader behind /gc-fitness/admin/corvo
// (gc-fitness #1330). Admin-only; every export is async (a sync export in a
// "use server" file passes jest and breaks `next build` — #785). All shaping
// lives in the pure `ai-coach-admin-model.ts`.
//
// ## Reads per page view (Firestore cost)
//
//   usage      ≤ 30 docs   `ai_coach_usage` by doc-id range (one per UTC day)
//   active     3 count() aggregations (24 h / 7 d / 30 d) — #504: no thread docs
//   threads    only the near-quota CANDIDATES (#504): threads with a message in the
//              last 48 h (a daily quota only counts today) + threads whose lifetime
//              `usage.total` already reaches the free tier's 80 % — not every user
//              active in 30 days
//   users      1 per near-quota candidate + 1 per reporter (point reads, NOT getAll —
//              getAll fails silently on Vercel, memory firestore-getall-fails-on-vercel)
//   proposals  1 per proposal created in the last 30 days (collection group), projected
//              to `type` + `status` — the per-type table needs the rows
//   reports    3 count() aggregations for the state chips + ≤ 100 rows of the chosen
//              state (#504), joined with their triage (`documentId in` chunks of 30)
//
// Every section is fail-soft: one failing query (e.g. a collection-group index
// that isn't deployed yet) leaves its section in an error state and the rest of
// the page renders.
//
// ## Indexes
//
// `collectionGroup("proposals").where("createdAt", ">=")` and
// `collectionGroup("reports").orderBy("createdAt", "desc")` need COLLECTION_GROUP
// single-field indexes on `createdAt` — collection-scope single-field indexes are
// automatic, collection-group ones are NOT. They are declared as `fieldOverrides`
// in gc-fitness/firestore.indexes.json (the emulator does not enforce indexes,
// so only production would have caught their absence).
//
// ## Reading a conversation
//
// `loadCorvoReportContext` is the ONLY path to message text, and it starts by
// reading the report: no report doc, no messages. Each successful read leaves an
// `admin_operations` row (kind `ai_coach_report_view`) with the admin's uid.

import { FieldPath, FieldValue } from "firebase-admin/firestore";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import {
  AI_COACH_QUOTA,
  NEAR_QUOTA_RATIO,
  AI_COACH_COLLECTION,
  AI_COACH_MESSAGES_SUBCOLLECTION,
  AI_COACH_PROPOSALS_SUBCOLLECTION,
  AI_COACH_REPORTS_SUBCOLLECTION,
  AI_COACH_USAGE_COLLECTION,
  CORVO_WINDOW_DAYS,
  REPORT_CONTEXT_PREVIOUS_MESSAGES,
  buildReportContext,
  buildUsageSeries,
  decodeContextMessage,
  decodeProposal,
  decodeReport,
  decodeThread,
  decodeUsageDay,
  isNearQuotaCandidate,
  nearQuotaUser,
  sortNearQuota,
  summarizeAcceptance,
  summarizeUsage,
  utcDayKeys,
  type AICoachReport,
  type AcceptanceRow,
  type ActiveUsers,
  type ContextMessage,
  type NearQuotaUser,
  type UsageDay,
  type UsageSummary,
} from "./ai-coach-admin-model";
import { getCurrentAdmin } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import {
  AI_COACH_REPORT_TRIAGE_COLLECTION,
  NEW_REPORT_TRIAGE,
  decodeReportTriage,
  normalizeReportTriageInput,
  reportStateCounts,
  reportTriageDocId,
  type ReportStateCounts,
  type ReportStateFilter,
  type ReportTriage,
} from "./ai-coach-report-triage";

const REPORTS_LIMIT = 100;
/** #504 — how many newest reports the "new" filter scans to find untriaged ones. */
const NEW_REPORTS_SCAN = 300;
/** A daily quota only counts `usage.civilDate` == the user's today: a message within 48 h. */
const DAILY_CANDIDATE_WINDOW_MS = 48 * 3_600_000;
/** Firestore's cap on `in` values. */
const IN_CHUNK = 30;

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ReportRow extends AICoachReport {
  email: string | null;
  /** #504 — operator triage (status + internal note). */
  triage: ReportTriage;
}

export interface ReportsSection {
  filter: ReportStateFilter;
  rows: ReportRow[];
  /** null when the count() aggregations failed (the rows still render). */
  counts: ReportStateCounts | null;
}

export interface CorvoDashboard {
  generatedAtISO: string;
  usage: Section<{ series: UsageDay[]; summary: UsageSummary }>;
  activeUsers: Section<ActiveUsers>;
  nearQuota: Section<NearQuotaUser[]>;
  acceptance: Section<AcceptanceRow[]>;
  reports: Section<ReportsSection>;
}

async function section<T>(load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message.slice(0, 300) };
  }
}

async function readUserDoc(uid: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await gcFitnessFirestore().collection(FirestoreCollections.users).doc(uid).get();
    return snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function countOf(query: FirebaseFirestore.Query): Promise<number> {
  const snap = await query.count().get();
  return snap.data().count;
}

/** Triage docs of these reports, by triage doc id (`documentId in` chunks, never getAll). */
async function readTriage(
  reports: Array<{ uid: string; messageId: string }>,
): Promise<Map<string, ReportTriage>> {
  const db = gcFitnessFirestore();
  const ids = Array.from(new Set(reports.map((r) => reportTriageDocId(r.uid, r.messageId))));
  const out = new Map<string, ReportTriage>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const snap = await db
      .collection(AI_COACH_REPORT_TRIAGE_COLLECTION)
      .where(FieldPath.documentId(), "in", ids.slice(i, i + IN_CHUNK))
      .get();
    for (const d of snap.docs) out.set(d.id, decodeReportTriage((d.data() ?? {}) as Record<string, unknown>));
  }
  return out;
}

async function withEmails(
  reports: Array<AICoachReport & { triage: ReportTriage }>,
): Promise<ReportRow[]> {
  const uids = Array.from(new Set(reports.map((r) => r.uid)));
  const emails = new Map<string, string | null>();
  await Promise.all(
    uids.map(async (uid) => {
      const doc = await readUserDoc(uid);
      const email = doc && typeof doc.email === "string" && doc.email ? doc.email : null;
      emails.set(uid, email);
    }),
  );
  return reports.map((r) => ({ ...r, email: emails.get(r.uid) ?? null }));
}

function decodeReportDocs(
  docs: Array<{ ref: { path: string }; data: () => unknown }>,
): AICoachReport[] {
  return docs
    .map((d) => decodeReport(d.ref.path, (d.data() ?? {}) as Record<string, unknown>))
    .filter((r): r is AICoachReport => r !== null);
}

async function loadReportRows(filter: ReportStateFilter): Promise<ReportRow[]> {
  const db = gcFitnessFirestore();
  if (filter === "reviewed" || filter === "resolved") {
    // Composite (status ASC, reportCreatedAt DESC) on ai_coach_report_triage; until
    // it is deployed, the unordered equality (automatic index) + an in-memory sort.
    const triageSnap = await db
      .collection(AI_COACH_REPORT_TRIAGE_COLLECTION)
      .where("status", "==", filter)
      .orderBy("reportCreatedAt", "desc")
      .limit(REPORTS_LIMIT)
      .get()
      .catch(() =>
        db
          .collection(AI_COACH_REPORT_TRIAGE_COLLECTION)
          .where("status", "==", filter)
          .limit(REPORTS_LIMIT)
          .get(),
      );
    const rows = await Promise.all(
      triageSnap.docs.map(async (t) => {
        const data = (t.data() ?? {}) as Record<string, unknown>;
        const uid = typeof data.uid === "string" ? data.uid : "";
        const messageId = typeof data.messageId === "string" ? data.messageId : "";
        if (!uid || !messageId || uid.includes("/") || messageId.includes("/")) return null;
        const path = `${AI_COACH_COLLECTION}/${uid}/${AI_COACH_REPORTS_SUBCOLLECTION}/${messageId}`;
        const reportSnap = await db.doc(path).get();
        // The user deleted the conversation (and with it the report): nothing to show.
        if (!reportSnap.exists) return null;
        const report = decodeReport(path, (reportSnap.data() ?? {}) as Record<string, unknown>);
        return report ? { ...report, triage: decodeReportTriage(data) } : null;
      }),
    );
    const present = rows.filter((r): r is AICoachReport & { triage: ReportTriage } => r !== null);
    present.sort((a, b) => (b.createdAtISO ?? "").localeCompare(a.createdAtISO ?? ""));
    return withEmails(present);
  }

  const snap = await db
    .collectionGroup(AI_COACH_REPORTS_SUBCOLLECTION)
    .orderBy("createdAt", "desc")
    .limit(filter === "new" ? NEW_REPORTS_SCAN : REPORTS_LIMIT)
    .get();
  const reports = decodeReportDocs(snap.docs);
  const triage = await readTriage(reports);
  const joined = reports.map((r) => ({
    ...r,
    triage: triage.get(reportTriageDocId(r.uid, r.messageId)) ?? NEW_REPORT_TRIAGE,
  }));
  const wanted = filter === "new" ? joined.filter((r) => r.triage.status === "new") : joined;
  return withEmails(wanted.slice(0, REPORTS_LIMIT));
}

async function loadReportCounts(): Promise<ReportStateCounts | null> {
  const db = gcFitnessFirestore();
  try {
    const triage = db.collection(AI_COACH_REPORT_TRIAGE_COLLECTION);
    const [total, reviewed, resolved] = await Promise.all([
      // The collection-group createdAt index (fieldOverrides) serves this count. It
      // spans EVERY `reports` subcollection (a count can't filter by parent path);
      // today the rules allow `reports` only under ai_coach/{uid}, so it is exact.
      countOf(db.collectionGroup(AI_COACH_REPORTS_SUBCOLLECTION).orderBy("createdAt", "desc")),
      countOf(triage.where("status", "==", "reviewed")),
      countOf(triage.where("status", "==", "resolved")),
    ]);
    return reportStateCounts(total, reviewed, resolved);
  } catch (err) {
    console.warn("[corvo-admin] report counts failed", err);
    return null;
  }
}

function minLifetimeNearThreshold(): number | null {
  const limits = Object.values(AI_COACH_QUOTA)
    .filter((rule) => rule.kind === "lifetime")
    .map((rule) => Math.ceil(rule.limit * NEAR_QUOTA_RATIO));
  return limits.length > 0 ? Math.min(...limits) : null;
}

export async function loadCorvoDashboard(
  options: { reportState?: ReportStateFilter } = {},
): Promise<CorvoDashboard> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();
  const now = new Date();
  const keys = utcDayKeys(now, CORVO_WINDOW_DAYS);
  const cutoff = new Date(now.getTime() - CORVO_WINDOW_DAYS * 86_400_000);

  const usagePromise = section(async () => {
    const snap = await db
      .collection(AI_COACH_USAGE_COLLECTION)
      .where(FieldPath.documentId(), ">=", keys[0])
      .get();
    const days = snap.docs
      .filter((d) => d.id <= keys[keys.length - 1])
      .map((d) => decodeUsageDay(d.id, (d.data() ?? {}) as Record<string, unknown>));
    const series = buildUsageSeries(keys, days);
    return { series, summary: summarizeUsage(series) };
  });

  // #504 — active users are three count() aggregations (1 read per 1000 index
  // entries), not a read of every thread active in 30 days.
  const activePromise = section(async () => {
    const threads = db.collection(AI_COACH_COLLECTION);
    const since = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const [last24h, last7d, last30d] = await Promise.all([
      countOf(threads.where("lastMessageAt", ">=", since(1))),
      countOf(threads.where("lastMessageAt", ">=", since(7))),
      countOf(threads.where("lastMessageAt", ">=", cutoff)),
    ]);
    return { last24h, last7d, last30d } satisfies ActiveUsers;
  });

  // Only the threads that CAN be near a quota: a daily rule needs a turn today
  // (a message in the last 48 h covers every user's civil "today"), a lifetime rule
  // needs `usage.total` at 80 % of the smallest lifetime limit. Single-field ranges,
  // automatic indexes. The 30-day window still applies, as before.
  const threadsPromise = (async () => {
    const lifetimeMin = minLifetimeNearThreshold();
    const [recent, heavy] = await Promise.all([
      db
        .collection(AI_COACH_COLLECTION)
        .where("lastMessageAt", ">=", new Date(now.getTime() - DAILY_CANDIDATE_WINDOW_MS))
        .get(),
      lifetimeMin === null
        ? Promise.resolve(null)
        : db.collection(AI_COACH_COLLECTION).where("usage.total", ">=", lifetimeMin).get(),
    ]);
    const byUid = new Map<string, ReturnType<typeof decodeThread>>();
    for (const d of [...recent.docs, ...(heavy?.docs ?? [])]) {
      byUid.set(d.id, decodeThread(d.id, (d.data() ?? {}) as Record<string, unknown>));
    }
    return Array.from(byUid.values()).filter(
      (t) => t.lastMessageAtMs !== null && t.lastMessageAtMs >= cutoff.getTime(),
    );
  })();

  const nearQuotaPromise = section(async () => {
    const candidates = (await threadsPromise).filter((thread) => isNearQuotaCandidate(thread, now));
    const rows = await Promise.all(
      candidates.map(async (thread) => nearQuotaUser(thread, await readUserDoc(thread.uid), now)),
    );
    return sortNearQuota(rows.filter((r): r is NearQuotaUser => r !== null));
  });

  const acceptancePromise = section(async () => {
    const snap = await db
      .collectionGroup(AI_COACH_PROPOSALS_SUBCOLLECTION)
      .where("createdAt", ">=", cutoff)
      .select("type", "status")
      .get();
    const proposals = snap.docs
      // Only ai_coach/{uid}/proposals — any other "proposals" subcollection is not ours.
      .filter((d) => d.ref.path.startsWith(`${AI_COACH_COLLECTION}/`))
      .map((d) => decodeProposal((d.data() ?? {}) as Record<string, unknown>));
    return summarizeAcceptance(proposals);
  });

  const reportFilter = options.reportState ?? "new";
  const reportsPromise = section(async () => {
    const [rows, counts] = await Promise.all([loadReportRows(reportFilter), loadReportCounts()]);
    return { filter: reportFilter, rows, counts } satisfies ReportsSection;
  });

  const [usage, activeUsers, nearQuota, acceptance, reports] = await Promise.all([
    usagePromise,
    activePromise,
    nearQuotaPromise,
    acceptancePromise,
    reportsPromise,
  ]);
  return { generatedAtISO: now.toISOString(), usage, activeUsers, nearQuota, acceptance, reports };
}

export type CorvoReportContext =
  | { kind: "not_found" }
  | {
      kind: "deleted";
      report: ReportRow;
    }
  | {
      kind: "ok";
      report: ReportRow;
      messages: ContextMessage[];
    };

/**
 * The reported assistant message plus up to 6 messages before it. Refuses
 * (not_found) unless `ai_coach/{uid}/reports/{messageId}` exists.
 */
export async function loadCorvoReportContext(uid: string, messageId: string): Promise<CorvoReportContext> {
  const admin = await getCurrentAdmin();
  const db = gcFitnessFirestore();
  if (!uid || !messageId || uid.includes("/") || messageId.includes("/")) return { kind: "not_found" };

  const thread = db.collection(AI_COACH_COLLECTION).doc(uid);
  const reportSnap = await thread.collection(AI_COACH_REPORTS_SUBCOLLECTION).doc(messageId).get();
  if (!reportSnap.exists) return { kind: "not_found" };
  const decoded = decodeReport(
    `${AI_COACH_COLLECTION}/${uid}/${AI_COACH_REPORTS_SUBCOLLECTION}/${messageId}`,
    (reportSnap.data() ?? {}) as Record<string, unknown>,
  );
  if (!decoded) return { kind: "not_found" };
  const [userDoc, triageSnap] = await Promise.all([
    readUserDoc(uid),
    db
      .collection(AI_COACH_REPORT_TRIAGE_COLLECTION)
      .doc(reportTriageDocId(uid, messageId))
      .get()
      .catch(() => null),
  ]);
  const report: ReportRow = {
    ...decoded,
    email: userDoc && typeof userDoc.email === "string" && userDoc.email ? userDoc.email : null,
    triage:
      triageSnap && triageSnap.exists
        ? decodeReportTriage((triageSnap.data() ?? {}) as Record<string, unknown>)
        : NEW_REPORT_TRIAGE,
  };

  const messages = thread.collection(AI_COACH_MESSAGES_SUBCOLLECTION);
  const messageSnap = await messages.doc(messageId).get();
  // «Borrar conversación» (#1322) deletes every message but keeps the reports.
  if (!messageSnap.exists) return { kind: "deleted", report };

  const reportedData = (messageSnap.data() ?? {}) as Record<string, unknown>;
  const reported = decodeContextMessage(messageId, reportedData, messageId);
  let previous: ContextMessage[] = [];
  if (reportedData.createdAt) {
    const prevSnap = await messages
      .where("createdAt", "<", reportedData.createdAt)
      .orderBy("createdAt", "desc")
      .limit(REPORT_CONTEXT_PREVIOUS_MESSAGES)
      .get();
    previous = prevSnap.docs.map((d) =>
      decodeContextMessage(d.id, (d.data() ?? {}) as Record<string, unknown>, messageId),
    );
  }

  // Audit trail: who read which reported conversation. Fail-soft — a failed log
  // must not hide the report from the operator who is handling it.
  await db
    .collection(FirestoreCollections.adminOperations)
    .add({
      actorUid: admin.uid,
      kind: "ai_coach_report_view",
      mode: "execute",
      targetUid: uid,
      status: "success",
      summary: `Read the context of reported AI Coach message ${messageId}`,
      errorMessage: null,
      createdAt: FieldValue.serverTimestamp(),
    })
    .catch(() => undefined);

  return { kind: "ok", report, messages: buildReportContext(reported, previous) };
}

export type SetCorvoReportTriageResult = { ok: true; triage: ReportTriage } | { ok: false; error: string };

/**
 * #504 — the operator marks a report new / reviewed / resolved and leaves an
 * internal note. Admin-only; the report must exist. Writes the server-only
 * `ai_coach_report_triage/{uid}_{messageId}` (never the report doc, which its
 * owner can read) and an `admin_operations` row.
 */
export async function setCorvoReportTriage(input: unknown): Promise<SetCorvoReportTriageResult> {
  const admin = await getCurrentAdmin();
  let parsed: ReturnType<typeof normalizeReportTriageInput>;
  try {
    parsed = normalizeReportTriageInput(input);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid input." };
  }
  const db = gcFitnessFirestore();
  const reportSnap = await db
    .collection(AI_COACH_COLLECTION)
    .doc(parsed.uid)
    .collection(AI_COACH_REPORTS_SUBCOLLECTION)
    .doc(parsed.messageId)
    .get();
  if (!reportSnap.exists) return { ok: false, error: "Report not found." };
  const reportData = (reportSnap.data() ?? {}) as Record<string, unknown>;

  await db
    .collection(AI_COACH_REPORT_TRIAGE_COLLECTION)
    .doc(reportTriageDocId(parsed.uid, parsed.messageId))
    .set({
      uid: parsed.uid,
      messageId: parsed.messageId,
      status: parsed.status,
      note: parsed.note,
      // Copied so the reviewed/resolved lists sort by report date without a join.
      reportCreatedAt: reportData.createdAt ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.uid,
    });

  await db
    .collection(FirestoreCollections.adminOperations)
    .add({
      actorUid: admin.uid,
      kind: "ai_coach_report_triage",
      mode: "execute",
      targetUid: parsed.uid,
      status: "success",
      summary: `Marked AI Coach report ${parsed.messageId} as ${parsed.status}`,
      errorMessage: null,
      createdAt: FieldValue.serverTimestamp(),
    })
    .catch(() => undefined);

  return {
    ok: true,
    triage: { status: parsed.status, note: parsed.note, updatedAtISO: new Date().toISOString(), updatedBy: admin.uid },
  };
}
