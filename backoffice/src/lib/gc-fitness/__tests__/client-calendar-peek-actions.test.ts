const mockGetCurrentTrainer = jest.fn();
const mockClientGet = jest.fn();
const mockClientDoc = jest.fn(() => ({ get: mockClientGet }));
const mockCollection = jest.fn(() => ({ doc: mockClientDoc }));
const mockListMonthForClients = jest.fn();

jest.mock("@/lib/firebase/gc-fitness-admin", () => ({
  gcFitnessFirestore: () => ({ collection: mockCollection }),
}));

jest.mock("@/lib/gc-fitness/auth-helpers", () => ({
  getCurrentTrainer: () => mockGetCurrentTrainer(),
}));

jest.mock("@/lib/gc-fitness/civil-date", () => ({
  civilDateToday: jest.fn(() => "2026-07-13"),
}));

jest.mock("../schedule-month-actions", () => ({
  listMonthForClients: (input: unknown) => mockListMonthForClients(input),
}));

import { getClientCalendarPeek } from "../client-calendar-peek-actions";

describe("getClientCalendarPeek", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentTrainer.mockResolvedValue({
      uid: "trainer-1",
      email: "trainer@example.com",
    });
    mockClientGet.mockResolvedValue({
      exists: true,
      data: () => ({
        coachId: "trainer-1",
        timezone: "America/Argentina/Buenos_Aires",
      }),
    });
    mockListMonthForClients.mockResolvedValue({
      monthStart: "2026-07-10",
      monthEnd: "2026-07-16",
      workoutsByDay: {},
      habitsByDay: {},
    });
  });

  it("loads a 7-day window centered on the requested anchor for the owned client", async () => {
    const result = await getClientCalendarPeek({
      clientId: "client-1",
      anchorCivil: "2026-07-13",
    });

    expect(mockCollection).toHaveBeenCalledWith("users");
    expect(mockClientDoc).toHaveBeenCalledWith("client-1");
    expect(mockListMonthForClients).toHaveBeenCalledWith({
      startCivil: "2026-07-10",
      endCivil: "2026-07-16",
      clientIds: ["client-1"],
      todayCivil: "2026-07-13",
    });
    expect(result).toEqual({
      anchorCivil: "2026-07-13",
      startCivil: "2026-07-10",
      endCivil: "2026-07-16",
      todayCivil: "2026-07-13",
      calendar: {
        monthStart: "2026-07-10",
        monthEnd: "2026-07-16",
        workoutsByDay: {},
        habitsByDay: {},
      },
    });
  });

  it("falls back to today when the anchor is malformed", async () => {
    await getClientCalendarPeek({
      clientId: "client-1",
      anchorCivil: "not-a-date",
    });

    expect(mockListMonthForClients).toHaveBeenCalledWith(
      expect.objectContaining({
        startCivil: "2026-07-10",
        endCivil: "2026-07-16",
        todayCivil: "2026-07-13",
      }),
    );
  });

  it("rejects clients owned by a different coach before reading calendar data", async () => {
    mockClientGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ coachId: "other-trainer", timezone: "UTC" }),
    });

    await expect(
      getClientCalendarPeek({
        clientId: "client-1",
        anchorCivil: "2026-07-13",
      }),
    ).rejects.toThrow("Forbidden");
    expect(mockListMonthForClients).not.toHaveBeenCalled();
  });
});
