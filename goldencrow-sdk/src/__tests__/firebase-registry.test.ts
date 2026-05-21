/**
 * P11-01 — Named-app registry isolation tests.
 *
 * These tests assert the Pitfall 16 invariants directly:
 *   T1: Different project keys → different App instances.
 *   T2: Same project key called twice → same App instance (idempotent).
 *   T3: Missing env vars → loud throw, NOT a silent half-init.
 *   T4: Per-project Firestore handles are bound to per-project Apps.
 *   T5 (bonus): adminAuthFor('pocket-gyms') is bound to the 'pocket-gyms' App.
 *
 * Strategy: mock `firebase-admin/app`, `firebase-admin/firestore`, and
 * `firebase-admin/auth` so we don't make real network connections. The
 * mocks track `initializeApp(...)` calls and return App-shaped stubs
 * whose `.name` property is the second argument. That's enough surface
 * to assert registry isolation without booting a real Firebase Admin.
 */

// ---- Module mocks -------------------------------------------------------

interface AppStub {
  name: string;
  options: unknown;
}

const __registry: AppStub[] = [];

jest.mock("firebase-admin/app", () => ({
  initializeApp: jest.fn((options: unknown, name?: string) => {
    if (!name) {
      throw new Error(
        "test stub: initializeApp() called without explicit name — " +
          "this would mean the registry regressed to default-app behavior",
      );
    }
    const existing = __registry.find((a) => a.name === name);
    if (existing) return existing;
    const app: AppStub = { name, options };
    __registry.push(app);
    return app;
  }),
  getApps: jest.fn(() => __registry),
  cert: jest.fn((c: unknown) => c),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn((app: AppStub) => ({
    app,
    __kind: "firestore-stub" as const,
  })),
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn((app: AppStub) => ({
    app,
    __kind: "auth-stub" as const,
  })),
}));

jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn((app: AppStub) => ({
    app,
    __kind: "storage-stub" as const,
  })),
}));

// ---- Helpers -----------------------------------------------------------

function clearRegistry(): void {
  while (__registry.length > 0) __registry.pop();
}

function clearAdminEnv(): void {
  delete process.env.FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.MYDNAMAP_FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.MYDNAMAP_FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.MYDNAMAP_FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.POCKETGYMS_FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.POCKETGYMS_FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.POCKETGYMS_FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.GC_FITNESS_FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID;
}

function setEnvForAllProjects(): void {
  process.env.FIREBASE_ADMIN_PROJECT_ID = "mydnamap-prj";
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "mydnamap@test.iam";
  process.env.FIREBASE_ADMIN_PRIVATE_KEY = "fake-key-mydnamap";

  process.env.POCKETGYMS_FIREBASE_ADMIN_PROJECT_ID = "pocketgyms-prj";
  process.env.POCKETGYMS_FIREBASE_ADMIN_CLIENT_EMAIL = "pg@test.iam";
  process.env.POCKETGYMS_FIREBASE_ADMIN_PRIVATE_KEY = "fake-key-pg";

  // gc-fitness — base64-encoded private key per backoffice convention.
  process.env.GC_FITNESS_FIREBASE_ADMIN_PROJECT_ID = "gcfitness-3476b";
  process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL = "gcf@test.iam";
  process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY =
    Buffer.from("fake-key-gcf").toString("base64");
}

// ---- Tests --------------------------------------------------------------

describe("P11-01 named-app Firebase registry", () => {
  beforeEach(() => {
    jest.resetModules();
    clearRegistry();
    clearAdminEnv();
  });

  it("T1: different project keys yield distinct App instances", () => {
    setEnvForAllProjects();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { adminAppFor } = require("../config/firebase");
    const a = adminAppFor("mydnamap");
    const b = adminAppFor("gc-fitness");
    expect(a).not.toBe(b);
    expect(a.name).toBe("mydnamap");
    expect(b.name).toBe("gc-fitness");
  });

  it("T2: same project key called twice returns the same App (idempotent)", () => {
    setEnvForAllProjects();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { adminAppFor } = require("../config/firebase");
    const a1 = adminAppFor("mydnamap");
    const a2 = adminAppFor("mydnamap");
    expect(a1).toBe(a2);
  });

  it("T3: missing env throws a descriptive error (no silent half-init)", () => {
    // Intentionally do NOT set env vars for gc-fitness.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { adminAppFor } = require("../config/firebase");
    expect(() => adminAppFor("gc-fitness")).toThrow(/gc-fitness/);
    expect(() => adminAppFor("gc-fitness")).toThrow(/missing env/i);
  });

  it("T4: per-project Firestore handles bind to per-project Apps", () => {
    setEnvForAllProjects();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { adminDbFor } = require("../config/firebase");
    const dbA = adminDbFor("mydnamap");
    const dbB = adminDbFor("gc-fitness");
    expect(dbA.app.name).toBe("mydnamap");
    expect(dbB.app.name).toBe("gc-fitness");
    expect(dbA.app).not.toBe(dbB.app);
  });

  it("T5 (bonus): adminAuthFor('pocket-gyms') is bound to the 'pocket-gyms' App", () => {
    setEnvForAllProjects();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { adminAuthFor } = require("../config/firebase");
    const auth = adminAuthFor("pocket-gyms");
    expect(auth.app.name).toBe("pocket-gyms");
  });
});
