// __tests__/admin-actions.transfer-chat.test.ts
//
// #838 — `transferClientToCoach` is the alta path for a COACH-LESS user: the
// admin coach-less profile page's `assignCoachAction` delegates straight to
// it ("Assigning a coach IS a transfer — from no coach to one"), so it is the
// action a coach-request client actually travels through. It had ZERO jest
// coverage, which is a large part of why the ticket could credibly predict a
// misrouting that the action was in fact already preventing.
//
// These cases pin the chat half of the transfer:
//   - `coachId` re-points (the behavior the ticket asked for — already there,
//     now nailed down so it cannot silently regress).
//   - the unread tally FOLLOWS the coach (the half that really was missing).
//   - a MISSING chat doc is created rather than skipped, which is exactly the
//     coach-less case: `preCreateMirror` only creates the thread `if (coachId)`.

jest.mock("next/headers", () => ({ cookies: jest.fn().mockResolvedValue({}) }));
jest.mock("next/cache", () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }));

const SERVER_TIMESTAMP = "SERVER_TIMESTAMP_SENTINEL";
const FIELD_DELETE = "FIELD_DELETE_SENTINEL";

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => SERVER_TIMESTAMP),
    delete: jest.fn(() => FIELD_DELETE),
  },
}));

const mockState: { db: MockDb | null } = { db: null };

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentAdmin: jest.fn(async () => ({
    uid: "admin-1",
    email: "admin@example.com",
  })),
}));

const mockSetCustomUserClaims = jest.fn(async () => undefined);
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
  gcFitnessAuth: () => ({
    getUser: async (uid: string) => ({ uid, customClaims: {} }),
    setCustomUserClaims: mockSetCustomUserClaims,
  }),
}));

import { transferClientToCoach } from "../admin-actions";
import { FirestoreCollections } from "../collections";

// ── In-memory Firestore mock (batch + merge + FieldValue.delete aware) ────

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
      merge
        ? applyPatch(this.store.get(this.id), patch)
        : applyPatch(undefined, patch),
    );
  }
}

class MockCollection {
  constructor(private colStore: Map<string, DocData>) {}
  doc(id: string) {
    return new MockDocRef(this.colStore, id);
  }
  async add(data: DocData) {
    const id = `auto-${this.colStore.size + 1}`;
    this.colStore.set(id, { ...data });
    return { id };
  }
}

class MockBatch {
  private writes: Array<{ ref: MockDocRef; patch: DocData; merge: boolean }> = [];
  set(ref: MockDocRef, patch: DocData, opts?: { merge?: boolean }) {
    this.writes.push({ ref, patch, merge: opts?.merge === true });
    return this;
  }
  // update() differs from set(merge) only for dotted keys (nested paths vs
  // literal field names); the action deliberately writes `unreadCount` as a
  // whole field value precisely to stay clear of that, so field-level merge
  // models both faithfully here.
  update(ref: MockDocRef, patch: DocData) {
    this.writes.push({ ref, patch, merge: true });
    return this;
  }
  async commit() {
    for (const w of this.writes) w.ref._apply(w.patch, w.merge);
  }
}

class MockDb {
  collections = new Map<string, Map<string, DocData>>();
  collection(name: string) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return new MockCollection(this.collections.get(name)!);
  }
  batch() {
    return new MockBatch();
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

const CLIENT_UID = "client-uid-1";
const SALES_COACH = "coach-sales-uid";
const NEW_COACH = "coach-B-uid";

function db(): MockDb {
  return mockState.db!;
}

/** A coach-less client who used the #836 banner: no coachId of their own. */
function seedCoachRequestClient() {
  db().seed(FirestoreCollections.users, CLIENT_UID, {
    role: "client",
    displayName: "Cli Ent",
  });
  db().seed(FirestoreCollections.users, NEW_COACH, {
    role: "trainer",
    displayName: "Coach Bea",
    photoURL: "https://example.com/b.jpg",
  });
}

beforeEach(() => {
  mockState.db = new MockDb();
  mockSetCustomUserClaims.mockClear();
});

describe("transferClientToCoach — the chat follows the client (#838)", () => {
  it("re-points coachId AND carries the pending request over to the adopting coach", async () => {
    seedCoachRequestClient();
    // The thread `onMessageCreated` materialized from "Quiero entrenar con
    // coach": born naming the SALES coach, who holds the single unread.
    db().seed(FirestoreCollections.chats, CLIENT_UID, {
      clientId: CLIENT_UID,
      coachId: SALES_COACH,
      createdAt: "ORIGINAL_CREATED_AT",
      unreadCount: { [SALES_COACH]: 1, [CLIENT_UID]: 0 },
    });

    await transferClientToCoach({
      clientUid: CLIENT_UID,
      newCoachUid: NEW_COACH,
    });

    const chat = db().read(FirestoreCollections.chats, CLIENT_UID)!;
    // Without this the new coach hits permission-denied on the thread and the
    // push fan-out keeps naming the sales coach — the ticket's headline.
    expect(chat.coachId).toBe(NEW_COACH);
    // Without this the new coach's inbox badge reads 0 on the very message
    // that caused the adoption, and their first reply destroys the count.
    expect(chat.unreadCount).toEqual({ [NEW_COACH]: 1, [CLIENT_UID]: 0 });
    expect(chat.createdAt).toBe("ORIGINAL_CREATED_AT");
  });

  it("creates the thread when the coach-less client never messaged", async () => {
    // `preCreateMirror.convertMirrorToCanonical` provisions the chat parent
    // only `if (coachId)`, so a coach-less signup has none. The old
    // `if (chatSnap.exists)` guard skipped the write entirely and the client
    // landed on their new coach with no thread — while `provisionClient`, the
    // other alta path, has always created it.
    seedCoachRequestClient();

    await transferClientToCoach({
      clientUid: CLIENT_UID,
      newCoachUid: NEW_COACH,
    });

    const chat = db().read(FirestoreCollections.chats, CLIENT_UID);
    expect(chat).toBeDefined();
    expect(chat!.clientId).toBe(CLIENT_UID);
    expect(chat!.coachId).toBe(NEW_COACH);
    expect(chat!.createdAt).toBe(SERVER_TIMESTAMP);
  });

  it("re-points the canonical user doc and resyncs the coachId claim", async () => {
    seedCoachRequestClient();

    await transferClientToCoach({
      clientUid: CLIENT_UID,
      newCoachUid: NEW_COACH,
    });

    const user = db().read(FirestoreCollections.users, CLIENT_UID)!;
    expect(user.coachId).toBe(NEW_COACH);
    expect(user.coachDisplayName).toBe("Coach Bea");
    // A claimed client is no longer a triage stray.
    expect("autoAssignedCoach" in user).toBe(false);
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(CLIENT_UID, {
      role: "client",
      coachId: NEW_COACH,
    });
  });

  it("refuses to transfer a trainer account", async () => {
    db().seed(FirestoreCollections.users, CLIENT_UID, { role: "trainer" });
    db().seed(FirestoreCollections.users, NEW_COACH, { role: "trainer" });

    await expect(
      transferClientToCoach({ clientUid: CLIENT_UID, newCoachUid: NEW_COACH }),
    ).rejects.toThrow(/coach, not a client/);
    expect(db().read(FirestoreCollections.chats, CLIENT_UID)).toBeUndefined();
  });

  it("refuses a no-op transfer to the coach the client already has", async () => {
    db().seed(FirestoreCollections.users, CLIENT_UID, {
      role: "client",
      coachId: NEW_COACH,
    });
    db().seed(FirestoreCollections.users, NEW_COACH, { role: "trainer" });

    await expect(
      transferClientToCoach({ clientUid: CLIENT_UID, newCoachUid: NEW_COACH }),
    ).rejects.toThrow(/already linked/);
  });
});
