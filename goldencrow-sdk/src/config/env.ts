function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}`);
  return value;
}

export const ENV = {
  PORT: Number(process.env.PORT ?? "3000"),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  FIREBASE_PROJECT_ID: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
  FIREBASE_CLIENT_EMAIL: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
  FIREBASE_PRIVATE_KEY: requireEnv("FIREBASE_ADMIN_PRIVATE_KEY"),
  FIREBASE_WEB_API_KEY:
    process.env.FIREBASE_WEB_API_KEY ??
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    "",
  BACKOFFICE_ORIGIN: process.env.BACKOFFICE_ORIGIN ?? "http://localhost:3001",
  EMAIL_VERIFICATION_CONTINUE_URL:
    process.env.EMAIL_VERIFICATION_CONTINUE_URL ??
    `${process.env.BACKOFFICE_ORIGIN ?? "http://localhost:3001"}/login`,
};

// Comma-separated emails: TEAM_ALLOWLIST=alice@example.com,bob@example.com
export const TEAM_ALLOWLIST = new Set<string>(
  (process.env.TEAM_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
);
