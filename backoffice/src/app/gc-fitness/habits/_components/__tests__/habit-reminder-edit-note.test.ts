/**
 * 260611-ugu — unit tests for the coach-facing "client changed reminder" note
 * derivation on the habits-table ReminderCell. Twin of the workout treatment
 * shipped in PR #152 as ClientDailyTimeline.reminderNoteFor, deleted in #309 —
 * these tests are now the only guard on that Spanish copy.
 *
 * The note only surfaces when reminderEditedAt is present (the client stamped
 * reminderUpdatedAt from the app); these tests pin the three rendered phrases.
 */
import { habitReminderEditNote } from "../habit-pills";

describe("habitReminderEditNote (260611-ugu habit reminder client-edit visibility)", () => {
  it("client disabled the reminder → 'El cliente desactivó el recordatorio'", () => {
    expect(
      habitReminderEditNote({ reminderEnabled: false, reminderTime: "07:30" }),
    ).toBe("El cliente desactivó el recordatorio");
  });

  it("client set an explicit time → 'El cliente cambió el recordatorio a las HH:mm'", () => {
    expect(
      habitReminderEditNote({ reminderEnabled: true, reminderTime: "08:15" }),
    ).toBe("El cliente cambió el recordatorio a las 08:15");
  });

  it("enabled but no explicit time → generic 'El cliente cambió el recordatorio'", () => {
    expect(habitReminderEditNote({ reminderEnabled: true })).toBe(
      "El cliente cambió el recordatorio",
    );
    expect(
      habitReminderEditNote({ reminderEnabled: true, reminderTime: "" }),
    ).toBe("El cliente cambió el recordatorio");
  });

  it("matches the workout note copy from PR #152 (parity)", () => {
    // The deleted ClientDailyTimeline.reminderNoteFor produced these phrases for the
    // workout surface — the habit twin must read identically.
    expect(
      habitReminderEditNote({ reminderEnabled: false }),
    ).toBe("El cliente desactivó el recordatorio");
  });
});
