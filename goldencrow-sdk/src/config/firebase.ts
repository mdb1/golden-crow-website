/**
 * Pitfall 16 — Named-App Per-Project Firebase Admin Registry
 *
 * This module is the SOLE legitimate site in the SDK that calls
 * `initializeApp(...)`. Every call passes an explicit project-key name
 * argument; the Node `firebase-admin` SDK keeps a process-global app
 * registry, so a second project added via the default app would collide
 * with the first project's connection pool and silently corrupt cross-
 * project queries (Pitfall 16, see PATTERNS.md Pattern A).
 *
 * Pattern A reuse: generalizes the `getOrInit(projectKey)` pattern from
 * `golden-crow-website/backoffice/src/lib/firebase/gc-fitness-admin.ts`
 * to a registry keyed by `ProjectKey`. Per-project env vars are pulled
 * from the `ENV_KEYS_BY_PROJECT` table at the time the project is first
 * accessed (lazy resolution + loud-fail on missing env).
 *
 * Backwards compatibility:
 *   - The legacy single-project env keys `FIREBASE_ADMIN_PROJECT_ID` /
 *     `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` are
 *     REMAPPED to the `mydnamap` per-project keys. If both legacy and
 *     `MYDNAMAP_FIREBASE_ADMIN_*` are present, legacy wins with a one-
 *     time deprecation log; the deploy should migrate to the new names.
 *   - The legacy module-level exports `adminDb` / `adminAuth` /
 *     `adminStorage` / `default` are REMOVED. They are replaced with a
 *     `Proxy` shim that throws at first ACCESS (not at module load) so
 *     callers continue to import the module without exploding the entire
 *     SDK boot, but every legacy CALL site surfaces a clear migration
 *     error. Plan 11-02 migrates the call sites; the integration test
 *     in `__tests__/firebase-registry.test.ts` locks the registry
 *     semantics independently of that migration.
 *
 * Adding a new project:
 *   1. Append the literal to `ProjectKey` in `../types/sdk.types.ts`.
 *   2. Add a new entry to `ENV_KEYS_BY_PROJECT` below.
 *   3. Wire `TEAM_ALLOWLIST_*` in `./env.ts` and extend
 *      `resolveProjectAccess`.
 *   4. Configure the three `<KEY>_FIREBASE_ADMIN_*` env vars in Vercel.
 */

import {
  initializeApp,
  getApps,
  cert,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage, type Storage } from "firebase-admin/storage";

import type { ProjectKey } from "../types/sdk.types.js";

interface ProjectEnvKeys {
  /** Env var names (NOT values) for the per-project service account. */
  readonly projectId: readonly string[];
  readonly clientEmail: readonly string[];
  readonly privateKey: readonly string[];
  /**
   * If true, the resolved private key is base64-decoded before being
   * passed to `cert()`. Falls back to the raw value if decode fails or
   * yields an empty string. This matches the backoffice
   * `gc-fitness-admin.ts` convention (avoids newline/escape pitfalls in
   * the Vercel env-var UI).
   */
  readonly privateKeyIsBase64: boolean;
}

/**
 * Per-project env-var table. The arrays are ordered: the first defined
 * value wins. This lets `mydnamap` accept BOTH the legacy single-project
 * names AND the new namespaced names (legacy first, so existing deploys
 * keep working).
 */
const ENV_KEYS_BY_PROJECT: Record<ProjectKey, ProjectEnvKeys> = {
  mydnamap: {
    projectId: ["FIREBASE_ADMIN_PROJECT_ID", "MYDNAMAP_FIREBASE_ADMIN_PROJECT_ID"],
    clientEmail: ["FIREBASE_ADMIN_CLIENT_EMAIL", "MYDNAMAP_FIREBASE_ADMIN_CLIENT_EMAIL"],
    privateKey: ["FIREBASE_ADMIN_PRIVATE_KEY", "MYDNAMAP_FIREBASE_ADMIN_PRIVATE_KEY"],
    privateKeyIsBase64: false,
  },
  "pocket-gyms": {
    projectId: ["POCKETGYMS_FIREBASE_ADMIN_PROJECT_ID"],
    clientEmail: ["POCKETGYMS_FIREBASE_ADMIN_CLIENT_EMAIL"],
    privateKey: ["POCKETGYMS_FIREBASE_ADMIN_PRIVATE_KEY"],
    privateKeyIsBase64: false,
  },
  "gc-fitness": {
    // Mirror the backoffice convention from
    // `backoffice/src/lib/firebase/gc-fitness-admin.ts`:
    //   - projectId loaded from `NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID`
    //     (publicly readable; the same value lives in the iOS plist).
    //   - clientEmail + privateKey are server-secret; private key is base64.
    projectId: [
      "GC_FITNESS_FIREBASE_ADMIN_PROJECT_ID",
      "NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID",
    ],
    clientEmail: ["GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL"],
    privateKey: ["GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY"],
    privateKeyIsBase64: true,
  },
};

function readFirstEnv(names: readonly string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.length > 0) return v;
  }
  return undefined;
}

function decodePrivateKey(raw: string, isBase64: boolean): string {
  if (isBase64) {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      if (decoded && decoded.length > 0) return decoded;
    } catch {
      // Fall through to raw — decode failure means the var probably
      // already holds an unencoded PEM string.
    }
  }
  // Common Vercel pitfall: PEM newlines escaped as `\n` literals.
  return raw.replace(/\\n/g, "\n");
}

let legacyMydnamapEnvWarned = false;
function warnIfLegacyMydnamapEnv(): void {
  if (legacyMydnamapEnvWarned) return;
  const hasLegacy = !!process.env.FIREBASE_ADMIN_PROJECT_ID;
  const hasNew = !!process.env.MYDNAMAP_FIREBASE_ADMIN_PROJECT_ID;
  if (hasLegacy && hasNew) {
    // eslint-disable-next-line no-console
    console.warn(
      "[goldencrow-sdk:firebase] Both legacy FIREBASE_ADMIN_* and " +
        "MYDNAMAP_FIREBASE_ADMIN_* env vars are set. Legacy wins for " +
        "backwards compat — please remove the duplicates once the " +
        "deploy is fully migrated to the namespaced env names."
    );
    legacyMydnamapEnvWarned = true;
  }
}

/**
 * Resolves & validates env vars for `project`, then returns a pre-existing
 * `App` from the registry or creates a new one named `project`. Throws
 * with a descriptive error listing the missing env-var names if any of
 * the three required credentials are absent (no silent half-init).
 */
function getOrInit(project: ProjectKey): App {
  const existing = getApps().find((a) => a.name === project);
  if (existing) return existing;

  warnIfLegacyMydnamapEnv();

  const keys = ENV_KEYS_BY_PROJECT[project];
  const projectId = readFirstEnv(keys.projectId);
  const clientEmail = readFirstEnv(keys.clientEmail);
  const privateKeyRaw = readFirstEnv(keys.privateKey);

  const missing: string[] = [];
  if (!projectId) missing.push(keys.projectId.join(" OR "));
  if (!clientEmail) missing.push(keys.clientEmail.join(" OR "));
  if (!privateKeyRaw) missing.push(keys.privateKey.join(" OR "));
  if (missing.length > 0 || !projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      `goldencrow-sdk firebase: missing env for project '${project}' — ` +
        `expected ${missing.join(", ")}`
    );
  }

  const privateKey = decodePrivateKey(privateKeyRaw, keys.privateKeyIsBase64);

  return initializeApp(
    {
      credential: cert({ projectId, clientEmail, privateKey }),
    },
    project
  );
}

/**
 * Returns the per-project `App` instance, creating it on first call.
 * Idempotent: subsequent calls return the same `App`.
 *
 * Pitfall 16 invariant: the underlying `initializeApp()` always passes
 * `project` as the explicit name argument — no default-app slot is ever
 * touched by this SDK.
 */
export function adminAppFor(project: ProjectKey): App {
  return getOrInit(project);
}

function lazyAdminHandle<T extends object>(factory: () => T): T {
  let instance: T | undefined;

  function getInstance() {
    instance ??= factory();
    return instance;
  }

  return new Proxy({} as T, {
    get(_target, property) {
      const target = getInstance();
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(_target, property, value) {
      const target = getInstance();
      return Reflect.set(target, property, value, target);
    },
    has(_target, property) {
      return property in getInstance();
    },
  });
}

export function adminAuthFor(project: ProjectKey): Auth {
  return lazyAdminHandle(() => getAuth(getOrInit(project)));
}

export function adminDbFor(project: ProjectKey): Firestore {
  return lazyAdminHandle(() => getFirestore(getOrInit(project)));
}

export function adminStorageFor(project: ProjectKey): Storage {
  return lazyAdminHandle(() => getStorage(getOrInit(project)));
}

// ---------------------------------------------------------------------------
// Legacy default-app exports — DEPRECATED, removed in spirit, retained as
// throwing Proxy shims so plan 11-02 can migrate the call sites one-by-one
// without the entire SDK boot failing at module load. Each shim throws at
// FIRST ACCESS (property read or method call) with a clear migration error.
//
// DO NOT add new call sites against these exports. The grep PR-check script
// (`scripts/check-no-default-app.sh`) does not catch these by name, but
// every legacy access throws at runtime, so the Jest + integration suite in
// 11-02 will surface any remaining call.
// ---------------------------------------------------------------------------

function throwingProxy(legacyName: string): never {
  // Returned by call-site `import { adminDb } from "..."`. Any property
  // read or function call surfaces the migration error at use time. We
  // can't actually type this as Firestore | Auth | Storage without
  // lying — `as never` is intentional.
  const handler: ProxyHandler<object> = {
    get() {
      throw new Error(
        `goldencrow-sdk firebase: '${legacyName}' default-app export was ` +
          `removed in Phase 11 (Pitfall 16 fix). Use ${migrationHint(legacyName)} ` +
          `from this module instead. See .planning/phases/11-backoffice-slot-in/.`
      );
    },
    apply() {
      throw new Error(
        `goldencrow-sdk firebase: '${legacyName}' default-app export was ` +
          `removed in Phase 11 (Pitfall 16 fix). Use ${migrationHint(legacyName)} ` +
          `from this module instead. See .planning/phases/11-backoffice-slot-in/.`
      );
    },
  };
  return new Proxy(function () {}, handler) as never;
}

function migrationHint(legacyName: string): string {
  switch (legacyName) {
    case "adminDb":
      return "adminDbFor('mydnamap')";
    case "adminAuth":
      return "adminAuthFor('mydnamap')";
    case "adminStorage":
      return "adminStorageFor('mydnamap')";
    case "default":
      return "adminAppFor('mydnamap')";
    default:
      return "adminAppFor(<projectKey>)";
  }
}

/** @deprecated Pitfall 16 — use `adminDbFor('mydnamap')`. Throws on access. */
export const adminDb: Firestore = throwingProxy("adminDb");

/** @deprecated Pitfall 16 — use `adminAuthFor('mydnamap')`. Throws on access. */
export const adminAuth: Auth = throwingProxy("adminAuth");

/** @deprecated Pitfall 16 — use `adminStorageFor('mydnamap')`. Throws on access. */
export const adminStorage: Storage = throwingProxy("adminStorage");

/** @deprecated Pitfall 16 — use `adminAppFor('mydnamap')`. Throws on access. */
const adminApp: App = throwingProxy("default");
export default adminApp;
