// __tests__/admin-user-search.test.ts
//
// Unit coverage for the pure email CONTAINS matcher used by the admin
// user-email search (GitHub issue #163). These exports are side-effect free
// (no firebase imports) — the unit-testable seam for the Admin-SDK scan.
//
// The server-action block (searchUsersByEmailForAdmin) is appended later and
// mirrors admin-actions.app-config.test.ts mocks.

import { emailMatchesQuery, normalizeSearchQuery } from "../admin-user-search";

// ── Mocks for the server-action block (mirrors admin-actions.app-config.test.ts).
// jest.mock is hoisted, so these apply file-wide; the pure helper above has NO
// firebase imports, so mocking firebase does not affect its tests.
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: jest.fn(),
}));

const mockGet = jest.fn();
const mockSelect = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ select: mockSelect }));
const mockGetUser = jest.fn();

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({ collection: mockCollection })),
  gcFitnessAuth: jest.fn(() => ({ getUser: mockGetUser })),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP_SENTINEL"),
    increment: jest.fn((n: number) => ({ __increment: n })),
    delete: jest.fn(() => "DELETE_SENTINEL"),
  },
}));

/** Build a mock projected QueryDocumentSnapshot: supports .data() and .get(field). */
function mockDoc(id: string, fields: Record<string, unknown>) {
  return {
    id,
    data: () => fields,
    get: (field: string) => fields[field],
  };
}

describe("normalizeSearchQuery", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeSearchQuery("  Foo@Example.COM ")).toBe("foo@example.com");
  });

  it("does NOT apply gmail dot/plus canonicalization (literal matching)", () => {
    // Unlike normalizeMirrorEmail, this keeps dots + the +tag so the literal
    // stored email substring matches.
    expect(normalizeSearchQuery("First.Last+tag@Gmail.com")).toBe(
      "first.last+tag@gmail.com",
    );
  });

  it("returns empty string for an all-whitespace input", () => {
    expect(normalizeSearchQuery("   ")).toBe("");
  });
});

describe("emailMatchesQuery", () => {
  it("matches a prefix", () => {
    expect(emailMatchesQuery("carba.nico@gmail.com", "carba")).toBe(true);
  });

  it("matches a mid-string substring (the #163 follow-up case)", () => {
    expect(emailMatchesQuery("ncarballal@gmail.com", "carba")).toBe(true);
  });

  it("matches case-insensitively against the stored value", () => {
    expect(emailMatchesQuery("NCarballal@Gmail.com", "carba")).toBe(true);
  });

  it("does not match when the substring is absent", () => {
    expect(emailMatchesQuery("someone@example.com", "carba")).toBe(false);
  });

  it("never matches an empty query", () => {
    expect(emailMatchesQuery("someone@example.com", "")).toBe(false);
  });

  it("never matches non-string or empty stored emails", () => {
    expect(emailMatchesQuery(undefined, "a")).toBe(false);
    expect(emailMatchesQuery(null, "a")).toBe(false);
    expect(emailMatchesQuery(42, "a")).toBe(false);
    expect(emailMatchesQuery("", "a")).toBe(false);
  });
});

// ── Server-action block ───────────────────────────────────────────────────────
// Imported AFTER the mocks above are declared. searchUsersByEmailForAdmin is
// admin-gated, scans the users collection with a field projection, filters
// CONTAINS in memory, and merges claim roles into the doc role.

import { searchUsersByEmailForAdmin } from "../admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";

const mockedGetCurrentAdmin = getCurrentAdmin as jest.MockedFunction<
  typeof getCurrentAdmin
>;

const ADMIN = {
  uid: "admin-1",
  email: "admin@example.com",
  role: "admin" as const,
  isTrainer: false,
  roles: ["admin"],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetCurrentAdmin.mockResolvedValue(ADMIN);
  mockGetUser.mockResolvedValue({ customClaims: {} });
});

describe("searchUsersByEmailForAdmin", () => {
  it("propagates Forbidden when the caller is not an admin", async () => {
    mockedGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(searchUsersByEmailForAdmin("foo")).rejects.toThrow("Forbidden");
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it("returns [] for an empty query WITHOUT querying firestore", async () => {
    const rows = await searchUsersByEmailForAdmin("   ");
    expect(rows).toEqual([]);
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it("scans users with a field projection and filters CONTAINS (not prefix-only)", async () => {
    const docs = [
      mockDoc("uid-prefix", { email: "carba.nico@gmail.com", role: "trainer" }),
      mockDoc("uid-substr", { email: "ncarballal@gmail.com", role: "client", coachId: "coach-1" }),
      mockDoc("uid-other", { email: "someone@example.com", role: "client" }),
    ];
    mockGet.mockResolvedValueOnce({ docs });

    const rows = await searchUsersByEmailForAdmin("  Carba ");

    expect(mockCollection).toHaveBeenCalledWith("users");
    expect(mockSelect).toHaveBeenCalledWith(
      "email",
      "displayName",
      "role",
      "photoURL",
      "deleted",
      "coachId",
    );
    // Both the prefix match AND the mid-string match come back; the non-match doesn't.
    expect(rows.map((r) => r.uid).sort()).toEqual(["uid-prefix", "uid-substr"]);
    // Auth lookups only ran for the matches.
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  it("caps the result list to 50 matches", async () => {
    const docs = Array.from({ length: 60 }, (_, i) =>
      mockDoc(`uid-${i}`, { email: `user${String(i).padStart(2, "0")}@carba.com` }),
    );
    mockGet.mockResolvedValueOnce({ docs });

    const rows = await searchUsersByEmailForAdmin("carba", 9999);
    expect(rows).toHaveLength(50);
  });

  it("maps matches into rows and merges claim roles with the doc role", async () => {
    const docs = [
      mockDoc("uid-client", {
        email: "client@example.com",
        displayName: "Client One",
        role: "client",
        photoURL: "https://example.com/c.jpg",
        deleted: false,
        coachId: "coach-9",
      }),
      mockDoc("uid-admin", {
        email: "admin2@example.com",
        displayName: "Admin Two",
        // No doc role — admin lives only in claims.
      }),
    ];
    mockGet.mockResolvedValueOnce({ docs });
    // Per-uid claims: the first user has no extra claims, the second is admin.
    mockGetUser.mockImplementation((uid: string) =>
      uid === "uid-admin"
        ? Promise.resolve({ customClaims: { admin: true } })
        : Promise.resolve({ customClaims: {} }),
    );

    const rows = await searchUsersByEmailForAdmin("example.com");

    expect(rows).toHaveLength(2);

    const adminRow = rows.find((r) => r.uid === "uid-admin")!;
    expect(adminRow.email).toBe("admin2@example.com");
    expect(adminRow.roles).toEqual(["admin"]);
    expect(adminRow.photoURL).toBeNull();
    expect(adminRow.coachId).toBeNull();
    expect(adminRow.deleted).toBe(false);

    const clientRow = rows.find((r) => r.uid === "uid-client")!;
    expect(clientRow.roles).toEqual(["client"]);
    expect(clientRow.photoURL).toBe("https://example.com/c.jpg");
    expect(clientRow.coachId).toBe("coach-9");

    // Sorted by email asc (admin2@ before client@).
    expect(rows.map((r) => r.email)).toEqual([
      "admin2@example.com",
      "client@example.com",
    ]);
  });

  it("does not throw when getUser fails for a doc (tolerant role merge)", async () => {
    const docs = [
      mockDoc("uid-x", { email: "x@example.com", displayName: "X", role: "trainer" }),
    ];
    mockGet.mockResolvedValueOnce({ docs });
    mockGetUser.mockRejectedValueOnce(new Error("auth/user-not-found"));

    const rows = await searchUsersByEmailForAdmin("x");
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toEqual(["trainer"]);
  });
});
