"use server";

// ai-coach-admin-actions.ts — the reader behind /gc-fitness/admin/corvo
// (gc-fitness #1330). Admin-only; every export is async (a sync export in a
// "use server" file passes jest and breaks `next build` — #785). All shaping
// lives in the pure `ai-coach-admin-model.ts`.
//
// ## Reads per page view (Firestore cost)
//
//   usage      ≤ 30 docs   `ai_coach_usage` by doc-id range (one per UTC day)
//   threads    1 per user active in the last 30 days (`lastMessageAt >= cutoff`)
//   users      1 per near-quota candidate + 1 per reporter (point reads, NOT getAll —
//              getAll fails silently on Vercel, memory firestore-getall-fails-on-vercel)
//   proposals  1 per proposal created in the last 30 days (collection group)
//   reports    ≤ 100 (collection group, newest first)
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
  summarizeThreads,
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

const REPORTS_LIMIT = 100;

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ReportRow extends AICoachReport {
  email: string | null;
}

export interface CorvoDashboard {
  generatedAtISO: string;
  usage: Section<{ series: UsageDay[]; summary: UsageSummary }>;
  activeUsers: Section<ActiveUsers>;
  nearQuota: Section<NearQuotaUser[]>;
  acceptance: Section<AcceptanceRow[]>;
  reports: Section<ReportRow[]>;
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

export async function loadCorvoDashboard(): Promise<CorvoDashboard> {
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

  const threadsPromise = db
    .collection(AI_COACH_COLLECTION)
    .where("lastMessageAt", ">=", cutoff)
    .get()
    .then((snap) => snap.docs.map((d) => decodeThread(d.id, (d.data() ?? {}) as Record<string, unknown>)));

  const activePromise = section(async () => summarizeThreads(await threadsPromise, now));

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
      .get();
    const proposals = snap.docs
      // Only ai_coach/{uid}/proposals — any other "proposals" subcollection is not ours.
      .filter((d) => d.ref.path.startsWith(`${AI_COACH_COLLECTION}/`))
      .map((d) => decodeProposal((d.data() ?? {}) as Record<string, unknown>));
    return summarizeAcceptance(proposals);
  });

  const reportsPromise = section(async () => {
    const snap = await db
      .collectionGroup(AI_COACH_REPORTS_SUBCOLLECTION)
      .orderBy("createdAt", "desc")
      .limit(REPORTS_LIMIT)
      .get();
    const reports = snap.docs
      .map((d) => decodeReport(d.ref.path, (d.data() ?? {}) as Record<string, unknown>))
      .filter((r): r is AICoachReport => r !== null);
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
  const userDoc = await readUserDoc(uid);
  const report: ReportRow = {
    ...decoded,
    email: userDoc && typeof userDoc.email === "string" && userDoc.email ? userDoc.email : null,
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
