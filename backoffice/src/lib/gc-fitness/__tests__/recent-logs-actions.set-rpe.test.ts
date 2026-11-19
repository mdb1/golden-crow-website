// __tests__/recent-logs-actions.set-rpe.test.ts
//
// gc-fitness #1623: las apps registran el esfuerzo POR SERIE como `sets[].rpe` (número, 6–10 en
// pasos de 0,5). Lo que se testea acá es la lectura del WIRE — el nombre del campo y la lectura
// permisiva (`normalizedRpe`) — porque un test de render pasaría igual con un campo mal leído:
// la vista simplemente no mostraría nunca el RPE y no habría nada roto a la vista.

const mockState: { db: unknown } = { db: null };

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockState.db,
}));
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: jest.fn(async () => ({ uid: "coach1", email: "coach@x.com" })),
}));
jest.mock("@/lib/gc-fitness/trainer-timezone", () => ({
  getTrainerTimezone: jest.fn(async () => "UTC"),
}));

import { getWorkoutLogDetail } from "../recent-logs-actions";
import { FirestoreCollections } from "../collections";

function docSnap(exists: boolean, data: Record<string, unknown>, id = "") {
  return {
    exists,
    id: (data.__id as string) ?? id,
    data: () => data,
    get: (field: string) => data[field],
  };
}

function makeDb(fixtures: Record<string, Record<string, unknown> | null>) {
  const docRef = (path: string) => ({
    get: async () => {
      const data = fixtures[path];
      const id = path.split("/").pop() ?? "";
      return data ? docSnap(true, data, id) : docSnap(false, {}, id);
    },
    collection: (sub: string) => ({
      doc: (subId: string) => docRef(`${path}/${sub}/${subId}`),
    }),
  });
  return {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
    }),
  };
}

const WL = FirestoreCollections.workoutLogs;
const USERS = FirestoreCollections.users;

async function setsFor(rawRpes: unknown[]) {
  const id = "log-rpe-1";
  mockState.db = makeDb({
    [`${WL}/${id}`]: {
      __id: id,
      clientId: "client1",
      trainerId: "coach1",
      status: "completed",
      sets: rawRpes.map((rpe, i) => ({
        id: `s${i + 1}`,
        reps: 8,
        weight_kg: 60,
        completed_at: `2026-08-05T01:0${i}:00.000Z`,
        ...(rpe === "__absent__" ? {} : { rpe }),
      })),
      templateSnapshot: { name: "Pecho", exercises: [] },
    },
    [`${USERS}/client1`]: { displayName: "Client One", coachId: "coach1" },
    [`${USERS}/coach1`]: { displayName: "Coach One" },
  });
  return (await getWorkoutLogDetail(id)).sets;
}

describe("getWorkoutLogDetail — RPE por serie (#1623)", () => {
  it("lee `rpe` de cada serie y lo normaliza a pasos de 0,5", async () => {
    const sets = await setsFor([8, 7.3, 10.2, 6]);
    expect(sets.map((s) => s.rpe)).toEqual([8, 7.5, 10, 6]);
  });

  it("una serie sin el campo —todas las anteriores a #1623— no trae la clave", async () => {
    const [set] = await setsFor(["__absent__"]);
    expect(set.rpe).toBeUndefined();
    // Sin clave (no `rpe: undefined`): el objeto cruza el límite RSC tal cual.
    expect(Object.prototype.hasOwnProperty.call(set, "rpe")).toBe(false);
  });

  it("descarta valores fuera de rango o que no son números", async () => {
    const sets = await setsFor(["8", null, Number.NaN, 5.7, 11]);
    for (const set of sets) {
      expect(Object.prototype.hasOwnProperty.call(set, "rpe")).toBe(false);
    }
  });
});
