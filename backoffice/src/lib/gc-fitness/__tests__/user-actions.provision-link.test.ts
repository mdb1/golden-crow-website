// __tests__/user-actions.provision-link.test.ts
//
// Phase 32 review-fix vectors (CR-01 / CR-02 / CR-03 / WR-01 / WR-02) for
// `provisionClient`. The pure `decideLinkOutcome` suite (coach-link.test.ts)
// cannot see the WRITE PAYLOADS, so these tests run the action against an
// in-memory Firestore mock (adapted from live-workout-actions.start-dedupe)
// whose transaction buffers writes and applies them only on commit — a
// thrown sentinel therefore aborts with zero writes, mirroring the server.
//
//  - CR-01: claiming a stray CLEARS `autoAssignedCoach` (FieldValue.delete
//    survives merge), so a second coach's attempt is a conflict, not a steal.
//  - CR-02: a `role: "trainer"` target is refused with zero writes and zero
//    claims mutation (the demotion/lockout vector).
//  - CR-03: refusals are RETURN VALUES ({ ok: false, mode }) — never thrown
//    errors whose message prod-Next.js would mask.
//  - WR-01: the idempotent claims sync also runs on the alreadyYours path,
//    healing a prior post-commit claims failure on resubmit.
//  - WR-02: the chat write carries no unreadCount and never rewrites an
//    existing chat's createdAt.

jest.mock("next/headers", () => ({
  cookies: jest.fn().mockResolvedValue({}),
}));
jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));
jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
}));

const SERVER_TIMESTAMP = "SERVER_TIMESTAMP_SENTINEL";
const FIELD_DELETE = "FIELD_DELETE_SENTINEL";

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => SERVER_TIMESTAMP),
    delete: jest.fn(() => FIELD_DELETE),
  },
}));

const mockState: { db: MockDb | null; sessionUid: string } = {
  db: null,
  sessionUid: "coach-B",
};

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({
    uid: mockState.sessionUid,
    email: `${mockState.sessionUid}@example.com`,
  })),
}));

type AuthUser = {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string | null;
  customClaims?: Record<string, unknown>;
};
const authUsersByEmail = new Map<string, AuthUser>();
const mockSetCustomUserClaims = jest.fn(async () => undefined);

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
  gcFitnessAuth: () => ({
    getUserByEmail: async (email: string) => {
      const user = authUsersByEmail.get(email);
      if (!user) {
        throw Object.assign(new Error("no user"), {
          code: "auth/user-not-found",
        });
      }
      return user;
    },
    getUser: async (uid: string) => ({ uid, customClaims: {}, photoURL: null }),
    setCustomUserClaims: mockSetCustomUserClaims,
  }),
}));

import { provisionClient } from "../user-actions";
import { FirestoreCollections } from "../collections";
import { normalizeMirrorEmail } from "../email-normalization";

// ── In-memory Firestore mock (merge + FieldValue.delete aware) ────────────

type DocData = Record<string, unknown>;

function applyPatch(base: DocData | undefined, patch: DocData): DocData {
  const next: DocData = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === FIELD_DELETE) delete next[key];
    else next[key] = value;
  }
  return next;
}

class MockDocRef {
  constructor(
    private store: Map<string, DocData>,
    public readonly id: string,
  ) {}
  async get() {
    const data = this.store.get(this.id);
    return {
      exists: data !== undefined,
      id: this.id,
      data: () => (data ? { ...data } : undefined),
      get: (field: string) => data?.[field],
    };
  }
  _apply(patch: DocData, merge: boolean) {
    this.store.set(
      this.id,
      merge ? applyPatch(this.store.get(this.id), patch) : applyPatch(undefined, patch),
    );
  }
}

class MockCollection {
  constructor(private colStore: Map<string, DocData>) {}
  doc(id: string) {
    return new MockDocRef(this.colStore, id);
  }
}

class MockTxn {
  private writes: Array<{ ref: MockDocRef; patch: DocData; merge: boolean }> =
    [];
  async get(ref: MockDocRef) {
    return ref.get();
  }
  set(ref: MockDocRef, patch: DocData, opts?: { merge?: boolean }) {
    this.writes.push({ ref, patch, merge: opts?.merge === true });
    return this;
  }
  // #838 — the existing-chat branch writes with update() so it can replace
  // `unreadCount` as a WHOLE field value (a merge-set cannot remove a key
  // from inside the map). At the field level update() behaves like a merge
  // for the fields it names, which is what applyPatch already models; the
  // only real difference — dotted keys meaning nested paths — is deliberately
  // not exercised by the action, precisely because set() would read them as
  // literal field names.
  update(ref: MockDocRef, patch: DocData) {
    this.writes.push({ ref, patch, merge: true });
    return this;
  }
  // Writes are buffered until the tx body resolves — a thrown sentinel
  // therefore aborts with ZERO writes, mirroring the Admin SDK guarantee
  // the conflict gate relies on.
  commit() {
    for (const w of this.writes) w.ref._apply(w.patch, w.merge);
  }
}

class MockDb {
  collections = new Map<string, Map<string, DocData>>();
  collection(name: string) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return new MockCollection(this.collections.get(name)!);
  }
  async runTransaction<T>(fn: (tx: MockTxn) => Promise<T>): Promise<T> {
    const tx = new MockTxn();
    const result = await fn(tx);
    tx.commit();
    return result;
  }
  seed(col: string, id: string, data: DocData) {
    this.collection(col);
    this.collections.get(col)!.set(id, { ...data });
  }
  read(col: string, id: string): DocData | undefined {
    return this.collections.get(col)?.get(id);
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const CLIENT_EMAIL = "client@example.com";
const CLIENT_UID = "client-1";
const MIRROR_ID = normalizeMirrorEmail(CLIENT_EMAIL);

function seedAuthClient(uid = CLIENT_UID) {
  authUsersByEmail.set(CLIENT_EMAIL, {
    uid,
    email: CLIENT_EMAIL,
    displayName: "Cli Ent",
    photoURL: null,
    customClaims: {},
  });
  return uid;
}

function db(): MockDb {
  return mockState.db!;
}

beforeEach(() => {
  mockState.db = new MockDb();
  mockState.sessionUid = "coach-B";
  authUsersByEmail.clear();
  mockSetCustomUserClaims.mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore();
});

// ── CR-01 — claiming a stray clears the stray marker ─────────────────────

describe("CR-01 — stray claim clears autoAssignedCoach", () => {
  it("existing-user branch: claimed doc loses the marker; a second coach then conflicts", async () => {
    seedAuthClient();
    db().seed(FirestoreCollections.users, CLIENT_UID, {
      coachId: "coach-A",
      autoAssignedCoach: true,
      role: "client",
    });

    const first = await provisionClient({ email: CLIENT_EMAIL });
    expect(first).toEqual({ ok: true, mode: "attached-existing-user" });

    const doc = db().read(FirestoreCollections.users, CLIENT_UID)!;
    expect(doc.coachId).toBe("coach-B");
    // The steal vector: with the marker preserved, rule (3) would still
    // classify this doc as a claimable stray for ANY other coach.
    expect("autoAssignedCoach" in doc).toBe(false);

    // Second coach's attempt is now a refused conflict, not a silent steal.
    mockState.sessionUid = "coach-C";
    const second = await provisionClient({ email: CLIENT_EMAIL });
    expect(second).toEqual({ ok: false, mode: "conflict" });
    expect(db().read(FirestoreCollections.users, CLIENT_UID)!.coachId).toBe(
      "coach-B",
    );
  });

  it("mirror branch: claimed mirror loses the marker too", async () => {
    db().seed(FirestoreCollections.userMirror, MIRROR_ID, {
      coachId: "coach-A",
      autoAssignedCoach: true,
    });

    const result = await provisionClient({ email: CLIENT_EMAIL });
    expect(result).toEqual({ ok: true, mode: "precreated-mirror" });

    const mirror = db().read(FirestoreCollections.userMirror, MIRROR_ID)!;
    expect(mirror.coachId).toBe("coach-B");
    expect("autoAssignedCoach" in mirror).toBe(false);
  });
});

// ── CR-02 — trainer target refused ────────────────────────────────────────

describe("CR-02 — trainer-target refusal", () => {
  it("refuses another trainer's email with zero writes and zero claims mutation", async () => {
    seedAuthClient("trainer-X");
    db().seed(FirestoreCollections.users, "trainer-X", {
      role: "trainer",
      displayName: "Other Trainer",
    });

    const result = await provisionClient({ email: CLIENT_EMAIL });
    expect(result).toEqual({ ok: false, mode: "trainer-target" });

    const doc = db().read(FirestoreCollections.users, "trainer-X")!;
    expect(doc.role).toBe("trainer"); // no demotion
    expect("coachId" in doc).toBe(false); // no ownership write
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled(); // no claims clobber
    expect(
      db().read(FirestoreCollections.chats, "trainer-X"),
    ).toBeUndefined(); // no chat doc
  });
});

// ── CR-03 — refusals are results, not thrown messages ─────────────────────

describe("CR-03 — discriminated refusal results", () => {
  it("conflict RETURNS { ok: false, mode: 'conflict' } (never throws) with zero writes", async () => {
    seedAuthClient();
    db().seed(FirestoreCollections.users, CLIENT_UID, {
      coachId: "coach-A",
      role: "client",
    });

    // Must not throw — a thrown Error's message is masked by prod Next.js.
    const result = await provisionClient({ email: CLIENT_EMAIL });
    expect(result).toEqual({ ok: false, mode: "conflict" });

    const doc = db().read(FirestoreCollections.users, CLIENT_UID)!;
    expect(doc.coachId).toBe("coach-A"); // untouched
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    expect(db().read(FirestoreCollections.chats, CLIENT_UID)).toBeUndefined();
  });

  it("mirror-branch conflict returns the same result shape with the mirror untouched", async () => {
    db().seed(FirestoreCollections.userMirror, MIRROR_ID, {
      coachId: "coach-A",
    });

    const result = await provisionClient({ email: CLIENT_EMAIL });
    expect(result).toEqual({ ok: false, mode: "conflict" });
    expect(
      db().read(FirestoreCollections.userMirror, MIRROR_ID)!.coachId,
    ).toBe("coach-A");
  });

  it("self-add returns { ok: false, mode: 'self' } instead of throwing", async () => {
    authUsersByEmail.set(CLIENT_EMAIL, {
      uid: "coach-B", // the session coach themself
      email: CLIENT_EMAIL,
      customClaims: {},
    });

    const result = await provisionClient({ email: CLIENT_EMAIL });
    expect(result).toEqual({ ok: false, mode: "self" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });
});

// ── WR-01 — claims heal on the alreadyYours retry path ────────────────────

describe("WR-01 — alreadyYours re-syncs claims", () => {
  it("runs the idempotent setCustomUserClaims even when the doc is already linked", async () => {
    seedAuthClient();
    db().seed(FirestoreCollections.users, CLIENT_UID, {
      coachId: "coach-B",
      role: "client",
    });

    const result = await provisionClient({ email: CLIENT_EMAIL });
    expect(result).toEqual({ ok: true, mode: "already-linked" });

    // The retry after a post-commit claims failure lands here — the claims
    // write must run so the doc/claims divergence heals on resubmit.
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(
      CLIENT_UID,
      expect.objectContaining({ role: "client", coachId: "coach-B" }),
    );
  });
});

// ── WR-02 — chat payload hygiene ──────────────────────────────────────────

describe("WR-02 — chat write payload", () => {
  it("preserves an existing chat's createdAt and moves the tally to the new coach", async () => {
    seedAuthClient();
    db().seed(FirestoreCollections.users, CLIENT_UID, {
      coachId: "coach-A",
      autoAssignedCoach: true, // claimable stray with chat history
      role: "client",
    });
    db().seed(FirestoreCollections.chats, CLIENT_UID, {
      clientId: CLIENT_UID,
      coachId: "coach-A",
      createdAt: "ORIGINAL_CREATED_AT",
      unreadCount: { "coach-A": 3, [CLIENT_UID]: 1 },
    });

    const result = await provisionClient({ email: CLIENT_EMAIL });
    expect(result).toEqual({ ok: true, mode: "attached-existing-user" });

    const chat = db().read(FirestoreCollections.chats, CLIENT_UID)!;
    expect(chat.createdAt).toBe("ORIGINAL_CREATED_AT"); // NOT reset to now
    expect(chat.coachId).toBe("coach-B");
    // #838 — this assertion USED to pin `{ "coach-A": 3, client: 1 }`, i.e.
    // the tally staying with the coach who no longer has the client. That was
    // WR-02 guarding the right thing (don't clobber counters) with the wrong
    // invariant (don't touch them at all): coach-B's inbox badge read 0 on a
    // thread carrying 3 unread client messages that only coach-B could still
    // read. The tally now follows the thread; the client's own slot is
    // untouched and coach-A's dead slot is removed.
    expect(chat.unreadCount).toEqual({ "coach-B": 3, [CLIENT_UID]: 1 });
  });

  it("gives the incoming coach a zeroed slot when nothing was pending", async () => {
    // `client-roster` composes the badge from `unreadCount[trainer.uid]`, so
    // an ABSENT key and a 0 read the same downstream — but only the explicit
    // key survives the next `onMessageCreated` increment landing on the right
    // participant. Pin that the slot is established either way.
    seedAuthClient();
    db().seed(FirestoreCollections.users, CLIENT_UID, { role: "client" });
    db().seed(FirestoreCollections.chats, CLIENT_UID, {
      clientId: CLIENT_UID,
      coachId: "coach-A",
      createdAt: "ORIGINAL_CREATED_AT",
      unreadCount: { [CLIENT_UID]: 2 },
    });

    await provisionClient({ email: CLIENT_EMAIL });

    const chat = db().read(FirestoreCollections.chats, CLIENT_UID)!;
    expect(chat.unreadCount).toEqual({ [CLIENT_UID]: 2, "coach-B": 0 });
  });

  it("leaves the counters alone when re-linking a client who is already yours", async () => {
    // The idempotent-resubmit shape. The users doc carries no coachId (so
    // decideLinkOutcome says "link" and the write path runs) while the chat
    // doc already names this coach — rewriting the map here would zero a
    // badge the coach is actively looking at.
    seedAuthClient();
    db().seed(FirestoreCollections.users, CLIENT_UID, { role: "client" });
    db().seed(FirestoreCollections.chats, CLIENT_UID, {
      clientId: CLIENT_UID,
      coachId: "coach-B",
      createdAt: "ORIGINAL_CREATED_AT",
      unreadCount: { "coach-B": 5, [CLIENT_UID]: 0 },
    });

    await provisionClient({ email: CLIENT_EMAIL });

    const chat = db().read(FirestoreCollections.chats, CLIENT_UID)!;
    expect(chat.unreadCount).toEqual({ "coach-B": 5, [CLIENT_UID]: 0 });
  });

  it("stamps createdAt only when the chat doc does not exist yet", async () => {
    seedAuthClient();
    db().seed(FirestoreCollections.users, CLIENT_UID, { role: "client" });

    await provisionClient({ email: CLIENT_EMAIL });

    const chat = db().read(FirestoreCollections.chats, CLIENT_UID)!;
    expect(chat.createdAt).toBe(SERVER_TIMESTAMP);
    // The bogus always-{} unreadCount write is gone entirely.
    expect("unreadCount" in chat).toBe(false);
  });
});
