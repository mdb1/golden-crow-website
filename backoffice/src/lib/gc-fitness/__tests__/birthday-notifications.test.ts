// __tests__/birthday-notifications.test.ts
//
// Birthday cards on the coach's notifications surface. Matching is purely on
// the MM-DD of the stored civil `birthDate` against the CALLER'S civil today —
// the caller resolves "today" in the coach's zone, so the time-zone edge lives
// in which `todayCivil` string comes in, not in this module. The tests pin:
// month/day match across years and across the Dec→Jan boundary, the Feb 29
// behaviour, the name precedence, the card shape, and the trainer query.

import { FakeFirestore } from "@/lib/test-utils/fake-firestore-c";

const mockDb: { current: FakeFirestore | null } = { current: null };
jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => mockDb.current,
}));

import {
  birthdayNotificationCount,
  birthdayNotificationCountForTrainer,
  listBirthdayNotifications,
  listBirthdayNotificationsForTrainer,
} from "../birthday-notifications";
import { civilDateToday } from "../civil-date";
import type { ClientRosterEntry } from "../client-roster";

function client(overrides: Partial<ClientRosterEntry> & { uid: string }): ClientRosterEntry {
  return {
    email: `${overrides.uid}@example.com`,
    displayName: `Name ${overrides.uid}`,
    timezone: null,
    photoURL: null,
    birthDate: null,
    coachNickname: null,
    pendingProvisioning: false,
    autoAssignedCoach: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockDb.current = new FakeFirestore();
});

describe("listBirthdayNotifications", () => {
  it("emits the full card for a client whose MM-DD matches today (any birth year)", () => {
    const cards = listBirthdayNotifications(
      [client({ uid: "c1", birthDate: "1990-06-15", displayName: "Ana" })],
      "2026-06-15",
    );
    expect(cards).toEqual([
      {
        id: "birthday:c1:2026-06-15",
        clientId: "c1",
        clientName: "Ana",
        birthDate: "1990-06-15",
        title: "Birthday",
        detail: "Send a birthday message to your client.",
        actionHref: "/gc-fitness/clients/c1",
        actionLabel: "Open client",
        sortAtISO: "2026-06-15T12:00:00.000Z",
      },
    ]);
  });

  it("does not fire the day before or after", () => {
    const roster = [client({ uid: "c1", birthDate: "1990-06-15" })];
    expect(listBirthdayNotifications(roster, "2026-06-14")).toEqual([]);
    expect(listBirthdayNotifications(roster, "2026-06-16")).toEqual([]);
  });

  it("handles the year boundary: Dec 31 and Jan 1 birthdays fire on their own day only", () => {
    const roster = [
      client({ uid: "dec", birthDate: "1985-12-31" }),
      client({ uid: "jan", birthDate: "2000-01-01" }),
    ];
    expect(listBirthdayNotifications(roster, "2026-12-31").map((c) => c.clientId)).toEqual(["dec"]);
    expect(listBirthdayNotifications(roster, "2027-01-01").map((c) => c.clientId)).toEqual(["jan"]);
    // The id carries the YEAR of today, so next year's card is a new one.
    expect(listBirthdayNotifications(roster, "2027-01-01")[0].id).toBe("birthday:jan:2027-01-01");
  });

  it("time zones: the same instant can be a different civil day for the coach — the caller's today decides", () => {
    // 2026-06-16T02:00Z is still June 15 in Buenos Aires (UTC-3) but June 16 in UTC.
    const instant = new Date("2026-06-16T02:00:00Z");
    const roster = [client({ uid: "c1", birthDate: "1990-06-15" })];
    const baToday = civilDateToday("America/Argentina/Buenos_Aires", instant);
    const utcToday = civilDateToday("UTC", instant);
    expect(baToday).toBe("2026-06-15");
    expect(utcToday).toBe("2026-06-16");
    expect(listBirthdayNotifications(roster, baToday)).toHaveLength(1);
    expect(listBirthdayNotifications(roster, utcToday)).toHaveLength(0);
  });

  describe("Feb 29", () => {
    const leapling = [client({ uid: "leap", birthDate: "2000-02-29" })];

    it("fires on Feb 29 of a leap year", () => {
      expect(listBirthdayNotifications(leapling, "2028-02-29")).toHaveLength(1);
    });

    it("CURRENT behaviour: in a non-leap year it fires on NEITHER Feb 28 nor Mar 1", () => {
      expect(listBirthdayNotifications(leapling, "2027-02-28")).toEqual([]);
      expect(listBirthdayNotifications(leapling, "2027-03-01")).toEqual([]);
    });

    // FINDING: a client born on Feb 29 gets no birthday card from the coach in 3
    // of every 4 years. Common convention is to celebrate on Feb 28 in non-leap
    // years. Flip to `it` once listBirthdayNotifications handles it.
    it.failing("should fire on Feb 28 in a non-leap year", () => {
      expect(listBirthdayNotifications(leapling, "2027-02-28")).toHaveLength(1);
    });
  });

  it("trims the stored birthDate and ignores empty / missing ones", () => {
    const cards = listBirthdayNotifications(
      [
        client({ uid: "padded", birthDate: "  1990-06-15  " }),
        client({ uid: "blank", birthDate: "   " }),
        client({ uid: "none", birthDate: null }),
        client({ uid: "undef", birthDate: undefined }),
      ],
      "2026-06-15",
    );
    expect(cards.map((c) => [c.clientId, c.birthDate])).toEqual([["padded", "1990-06-15"]]);
  });

  it("does not match malformed birth dates (wrong part count / timestamp form)", () => {
    const roster = [
      client({ uid: "slash", birthDate: "15/06/1990" }),
      client({ uid: "two", birthDate: "06-15" }),
      // A full ISO timestamp splits into ["1990","06","15T00:00:00Z"] → no match.
      client({ uid: "iso", birthDate: "1990-06-15T00:00:00Z" }),
    ];
    expect(listBirthdayNotifications(roster, "2026-06-15")).toEqual([]);
  });

  it("returns nothing when todayCivil itself is malformed", () => {
    const roster = [client({ uid: "c1", birthDate: "1990-06-15" })];
    expect(listBirthdayNotifications(roster, "")).toEqual([]);
    expect(listBirthdayNotifications(roster, "2026-06")).toEqual([]);
    expect(listBirthdayNotifications(roster, "2026--15")).toEqual([]);
  });

  it("names the client by coach nickname → displayName → email → uid", () => {
    const today = "2026-06-15";
    const b = "1990-06-15";
    const name = (c: ClientRosterEntry) => listBirthdayNotifications([c], today)[0].clientName;
    expect(name(client({ uid: "a", birthDate: b, coachNickname: "  Gordo  ", displayName: "Juan" }))).toBe("Gordo");
    expect(name(client({ uid: "b", birthDate: b, coachNickname: "   ", displayName: "Juan" }))).toBe("Juan");
    expect(name(client({ uid: "c", birthDate: b, displayName: "", email: "x@y.com" }))).toBe("x@y.com");
    expect(name(client({ uid: "d", birthDate: b, displayName: "", email: "" }))).toBe("d");
  });

  it("birthdayNotificationCount counts the cards", () => {
    const roster = [
      client({ uid: "a", birthDate: "1990-06-15" }),
      client({ uid: "b", birthDate: "1991-06-15" }),
      client({ uid: "c", birthDate: "1991-06-16" }),
    ];
    expect(birthdayNotificationCount(roster, "2026-06-15")).toBe(2);
  });
});

describe("listBirthdayNotificationsForTrainer", () => {
  it("reads ONLY the trainer's clients (coachId + role filter) and maps users docs", async () => {
    const db = mockDb.current!;
    db.seed("users/mine", {
      coachId: "coach-a",
      role: "client",
      displayName: "  Mía  ",
      email: "mia@example.com",
      birthDate: "1995-06-15",
    });
    db.seed("users/mine-nick", {
      coachId: "coach-a",
      role: "client",
      displayName: "Pablo",
      coachNickname: "Pablito",
      birthDate: "1980-06-15",
    });
    db.seed("users/mine-email-only", {
      coachId: "coach-a",
      role: "client",
      email: " e@example.com ",
      birthDate: "1980-06-15",
    });
    db.seed("users/mine-no-name", { coachId: "coach-a", role: "client", birthDate: "1980-06-15" });
    db.seed("users/other-coach", { coachId: "coach-b", role: "client", birthDate: "1990-06-15" });
    db.seed("users/coach-a-trainer", { coachId: "coach-a", role: "trainer", birthDate: "1990-06-15" });
    db.seed("users/mine-not-today", { coachId: "coach-a", role: "client", birthDate: "1990-06-16" });

    const cards = await listBirthdayNotificationsForTrainer("coach-a", "2026-06-15");

    expect(db.queries).toEqual([
      {
        collection: "users",
        filters: [
          { field: "coachId", op: "==", value: "coach-a" },
          { field: "role", op: "==", value: "client" },
        ],
        orderBy: [],
        limit: null,
      },
    ]);
    expect(cards.map((c) => [c.clientId, c.clientName]).sort()).toEqual([
      ["mine", "Mía"],
      ["mine-email-only", "e@example.com"],
      ["mine-nick", "Pablito"],
      ["mine-no-name", "mine-no-name"],
    ]);
    expect(await birthdayNotificationCountForTrainer("coach-a", "2026-06-15")).toBe(4);
    expect(db.writes).toEqual([]);
  });
});
