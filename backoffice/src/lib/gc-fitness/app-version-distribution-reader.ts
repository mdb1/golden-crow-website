// app-version-distribution-reader.ts — #541. Server-only, NOT "use server" (page-only).
//
// ONE collection-group query over `fcm_tokens`, projected to the four fields the
// distribution needs and capped (`MAX_TOKENS`): no index (no filter / order), no per-user
// fan-out. Read cost = token docs, only when an admin opens /admin/app-config. If the user
// base outgrows the cap the page says the numbers are partial; the next step then is a
// daily rollup in gc-fitness functions (like `usage_daily`), not a bigger cap.

import "server-only";

import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";

import { buildDistribution, type PlatformDistribution, type TokenRecord } from "./app-version-distribution";
import { getCurrentAdmin } from "./auth-helpers";
import { FCM_TOKENS_SUBCOLLECTION } from "./client-app-devices";

const MAX_TOKENS = 5000;

export interface AppVersionDistribution {
  platforms: PlatformDistribution[];
  tokensRead: number;
  capped: boolean;
}

function toMs(raw: unknown): number | null {
  if (raw && typeof (raw as { toMillis?: () => number }).toMillis === "function") return (raw as { toMillis: () => number }).toMillis();
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return null;
}

export async function loadAppVersionDistribution(): Promise<AppVersionDistribution> {
  await getCurrentAdmin();
  const snap = await gcFitnessFirestore()
    .collectionGroup(FCM_TOKENS_SUBCOLLECTION)
    .select("platform", "appBuild", "appVersion", "registeredAt")
    .limit(MAX_TOKENS)
    .get();
  const tokens: TokenRecord[] = snap.docs
    // users/{uid}/fcm_tokens/{id} — the owner is the grandparent doc.
    .filter((d) => d.ref.parent.parent?.parent.id === "users")
    .map((d) => ({
      uid: d.ref.parent.parent!.id,
      platform: d.get("platform"),
      appBuild: d.get("appBuild"),
      appVersion: d.get("appVersion"),
      registeredAtMs: toMs(d.get("registeredAt")),
    }));
  return { platforms: buildDistribution(tokens), tokensRead: snap.size, capped: snap.size >= MAX_TOKENS };
}
