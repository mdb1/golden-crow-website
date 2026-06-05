// __tests__/admin-actions.app-config.test.ts
//
// Auth-gate + validation + write-shape tests for the app-version (force-update)
// Server Actions in `admin-actions.ts`:
//   - getAppVersionConfig  — admin-gated read, zeroed defaults when absent.
//   - updateAppVersionConfig — admin-gated, Zod-validated write to
//     /app_config/mobile with the acting admin recorded for audit.
//
// All Firebase Admin + auth surfaces are mocked — no live Firestore.

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: jest.fn(),
}));

const mockSet = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn(() => ({ set: mockSet, get: mockGet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: jest.fn(() => ({ collection: mockCollection })),
  gcFitnessAuth: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP_SENTINEL"),
    increment: jest.fn((n: number) => ({ __increment: n })),
  },
}));

import {
  getAppVersionConfig,
  updateAppVersionConfig,
} from "@/lib/gc-fitness/admin-actions";
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

const validInput = () => ({
  ios: { minBuild: 42, latestVersion: "1.2.0", storeUrl: "https://apps.apple.com/app/id1" },
  android: { minBuild: 0, latestVersion: "", storeUrl: "" },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetCurrentAdmin.mockResolvedValue(ADMIN);
  mockSet.mockResolvedValue(undefined);
});

describe("updateAppVersionConfig", () => {
  it("rejects when the caller is not an admin (Forbidden)", async () => {
    mockedGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(updateAppVersionConfig(validInput())).rejects.toThrow(
      "Forbidden",
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("rejects a negative minBuild before any write", async () => {
    const bad = validInput();
    bad.ios.minBuild = -1;
    await expect(updateAppVersionConfig(bad)).rejects.toThrow();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("rejects a malformed latestVersion before any write", async () => {
    const bad = validInput();
    bad.ios.latestVersion = "not-a-version";
    await expect(updateAppVersionConfig(bad)).rejects.toThrow();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("rejects a non-http storeUrl before any write", async () => {
    const bad = validInput();
    bad.ios.storeUrl = "javascript:alert(1)";
    await expect(updateAppVersionConfig(bad)).rejects.toThrow();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("writes /app_config/mobile with the validated shape + acting admin", async () => {
    await updateAppVersionConfig(validInput());

    expect(mockCollection).toHaveBeenCalledWith("app_config");
    expect(mockDoc).toHaveBeenCalledWith("mobile");
    expect(mockSet).toHaveBeenCalledTimes(1);

    const [payload, options] = mockSet.mock.calls[0];
    expect(options).toEqual({ merge: true });
    expect(payload.ios).toEqual({
      minBuild: 42,
      latestVersion: "1.2.0",
      storeUrl: "https://apps.apple.com/app/id1",
    });
    expect(payload.android).toEqual({
      minBuild: 0,
      latestVersion: "",
      storeUrl: "",
    });
    expect(payload.updatedBy).toBe("admin@example.com");
    expect(payload.updatedAt).toBe("SERVER_TIMESTAMP_SENTINEL");
  });

  it("coerces a numeric-string minBuild to a number", async () => {
    const input = validInput();
    // Simulate a form-posted string (Input type=number serializes to string).
    (input.ios as unknown as { minBuild: string }).minBuild = "57";
    await updateAppVersionConfig(input);
    const [payload] = mockSet.mock.calls[0];
    expect(payload.ios.minBuild).toBe(57);
  });
});

describe("getAppVersionConfig", () => {
  it("rejects when the caller is not an admin (Forbidden)", async () => {
    mockedGetCurrentAdmin.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(getAppVersionConfig()).rejects.toThrow("Forbidden");
  });

  it("returns zeroed defaults when the doc does not exist", async () => {
    mockGet.mockResolvedValueOnce({ exists: false, get: () => undefined });
    const config = await getAppVersionConfig();
    expect(config).toEqual({
      ios: { minBuild: 0, latestVersion: "", storeUrl: "" },
      android: { minBuild: 0, latestVersion: "", storeUrl: "" },
      updatedAtISO: null,
      updatedBy: null,
    });
  });

  it("maps stored platform fields + audit metadata", async () => {
    const updatedAtDate = new Date("2026-06-05T12:00:00.000Z");
    const stored: Record<string, unknown> = {
      ios: { minBuild: 42, latestVersion: "1.2.0", storeUrl: "https://apps.apple.com/app/id1" },
      android: { minBuild: 3, latestVersion: "0.9.0", storeUrl: "https://play.google.com/x" },
      updatedAt: { toDate: () => updatedAtDate },
      updatedBy: "admin@example.com",
    };
    mockGet.mockResolvedValueOnce({
      exists: true,
      get: (key: string) => stored[key],
    });

    const config = await getAppVersionConfig();
    expect(config.ios).toEqual({
      minBuild: 42,
      latestVersion: "1.2.0",
      storeUrl: "https://apps.apple.com/app/id1",
    });
    expect(config.android.minBuild).toBe(3);
    expect(config.updatedAtISO).toBe(updatedAtDate.toISOString());
    expect(config.updatedBy).toBe("admin@example.com");
  });
});
