import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { AdminRepositoryError } from "../repositories/admin-errors.js";

export const PUBLISHER_ACCESS_KEY_FIELD = "portalAccessKey";
export const PublisherAccessKeySchema = z
  .string()
  .min(6)
  .max(256)
  .refine(
    (value) => Boolean(value.trim()),
    "Enter the publisher's current access key.",
  );
const CredentialSchema = z
  .object({ email: z.string().email(), accessKey: PublisherAccessKeySchema })
  .strict();
export type PublisherCredentialKind = "organization" | "individual";

function encryptionKey() {
  const material =
    process.env.PUBLISHER_PORTAL_CREDENTIALS_SECRET?.trim() ||
    (
      process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
      process.env.MYDNAMAP_FIREBASE_ADMIN_PRIVATE_KEY
    )
      ?.trim()
      .replace(/\\n/g, "\n");
  if (!material || Buffer.byteLength(material) < 32) {
    throw new AdminRepositoryError(
      "Publisher credential storage is not configured.",
      503,
    );
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      material,
      "pocketgenes-publisher-portal",
      "stored-access-key-v1",
      32,
    ),
  );
}

// Discover profiles may be read outside the backoffice. Only authenticated
// ciphertext is stored on the entity; ordinary profile DTOs never include it.
export function sealPublisherAccessKey(
  kind: PublisherCredentialKind,
  id: string,
  email: string,
  accessKey: string,
) {
  const credential = CredentialSchema.parse({
    email: email.trim().toLowerCase(),
    accessKey,
  });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${kind}:${id}`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credential), "utf8"),
    cipher.final(),
  ]);
  return [
    "pgpk1",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function openPublisherAccessKey(
  kind: PublisherCredentialKind,
  id: string,
  value: unknown,
) {
  if (value === null || value === undefined) return null;
  const key = encryptionKey();
  try {
    if (typeof value !== "string" || value.length > 2048) throw new Error();
    const [prefix, iv, encrypted, tag, extra] = value.split(".");
    if (prefix !== "pgpk1" || !iv || !encrypted || !tag || extra !== undefined)
      throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(`${kind}:${id}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]);
    return CredentialSchema.parse(JSON.parse(plaintext.toString("utf8")));
  } catch {
    throw new AdminRepositoryError(
      "The stored publisher access key could not be read.",
      409,
    );
  }
}
