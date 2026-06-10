// __tests__/admin-user-search.test.ts
//
// Unit coverage for the pure email-prefix range-bound builder used by the
// admin user-email search (GitHub issue #163). These exports are side-effect
// free (no firebase imports) — the unit-testable seam for the Admin-SDK query.
//
// The server-action block (searchUsersByEmailForAdmin) is appended later and
// mirrors admin-actions.app-config.test.ts mocks.

import {
  buildEmailPrefixBounds,
  normalizeSearchQuery,
} from "../admin-user-search";

// ── Mocks for the server-action block (mirrors admin-actions.app-config.test.ts).
// jest.mock is hoisted, so these apply file-wide; the pure helper above has NO
// firebase imports, so mocking firebase does not affect its tests.
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: jest.fn(),
}));

const mockGet = jest.fn();
const mockLimit = jest.fn(() => ({ get: mockGet }));
const mockEndAt = jest.fn(() => ({ limit: mockLimit }));
const mockStartAt = jest.fn(() => ({ endAt: mockEndAt }));
const mockOrderBy = jest.fn(() => ({ startAt: mockStartAt }));
const mockCollection = jest.fn(() => ({ orderBy: mockOrderBy }));
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

// Standard Firestore prefix-range upper-bound sentinel (highest BMP private-use
// code point). The PLAN renders `endAt` as the bare query because the sentinel
// is a non-printing glyph; the real upper bound is `q + SENTINEL`.
const SENTINEL = "";

describe("normalizeSearchQuery", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeSearchQuery("  Foo@Example.COM ")).toBe("foo@example.com");
  });

  it("does NOT apply gmail dot/plus canonicalization (literal prefix matching)", () => {
    // Unlike normalizeMirrorEmail, this keeps dots + the +tag so the literal
    // stored email prefix matches.
    expect(normalizeSearchQuery("First.Last+tag@Gmail.com")).toBe(
      "first.last+tag@gmail.com",
    );
  });

  it("returns empty string for an all-whitespace input", () => {
    expect(normalizeSearchQuery("   ")).toBe("");
  });
});

describe("buildEmailPrefixBounds", () => {
  it("builds a [q, q+sentinel] range for a non-empty query", () => {
    expect(buildEmailPrefixBounds("ab")).toEqual({
      startAt: "ab",
      endAt: "ab" + SENTINEL,
    });
  });

  it("returns null for an empty query", () => {
    expect(buildEmailPrefixBounds("")).toBeNull();
  });

  it("returns null for an all-whitespace query", () => {
    expect(buildEmailPrefixBounds("   ")).toBeNull();
  });

  it("normalizes (trim + lowercase) before building bounds", () => {
    expect(buildEmailPrefixBounds("  AB ")).toEqual({
      startAt: "ab",
      endAt: "ab" + SENTINEL,
    });
  });

  it("uses the high-codepoint sentinel as the upper bound", () => {
    const bounds = buildEmailPrefixBounds("john@");
    expect(bounds).not.toBeNull();
    expect(bounds!.startAt).toBe("john@");
    expect(bounds!.endAt).toBe("john@" + SENTINEL);
  });
});

// ── Server-action block ───────────────────────────────────────────────────────
// Imported AFTER the mocks above are declared. searchUsersByEmailForAdmin is
// admin-gated, runs the prefix-range query via the Admin SDK, and merges claim
// roles into the doc role.

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
    expect(mockOrderBy).not.toHaveBeenCalled();
  });

  it("returns [] for an empty query WITHOUT querying firestore", async () => {
    const rows = await searchUsersByEmailForAdmin("   ");
    expect(rows).toEqual([]);
    expect(mockCollection).not.toHaveBeenCalled();
    expect(mockOrderBy).not.toHaveBeenCalled();
  });

  it("runs the orderBy(email).startAt/endAt prefix range for a non-empty query", async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });
    await searchUsersByEmailForAdmin("  John@ ");

    expect(mockCollection).toHaveBeenCalledWith("users");
    expect(mockOrderBy).toHaveBeenCalledWith("email");
    expect(mockStartAt).toHaveBeenCalledWith("john@");
    expect(mockEndAt).toHaveBeenCalledWith("john@" + SENTINEL);
  });

  it("caps the limit to 50", async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });
    await searchUsersByEmailForAdmin("john", 9999);
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it("maps a snapshot into rows and merges claim roles with the doc role", async () => {
    const docs = [
      {
        id: "uid-client",
        data: () => ({
          email: "client@example.com",
          displayName: "Client One",
          role: "client",
          photoURL: "https://example.com/c.jpg",
          deleted: false,
          coachId: "coach-9",
        }),
      },
      {
        id: "uid-admin",
        data: () => ({
          email: "admin2@example.com",
          displayName: "Admin Two",
          // No doc role — admin lives only in claims.
        }),
      },
    ];
    mockGet.mockResolvedValueOnce({ docs });
    // Per-uid claims: the first user has no extra claims, the second is admin.
    mockGetUser.mockImplementation((uid: string) =>
      uid === "uid-admin"
        ? Promise.resolve({ customClaims: { admin: true } })
        : Promise.resolve({ customClaims: {} }),
    );

    const rows = await searchUsersByEmailForAdmin("a");

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
      {
        id: "uid-x",
        data: () => ({ email: "x@example.com", displayName: "X", role: "trainer" }),
      },
    ];
    mockGet.mockResolvedValueOnce({ docs });
    mockGetUser.mockRejectedValueOnce(new Error("auth/user-not-found"));

    const rows = await searchUsersByEmailForAdmin("x");
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toEqual(["trainer"]);
  });
});
