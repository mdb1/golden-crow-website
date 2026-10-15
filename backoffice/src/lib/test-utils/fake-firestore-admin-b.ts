// fake-firestore-admin-b.ts
//
// A small in-memory stand-in for the slice of the Firebase ADMIN Firestore API
// that the admin / god-mode Server Actions use (admin-actions,
// admin-coachless-actions, engineering-actions, data-hygiene-actions).
//
// Why a fake and not per-test jest.fn chains: these actions READ the target doc
// before deciding whether to write (ownership / role / typed-confirmation
// guards). The tests that matter assert "the guard refused AND nothing was
// written", so every write path (set / update / delete / add / batch /
// recursiveDelete) funnels through ONE `writes` log that a test can assert is
// empty, and through the store so the happy path can assert the WRITTEN doc.
//
// Supported: collection(path).doc(id) (+ nested .collection()), where("==")
// chains, orderBy (applied), limit, select (no-op projection), count(), get(),
// add(); doc get/set(merge)/update/delete; db.batch(); db.recursiveDelete().
// FieldValue sentinels come from `fakeFieldValueModule` (mock
// "firebase-admin/firestore" with it) — DELETE removes the key on merge/update.

export const FV_SERVER_TIMESTAMP = "FV_SERVER_TIMESTAMP";
export const FV_DELETE = "FV_DELETE";

/** Drop-in factory result for `jest.mock("firebase-admin/firestore", ...)`. */
export const fakeFieldValueModule = {
  FieldValue: {
    serverTimestamp: () => FV_SERVER_TIMESTAMP,
    delete: () => FV_DELETE,
    increment: (n: number) => ({ __increment: n }),
  },
};

export type DocData = Record<string, unknown>;

export interface FakeWrite {
  op: "set" | "update" | "delete" | "add" | "recursiveDelete";
  /** `collection/id` (nested paths keep every segment). */
  path: string;
  data?: DocData;
  options?: { merge?: boolean };
}

interface Filter {
  field: string;
  op: string;
  value: unknown;
}

function applyPatch(base: DocData | undefined, patch: DocData): DocData {
  const next: DocData = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === FV_DELETE) delete next[key];
    else next[key] = value;
  }
  return next;
}

function docSnapshot(ref: FakeDocRef, data: DocData | undefined) {
  return {
    id: ref.id,
    ref,
    exists: data !== undefined,
    data: () => (data ? { ...data } : undefined),
    get: (field: string) => data?.[field],
  };
}

export class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    public readonly parentPath: string,
    public readonly id: string,
  ) {
    if (/^__.*__$/.test(id)) {
      // Mirror Firestore: a reserved id cannot even be referenced.
      throw new Error(`3 INVALID_ARGUMENT: Resource id "${id}" is reserved.`);
    }
  }

  get path(): string {
    return `${this.parentPath}/${this.id}`;
  }

  collection(name: string): FakeQuery {
    return new FakeQuery(this.db, `${this.path}/${name}`);
  }

  async get() {
    return docSnapshot(this, this.db.read(this.parentPath, this.id));
  }

  async set(data: DocData, options?: { merge?: boolean }) {
    this.db.record({ op: "set", path: this.path, data, options });
    this.db.applySet(this, data, options);
  }

  async update(data: DocData) {
    this.db.record({ op: "update", path: this.path, data });
    this.db.applyUpdate(this, data);
  }

  async delete() {
    this.db.record({ op: "delete", path: this.path });
    this.db.applyDelete(this);
  }
}

export class FakeQuery {
  constructor(
    protected readonly db: FakeFirestore,
    public readonly path: string,
    private readonly filters: Filter[] = [],
    private readonly order: { field: string; dir: "asc" | "desc" } | null = null,
    private readonly max: number | null = null,
  ) {}

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.db, this.path, id);
  }

  where(field: string, op: string, value: unknown): FakeQuery {
    return new FakeQuery(this.db, this.path, [...this.filters, { field, op, value }], this.order, this.max);
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc"): FakeQuery {
    return new FakeQuery(this.db, this.path, this.filters, { field, dir }, this.max);
  }

  limit(n: number): FakeQuery {
    return new FakeQuery(this.db, this.path, this.filters, this.order, n);
  }

  select(..._fields: string[]): FakeQuery {
    return this;
  }

  private matching(): Array<[string, DocData]> {
    let rows = Array.from(this.db.collectionMap(this.path).entries()).filter(([, data]) =>
      this.filters.every((f) => {
        if (f.op !== "==") throw new Error(`fake firestore: unsupported op ${f.op}`);
        return data[f.field] === f.value;
      }),
    );
    if (this.order) {
      const { field, dir } = this.order;
      rows = rows.sort(([, a], [, b]) => {
        const cmp = String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
        return dir === "desc" ? -cmp : cmp;
      });
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    return rows;
  }

  async get() {
    const docs = this.matching().map(([id, data]) => docSnapshot(this.doc(id), data));
    return { empty: docs.length === 0, size: docs.length, docs };
  }

  count() {
    return {
      get: async () => {
        const n = this.matching().length;
        return { data: () => ({ count: n }) };
      },
    };
  }

  async add(data: DocData) {
    const id = `auto-${this.db.nextAutoId()}`;
    const ref = this.doc(id);
    this.db.record({ op: "add", path: ref.path, data });
    this.db.applySet(ref, data);
    return ref;
  }
}

export class FakeBatch {
  private readonly ops: Array<() => void> = [];
  constructor(private readonly db: FakeFirestore) {}
  set(ref: FakeDocRef, data: DocData, options?: { merge?: boolean }) {
    this.ops.push(() => {
      this.db.record({ op: "set", path: ref.path, data, options });
      this.db.applySet(ref, data, options);
    });
    return this;
  }
  update(ref: FakeDocRef, data: DocData) {
    this.ops.push(() => {
      this.db.record({ op: "update", path: ref.path, data });
      this.db.applyUpdate(ref, data);
    });
    return this;
  }
  delete(ref: FakeDocRef) {
    this.ops.push(() => {
      this.db.record({ op: "delete", path: ref.path });
      this.db.applyDelete(ref);
    });
    return this;
  }
  async commit() {
    for (const op of this.ops) op();
  }
}

export class FakeFirestore {
  /** collection path → (doc id → data). */
  private readonly store = new Map<string, Map<string, DocData>>();
  /** Every write, in order. Assert `[]` to prove a guard wrote nothing. */
  readonly writes: FakeWrite[] = [];
  private autoId = 0;

  constructor(seed: Record<string, Record<string, DocData>> = {}) {
    for (const [path, docs] of Object.entries(seed)) {
      for (const [id, data] of Object.entries(docs)) {
        this.collectionMap(path).set(id, { ...data });
      }
    }
  }

  collection(path: string): FakeQuery {
    return new FakeQuery(this, path);
  }

  batch(): FakeBatch {
    return new FakeBatch(this);
  }

  async recursiveDelete(ref: FakeDocRef) {
    this.record({ op: "recursiveDelete", path: ref.path });
    this.applyDelete(ref);
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(`${ref.path}/`)) this.store.delete(key);
    }
  }

  // ── inspection helpers for tests ──────────────────────────────────────────

  /** Current data of `collection/id`, or undefined. */
  doc(path: string, id: string): DocData | undefined {
    return this.read(path, id);
  }

  /** Writes whose path starts with `prefix` (e.g. "admin_operations/"). */
  writesTo(prefix: string): FakeWrite[] {
    return this.writes.filter((w) => w.path.startsWith(prefix));
  }

  /** All docs currently in a collection. */
  all(path: string): Record<string, DocData> {
    return Object.fromEntries(this.collectionMap(path).entries());
  }

  // ── internals (public so refs / batches can reach them) ───────────────────

  collectionMap(path: string): Map<string, DocData> {
    let map = this.store.get(path);
    if (!map) {
      map = new Map();
      this.store.set(path, map);
    }
    return map;
  }

  read(path: string, id: string): DocData | undefined {
    const data = this.store.get(path)?.get(id);
    return data ? { ...data } : undefined;
  }

  record(write: FakeWrite) {
    this.writes.push(write);
  }

  nextAutoId(): number {
    this.autoId += 1;
    return this.autoId;
  }

  applySet(ref: FakeDocRef, data: DocData, options?: { merge?: boolean }) {
    const map = this.collectionMap(ref.parentPath);
    const base = options?.merge ? map.get(ref.id) : undefined;
    map.set(ref.id, applyPatch(base, data));
  }

  applyUpdate(ref: FakeDocRef, data: DocData) {
    const map = this.collectionMap(ref.parentPath);
    const existing = map.get(ref.id);
    if (!existing) throw new Error(`5 NOT_FOUND: no document to update: ${ref.path}`);
    map.set(ref.id, applyPatch(existing, data));
  }

  applyDelete(ref: FakeDocRef) {
    this.store.get(ref.parentPath)?.delete(ref.id);
  }
}
