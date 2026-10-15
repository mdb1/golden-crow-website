// fake-firestore-c.ts
//
// A small in-memory stand-in for the Firebase Admin Firestore surface used by
// the gc-fitness Server Actions, for authorization / ownership tests (coverage
// group "c"). Server Actions write through the Admin SDK, which BYPASSES
// firestore.rules — so the tests have to assert on what the action actually
// WROTE (or that it wrote nothing). Every applied write lands in `db.writes`
// with the RAW payload (FieldValue sentinels intact), and every query lands in
// `db.queries` with its filters.
//
// Usage in a test file:
//
//   const mockDb: { current: FakeFirestore | null } = { current: null };
//   jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
//     gcFitnessFirestore: () => mockDb.current,
//   }));
//   jest.mock("firebase-admin/firestore", () =>
//     jest.requireActual("@/lib/test-utils/fake-firestore-c").firestoreModuleMock,
//   );
//   beforeEach(() => { mockDb.current = new FakeFirestore(); });
//
// Supported: collection / doc / nested collections / collectionGroup, where
// (==, !=, <, <=, >, >=, in, not-in, array-contains, array-contains-any),
// orderBy, limit, get, set (merge), update, delete, add, getAll, batch,
// runTransaction (reads first, writes applied at the end of the callback).
// FieldValue sentinels: serverTimestamp, delete, arrayUnion, arrayRemove,
// increment.

export class FakeTimestamp {
  constructor(private readonly ms: number) {}
  toDate(): Date {
    return new Date(this.ms);
  }
  toMillis(): number {
    return this.ms;
  }
  static fromDate(d: Date): FakeTimestamp {
    return new FakeTimestamp(d.getTime());
  }
}

type Sentinel =
  | { __fv: "serverTimestamp" }
  | { __fv: "delete" }
  | { __fv: "arrayUnion"; values: unknown[] }
  | { __fv: "arrayRemove"; values: unknown[] }
  | { __fv: "increment"; by: number };

function isSentinel(v: unknown): v is Sentinel {
  return !!v && typeof v === "object" && "__fv" in (v as object);
}

export const FakeFieldValue = {
  serverTimestamp: () => ({ __fv: "serverTimestamp" }) as Sentinel,
  delete: () => ({ __fv: "delete" }) as Sentinel,
  arrayUnion: (...values: unknown[]) => ({ __fv: "arrayUnion", values }) as Sentinel,
  arrayRemove: (...values: unknown[]) => ({ __fv: "arrayRemove", values }) as Sentinel,
  increment: (by: number) => ({ __fv: "increment", by }) as Sentinel,
};

/** Drop-in for `jest.mock("firebase-admin/firestore", ...)`. */
export const firestoreModuleMock = {
  FieldValue: FakeFieldValue,
  Timestamp: FakeTimestamp,
};

export type DocData = Record<string, unknown>;

export interface WriteRecord {
  op: "set" | "update" | "delete" | "create";
  path: string;
  data?: DocData;
  merge?: boolean;
  via: "direct" | "batch" | "transaction";
}

export interface QueryRecord {
  /** Collection path, or `group:<id>` for a collectionGroup query. */
  collection: string;
  filters: Array<{ field: string; op: string; value: unknown }>;
  orderBy: Array<{ field: string; dir: "asc" | "desc" }>;
  limit: number | null;
}

function comparable(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v && typeof (v as { toMillis?: () => number }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  return v;
}

function equal(a: unknown, b: unknown): boolean {
  return comparable(a) === comparable(b);
}

function getField(data: DocData | undefined, field: string): unknown {
  if (!data) return undefined;
  let cur: unknown = data;
  for (const part of field.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function matches(
  data: DocData,
  f: { field: string; op: string; value: unknown },
): boolean {
  const v = getField(data, f.field);
  const a = comparable(v);
  const b = comparable(f.value);
  switch (f.op) {
    case "==":
      return v !== undefined && a === b;
    case "!=":
      return v !== undefined && a !== b;
    case "<":
      return v !== undefined && typeof a === typeof b && (a as number) < (b as number);
    case "<=":
      return v !== undefined && typeof a === typeof b && (a as number) <= (b as number);
    case ">":
      return v !== undefined && typeof a === typeof b && (a as number) > (b as number);
    case ">=":
      return v !== undefined && typeof a === typeof b && (a as number) >= (b as number);
    case "in":
      return v !== undefined && (f.value as unknown[]).some((x) => equal(x, v));
    case "not-in":
      return v !== undefined && !(f.value as unknown[]).some((x) => equal(x, v));
    case "array-contains":
      return Array.isArray(v) && v.some((x) => equal(x, f.value));
    case "array-contains-any":
      return (
        Array.isArray(v) && v.some((x) => (f.value as unknown[]).some((y) => equal(x, y)))
      );
    default:
      throw new Error(`fake-firestore-c: unsupported op ${f.op}`);
  }
}

function applySentinels(base: DocData | undefined, patch: DocData, now: number): DocData {
  const out: DocData = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      throw new Error(
        `fake-firestore-c: Cannot use "undefined" as a Firestore value (field "${key}").`,
      );
    }
    if (isSentinel(value)) {
      const cur = out[key];
      switch (value.__fv) {
        case "serverTimestamp":
          out[key] = new FakeTimestamp(now);
          break;
        case "delete":
          delete out[key];
          break;
        case "arrayUnion": {
          const arr = Array.isArray(cur) ? [...cur] : [];
          for (const x of value.values) if (!arr.some((y) => equal(x, y))) arr.push(x);
          out[key] = arr;
          break;
        }
        case "arrayRemove": {
          const arr = Array.isArray(cur) ? cur : [];
          out[key] = arr.filter((y) => !value.values.some((x) => equal(x, y)));
          break;
        }
        case "increment":
          out[key] = (typeof cur === "number" ? cur : 0) + value.by;
          break;
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

export class FakeDocSnapshot {
  constructor(
    public readonly ref: FakeDocRef,
    private readonly _data: DocData | undefined,
  ) {}
  get id(): string {
    return this.ref.id;
  }
  get exists(): boolean {
    return this._data !== undefined;
  }
  data(): DocData | undefined {
    return this._data === undefined ? undefined : { ...this._data };
  }
  get(field: string): unknown {
    return getField(this._data, field);
  }
}

export class FakeQuerySnapshot {
  constructor(public readonly docs: FakeDocSnapshot[]) {}
  get size(): number {
    return this.docs.length;
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
  forEach(cb: (d: FakeDocSnapshot) => void): void {
    this.docs.forEach(cb);
  }
}

export class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    public readonly path: string,
  ) {}
  get id(): string {
    return this.path.split("/").pop() as string;
  }
  get parent(): FakeCollectionRef {
    return new FakeCollectionRef(this.db, this.path.split("/").slice(0, -1).join("/"));
  }
  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }
  async get(): Promise<FakeDocSnapshot> {
    this.db.reads.push(this.path);
    return this.db.snapshot(this);
  }
  async set(data: DocData, options?: { merge?: boolean }): Promise<void> {
    this.db.applyWrite({ op: "set", path: this.path, data, merge: options?.merge === true, via: "direct" });
  }
  async create(data: DocData): Promise<void> {
    if (this.db.store.has(this.path)) throw new Error("ALREADY_EXISTS");
    this.db.applyWrite({ op: "create", path: this.path, data, via: "direct" });
  }
  async update(data: DocData): Promise<void> {
    this.db.applyWrite({ op: "update", path: this.path, data, via: "direct" });
  }
  async delete(): Promise<void> {
    this.db.applyWrite({ op: "delete", path: this.path, via: "direct" });
  }
}

export class FakeQuery {
  constructor(
    protected readonly db: FakeFirestore,
    /** Collection path, or `group:<id>`. */
    protected readonly source: string,
    protected readonly filters: QueryRecord["filters"] = [],
    protected readonly orders: QueryRecord["orderBy"] = [],
    protected readonly max: number | null = null,
  ) {}
  where(field: string, op: string, value: unknown): FakeQuery {
    return new FakeQuery(this.db, this.source, [...this.filters, { field, op, value }], this.orders, this.max);
  }
  orderBy(field: string, dir: "asc" | "desc" = "asc"): FakeQuery {
    return new FakeQuery(this.db, this.source, this.filters, [...this.orders, { field, dir }], this.max);
  }
  limit(n: number): FakeQuery {
    return new FakeQuery(this.db, this.source, this.filters, this.orders, n);
  }
  describe(): QueryRecord {
    return {
      collection: this.source,
      filters: [...this.filters],
      orderBy: [...this.orders],
      limit: this.max,
    };
  }
  async get(): Promise<FakeQuerySnapshot> {
    return this.db.runQuery(this);
  }
  /** Evaluated synchronously (used by transactions too). */
  evaluate(): FakeQuerySnapshot {
    const isGroup = this.source.startsWith("group:");
    const groupId = isGroup ? this.source.slice("group:".length) : "";
    let rows = [...this.db.store.entries()].filter(([path]) => {
      const parts = path.split("/");
      if (isGroup) return parts.length >= 2 && parts[parts.length - 2] === groupId;
      return parts.slice(0, -1).join("/") === this.source;
    });
    rows = rows.filter(([, data]) => this.filters.every((f) => matches(data, f)));
    // Firestore drops docs missing an orderBy field.
    rows = rows.filter(([, data]) => this.orders.every((o) => getField(data, o.field) !== undefined));
    if (this.orders.length > 0) {
      rows.sort(([, a], [, b]) => {
        for (const o of this.orders) {
          const x = comparable(getField(a, o.field)) as number | string;
          const y = comparable(getField(b, o.field)) as number | string;
          if (x === y) continue;
          const cmp = x < y ? -1 : 1;
          return o.dir === "desc" ? -cmp : cmp;
        }
        return 0;
      });
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    return new FakeQuerySnapshot(
      rows.map(([path, data]) => new FakeDocSnapshot(new FakeDocRef(this.db, path), { ...data })),
    );
  }
}

export class FakeCollectionRef extends FakeQuery {
  constructor(db: FakeFirestore, public readonly path: string) {
    super(db, path);
  }
  get id(): string {
    return this.path.split("/").pop() as string;
  }
  /** The owning doc for a subcollection, null for a root collection. */
  get parent(): FakeDocRef | null {
    const parts = this.path.split("/");
    return parts.length < 2 ? null : new FakeDocRef(this.db, parts.slice(0, -1).join("/"));
  }
  doc(id?: string): FakeDocRef {
    return new FakeDocRef(this.db, `${this.path}/${id ?? this.db.autoId()}`);
  }
  async add(data: DocData): Promise<FakeDocRef> {
    const ref = this.doc();
    this.db.applyWrite({ op: "set", path: ref.path, data, via: "direct" });
    return ref;
  }
}

type PendingWrite = Omit<WriteRecord, "via">;

export class FakeFirestore {
  readonly store = new Map<string, DocData>();
  readonly writes: WriteRecord[] = [];
  readonly queries: QueryRecord[] = [];
  readonly reads: string[] = [];
  /** Throw from `get()` of any query this predicate matches. */
  private queryFailures: Array<{ when: (q: QueryRecord) => boolean; error: Error }> = [];
  private idCounter = 0;
  /** Clock used for serverTimestamp() materialization. */
  now = Date.parse("2026-06-15T12:00:00Z");

  autoId(): string {
    this.idCounter += 1;
    return `auto-${this.idCounter}`;
  }

  /** Seed a doc at `path` (e.g. "users/c1"). */
  seed(path: string, data: DocData): this {
    this.store.set(path, { ...data });
    return this;
  }

  doc(path: string): DocData | undefined {
    const d = this.store.get(path);
    return d === undefined ? undefined : { ...d };
  }

  failQueryWhen(when: (q: QueryRecord) => boolean, error = new Error("FAILED_PRECONDITION: index")): void {
    this.queryFailures.push({ when, error });
  }

  collection(path: string): FakeCollectionRef {
    return new FakeCollectionRef(this, path);
  }

  collectionGroup(id: string): FakeQuery {
    return new FakeQuery(this, `group:${id}`);
  }

  async getAll(...refs: FakeDocRef[]): Promise<FakeDocSnapshot[]> {
    return refs.map((r) => {
      this.reads.push(r.path);
      return this.snapshot(r);
    });
  }

  snapshot(ref: FakeDocRef): FakeDocSnapshot {
    const d = this.store.get(ref.path);
    return new FakeDocSnapshot(ref, d === undefined ? undefined : { ...d });
  }

  async runQuery(q: FakeQuery): Promise<FakeQuerySnapshot> {
    const rec = q.describe();
    this.queries.push(rec);
    const failure = this.queryFailures.find((f) => f.when(rec));
    if (failure) throw failure.error;
    return q.evaluate();
  }

  applyWrite(w: WriteRecord): void {
    this.writes.push(w);
    const cur = this.store.get(w.path);
    switch (w.op) {
      case "delete":
        this.store.delete(w.path);
        return;
      case "update":
        if (cur === undefined) {
          throw new Error(`NOT_FOUND: No document to update: ${w.path}`);
        }
        this.store.set(w.path, applySentinels(cur, w.data ?? {}, this.now));
        return;
      case "set":
      case "create":
        this.store.set(
          w.path,
          applySentinels(w.merge ? cur : undefined, w.data ?? {}, this.now),
        );
        return;
    }
  }

  batch() {
    const pending: PendingWrite[] = [];
    const b = {
      set: (ref: FakeDocRef, data: DocData, options?: { merge?: boolean }) => {
        pending.push({ op: "set", path: ref.path, data, merge: options?.merge === true });
        return b;
      },
      update: (ref: FakeDocRef, data: DocData) => {
        pending.push({ op: "update", path: ref.path, data });
        return b;
      },
      delete: (ref: FakeDocRef) => {
        pending.push({ op: "delete", path: ref.path });
        return b;
      },
      commit: async () => {
        for (const w of pending) this.applyWrite({ ...w, via: "batch" });
        return [];
      },
    };
    return b;
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const pending: PendingWrite[] = [];
    const tx: FakeTransaction = {
      get: (async (target: FakeDocRef | FakeQuery) => {
        if (target instanceof FakeDocRef) {
          this.reads.push(target.path);
          return this.snapshot(target);
        }
        return this.runQuery(target);
      }) as FakeTransaction["get"],
      set: (ref, data, options) => {
        pending.push({ op: "set", path: ref.path, data, merge: options?.merge === true });
        return tx;
      },
      update: (ref, data) => {
        pending.push({ op: "update", path: ref.path, data });
        return tx;
      },
      delete: (ref) => {
        pending.push({ op: "delete", path: ref.path });
        return tx;
      },
    };
    const result = await fn(tx);
    for (const w of pending) this.applyWrite({ ...w, via: "transaction" });
    return result;
  }

  /** Writes whose path starts with `prefix` (e.g. "habits/"). */
  writesTo(prefix: string): WriteRecord[] {
    return this.writes.filter((w) => w.path.startsWith(prefix));
  }
}

export interface FakeTransaction {
  get: {
    (ref: FakeDocRef): Promise<FakeDocSnapshot>;
    (q: FakeQuery): Promise<FakeQuerySnapshot>;
  };
  set: (ref: FakeDocRef, data: DocData, options?: { merge?: boolean }) => FakeTransaction;
  update: (ref: FakeDocRef, data: DocData) => FakeTransaction;
  delete: (ref: FakeDocRef) => FakeTransaction;
}

/** Stand-in identities used across group-c suites. */
export const TRAINER = { uid: "coach-a", email: "a@example.com", role: "trainer" as const, isAdmin: false, roles: ["trainer"] };
export const OTHER_TRAINER_UID = "coach-b";

// ── auth (real `auth-helpers` over a mocked `next-firebase-auth-edge`) ────────
//
// The group-c suites keep `auth-helpers` REAL and mock only `getTokens`, so a
// test proves which gate an action calls (trainer vs admin), not just that a
// mocked gate was awaited. Mock in the test file:
//
//   jest.mock("next/headers", () => ({ cookies: jest.fn(async () => ({ get: () => undefined })) }));
//   jest.mock("next-firebase-auth-edge", () => ({ getTokens: jest.fn() }));

export function setGcFitnessAuthEnv(): void {
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_API_KEY = "test-api-key";
  process.env.GC_FITNESS_COOKIE_SIGNATURE_KEY = "test-sig";
  process.env.NEXT_PUBLIC_GC_FITNESS_FIREBASE_PROJECT_ID = "gcfitness-test";
  process.env.GC_FITNESS_FIREBASE_ADMIN_CLIENT_EMAIL = "svc@example.com";
  process.env.GC_FITNESS_FIREBASE_ADMIN_PRIVATE_KEY = Buffer.from("pk").toString("base64");
}

/** What `getTokens` resolves to for a signed-in user with these roles. */
export function tokensFor(uid: string, roles: string[]): unknown {
  return {
    token: `id-token-${uid}`,
    decodedToken: { uid, email: `${uid}@example.com`, roles },
  };
}
