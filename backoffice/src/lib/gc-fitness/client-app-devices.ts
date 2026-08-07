// client-app-devices.ts
//
// #785 — "nos falta en cada perfil, qué versión de la app están usando, y si es
// iOS o Android".
//
// WHERE THE ANSWER ALREADY LIVES
// ------------------------------
// Every signed-in device registers its push token at
// `/users/{uid}/fcm_tokens/{tokenId}` with `{ token, platform, registeredAt }` —
// both apps have written `platform` since P02-07 (`"ios"` / `"android"`). So the
// platform half of the question needed no new write anywhere; it was simply
// never read.
//
// `appVersion` / `appBuild` are the new half: the apps started stamping them
// onto the same doc, and the rules whitelist admits them. A device that has not
// re-registered since that build reports a null version rather than a wrong one
// — which is itself the answer to "who is on an old build".
//
// WHY THE TOKEN SUBCOLLECTION AND NOT THE USER DOC
// ------------------------------------------------
// The question is per-DEVICE. Someone with an iPhone and an Android tablet is
// on two versions at once, and a single `users/{uid}.appVersion` would show
// whichever wrote last — a value that is right about nothing. One row per
// device also makes "signed in on the phone in March, never since" visible.

import type { Firestore } from "firebase-admin/firestore";

import { FirestoreCollections } from "@/lib/gc-fitness/collections";

export type ClientAppPlatform = "ios" | "android" | "unknown";

export interface ClientAppDevice {
  platform: ClientAppPlatform;
  /** Marketing version ("1.3.0"), or null for a device registered before #785. */
  appVersion: string | null;
  /** Build number, when the app reported one. */
  appBuild: string | null;
  registeredAtISO: string | null;
}

/** Firestore subcollection holding one doc per registered device. */
export const FCM_TOKENS_SUBCOLLECTION = "fcm_tokens";

function asIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const ts = value as { toDate?: () => Date };
  if (typeof ts.toDate === "function") {
    const date = ts.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function asPlatform(value: unknown): ClientAppPlatform {
  return value === "ios" || value === "android" ? value : "unknown";
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Project raw token docs into the per-device rows a profile renders.
 *
 * Pure — no Firestore — so the shape and the ordering are unit-testable.
 * Newest registration first, and one row per (platform, version, build): a
 * token ROTATES (Firebase mints a new one on reinstall, restore, or its own
 * schedule) and each rotation writes a new doc, so a single phone can hold a
 * dozen. Collapsing them keeps the profile answering "what is this person
 * running" instead of listing push-token history.
 */
export function projectAppDevices(
  docs: Array<{ data: () => Record<string, unknown> }>,
): ClientAppDevice[] {
  const rows = docs
    .map((doc) => {
      const d = doc.data();
      return {
        platform: asPlatform(d.platform),
        appVersion: asText(d.appVersion),
        appBuild: asText(d.appBuild),
        registeredAtISO: asIso(d.registeredAt),
      };
    })
    .sort((a, b) => (b.registeredAtISO ?? "").localeCompare(a.registeredAtISO ?? ""));

  const seen = new Set<string>();
  const out: ClientAppDevice[] = [];
  for (const row of rows) {
    const key = `${row.platform}|${row.appVersion ?? ""}|${row.appBuild ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * "iOS 1.3.0 (42)" — one device, for a profile line.
 *
 * A device with no version says so rather than looking current: the whole point
 * of the field is spotting who is behind.
 */
export function formatAppDevice(device: ClientAppDevice): string {
  const platform =
    device.platform === "ios"
      ? "iOS"
      : device.platform === "android"
        ? "Android"
        : "Desconocido";
  if (!device.appVersion) return `${platform} · versión desconocida`;
  return device.appBuild
    ? `${platform} ${device.appVersion} (${device.appBuild})`
    : `${platform} ${device.appVersion}`;
}

/**
 * Read a client's registered devices. Bounded: a heavy token rotator can
 * accumulate docs, and this feeds one line of a profile.
 */
export async function listClientAppDevices(
  db: Firestore,
  uid: string,
  limit = 25,
): Promise<ClientAppDevice[]> {
  const snap = await db
    .collection(FirestoreCollections.users)
    .doc(uid)
    .collection(FCM_TOKENS_SUBCOLLECTION)
    .limit(limit)
    .get()
    .catch(() => null);
  return snap ? projectAppDevices(snap.docs) : [];
}
