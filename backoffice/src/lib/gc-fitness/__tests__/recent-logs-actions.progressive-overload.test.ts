// __tests__/recent-logs-actions.progressive-overload.test.ts
//
// Issue #576: el atleta puede entrenar en "modo sobrecarga progresiva" — la app le sube la
// prescripción set a set en vez de darle la del plan. El coach tiene que verlo, porque sin eso
// un log con más reps o más kilos que lo prescripto se lee como que el cliente hizo la suya.
//
// ⚠️ Lo que se testea acá es el NOMBRE DEL CAMPO EN EL WIRE, y por eso no alcanza con un test de
// render. Las apps escriben `progressive_overload` (snake_case, como `total_volume_kg` y
// `duration_seconds`). Leer `progressiveOverload` compilaría, renderizaría perfecto y daría
// SIEMPRE `false`: la insignia no aparecería nunca y no habría nada roto a la vista — el modo
// simplemente no existiría para el coach.

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

async function detailFor(log: Record<string, unknown>) {
  const id = "log-po-1";
  mockState.db = makeDb({
    [`${WL}/${id}`]: {
      __id: id,
      clientId: "client1",
      trainerId: "coach1",
      status: "completed",
      sets: [],
      templateSnapshot: { name: "Pecho", exercises: [] },
      ...log,
    },
    [`${USERS}/client1`]: { displayName: "Client One", coachId: "coach1" },
    [`${USERS}/coach1`]: { displayName: "Coach One" },
  });
  return getWorkoutLogDetail(id);
}

describe("getWorkoutLogDetail — modo sobrecarga progresiva (#576)", () => {
  it("lee el campo snake_case que escriben las apps", async () => {
    const detail = await detailFor({ progressive_overload: true });
    expect(detail.progressiveOverload).toBe(true);
  });

  it("un log sin el campo —todos los anteriores al modo— no es sobrecarga", async () => {
    // El default correcto es `false`, no `undefined`: la vista lo usa como booleano.
    const detail = await detailFor({});
    expect(detail.progressiveOverload).toBe(false);
  });

  it("false explícito sigue siendo false", async () => {
    const detail = await detailFor({ progressive_overload: false });
    expect(detail.progressiveOverload).toBe(false);
  });

  it("NO acepta un valor truthy que no sea el booleano true", async () => {
    // Un cliente viejo o un script de migración podrían dejar un string. La comparación es
    // `=== true` justamente para que una insignia que afirma algo sobre el entrenamiento del
    // usuario no se encienda por un "0" o un "no".
    const detail = await detailFor({ progressive_overload: "no" });
    expect(detail.progressiveOverload).toBe(false);
  });

  it("no lee la variante camelCase — ese nombre no existe en el wire", async () => {
    const detail = await detailFor({ progressiveOverload: true });
    expect(detail.progressiveOverload).toBe(false);
  });
});
