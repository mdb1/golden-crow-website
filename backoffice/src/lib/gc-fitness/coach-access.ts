// coach-access.ts — #510. Who may hold the Corvo `trainer` role.
//
// THE HOLE THIS CLOSES. `/api/gc-fitness/login` used to give `trainer` to
// ANY signed-in account that was not a client. A coach the admin removed could
// simply sign in again and get the role back; only a disabled Auth account
// stayed out.
//
// THE RULE NOW. Login never creates a coach. It only RE-AFFIRMS one that an
// explicit path already made:
//
//   1. the account's custom claims already say coach (`role:"trainer"`,
//      `roles[]` ∋ trainer/admin, or `admin:true`). Every coach that exists
//      today carries that claim: the login wrote it on every sign-in, and the
//      gc-fitness functions write it for allowlisted sign-ups
//      (`onBeforeUserCreated`) and for coaches whose first sign-in was on the
//      phone (`finalizeClientProvisioning` → `createCoachDoc`). So no backfill
//      is needed — existing coaches keep their role;
//   2. the email is on the coach allowlist — the `GC_FITNESS_TEAM_ALLOWLIST`
//      env var or an enabled `coach_allowlist/{email}` doc (the admin's "add
//      coach" path). Same predicate as `functions/src/auth/allowlist.ts`.
//
// …and NEVER when `users/{uid}.coachDisabled === true` — the mark that
// `disableCoach` below leaves. A removed coach stays removed whatever their
// claims or the allowlist say, until an admin calls `reactivateCoach`.
//
// A `users/{uid}.role == "trainer"` DOC alone is deliberately not a grant: the
// old login wrote that doc for every account it promoted, so it proves nothing.
//
// Not a "use server" file: the two admin entry points are wrapped by the
// admin page's actions module, which is the only thing a browser can call.

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { gcFitnessAuth, gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { toActionFailure, type ActionResult } from "@/lib/gc-fitness/action-result";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import {
  backofficeRolesFromClaims,
  revokeSessions,
} from "@/lib/gc-fitness/session-revocation";

/** Do these custom claims already say coach (or admin)? Twin of functions' `claimsSayCoach`. */
export function claimsSayCoach(claims: Record<string, unknown> | undefined | null): boolean {
  return backofficeRolesFromClaims(claims).length > 0;
}

function emailInEnvAllowlist(email: string): boolean {
  return (process.env.GC_FITNESS_TEAM_ALLOWLIST ?? "")
    .toLowerCase()
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .includes(email);
}

/** Twin of `functions/src/auth/allowlist.ts → emailInAllowlist`. */
export async function emailInCoachAllowlist(email: string | undefined | null): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (emailInEnvAllowlist(normalized)) return true;
  const snap = await gcFitnessFirestore()
    .collection(FirestoreCollections.coachAllowlist)
    .doc(normalized)
    .get();
  return snap.exists && snap.get("enabled") !== false;
}

export type CoachGrantDecision =
  | { grant: true; via: "claims" | "allowlist" }
  | { grant: false; reason: "coach-disabled" | "not-a-coach" };

/**
 * May this account hold `trainer` after signing in? Pure decision over what
 * the login already read, plus (only when needed) the allowlist lookup.
 */
export async function decideCoachGrant(args: {
  claims: Record<string, unknown> | undefined | null;
  userDoc: Record<string, unknown> | undefined | null;
  email: string | undefined | null;
}): Promise<CoachGrantDecision> {
  if (args.userDoc?.coachDisabled === true) {
    return { grant: false, reason: "coach-disabled" };
  }
  if (claimsSayCoach(args.claims)) return { grant: true, via: "claims" };
  if (await emailInCoachAllowlist(args.email)) return { grant: true, via: "allowlist" };
  return { grant: false, reason: "not-a-coach" };
}

/** `claims` with the trainer role removed and the rest (admin, unrelated keys) kept. */
export function claimsWithoutTrainer(claims: Record<string, unknown>): Record<string, unknown> {
  const roles = backofficeRolesFromClaims(claims).filter((r) => r !== "trainer");
  const extraRoles = Array.isArray(claims.roles)
    ? (claims.roles as unknown[])
        .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
        .map((r) => r.trim().toLowerCase())
        .filter((r) => r !== "trainer" && r !== "admin")
    : [];
  const isAdmin = roles.includes("admin");
  const { role: _role, roles: _roles, admin: _admin, ...rest } = claims;
  return {
    ...rest,
    ...(isAdmin ? { role: "admin" } : {}),
    roles: [...extraRoles, ...roles],
    admin: isAdmin,
  };
}

/** `claims` with the trainer role added (the login's merged shape). */
export function claimsWithTrainer(claims: Record<string, unknown>): Record<string, unknown> {
  const roles = new Set<string>();
  if (typeof claims.role === "string" && claims.role.trim()) roles.add(claims.role.trim().toLowerCase());
  if (Array.isArray(claims.roles)) {
    for (const r of claims.roles) {
      if (typeof r === "string" && r.trim()) roles.add(r.trim().toLowerCase());
    }
  }
  if (claims.admin === true) roles.add("admin");
  roles.delete("client");
  roles.add("trainer");
  const list = Array.from(roles);
  return { ...claims, role: "trainer", roles: list, admin: list.includes("admin") };
}

const coachTargetSchema = z.object({ coachUid: z.string().trim().min(1).max(128) });

async function setAllowlistEnabled(email: unknown, enabled: boolean, adminUid: string) {
  if (typeof email !== "string" || !email.trim()) return;
  const ref = gcFitnessFirestore()
    .collection(FirestoreCollections.coachAllowlist)
    .doc(email.trim().toLowerCase());
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.set(
    { enabled, updatedAt: FieldValue.serverTimestamp(), updatedBy: adminUid },
    { merge: true },
  );
}

async function logOperation(args: {
  actorUid: string;
  kind: "disable_coach" | "reactivate_coach";
  targetUid: string;
}) {
  await gcFitnessFirestore().collection(FirestoreCollections.adminOperations).add({
    actorUid: args.actorUid,
    kind: args.kind,
    mode: "execute",
    targetUid: args.targetUid,
    status: "success",
    summary: {},
    errorMessage: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Removes a coach: marks `users/{uid}.coachDisabled`, takes `trainer` out of
 * the claims (an admin role survives), disables their allowlist entry so a
 * re-created account is not re-admitted either, and revokes their sessions.
 * The coach's clients and content are untouched — transfer them separately.
 */
export async function disableCoach(input: unknown): Promise<ActionResult<{ uid: string }>> {
  try {
    const admin = await getCurrentAdmin();
    const { coachUid } = coachTargetSchema.parse(input);
    if (coachUid === admin.uid) {
      return { ok: false, error: "You can't remove your own coach access." };
    }
    const userRef = gcFitnessFirestore().collection(FirestoreCollections.users).doc(coachUid);
    const snap = await userRef.get();
    if (!snap.exists || snap.get("role") === "client") {
      return { ok: false, error: "That account is not a coach." };
    }
    const user = await gcFitnessAuth().getUser(coachUid);
    // Doc first: from this write on, the login refuses the role even if the
    // claim rewrite below fails.
    await userRef.set(
      {
        coachDisabled: true,
        coachDisabledAt: FieldValue.serverTimestamp(),
        coachDisabledBy: admin.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await gcFitnessAuth().setCustomUserClaims(
      coachUid,
      claimsWithoutTrainer((user.customClaims ?? {}) as Record<string, unknown>),
    );
    await setAllowlistEnabled(user.email ?? snap.get("email"), false, admin.uid);
    await revokeSessions(coachUid, "coach disabled");
    await logOperation({ actorUid: admin.uid, kind: "disable_coach", targetUid: coachUid });
    return { ok: true, uid: coachUid };
  } catch (err) {
    return toActionFailure(err);
  }
}

/** Undoes `disableCoach`: clears the mark, restores `trainer`, re-enables the allowlist entry. */
export async function reactivateCoach(input: unknown): Promise<ActionResult<{ uid: string }>> {
  try {
    const admin = await getCurrentAdmin();
    const { coachUid } = coachTargetSchema.parse(input);
    const userRef = gcFitnessFirestore().collection(FirestoreCollections.users).doc(coachUid);
    const snap = await userRef.get();
    if (!snap.exists || snap.get("role") === "client") {
      return { ok: false, error: "That account is not a coach." };
    }
    const user = await gcFitnessAuth().getUser(coachUid);
    await gcFitnessAuth().setCustomUserClaims(
      coachUid,
      claimsWithTrainer((user.customClaims ?? {}) as Record<string, unknown>),
    );
    await userRef.set(
      {
        coachDisabled: FieldValue.delete(),
        coachDisabledAt: FieldValue.delete(),
        coachDisabledBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await setAllowlistEnabled(user.email ?? snap.get("email"), true, admin.uid);
    await logOperation({ actorUid: admin.uid, kind: "reactivate_coach", targetUid: coachUid });
    return { ok: true, uid: coachUid };
  } catch (err) {
    return toActionFailure(err);
  }
}
