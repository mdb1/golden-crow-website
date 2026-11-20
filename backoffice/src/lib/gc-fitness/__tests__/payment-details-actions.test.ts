// payment-details-actions.test.ts — gc-fitness #1697. Admin SDK ⇒ las reglas no corren: la
// action es lo único que impide escribir los datos de cobro en el doc de OTRO. Se asertan los
// DOCUMENTOS escritos (fake en memoria).

jest.mock("firebase-admin/firestore", () =>
  jest.requireActual("@/lib/test-utils/fake-firestore-cov-a").firestoreModuleMock,
);
jest.mock("@/lib/firebase/gc-fitness-admin", () => {
  const f = jest.requireActual("@/lib/test-utils/fake-firestore-cov-a");
  return { gcFitnessFirestore: () => f.fake.db, gcFitnessStorage: () => f.fake.storage };
});

const mockGetCurrentTrainer = jest.fn();
jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));

import { fake } from "@/lib/test-utils/fake-firestore-cov-a";

import { getCoachPaymentDetails, updateCoachPaymentDetails } from "../payment-details-actions";

const COACH = "coach-A";
const OTHER = "coach-B";

beforeEach(() => {
  fake.reset();
  mockGetCurrentTrainer.mockReset();
  mockGetCurrentTrainer.mockResolvedValue({ uid: COACH, email: "ana@example.com" });
  fake.seed({
    [`users/${COACH}`]: { displayName: "Ana Coach", role: "trainer" },
    [`users/${OTHER}`]: { displayName: "Otro", role: "trainer", paymentDetails: "Alias: otro" },
  });
});

describe("updateCoachPaymentDetails", () => {
  it("writes the normalized text on the SESSION coach's own doc", async () => {
    const r = await updateCoachPaymentDetails({ paymentDetails: "  Alias: ana.fit  \r\nBanco Galicia \n" });
    expect(r).toEqual({ ok: true, paymentDetails: "Alias: ana.fit\nBanco Galicia" });
    expect(fake.doc(`users/${COACH}`)?.paymentDetails).toBe("Alias: ana.fit\nBanco Galicia");
    expect(fake.doc(`users/${COACH}`)?.displayName).toBe("Ana Coach");
    expect(fake.doc(`users/${OTHER}`)?.paymentDetails).toBe("Alias: otro");
  });

  it("ignores any uid smuggled in the input", async () => {
    await updateCoachPaymentDetails({ paymentDetails: "Alias: x", uid: OTHER, coachId: OTHER });
    expect(fake.doc(`users/${OTHER}`)?.paymentDetails).toBe("Alias: otro");
    expect(fake.doc(`users/${COACH}`)?.paymentDetails).toBe("Alias: x");
  });

  it("blank clears the field to null (never undefined)", async () => {
    fake.seed({ [`users/${COACH}`]: { displayName: "Ana Coach", paymentDetails: "Alias: viejo" } });
    const r = await updateCoachPaymentDetails({ paymentDetails: "   \n " });
    expect(r).toEqual({ ok: true, paymentDetails: null });
    expect(fake.doc(`users/${COACH}`)?.paymentDetails).toBeNull();
  });

  it("rejects more than 500 characters without writing", async () => {
    const r = await updateCoachPaymentDetails({ paymentDetails: "x".repeat(501) });
    expect(r.ok).toBe(false);
    expect(fake.doc(`users/${COACH}`)?.paymentDetails).toBeUndefined();
    const ok = await updateCoachPaymentDetails({ paymentDetails: "x".repeat(500) });
    expect(ok.ok).toBe(true);
  });

  it("rejects a non-string payload", async () => {
    const r = await updateCoachPaymentDetails({ paymentDetails: 42 });
    expect(r.ok).toBe(false);
  });

  it("returns Forbidden when there is no trainer session", async () => {
    mockGetCurrentTrainer.mockRejectedValue(new Error("Forbidden"));
    const r = await updateCoachPaymentDetails({ paymentDetails: "Alias: x" });
    expect(r).toEqual({ ok: false, error: "Forbidden" });
    expect(fake.doc(`users/${COACH}`)?.paymentDetails).toBeUndefined();
  });
});

describe("getCoachPaymentDetails", () => {
  it("reads the session coach's own value", async () => {
    expect(await getCoachPaymentDetails()).toBeNull();
    mockGetCurrentTrainer.mockResolvedValue({ uid: OTHER, email: "o@example.com" });
    expect(await getCoachPaymentDetails()).toBe("Alias: otro");
  });
});
