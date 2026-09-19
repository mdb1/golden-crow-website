"use server";

// moderation-actions.ts — the moderation queue's reader and its three verbs
// (gc-fitness #1050, S10). Every mutation here is an ADMIN SDK write that no
// client can make through rules; the operator trail is `admin_operations`,
// which the Monitoring page already reads.
//
// ## Why there is no Cloud Function behind Suspender / Ocultar
//
// The ticket sketched `suspendSocialAccount` / `hideContent` callables. The
// backoffice never calls a callable — every admin mutation in this codebase
// goes straight through the Admin SDK — and `functions/` has no `admin` claim
// to gate one on. What a callable would do is exactly two field flips:
//
//   suspend → `social_profiles/{uid}.suspended = true`, and the EXISTING
//             `onSocialProfileWritten` trigger fans `authorSuspended` out to
//             every `public_routines` card (reversible by design).
//   hide    → `hidden = true` on the card / comment / message. The card's
//             decoder drops a hidden card in both apps; the comment trigger
//             recounts; the message renders a placeholder.
//
// ## Resolving a report resolves the GROUP
//
// Acting on a target closes every open report about it, with the same
// resolution: three people reporting one routine are asking one question.
//
// ## Rule #1 (#1104) does not apply: these are admin-only, and the admin
// precedent (`admin-actions.ts`, `data-hygiene-actions.ts`) throws + redirects.

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { getCurrentAdmin } from "./auth-helpers";
import { FirestoreCollections } from "./collections";
import {
  decodeModerationReport,
  groupReportsByTarget,
  isReportStatus,
  isReportTargetType,
  operationKindFor,
  parseMessageTargetId,
  type ModerationAction,
  type ModerationGroup,
  type ModerationReport,
  type ModerationTargetPreview,
  type ReportStatus,
  type ReportTargetType,
} from "./moderation-model";

const QUEUE_WINDOW = 300;
const MODERATION_PATH = "/gc-fitness/admin/moderation";

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function localizedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const map = value as Record<string, unknown>;
    const es = typeof map.es === "string" ? map.es : "";
    const en = typeof map.en === "string" ? map.en : "";
    return es || en;
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────────────

export interface ModerationQueueFilters {
  status: ReportStatus;
  targetType: ReportTargetType | "all";
}

export interface ModerationQueuePage {
  groups: ModerationGroup[];
  reportCount: number;
  /** Open reports across the WHOLE collection — the nav badge, independent of filters. */
  openCount: number;
}

/** The reported thing, read from its own document so the operator sees what people saw. */
async function previewTarget(
  targetType: ReportTargetType,
  targetId: string,
): Promise<ModerationTargetPreview> {
  const db = gcFitnessFirestore();
  const missing: ModerationTargetPreview = {
    title: "(ya no existe)",
    body: null,
    hidden: false,
    ownerSuspended: false,
    missing: true,
  };
  try {
    switch (targetType) {
      case "profile": {
        const snap = await db.collection(FirestoreCollections.socialProfiles).doc(targetId).get();
        if (!snap.exists) return missing;
        const d = snap.data() ?? {};
        const handle = typeof d.handle === "string" && d.handle ? `@${d.handle}` : "";
        const name = typeof d.displayName === "string" ? d.displayName : "";
        return {
          title: [handle, name].filter(Boolean).join(" · ") || targetId,
          body: typeof d.bio === "string" && d.bio.trim() ? d.bio.trim() : null,
          hidden: false,
          ownerSuspended: d.suspended === true,
          missing: false,
        };
      }
      case "routine": {
        const snap = await db.collection(FirestoreCollections.publicRoutines).doc(targetId).get();
        if (!snap.exists) return missing;
        const d = snap.data() ?? {};
        const author = typeof d.authorHandle === "string" && d.authorHandle ? `@${d.authorHandle}` : "";
        return {
          title: [localizedText(d.name) || targetId, author].filter(Boolean).join(" · "),
          body: localizedText(d.description) || null,
          hidden: d.hidden === true,
          ownerSuspended: d.authorSuspended === true,
          missing: false,
        };
      }
      case "comment": {
        const snap = await db.collection(FirestoreCollections.routineComments).doc(targetId).get();
        if (!snap.exists) return missing;
        const d = snap.data() ?? {};
        const author = typeof d.authorHandle === "string" && d.authorHandle ? `@${d.authorHandle}` : "";
        return {
          title: [author || "comentario", d.deleted === true ? "(borrado por su autor)" : ""]
            .filter(Boolean)
            .join(" "),
          body: typeof d.text === "string" ? d.text : null,
          hidden: d.hidden === true,
          ownerSuspended: false,
          missing: false,
        };
      }
      case "message": {
        const parsed = parseMessageTargetId(targetId);
        if (!parsed) return missing;
        const snap = await db
          .collection(FirestoreCollections.dmThreads)
          .doc(parsed.threadId)
          .collection("messages")
          .doc(parsed.messageId)
          .get();
        if (!snap.exists) return missing;
        const d = snap.data() ?? {};
        return {
          title: `mensaje de ${typeof d.senderId === "string" ? d.senderId : "?"}`,
          body: typeof d.text === "string" ? d.text : null,
          hidden: d.hidden === true,
          ownerSuspended: false,
          missing: false,
        };
      }
    }
  } catch {
    return { ...missing, title: "(no se pudo leer)" };
  }
}

export async function listModerationQueue(
  filters: ModerationQueueFilters,
): Promise<ModerationQueuePage> {
  await getCurrentAdmin();
  const db = gcFitnessFirestore();

  const [snapshot, openAgg] = await Promise.all([
    db
      .collection(FirestoreCollections.socialReports)
      .where("status", "==", filters.status)
      .orderBy("createdAt", "desc")
      .limit(QUEUE_WINDOW)
      .get(),
    db.collection(FirestoreCollections.socialReports).where("status", "==", "open").count().get(),
  ]);

  const reports: ModerationReport[] = [];
  for (const doc of snapshot.docs) {
    const decoded = decodeModerationReport(doc.id, doc.data() as Record<string, unknown>, toIso);
    if (!decoded) continue;
    if (filters.targetType !== "all" && decoded.targetType !== filters.targetType) continue;
    reports.push(decoded);
  }

  const groups = groupReportsByTarget(reports);
  // Hydrate AFTER grouping: one read per target, not per report.
  await Promise.all(
    groups.map(async (group) => {
      group.preview = await previewTarget(group.targetType, group.targetId);
    }),
  );

  return {
    groups,
    reportCount: reports.length,
    openCount: openAgg.data().count,
  };
}

/** The nav badge. Cheap (one aggregation) and admin-only; 0 for everybody else. */
export async function countOpenReports(): Promise<number> {
  const db = gcFitnessFirestore();
  const agg = await db
    .collection(FirestoreCollections.socialReports)
    .where("status", "==", "open")
    .count()
    .get();
  return agg.data().count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Acting
// ─────────────────────────────────────────────────────────────────────────────

interface ActionTarget {
  targetType: ReportTargetType;
  targetId: string;
  targetOwnerUid: string;
  /** The open reports the operator saw for this target — what the action resolves. */
  reportIds: string[];
}

function readTarget(formData: FormData): ActionTarget {
  const targetType = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "").trim();
  const targetOwnerUid = String(formData.get("targetOwnerUid") ?? "").trim();
  if (!isReportTargetType(targetType)) throw new Error("Unsupported target type.");
  if (!targetId) throw new Error("Missing target id.");
  const reportIds = String(formData.get("reportIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return { targetType, targetId, targetOwnerUid, reportIds };
}

async function writeOperation(args: {
  actorUid: string;
  kind: string;
  targetUid: string;
  summary: Record<string, unknown>;
  status: "success" | "failed";
  errorMessage?: string;
}): Promise<void> {
  const db = gcFitnessFirestore();
  await db.collection(FirestoreCollections.adminOperations).add({
    actorUid: args.actorUid,
    kind: args.kind,
    mode: "execute",
    targetUid: args.targetUid,
    status: args.status,
    summary: args.summary,
    errorMessage: args.errorMessage ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Closes the OPEN reports the operator was looking at, with one resolution.
 *
 * The ids come from the form (hidden `reportIds`), not from a query: a
 * `status == open && targetType == X && targetId == Y` query needs a composite
 * index the emulator never enforces (`emulator-does-not-enforce-indexes`), and
 * the ids are already on the page. A report that arrived between render and
 * click stays open and shows up on the next load — which is the honest result.
 * Each doc is re-read so a report somebody else just resolved is not re-stamped.
 */
async function resolveOpenReports(
  reportIds: string[],
  resolution: ModerationAction,
  actorUid: string,
): Promise<number> {
  if (reportIds.length === 0) return 0;
  const db = gcFitnessFirestore();
  const status: ReportStatus = resolution === "dismiss" ? "dismissed" : "actioned";
  let resolved = 0;
  const batch = db.batch();
  for (const id of reportIds) {
    const ref = db.collection(FirestoreCollections.socialReports).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.get("status") !== "open") continue;
    batch.update(ref, {
      status,
      resolution,
      resolvedBy: actorUid,
      resolvedAt: FieldValue.serverTimestamp(),
    });
    resolved += 1;
  }
  if (resolved > 0) await batch.commit();
  return resolved;
}

async function setHidden(target: ActionTarget, hidden: boolean): Promise<void> {
  const db = gcFitnessFirestore();
  switch (target.targetType) {
    case "routine":
      await db
        .collection(FirestoreCollections.publicRoutines)
        .doc(target.targetId)
        .set({ hidden, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return;
    case "comment":
      await db
        .collection(FirestoreCollections.routineComments)
        .doc(target.targetId)
        .set({ hidden }, { merge: true });
      return;
    case "message": {
      const parsed = parseMessageTargetId(target.targetId);
      if (!parsed) throw new Error("Malformed message target.");
      await db
        .collection(FirestoreCollections.dmThreads)
        .doc(parsed.threadId)
        .collection("messages")
        .doc(parsed.messageId)
        .set({ hidden }, { merge: true });
      return;
    }
    case "profile":
      throw new Error("A profile is not hidden; it is suspended.");
  }
}

async function setSuspended(uid: string, suspended: boolean): Promise<void> {
  if (!uid) throw new Error("Missing owner uid.");
  const db = gcFitnessFirestore();
  // `set` + merge rather than `update`: a profile document that vanished between
  // the report and the click must not throw NOT_FOUND on the operator.
  await db
    .collection(FirestoreCollections.socialProfiles)
    .doc(uid)
    .set({ suspended, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function runAction(
  formData: FormData,
  action: ModerationAction,
  mutate: (target: ActionTarget) => Promise<Record<string, unknown>>,
): Promise<never> {
  const admin = await getCurrentAdmin();
  const target = readTarget(formData);
  const kind = operationKindFor(action);
  try {
    const summary = await mutate(target);
    const resolved = await resolveOpenReports(target.reportIds, action, admin.uid);
    await writeOperation({
      actorUid: admin.uid,
      kind,
      targetUid: target.targetOwnerUid || target.targetId,
      status: "success",
      summary: { ...summary, targetType: target.targetType, targetId: target.targetId, resolvedReports: resolved },
    });
  } catch (err) {
    await writeOperation({
      actorUid: admin.uid,
      kind,
      targetUid: target.targetOwnerUid || target.targetId,
      status: "failed",
      summary: { targetType: target.targetType, targetId: target.targetId },
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  revalidatePath(MODERATION_PATH);
  revalidatePath("/gc-fitness/admin");
  redirect(`${MODERATION_PATH}?op=${encodeURIComponent(action)}&ok=1`);
}

/** Ocultar contenido — the target stops being shown; the account stays. */
export async function hideReportedContent(formData: FormData): Promise<never> {
  return runAction(formData, "hide", async (target) => {
    await setHidden(target, true);
    return { action: "hide" };
  });
}

/** Suspender autor — the owner's profile leaves search, feed and suggestions; their cards are flagged. */
export async function suspendReportedAuthor(formData: FormData): Promise<never> {
  return runAction(formData, "suspend", async (target) => {
    await setSuspended(target.targetOwnerUid, true);
    return { action: "suspend", suspendedUid: target.targetOwnerUid };
  });
}

/** Descartar — nothing happens to the content; the reports close as dismissed. */
export async function dismissReports(formData: FormData): Promise<never> {
  return runAction(formData, "dismiss", async () => ({ action: "dismiss" }));
}

/** Reversal of Suspender. Reports are not reopened; the trail is the operation. */
export async function unsuspendSocialAccount(formData: FormData): Promise<never> {
  const admin = await getCurrentAdmin();
  const uid = String(formData.get("uid") ?? "").trim();
  await setSuspended(uid, false);
  await writeOperation({
    actorUid: admin.uid,
    kind: operationKindFor("unsuspend"),
    targetUid: uid,
    status: "success",
    summary: { action: "unsuspend" },
  });
  revalidatePath(MODERATION_PATH);
  redirect(`${MODERATION_PATH}?op=unsuspend&ok=1`);
}

/** Reversal of Ocultar. */
export async function unhideReportedContent(formData: FormData): Promise<never> {
  const admin = await getCurrentAdmin();
  const target = readTarget(formData);
  await setHidden(target, false);
  await writeOperation({
    actorUid: admin.uid,
    kind: operationKindFor("unhide"),
    targetUid: target.targetOwnerUid || target.targetId,
    status: "success",
    summary: { action: "unhide", targetType: target.targetType, targetId: target.targetId },
  });
  revalidatePath(MODERATION_PATH);
  redirect(`${MODERATION_PATH}?op=unhide&ok=1`);
}

/** Type re-exports for the page (types vanish at compile time; allowed in a "use server" file). */
export type { ModerationGroup, ModerationReport, ReportStatus, ReportTargetType };
