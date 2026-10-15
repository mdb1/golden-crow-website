import {
  assertServerActionsKey,
  serverActionsKeyProblem,
} from "../server-actions-key";

// The shape `openssl rand -base64 32` prints.
const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

describe("assertServerActionsKey", () => {
  it("fails a production build without the key", () => {
    expect(() => assertServerActionsKey({ VERCEL_ENV: "production" })).toThrow(
      /NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is not set/,
    );
  });

  it("fails a production build with a key Next could not use", () => {
    expect(() =>
      assertServerActionsKey({
        VERCEL_ENV: "production",
        NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "my-secret",
      }),
    ).toThrow(/not base64/);
    expect(() =>
      assertServerActionsKey({
        VERCEL_ENV: "production",
        NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(10).toString("base64"),
      }),
    ).toThrow(/10 bytes/);
  });

  it("passes a production build with a valid key", () => {
    expect(() =>
      assertServerActionsKey({
        VERCEL_ENV: "production",
        NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: VALID_KEY,
      }),
    ).not.toThrow();
  });

  it("never blocks local, preview or verification builds", () => {
    expect(() => assertServerActionsKey({})).not.toThrow();
    expect(() => assertServerActionsKey({ VERCEL_ENV: "preview" })).not.toThrow();
  });
});

describe("serverActionsKeyProblem", () => {
  it("accepts every AES key size", () => {
    for (const bytes of [16, 24, 32]) {
      expect(serverActionsKeyProblem(Buffer.alloc(bytes).toString("base64"))).toBeNull();
    }
  });
});
