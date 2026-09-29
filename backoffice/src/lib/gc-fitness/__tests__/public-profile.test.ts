/**
 * #1184 / SV2-4 (D-6) — las lecturas de la landing pública `/f/u/[uid]`.
 *
 * ## Qué defiende de verdad este archivo
 *
 * 1. QUÉ colecciones se leen. La página no tiene login y el Admin SDK pasa por
 *    encima de las reglas: si alguien "completa" el perfil con un `get` a `/users`,
 *    la página publica mail/coach/plan de cualquier uid. El Firestore falso registra
 *    cada colección tocada y el test falla si aparece otra.
 * 2. Que un perfil privado no sirva bio ni contadores, y que suspendido / sin handle /
 *    inexistente sean `null` (el 404 de la página).
 * 3. La FORMA de la query de rutinas, que tiene que calzar con el índice
 *    `(authorUid, authorSuspended, publishedAt DESC)`. El emulador no valida
 *    índices: una forma distinta va verde en local y es un 500 en producción.
 */

const mockState: { db: unknown } = { db: null };

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
}));

import {
  PROFILE_ROUTINE_LIMIT,
  profileInitials,
  readProfileRoutines,
  readPublicProfile,
  servablePhotoUrl,
} from "../public-profile";

// ---- Firestore falso -------------------------------------------------------

interface QueryCall {
  where: Array<[string, string, unknown]>;
  orderBy: Array<[string, string]>;
  limit: number | null;
}

interface FakeDoc {
  id: string;
  data: Record<string, unknown>;
}

function makeDb(opts: {
  profiles?: Record<string, Record<string, unknown>>;
  routines?: FakeDoc[];
  routinesThrow?: boolean;
}) {
  const collectionsRead: string[] = [];
  const queries: QueryCall[] = [];

  const db = {
    collection(name: string) {
      collectionsRead.push(name);
      const call: QueryCall = { where: [], orderBy: [], limit: null };
      const query = {
        where(field: string, op: string, value: unknown) {
          call.where.push([field, op, value]);
          return query;
        },
        orderBy(field: string, dir: string) {
          call.orderBy.push([field, dir]);
          return query;
        },
        limit(n: number) {
          call.limit = n;
          return query;
        },
        async get() {
          queries.push(call);
          if (opts.routinesThrow) throw new Error("FAILED_PRECONDITION: index");
          const docs = (opts.routines ?? []).slice(0, call.limit ?? undefined).map((d) => ({
            id: d.id,
            get: (field: string) => d.data[field],
          }));
          return { docs };
        },
        doc(id: string) {
          return {
            async get() {
              const data = opts.profiles?.[id];
              return { id, exists: data !== undefined, data: () => data };
            },
          };
        },
      };
      return query;
    },
  };

  mockState.db = db;
  return { collectionsRead, queries };
}

const PUBLIC_PROFILE = {
  uid: "u1",
  handle: "maru.lifts",
  displayName: "Maru Gómez",
  photoURL: "profile_photos/u1/avatar.jpg",
  bio: "Powerlifting los martes.",
  visibility: "public",
  followerCount: 12,
  publicRoutineCount: 3,
  suspended: false,
};

// ---- readPublicProfile -----------------------------------------------------

describe("readPublicProfile", () => {
  it("lee SÓLO social_profiles — nunca /users", async () => {
    const { collectionsRead } = makeDb({ profiles: { u1: PUBLIC_PROFILE } });
    await readPublicProfile("u1");
    expect(collectionsRead).toEqual(["social_profiles"]);
  });

  it("un perfil público sirve bio y contadores", async () => {
    makeDb({ profiles: { u1: PUBLIC_PROFILE } });
    expect(await readPublicProfile("u1")).toEqual({
      uid: "u1",
      handle: "maru.lifts",
      displayName: "Maru Gómez",
      photoUrl: null, // un path de Storage no es una URL servible
      isPrivate: false,
      bio: "Powerlifting los martes.",
      followerCount: 12,
      publicRoutineCount: 3,
    });
  });

  it("un perfil privado NO sirve bio ni contadores", async () => {
    makeDb({ profiles: { u1: { ...PUBLIC_PROFILE, visibility: "private" } } });
    const profile = await readPublicProfile("u1");
    expect(profile).toMatchObject({
      handle: "maru.lifts",
      displayName: "Maru Gómez",
      isPrivate: true,
      bio: null,
      followerCount: null,
      publicRoutineCount: null,
    });
  });

  it("sin `visibility` (o con un valor raro) se trata como privado", async () => {
    const { visibility: _omit, ...noVisibility } = PUBLIC_PROFILE;
    void _omit;
    makeDb({ profiles: { u1: noVisibility, u2: { ...PUBLIC_PROFILE, visibility: "PUBLIC" } } });
    expect((await readPublicProfile("u1"))?.isPrivate).toBe(true);
    expect((await readPublicProfile("u2"))?.isPrivate).toBe(true);
  });

  it("inexistente, suspendido o sin handle ⇒ null (el 404)", async () => {
    makeDb({
      profiles: {
        suspended: { ...PUBLIC_PROFILE, suspended: true },
        nohandle: { ...PUBLIC_PROFILE, handle: "" },
        blankhandle: { ...PUBLIC_PROFILE, handle: "   " },
      },
    });
    expect(await readPublicProfile("missing")).toBeNull();
    expect(await readPublicProfile("suspended")).toBeNull();
    expect(await readPublicProfile("nohandle")).toBeNull();
    expect(await readPublicProfile("blankhandle")).toBeNull();
  });

  it("un id vacío, con barra o reservado ni siquiera llega a Firestore", async () => {
    // `.doc("__x__")` hace THROW en el SDK real: adentro del render sería un 500.
    const { collectionsRead } = makeDb({ profiles: {} });
    expect(await readPublicProfile("")).toBeNull();
    expect(await readPublicProfile("a/b")).toBeNull();
    expect(await readPublicProfile("__standard__")).toBeNull();
    expect(collectionsRead).toEqual([]);
  });

  it("sin displayName cae al handle", async () => {
    makeDb({ profiles: { u1: { ...PUBLIC_PROFILE, displayName: "" } } });
    expect((await readPublicProfile("u1"))?.displayName).toBe("maru.lifts");
  });
});

// ---- readProfileRoutines ---------------------------------------------------

function routine(id: string, extra: Record<string, unknown> = {}): FakeDoc {
  return {
    id,
    data: {
      authorUid: "u1",
      authorSuspended: false,
      name: { es: `Rutina ${id}`, en: `Routine ${id}` },
      exerciseCount: 5,
      estimatedMinutes: 40,
      ...extra,
    },
  };
}

describe("readProfileRoutines", () => {
  it("usa la forma del índice (authorUid, authorSuspended, publishedAt DESC) y lee sólo public_routines", async () => {
    const { collectionsRead, queries } = makeDb({ routines: [routine("a")] });
    await readProfileRoutines("u1");

    expect(collectionsRead).toEqual(["public_routines"]);
    expect(queries).toHaveLength(1);
    expect(queries[0].where).toEqual([
      ["authorUid", "==", "u1"],
      ["authorSuspended", "==", false],
    ]);
    expect(queries[0].orderBy).toEqual([["publishedAt", "desc"]]);
    // Ninguna desigualdad: `hidden != true` pediría otro índice.
    expect(queries[0].where.some(([, op]) => op !== "==")).toBe(false);
  });

  it("descarta las escondidas por moderación y corta en 6, en el orden de la query", async () => {
    const docs = [
      routine("1"),
      routine("2", { hidden: true }),
      routine("3"),
      routine("4"),
      routine("5", { hidden: true }),
      routine("6"),
      routine("7"),
      routine("8"),
      routine("9"),
    ];
    makeDb({ routines: docs });
    const result = await readProfileRoutines("u1");
    expect(result).toHaveLength(PROFILE_ROUTINE_LIMIT);
    expect(result.map((r) => r.templateId)).toEqual(["1", "3", "4", "6", "7", "8"]);
  });

  it("mapea nombre en español, contador y minutos (0 ⇒ null)", async () => {
    makeDb({ routines: [routine("a"), routine("b", { estimatedMinutes: 0, name: { en: "Only EN" } })] });
    expect(await readProfileRoutines("u1")).toEqual([
      { templateId: "a", name: "Rutina a", exerciseCount: 5, estimatedMinutes: 40 },
      { templateId: "b", name: "Only EN", exerciseCount: 5, estimatedMinutes: null },
    ]);
  });

  it("una query que falla (p. ej. índice construyéndose) devuelve [] en vez de romper la página", async () => {
    makeDb({ routinesThrow: true });
    await expect(readProfileRoutines("u1")).resolves.toEqual([]);
  });
});

// ---- helpers puros ---------------------------------------------------------

describe("servablePhotoUrl / profileInitials", () => {
  it("sólo una URL https se sirve; un path de Storage o gs:// no", () => {
    expect(servablePhotoUrl("https://lh3.googleusercontent.com/a/x")).toBe(
      "https://lh3.googleusercontent.com/a/x",
    );
    expect(servablePhotoUrl("profile_photos/u1/avatar.jpg")).toBeNull();
    expect(servablePhotoUrl("gs://bucket/profile_photos/u1/avatar.jpg")).toBeNull();
    expect(servablePhotoUrl("http://insecure.example/x.jpg")).toBeNull();
    expect(servablePhotoUrl(null)).toBeNull();
  });

  it("iniciales: hasta dos palabras, o la primera letra del handle", () => {
    expect(profileInitials("Maru Gómez López", "maru")).toBe("MG");
    expect(profileInitials("ángela", "x")).toBe("Á");
    expect(profileInitials("", "maru.lifts")).toBe("M");
  });
});
