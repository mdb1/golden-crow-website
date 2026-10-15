// fake-firestore-cov-a.ts
//
// A small in-memory stand-in for the Firebase ADMIN Firestore + Storage used by
// the Server Action authorization suites (coverage group "cov-a": chat, client
// notes/goals/requests, progress photos, personal records, week muscle map,
// habit compliance).
//
// Why a fake and not per-call jest.fn chains: the point of these suites is to
// prove that a Server Action that REJECTS (wrong coach, bad input) wrote
// NOTHING. A store that records every write in `writes` makes that a single
// `expect(fake.writes).toEqual([])`, and lets the happy paths assert the
// written document itself instead of a mock's call arguments.
//
// Wiring (in a test file):
//
//   jest.mock("firebase-admin/firestore", () =>
//     jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
//   );
//   jest.mock("@/lib/firebase/gc-fitness-admin", () => {
//     const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
//     return { gcFitnessFirestore: () => f.fake.db, gcFitnessStorage: () => f.fake.storage };
//   });
//
// and `fake.reset()` in `beforeEach`.
//
// Semantics are intentionally minimal: FieldValue sentinels are STORED AS-IS
// (so a test can assert `updatedAt: SERVER_TIMESTAMP`), except `delete`, which
// removes the field. Dotted keys / FieldPath in `update()` write nested paths;
// in `set()` they are literal field names (matching real Firestore).

export type DocData = Record<string, unknown>;

export const SERVER_TIMESTAMP = { __fieldValue: "serverTimestamp" } as const;
export const FIELD_DELETE = { __fieldValue: "delete" } as const;
export function increment(n: number) {
  return { __fieldValue: "increment", n };
}

export class FakeFieldPath {
  readonly segments: string[];
  constructor(...segments: string[]) {
    this.segments = segments;
  }
}

export const firestoreModuleMock = {
  FieldValue: {
    serverTimestamp: () => SERVER_TIMESTAMP,
    delete: () => FIELD_DELETE,
    increment: (n: number) => increment(n),
  },
  FieldPath: FakeFieldPath,
  Timestamp: {
    fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() }),
  },
};

/** A Firestore-Timestamp-like value (exposes toDate / toMillis). */
export function ts(iso: string) {
  const d = new Date(iso);
  return { toDate: () => d, toMillis: () => d.getTime() };
}

export interface WriteRecord {
  op: "set" | "update" | "delete";
  path: string;
  data?: DocData;
  options?: unknown;
}

function getPath(data: DocData | undefined, field: string): unknown {
  if (!data) return undefined;
  if (field in data) return data[field];
  let cur: unknown = data;
  for (const seg of field.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as DocData)[seg];
  }
  return cur;
}

function setNested(target: DocData, segments: string[], value: unknown) {
  let cur = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const next = cur[segments[i]];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cur[segments[i]] = {};
    }
    cur = cur[segments[i]] as DocData;
  }
  const last = segments[segments.length - 1];
  if (value === FIELD_DELETE) delete cur[last];
  else cur[last] = value;
}

function comparable(v: unknown): number | string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "number" || typeof v === "string") return v;
  return null;
}

type Op = "==" | "<" | "<=" | ">" | ">=";

export class FakeSnapshot {
  constructor(
    readonly ref: FakeDocRef,
    private readonly raw: DocData | undefined,
  ) {}
  get id() {
    return this.ref.id;
  }
  get exists() {
    return this.raw !== undefined;
  }
  data(): DocData {
    return this.raw === undefined ? (undefined as unknown as DocData) : { ...this.raw };
  }
  get(field: string): unknown {
    return getPath(this.raw, field);
  }
}

export class FakeQuery {
  constructor(
    protected readonly store: FakeFirestore,
    readonly path: string,
    protected readonly filters: Array<[string, Op, unknown]> = [],
    protected readonly orders: Array<[string, "asc" | "desc"]> = [],
    protected readonly max: number | null = null,
  ) {}
  where(field: string, op: Op, value: unknown): FakeQuery {
    return new FakeQuery(this.store, this.path, [...this.filters, [field, op, value]], this.orders, this.max);
  }
  orderBy(field: string, dir: "asc" | "desc" = "asc"): FakeQuery {
    return new FakeQuery(this.store, this.path, this.filters, [...this.orders, [field, dir]], this.max);
  }
  limit(n: number): FakeQuery {
    return new FakeQuery(this.store, this.path, this.filters, this.orders, n);
  }
  async get() {
    this.store.queries.push({ path: this.path, filters: this.filters, orders: this.orders, limit: this.max });
    this.store.maybeFail("query", this.path);
    let docs = this.store.docsIn(this.path).filter((snap) =>
      this.filters.every(([field, op, value]) => {
        const a = comparable(snap.get(field));
        const b = comparable(value);
        if (op === "==") return snap.get(field) === value || (a !== null && a === b);
        if (a === null || b === null) return false;
        if (op === "<") return a < b;
        if (op === "<=") return a <= b;
        if (op === ">") return a > b;
        return a >= b;
      }),
    );
    for (const [field] of this.orders) {
      docs = docs.filter((d) => d.get(field) !== undefined);
    }
    docs.sort((x, y) => {
      for (const [field, dir] of this.orders) {
        const a = comparable(x.get(field)) ?? "";
        const b = comparable(y.get(field)) ?? "";
        if (a < b) return dir === "asc" ? -1 : 1;
        if (a > b) return dir === "asc" ? 1 : -1;
      }
      return 0;
    });
    if (this.max !== null) docs = docs.slice(0, this.max);
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

export class FakeCollectionRef extends FakeQuery {
  doc(id?: string): FakeDocRef {
    const docId = id ?? this.store.nextId();
    return new FakeDocRef(this.store, `${this.path}/${docId}`);
  }
}

export class FakeDocRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly path: string,
  ) {}
  get id() {
    return this.path.split("/").pop() as string;
  }
  collection(name: string) {
    return new FakeCollectionRef(this.store, `${this.path}/${name}`);
  }
  async get() {
    this.store.reads.push(this.path);
    this.store.maybeFail("get", this.path);
    return new FakeSnapshot(this, this.store.docs.get(this.path));
  }
  async set(data: DocData, options?: { merge?: boolean }) {
    this.store.applySet(this.path, data, options);
  }
  async update(...args: unknown[]) {
    this.store.applyUpdate(this.path, args);
  }
  async delete() {
    this.store.applyDelete(this.path);
  }
}

export class FakeFirestore {
  docs = new Map<string, DocData>();
  writes: WriteRecord[] = [];
  reads: string[] = [];
  queries: Array<{ path: string; filters: unknown[]; orders: unknown[]; limit: number | null }> = [];
  failures: Array<{ kind: "get" | "query"; path: RegExp }> = [];
  private idCounter = 0;

  nextId() {
    this.idCounter += 1;
    return `auto-${this.idCounter}`;
  }
  maybeFail(kind: "get" | "query", path: string) {
    if (this.failures.some((f) => f.kind === kind && f.path.test(path))) {
      throw new Error(`fake ${kind} failure on ${path}`);
    }
  }
  docsIn(collectionPath: string): FakeSnapshot[] {
    const depth = collectionPath.split("/").length + 1;
    const out: FakeSnapshot[] = [];
    for (const [path, data] of this.docs) {
      if (path.startsWith(`${collectionPath}/`) && path.split("/").length === depth) {
        out.push(new FakeSnapshot(new FakeDocRef(this, path), data));
      }
    }
    return out;
  }
  collection(name: string) {
    return new FakeCollectionRef(this, name);
  }
  async getAll(...refs: FakeDocRef[]) {
    return Promise.all(refs.map((r) => r.get()));
  }
  batch() {
    const ops: Array<() => void> = [];
    return {
      set: (ref: FakeDocRef, data: DocData, options?: { merge?: boolean }) => {
        ops.push(() => this.applySet(ref.path, data, options));
      },
      update: (ref: FakeDocRef, ...args: unknown[]) => {
        ops.push(() => this.applyUpdate(ref.path, args));
      },
      delete: (ref: FakeDocRef) => {
        ops.push(() => this.applyDelete(ref.path));
      },
      commit: async () => {
        ops.forEach((op) => op());
      },
    };
  }
  applySet(path: string, data: DocData, options?: { merge?: boolean }) {
    this.writes.push({ op: "set", path, data, options });
    const base = options?.merge ? { ...(this.docs.get(path) ?? {}) } : {};
    for (const [k, v] of Object.entries(data)) {
      if (v === FIELD_DELETE) delete base[k];
      else base[k] = v;
    }
    this.docs.set(path, base);
  }
  applyUpdate(path: string, args: unknown[]) {
    const patch: DocData = {};
    const pairs: Array<[string[], unknown]> = [];
    if (args.length === 1 && args[0] && typeof args[0] === "object" && !(args[0] instanceof FakeFieldPath)) {
      for (const [k, v] of Object.entries(args[0] as DocData)) {
        patch[k] = v;
        pairs.push([k.split("."), v]);
      }
    } else {
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const segs = key instanceof FakeFieldPath ? key.segments : String(key).split(".");
        patch[segs.join(".")] = args[i + 1];
        pairs.push([segs, args[i + 1]]);
      }
    }
    this.writes.push({ op: "update", path, data: patch });
    const existing = this.docs.get(path);
    if (!existing) throw new Error(`5 NOT_FOUND: no document to update: ${path}`);
    const next = structuredCloneish(existing);
    for (const [segs, v] of pairs) setNested(next, segs, v);
    this.docs.set(path, next);
  }
  applyDelete(path: string) {
    this.writes.push({ op: "delete", path });
    this.docs.delete(path);
  }
}

function structuredCloneish(d: DocData): DocData {
  const out: DocData = {};
  for (const [k, v] of Object.entries(d)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype
      ? structuredCloneish(v as DocData)
      : v;
  }
  return out;
}

export interface StorageSave {
  bucket: string | undefined;
  path: string;
  bytes: number;
  options: unknown;
}

export class FakeStorage {
  saves: StorageSave[] = [];
  signed: Array<{ bucket: string | undefined; path: string; options: unknown }> = [];
  failingBuckets = new Set<string | undefined>();
  bucket(name?: string) {
    return {
      file: (path: string) => ({
        save: async (bytes: Buffer, options: unknown) => {
          this.saves.push({ bucket: name, path, bytes: bytes.length, options });
        },
        getSignedUrl: async (options: unknown) => {
          if (this.failingBuckets.has(name)) throw new Error(`no bucket ${name}`);
          this.signed.push({ bucket: name, path, options });
          return [`https://signed.example/${name}/${path}`];
        },
      }),
    };
  }
}

/** Process-wide singleton the module mocks point at. Reset in beforeEach. */
export const fake = {
  db: new FakeFirestore(),
  storage: new FakeStorage(),
  reset() {
    fake.db = new FakeFirestore();
    fake.storage = new FakeStorage();
  },
  seed(docs: Record<string, DocData>) {
    for (const [path, data] of Object.entries(docs)) fake.db.docs.set(path, data);
  },
  doc(path: string): DocData | undefined {
    return fake.db.docs.get(path);
  },
};
