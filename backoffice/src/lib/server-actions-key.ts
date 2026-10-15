// server-actions-key.ts
//
// #382 — fails the PRODUCTION build when NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is
// missing or malformed.
//
// Next.js salts every Server Action ID with this key. Without it, `next build`
// invents a random key per build cache, and a redeploy can rotate every ID:
// tabs opened before it fail their next submit with "Server Action … was not
// found on the server" and the coach loses the form. Nothing turns red when
// that happens, so the only way to keep the key from silently going missing
// (a renamed Vercel variable, a new project) is to refuse to build without it.
//
// Scoped to VERCEL_ENV=production on purpose: local builds, the action-ID
// verification script and previews must keep building without the secret.
//
// Imported by next.config.ts — keep it dependency-free.

/** Byte lengths Next accepts: it imports the key as an AES-GCM key. */
const AES_KEY_BYTES = new Set([16, 24, 32]);

/** `process.env`, or any subset of it (tests pass plain objects). */
export type ServerActionsKeyEnv = Readonly<Record<string, string | undefined>>;

/** Returns the problem with the key, or null when it is usable. */
export function serverActionsKeyProblem(key: string | undefined): string | null {
  if (!key || key.trim() === "") return "is not set";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(key)) return "is not base64";
  const bytes = Buffer.from(key, "base64").length;
  if (!AES_KEY_BYTES.has(bytes)) {
    return `decodes to ${bytes} bytes; an AES key is 16, 24 or 32`;
  }
  return null;
}

export function assertServerActionsKey(env: ServerActionsKeyEnv): void {
  if (env.VERCEL_ENV !== "production") return;
  const problem = serverActionsKeyProblem(env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY);
  if (problem === null) return;
  throw new Error(
    `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ${problem}. Production builds need a ` +
      "fixed key so Server Action IDs survive deploys (#382). Generate one with " +
      "`openssl rand -base64 32` and set it in Vercel → Settings → Environment " +
      "Variables. See backoffice/.env.example.",
  );
}
