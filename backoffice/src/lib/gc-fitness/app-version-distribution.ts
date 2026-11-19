// app-version-distribution.ts — #541: «¿a cuántos bloquea este minBuild?» for
// /gc-fitness/admin/app-config. Pure. The reader is `app-version-distribution-reader.ts`.
//
// Source: `users/{uid}/fcm_tokens/{tokenId}` = `{ platform, appVersion, appBuild,
// registeredAt }` (#785). It is the ONLY per-device version signal we have; caveats the
// page states next to the numbers:
//   - a device counts once it registered a push token (both apps register on sign-in);
//   - a user who uninstalled keeps their last token doc, so the counts are an UPPER bound;
//   - tokens from before #785 have no build → «unknown» (they are, by construction, old).
// Per user and platform the NEWEST registration wins: a token rotates and every rotation
// writes a new doc, so older docs of the same phone must not count as a second device.

export type DistributionPlatform = "ios" | "android";

export interface TokenRecord {
  uid: string;
  platform: unknown;
  appBuild: unknown;
  appVersion: unknown;
  registeredAtMs: number | null;
}

export interface BuildBucket {
  build: number;
  /** Marketing version seen with this build (newest registration). */
  version: string | null;
  users: number;
}

export interface PlatformDistribution {
  platform: DistributionPlatform;
  users: number;
  /** Users whose newest token has no parseable build. */
  unknownBuild: number;
  /** Newest build first. */
  buckets: BuildBucket[];
}

export function parseBuild(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw === "string" && /^\d{1,10}$/.test(raw.trim())) return Number.parseInt(raw.trim(), 10);
  return null;
}

export function buildDistribution(tokens: TokenRecord[]): PlatformDistribution[] {
  const newest = new Map<string, TokenRecord>();
  for (const tok of tokens) {
    const platform = tok.platform === "ios" || tok.platform === "android" ? tok.platform : null;
    if (!platform) continue;
    const key = `${platform}|${tok.uid}`;
    const prev = newest.get(key);
    if (!prev || (tok.registeredAtMs ?? -1) > (prev.registeredAtMs ?? -1)) newest.set(key, tok);
  }
  return (["ios", "android"] as const).map((platform) => {
    const mine = [...newest.entries()].filter(([k]) => k.startsWith(`${platform}|`)).map(([, v]) => v);
    const byBuild = new Map<number, { users: number; version: string | null; at: number }>();
    let unknownBuild = 0;
    for (const tok of mine) {
      const build = parseBuild(tok.appBuild);
      if (build === null) {
        unknownBuild += 1;
        continue;
      }
      const cur = byBuild.get(build) ?? { users: 0, version: null, at: -1 };
      const at = tok.registeredAtMs ?? -1;
      byBuild.set(build, {
        users: cur.users + 1,
        version: at >= cur.at && typeof tok.appVersion === "string" ? tok.appVersion : cur.version,
        at: Math.max(at, cur.at),
      });
    }
    return {
      platform,
      users: mine.length,
      unknownBuild,
      buckets: [...byBuild.entries()]
        .map(([build, v]) => ({ build, version: v.version, users: v.users }))
        .sort((a, b) => b.build - a.build),
    };
  });
}

/** Users a gate of `minBuild` would force to update (unknown builds counted apart). */
export function blockedBy(dist: PlatformDistribution, minBuild: number): { known: number; unknown: number } {
  if (!Number.isFinite(minBuild) || minBuild <= 0) return { known: 0, unknown: 0 };
  return {
    known: dist.buckets.filter((b) => b.build < minBuild).reduce((a, b) => a + b.users, 0),
    unknown: dist.unknownBuild,
  };
}
