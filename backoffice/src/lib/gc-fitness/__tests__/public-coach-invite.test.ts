/**
 * gc-fitness#1631 — la lectura de la landing pública `/f/c/[code]`.
 *
 * Defiende: (1) que una invitación inexistente / revocada / de un coach dado de baja
 * sea `null` (el 404), y (2) que de `users/{coachId}` sólo salgan nombre y foto
 * servible — la página no tiene login y el Admin SDK no pasa por las reglas.
 */

const mockState: { db: unknown } = { db: null };

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
}));

import { readCoachInvite } from "../public-coach-invite";

type Docs = Record<string, Record<string, Record<string, unknown>>>;

function makeDb(docs: Docs) {
  const reads: string[] = [];
  const db = {
    collection(name: string) {
      return {
        doc(id: string) {
          if (id.includes("/") || /^__.*__$/.test(id)) throw new Error("invalid id");
          return {
            async get() {
              reads.push(`${name}/${id}`);
              const data = docs[name]?.[id];
              return { exists: data != null, get: (f: string) => data?.[f] };
            },
          };
        },
      };
    },
  };
  return { db, reads };
}

const coach = {
  role: "trainer",
  displayName: "  Vale Coach ",
  photoURL: "https://lh3.googleusercontent.com/a/x",
  email: "vale@example.com",
};

describe("readCoachInvite", () => {
  it("una invitación activa devuelve SÓLO nombre y foto del coach", async () => {
    const { db, reads } = makeDb({
      coach_invite_links: { abc234xyz9: { coachId: "uid-coach", active: true } },
      users: { "uid-coach": coach },
    });
    mockState.db = db;
    const invite = await readCoachInvite("abc234xyz9");
    expect(invite).toEqual({
      code: "abc234xyz9",
      coachName: "Vale Coach",
      coachPhotoUrl: "https://lh3.googleusercontent.com/a/x",
    });
    expect(Object.keys(invite!)).toEqual(["code", "coachName", "coachPhotoUrl"]);
    expect(reads).toEqual(["coach_invite_links/abc234xyz9", "users/uid-coach"]);
  });

  it("una foto que es un path de Storage cae a iniciales", async () => {
    const { db } = makeDb({
      coach_invite_links: { abc234xyz9: { coachId: "uid-coach", active: true } },
      users: { "uid-coach": { ...coach, photoURL: "profile_photos/uid-coach/avatar.jpg" } },
    });
    mockState.db = db;
    expect((await readCoachInvite("abc234xyz9"))?.coachPhotoUrl).toBeNull();
  });

  it.each([
    ["inexistente", {}],
    ["revocada", { coach_invite_links: { abc234xyz9: { coachId: "uid-coach", active: false } }, users: { "uid-coach": coach } }],
    ["coach dado de baja", { coach_invite_links: { abc234xyz9: { coachId: "uid-coach", active: true } }, users: { "uid-coach": { ...coach, coachDisabled: true } } }],
    ["coach que ya es cliente", { coach_invite_links: { abc234xyz9: { coachId: "uid-coach", active: true } }, users: { "uid-coach": { ...coach, role: "client" } } }],
    ["coach sin doc", { coach_invite_links: { abc234xyz9: { coachId: "uid-coach", active: true } } }],
  ])("%s ⇒ null (404)", async (_label, docs) => {
    mockState.db = makeDb(docs as Docs).db;
    expect(await readCoachInvite("abc234xyz9")).toBeNull();
  });

  it("un código con barra o reservado no llega a `.doc()` (sería un 500)", async () => {
    const { db, reads } = makeDb({});
    mockState.db = db;
    expect(await readCoachInvite("a/b")).toBeNull();
    expect(await readCoachInvite("__x__")).toBeNull();
    expect(await readCoachInvite("")).toBeNull();
    expect(reads).toEqual([]);
  });
});
