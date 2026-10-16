/**
 * @jest-environment jsdom
 */

// use-live-session.test.tsx
//
// The coach-run live workout keeps EVERYTHING the coach types in an in-memory
// buffer and only persists it two ways: a debounced (1.2 s) `syncWorkoutSession`
// for reload-resume, and the authoritative `finalizeWorkoutSession`. Any bug
// in this hook loses a coach's logged sets, so the assertions here are on the
// exact arguments the Server Actions receive.
//
// Server Actions are mocked at the module boundary; everything else (the
// weight-prefill resolver, set-type helpers, identity matching) runs for real.

import { act, renderHook, waitFor } from "@testing-library/react";

import type {
  ActiveSession,
  SessionExercise,
  SessionSetLog,
} from "@/lib/gc-fitness/live-workout-types";

const mockStart = jest.fn();
const mockGetActive = jest.fn();
const mockSync = jest.fn();
const mockFinalize = jest.fn();
const mockCancel = jest.fn();

jest.mock("@/lib/gc-fitness/live-workout-actions", () => ({
  startWorkoutSession: (...a: unknown[]) => mockStart(...a),
  getActiveSessionForAssignment: (...a: unknown[]) => mockGetActive(...a),
  syncWorkoutSession: (...a: unknown[]) => mockSync(...a),
  finalizeWorkoutSession: (...a: unknown[]) => mockFinalize(...a),
  cancelWorkoutSession: (...a: unknown[]) => mockCancel(...a),
}));

import { useLiveSession } from "../use-live-session";

function ex(overrides: Partial<SessionExercise> = {}): SessionExercise {
  return {
    exerciseId: "squat",
    name: { en: "Squat", es: "Sentadilla" },
    sets: 2,
    reps: 8,
    restSeconds: 90,
    order: 1,
    weightBySetKg: [60, 70],
    thumbnailURL: "https://cdn/thumb.gif",
    mediaURL: null,
    ...overrides,
  };
}

function session(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    logId: "log-1",
    assignmentId: "asg-1",
    clientId: "client-1",
    trainerId: "coach-1",
    workoutName: { en: "Legs" },
    startedAt: "2026-10-15T10:00:00.000Z",
    status: "active",
    exercises: [
      ex(),
      ex({
        exerciseId: "plank",
        name: { en: "Plank" },
        sets: 1,
        reps: 0,
        metric: "time",
        durationSeconds: 45,
        weightBySetKg: null,
        order: 2,
        restSeconds: 30,
      }),
    ],
    sets: [],
    scheduledFor: "2026-10-15",
    seriesId: null,
    prescriptionUpdatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

async function startedHook(s: ActiveSession = session()) {
  mockStart.mockResolvedValue(s);
  const hook = renderHook(() => useLiveSession("asg-1", {}));
  await waitFor(() => expect(hook.result.current.status).toBe("active"));
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSync.mockResolvedValue(undefined);
  mockGetActive.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useLiveSession — start on mount", () => {
  it("starts the session ONCE with the assignment id and builds rows from the prescription", async () => {
    const { result } = await startedHook();

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith({ assignmentId: "asg-1" });
    expect(result.current.session?.logId).toBe("log-1");
    expect(result.current.exercises.map((e) => e.exerciseId)).toEqual([
      "squat",
      "plank",
    ]);
    const squat = result.current.rowsByExercise.squat;
    expect(squat.map((r) => [r.weightKg, r.reps, r.done])).toEqual([
      [60, 8, false],
      [70, 8, false],
    ]);
    expect(result.current.rowsByExercise.plank[0].durationSeconds).toBe(45);
    expect(result.current.totalPlanned).toBe(3);
    expect(result.current.doneCount).toBe(0);
  });

  it("prefills from the client's last session when it is newer than the plan", async () => {
    mockStart.mockResolvedValue(session());
    const { result } = renderHook(() =>
      useLiveSession("asg-1", {
        squat: {
          weightKg: 82.5,
          reps: 6,
          lastLoggedAt: "2026-10-10T00:00:00.000Z",
        },
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("active"));

    expect(
      result.current.rowsByExercise.squat.map((r) => [r.weightKg, r.reps]),
    ).toEqual([
      [82.5, 6],
      [82.5, 6],
    ]);
  });

  it("re-hydrates already-logged sets on a resumed session (reload mid-workout)", async () => {
    const logged: SessionSetLog = {
      id: "set-a",
      exerciseId: "squat",
      setIndex: 1,
      weightKg: 75,
      reps: 5,
      completedAt: "2026-10-15T10:05:00.000Z",
      isWarmup: false,
      clientLoggedAt: "2026-10-15T10:05:00.000Z",
      setType: "failure",
    };
    const { result } = await startedHook(session({ sets: [logged] }));

    const row = result.current.rowsByExercise.squat[1];
    expect(row).toMatchObject({
      id: "set-a",
      weightKg: 75,
      reps: 5,
      done: true,
      setType: "failure",
      isWarmup: false,
      completedAt: "2026-10-15T10:05:00.000Z",
    });
    expect(result.current.doneCount).toBe(1);
  });

  it("surfaces the start error and lands in 'error'", async () => {
    mockStart.mockRejectedValue(new Error("Assignment not found"));
    const { result } = renderHook(() => useLiveSession("asg-1", {}));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorMessage).toBe("Assignment not found");
  });

  it("uses the bootstrap session without calling start", async () => {
    const { result } = renderHook(() =>
      useLiveSession("asg-1", {}, session()),
    );
    expect(result.current.status).toBe("active");
    expect(result.current.rowsByExercise.squat).toHaveLength(2);
    await act(async () => {});
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe("useLiveSession — media hydration", () => {
  it("re-reads the session when an exercise has no media, and swaps the exercises in", async () => {
    const bare = session({
      exercises: [ex({ thumbnailURL: null, mediaURL: null })],
    });
    mockGetActive.mockResolvedValue(
      session({ exercises: [ex({ thumbnailURL: "https://cdn/hydrated.gif" })] }),
    );
    const { result } = await startedHook(bare);

    await waitFor(() =>
      expect(result.current.exercises[0].thumbnailURL).toBe(
        "https://cdn/hydrated.gif",
      ),
    );
    expect(mockGetActive).toHaveBeenCalledTimes(1);
    expect(mockGetActive).toHaveBeenCalledWith("asg-1");
  });

  it("does not re-read when every exercise already has media", async () => {
    await startedHook();
    await act(async () => {});
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it("swallows a hydration failure — the session stays active", async () => {
    mockGetActive.mockRejectedValue(new Error("boom"));
    const { result } = await startedHook(
      session({ exercises: [ex({ thumbnailURL: null })] }),
    );
    await act(async () => {});
    expect(mockGetActive).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("active");
    expect(result.current.errorMessage).toBeNull();
  });

  it("hydration keeps the coach's logged rows", async () => {
    // The rows live in a separate state map keyed by exerciseId; swapping in
    // the hydrated exercise list must not reset them.
    let resolveHydrate: (s: ActiveSession) => void = () => {};
    mockGetActive.mockReturnValue(
      new Promise<ActiveSession>((r) => {
        resolveHydrate = r;
      }),
    );
    const { result } = await startedHook(
      session({ exercises: [ex({ thumbnailURL: null })] }),
    );
    act(() => {
      result.current.setWeight("squat", 0, 100);
      result.current.toggleDone("squat", 0);
    });
    await act(async () => {
      resolveHydrate(session({ exercises: [ex()] }));
    });
    expect(result.current.rowsByExercise.squat[0]).toMatchObject({
      weightKg: 100,
      done: true,
    });
  });
});

describe("useLiveSession — debounced sync", () => {
  it("does not sync immediately; syncs once after 1.2 s with only the DONE sets", async () => {
    const { result } = await startedHook();
    jest.useFakeTimers();

    act(() => {
      result.current.toggleDone("squat", 0);
    });
    act(() => {
      jest.advanceTimersByTime(1199);
    });
    expect(mockSync).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
    const arg = mockSync.mock.calls[0][0];
    expect(arg.logId).toBe("log-1");
    expect(arg.sets).toHaveLength(1);
    expect(arg.sets[0]).toMatchObject({
      exerciseId: "squat",
      setIndex: 0,
      weightKg: 60,
      reps: 8,
      isWarmup: false,
      setType: null,
      id: result.current.rowsByExercise.squat[0].id,
    });
    expect(typeof arg.sets[0].completedAt).toBe("string");
  });

  it("collapses a burst of edits into ONE sync carrying the LAST values", async () => {
    const { result } = await startedHook();
    jest.useFakeTimers();

    act(() => {
      result.current.toggleDone("squat", 0);
    });
    act(() => {
      jest.advanceTimersByTime(800);
      result.current.setWeight("squat", 0, 65);
    });
    act(() => {
      jest.advanceTimersByTime(800);
      result.current.setWeight("squat", 0, 67.5);
      result.current.setReps("squat", 0, 6.6);
    });
    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync.mock.calls[0][0].sets[0]).toMatchObject({
      weightKg: 67.5,
      reps: 7,
    });
  });

  it("clamps negative inputs to 0 before they reach the wire", async () => {
    const { result } = await startedHook();
    jest.useFakeTimers();
    act(() => {
      result.current.toggleDone("squat", 0);
      result.current.setWeight("squat", 0, -5);
      result.current.setReps("squat", 0, -3);
    });
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(mockSync.mock.calls[0][0].sets[0]).toMatchObject({
      weightKg: 0,
      reps: 0,
    });
  });

  it("un-checking a set removes it from the next sync", async () => {
    const { result } = await startedHook();
    jest.useFakeTimers();
    act(() => {
      result.current.toggleDone("squat", 0);
      result.current.toggleDone("squat", 1);
    });
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    act(() => {
      result.current.toggleDone("squat", 0);
    });
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(
      mockSync.mock.calls[1][0].sets.map((s: SessionSetLog) => s.setIndex),
    ).toEqual([1]);
  });

  it("set-type edits sync with isWarmup in lockstep (#403)", async () => {
    const { result } = await startedHook();
    jest.useFakeTimers();
    act(() => {
      result.current.toggleDone("squat", 0);
      result.current.toggleDone("squat", 1);
      result.current.toggleWarmup("squat", 0);
      result.current.setSetType("squat", 1, "dropset");
    });
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    const sets = mockSync.mock.calls[0][0].sets as SessionSetLog[];
    expect(sets.map((s) => [s.setType, s.isWarmup])).toEqual([
      ["warmup", true],
      ["dropset", false],
    ]);
  });

  it("removing a set re-syncs with the remaining rows re-indexed", async () => {
    const { result } = await startedHook();
    jest.useFakeTimers();
    act(() => {
      result.current.toggleDone("squat", 1);
    });
    act(() => {
      result.current.removeSet("squat", 0);
    });
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync.mock.calls[0][0].sets).toEqual([
      expect.objectContaining({ setIndex: 0, weightKg: 70 }),
    ]);
  });

  it("never removes the last remaining row", async () => {
    const { result } = await startedHook();
    act(() => {
      result.current.removeSet("plank", 0);
    });
    expect(result.current.rowsByExercise.plank).toHaveLength(1);
  });

  it("swallows a failed sync (best effort) — no error state, no unhandled rejection", async () => {
    mockSync.mockRejectedValue(new Error("network"));
    const { result } = await startedHook();
    jest.useFakeTimers();
    act(() => {
      result.current.toggleDone("squat", 0);
    });
    await act(async () => {
      jest.advanceTimersByTime(1200);
    });
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("active");
    expect(result.current.errorMessage).toBeNull();
  });

  // FINDING: the debounce timer is never cleared by finalize/cancel (nor on
  // unmount). A done-toggle inside the last 1.2 s before Finish fires a
  // `syncWorkoutSession` AFTER the log was finalized/cancelled, with the
  // pre-finish buffer. Whether that write clobbers the finished log depends on
  // the server's status guard — the client should not send it at all.
  it.failing("sends no sync after finalize when an edit was still debouncing", async () => {
    mockFinalize.mockResolvedValue({ futureUpdated: 0 });
    const { result } = await startedHook();
    jest.useFakeTimers();
    act(() => {
      result.current.toggleDone("squat", 0);
    });
    await act(async () => {
      await result.current.finalize({ mode: "session" });
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it.failing("sends no sync after cancel when an edit was still debouncing", async () => {
    mockCancel.mockResolvedValue(undefined);
    const { result } = await startedHook();
    jest.useFakeTimers();
    act(() => {
      result.current.toggleDone("squat", 0);
    });
    await act(async () => {
      await result.current.cancel();
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it.failing("sends no sync after the page unmounts", async () => {
    const { result, unmount } = await startedHook();
    jest.useFakeTimers();
    act(() => {
      result.current.toggleDone("squat", 0);
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSync).not.toHaveBeenCalled();
  });
});

describe("useLiveSession — toggleDone + rest-timer hook", () => {
  // FINDING (low — no live caller today): `toggleDone` reads `becameDone` out
  // of a setState UPDATER, which React runs lazily at render time, not inside
  // the call. So the boolean it returns is `false` and `onSetCompleted` never
  // fires. The run page derives rest starts from a rows diff instead
  // (active-workout-session.tsx), so the coach is not affected yet — but any
  // caller that trusts this API gets a silent no-op.
  it.failing("returns true and fires onSetCompleted for a working set", async () => {
    const { result } = await startedHook();
    const cb = jest.fn();
    act(() => result.current.registerOnSetCompleted(cb));
    let became = false;
    act(() => {
      became = result.current.toggleDone("squat", 0);
    });
    expect(became).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].exerciseId).toBe("squat");
  });

  it("does NOT fire onSetCompleted for a warmup set", async () => {
    const { result } = await startedHook();
    const cb = jest.fn();
    act(() => result.current.registerOnSetCompleted(cb));
    act(() => result.current.toggleWarmup("squat", 0));
    act(() => {
      result.current.toggleDone("squat", 0);
    });
    expect(cb).not.toHaveBeenCalled();
    expect(result.current.rowsByExercise.squat[0].done).toBe(true);
  });

  it.failing("fires onSetCompleted for a working set but not when un-checking", async () => {
    const { result } = await startedHook();
    const cb = jest.fn();
    act(() => result.current.registerOnSetCompleted(cb));
    act(() => result.current.toggleWarmup("squat", 0));
    act(() => {
      result.current.toggleDone("squat", 0);
    });
    expect(cb).not.toHaveBeenCalled();

    act(() => {
      result.current.toggleDone("squat", 1);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    let became = true;
    act(() => {
      became = result.current.toggleDone("squat", 1);
    });
    expect(became).toBe(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("addSet copies the last row's values but starts normal and not done", async () => {
    const { result } = await startedHook();
    act(() => result.current.setSetType("squat", 1, "failure"));
    act(() => result.current.addSet("squat"));
    const rows = result.current.rowsByExercise.squat;
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({
      weightKg: 70,
      reps: 8,
      setType: "normal",
      isWarmup: false,
      done: false,
    });
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });
});

describe("useLiveSession — finalize", () => {
  it("'session' mode writes the done sets and NO future prescription", async () => {
    mockFinalize.mockResolvedValue({ futureUpdated: 0 });
    const { result } = await startedHook();
    act(() => {
      result.current.toggleDone("squat", 1);
      result.current.setDuration("plank", 0, 52.4);
      result.current.toggleDone("plank", 0);
    });

    let res: { futureUpdated: number } | null = null;
    await act(async () => {
      res = await result.current.finalize({ mode: "session", rpe: 8, notes: "ok" });
    });

    expect(res).toEqual({ futureUpdated: 0 });
    expect(result.current.status).toBe("finished");
    expect(mockFinalize).toHaveBeenCalledTimes(1);
    const arg = mockFinalize.mock.calls[0][0];
    expect(arg).toMatchObject({
      logId: "log-1",
      rpe: 8,
      notes: "ok",
      mode: "session",
      editedExercises: undefined,
    });
    expect(
      arg.sets.map((s: SessionSetLog) => [s.exerciseId, s.setIndex, s.durationSeconds]),
    ).toEqual([
      ["squat", 1, null],
      ["plank", 0, 52],
    ]);
  });

  it("defaults rpe and notes to null", async () => {
    mockFinalize.mockResolvedValue({ futureUpdated: 0 });
    const { result } = await startedHook();
    await act(async () => {
      await result.current.finalize({ mode: "session" });
    });
    expect(mockFinalize.mock.calls[0][0]).toMatchObject({ rpe: null, notes: null });
  });

  it("'session_and_future' rebuilds the prescription from what was performed, in the current order", async () => {
    mockFinalize.mockResolvedValue({ futureUpdated: 4 });
    const { result } = await startedHook(
      session({
        exercises: [
          ex({ supersetGroup: "A", notes: "slow eccentric" }),
          ex({
            exerciseId: "plank",
            name: { en: "Plank" },
            sets: 1,
            reps: 0,
            metric: "time",
            durationSeconds: 45,
            weightBySetKg: null,
            order: 2,
            restSeconds: 30,
          }),
        ],
      }),
    );
    act(() => {
      result.current.setWeight("squat", 0, 62.5);
      result.current.setReps("squat", 1, 6);
      result.current.setSetType("squat", 0, "warmup");
    });
    act(() => result.current.addSet("squat"));
    act(() => result.current.setDuration("plank", 0, 60));
    act(() => result.current.moveExercise("plank", -1));

    let res: { futureUpdated: number } | null = null;
    await act(async () => {
      res = await result.current.finalize({ mode: "session_and_future" });
    });
    expect(res).toEqual({ futureUpdated: 4 });

    const edited = mockFinalize.mock.calls[0][0].editedExercises;
    expect(edited).toEqual([
      {
        exerciseId: "plank",
        sets: 1,
        reps: 0,
        restSeconds: 30,
        notes: null,
        order: 1,
        supersetGroup: null,
        repsBySet: [0],
        weightBySetKg: [0],
        setTypesBySet: ["normal"],
        metric: "time",
        durationBySetSeconds: [60],
        durationSeconds: 45,
      },
      {
        exerciseId: "squat",
        sets: 3,
        reps: 8,
        restSeconds: 90,
        notes: "slow eccentric",
        order: 2,
        supersetGroup: "A",
        repsBySet: [8, 6, 6],
        weightBySetKg: [62.5, 70, 70],
        setTypesBySet: ["warmup", "normal", "normal"],
        metric: null,
        durationBySetSeconds: null,
        durationSeconds: null,
      },
    ]);
  });

  it("on failure keeps the buffer, returns null, reports the error and goes back to active", async () => {
    mockFinalize.mockRejectedValue(new Error("Permission denied"));
    const { result } = await startedHook();
    act(() => {
      result.current.toggleDone("squat", 0);
    });
    let res: unknown = "unset";
    await act(async () => {
      res = await result.current.finalize({ mode: "session" });
    });
    expect(res).toBeNull();
    expect(result.current.status).toBe("active");
    expect(result.current.errorMessage).toBe("Permission denied");
    expect(result.current.rowsByExercise.squat[0].done).toBe(true);

    // Retry sends the same set (same id — the arrayUnion dedup key).
    mockFinalize.mockResolvedValue({ futureUpdated: 0 });
    const firstId = mockFinalize.mock.calls[0][0].sets[0].id;
    await act(async () => {
      await result.current.finalize({ mode: "session" });
    });
    expect(mockFinalize.mock.calls[1][0].sets[0].id).toBe(firstId);
    expect(result.current.status).toBe("finished");
  });

  it("is a no-op before the session exists", async () => {
    mockStart.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLiveSession("asg-1", {}));
    let res: unknown = "unset";
    await act(async () => {
      res = await result.current.finalize({ mode: "session" });
    });
    expect(res).toBeNull();
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(result.current.status).toBe("loading");
  });
});

describe("useLiveSession — cancel", () => {
  it("cancels the log by id and finishes", async () => {
    mockCancel.mockResolvedValue(undefined);
    const { result } = await startedHook();
    let ok = false;
    await act(async () => {
      ok = await result.current.cancel();
    });
    expect(ok).toBe(true);
    expect(mockCancel).toHaveBeenCalledWith({ logId: "log-1" });
    expect(result.current.status).toBe("finished");
  });

  it("on failure returns false, keeps the session active and the sets", async () => {
    mockCancel.mockRejectedValue(new Error("nope"));
    const { result } = await startedHook();
    act(() => {
      result.current.toggleDone("squat", 0);
    });
    let ok = true;
    await act(async () => {
      ok = await result.current.cancel();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("active");
    expect(result.current.errorMessage).toBe("nope");
    expect(result.current.rowsByExercise.squat[0].done).toBe(true);
  });
});
