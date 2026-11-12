import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AdminRepositoryError } from "../repositories/admin-errors.js";

const DAY_SECONDS = 86_400;
export const PublisherAccessCodeIdentitySchema = z.object({
  email: z.string().email().max(254),
  uid: z.string().min(1).max(128),
  publisherKind: z.enum(["organization", "individual"]),
  publisherId: z.string().min(1).max(300),
  authValidAfter: z.string().max(100),
});
export type PublisherAccessCodeIdentity = z.infer<
  typeof PublisherAccessCodeIdentitySchema
>;
const PayloadSchema = PublisherAccessCodeIdentitySchema.extend({
  partnerId: z.string().min(1).max(128),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();

function signingKey() {
  const dedicated =
    process.env.PUBLISHER_PORTAL_ACCESS_CODE_SIGNING_SECRET?.trim();
  const material =
    dedicated ||
    (
      process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
      process.env.MYDNAMAP_FIREBASE_ADMIN_PRIVATE_KEY
    )
      ?.trim()
      .replace(/\\n/g, "\n");
  if (!material || Buffer.byteLength(material) < 32) {
    throw new AdminRepositoryError(
      "Publisher access codes are not configured.",
      503,
    );
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      material,
      "pocketgenes-publisher-portal",
      "access-code-v1",
      32,
    ),
  );
}

function signature(payload: string) {
  return createHmac("sha256", signingKey()).update(`pgp1.${payload}`).digest();
}

export function createPublisherAccessCode(
  identity: PublisherAccessCodeIdentity,
  partnerId: string,
  now = new Date(),
) {
  // A stable daily window keeps previews reproducible. Codes remain valid for
  // 24–48 hours, and role/identity/password revocation is checked at redemption.
  const issuedAt = Math.floor(now.getTime() / 1000 / DAY_SECONDS) * DAY_SECONDS;
  const payload = PayloadSchema.parse({
    ...identity,
    partnerId,
    issuedAt,
    expiresAt: issuedAt + 2 * DAY_SECONDS,
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    accessKey: `pgp1.${encoded}.${signature(encoded).toString("base64url")}`,
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
  };
}

export function readPublisherAccessCode(
  code: string,
  email: string,
  now = new Date(),
) {
  const invalid = () =>
    new AdminRepositoryError(
      "This access link is invalid or expired. Request a new email or use your usual access key.",
      401,
    );
  const match =
    code.length <= 2048
      ? /^pgp1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(code)
      : null;
  if (!match) throw invalid();
  const actual = Buffer.from(match[2]!, "base64url");
  const expected = signature(match[1]!);
  if (
    actual.length !== expected.length ||
    actual.toString("base64url") !== match[2] ||
    !timingSafeEqual(actual, expected)
  )
    throw invalid();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(match[1]!, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  const parsed = PayloadSchema.safeParse(decoded);
  const seconds = Math.floor(now.getTime() / 1000);
  if (
    !parsed.success ||
    parsed.data.email !== email.trim().toLowerCase() ||
    parsed.data.issuedAt > seconds ||
    parsed.data.expiresAt <= seconds ||
    parsed.data.expiresAt - parsed.data.issuedAt !== 2 * DAY_SECONDS
  )
    throw invalid();
  return parsed.data;
}
