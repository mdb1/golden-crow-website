/**
 * @jest-environment jsdom
 */

// use-rest-timer.test.tsx
//
// The rest countdown the coach runs between sets. It is WALL-CLOCK based
// (`endsAt - Date.now()`), and the 250 ms interval only re-renders — so a
// throttled background tab must still show the true remaining time and expire
// on time. Completion = one beep (WebAudio) + the overlay closes.

import { act, renderHook } from "@testing-library/react";

import { useRestTimer } from "../use-rest-timer";

/** Minimal WebAudio fake: counts tones so expiry ("the beep") is observable. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = "suspended";
  currentTime = 0;
  destination = {};
  oscillators = 0;
  resume = jest.fn(() => Promise.resolve());
  close = jest.fn(() => Promise.resolve());
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createOscillator() {
    this.oscillators += 1;
    return {
      type: "",
      frequency: { value: 0 },
      connect: () => {},
      start: () => {},
      stop: () => {},
      onended: null as null | (() => void),
    };
  }
  createGain() {
    return {
      connect: () => {},
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
    };
  }
}

type AudioWin = Window & {
  AudioContext?: unknown;
  __gcFitnessRestTimerAudioContext?: unknown;
};

function beeps(): number {
  return FakeAudioContext.instances.reduce((n, c) => n + c.oscillators, 0);
}

function tick(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-15T10:00:00.000Z"));
  FakeAudioContext.instances = [];
  const w = window as AudioWin;
  w.AudioContext = FakeAudioContext;
  delete w.__gcFitnessRestTimerAudioContext;
});

afterEach(() => {
  jest.useRealTimers();
  const w = window as AudioWin;
  delete w.AudioContext;
  delete w.__gcFitnessRestTimerAudioContext;
});

describe("useRestTimer — countdown", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useRestTimer());
    expect(result.current).toMatchObject({
      active: false,
      sheetOpen: false,
      isPaused: false,
      remainingSeconds: 0,
      totalSeconds: 0,
      progress: 0,
    });
  });

  it("start(90) opens the sheet with the full duration and counts down", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(90));
    expect(result.current).toMatchObject({
      active: true,
      sheetOpen: true,
      remainingSeconds: 90,
      totalSeconds: 90,
      progress: 1,
    });
    tick(30_000);
    expect(result.current.remainingSeconds).toBe(60);
    expect(result.current.progress).toBeCloseTo(60 / 90);
  });

  it("rounds UP partial seconds (shows 1 until it really hits 0)", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(3));
    tick(2_750);
    expect(result.current.remainingSeconds).toBe(1);
    expect(result.current.active).toBe(true);
  });

  it("normalizes the requested seconds: rounds, and never below 1", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(44.6));
    expect(result.current.totalSeconds).toBe(45);
    act(() => result.current.start(0));
    expect(result.current.totalSeconds).toBe(1);
    expect(result.current.active).toBe(true);
  });

  it("resumes a suspended AudioContext on start (user gesture unlock)", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(10));
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].resume).toHaveBeenCalledTimes(1);
  });
});

describe("useRestTimer — completion", () => {
  it("expires exactly at the deadline: beeps once, closes, deactivates", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(3));
    tick(2_999);
    expect(result.current.active).toBe(true);
    expect(beeps()).toBe(0);

    tick(1);
    expect(result.current).toMatchObject({
      active: false,
      sheetOpen: false,
      remainingSeconds: 0,
    });
    expect(beeps()).toBe(2); // the two-tone chime, once

    tick(10_000);
    expect(beeps()).toBe(2);
  });

  it("still expires (silently) when WebAudio is unavailable", () => {
    delete (window as AudioWin).AudioContext;
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(2));
    tick(2_000);
    expect(result.current.active).toBe(false);
  });

  it("a second rest after an expiry beeps again", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(1));
    tick(1_000);
    act(() => result.current.start(1));
    expect(result.current.active).toBe(true);
    tick(1_000);
    expect(result.current.active).toBe(false);
    expect(beeps()).toBe(4);
  });

  it("skip ends the rest without a beep", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    tick(5_000);
    act(() => result.current.skip());
    expect(result.current).toMatchObject({
      active: false,
      sheetOpen: false,
      isPaused: false,
      remainingSeconds: 0,
    });
    tick(120_000);
    expect(beeps()).toBe(0);
  });
});

describe("useRestTimer — wall clock, not tick count", () => {
  it("a throttled tab (no ticks for 40 s) shows the TRUE remaining time on the next tick", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    // Jump the wall clock without firing intervals — what a background tab
    // with throttled timers looks like.
    jest.setSystemTime(Date.now() + 40_000);
    tick(250);
    expect(result.current.remainingSeconds).toBe(20);
  });

  it("expires on the first tick after a throttled stretch that passed the deadline", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(30));
    jest.setSystemTime(Date.now() + 120_000);
    tick(250);
    expect(result.current.active).toBe(false);
    expect(beeps()).toBe(2);
  });
});

describe("useRestTimer — pause / resume", () => {
  it("pause freezes the remaining time while the wall clock moves", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    tick(10_000);
    act(() => result.current.pause());
    expect(result.current.isPaused).toBe(true);
    expect(result.current.remainingSeconds).toBe(50);

    tick(300_000);
    expect(result.current.remainingSeconds).toBe(50);
    expect(result.current.active).toBe(true);
    expect(beeps()).toBe(0);
  });

  it("resume continues from the frozen value and expires that much later", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    tick(10_000);
    act(() => result.current.pause());
    tick(30_000);
    act(() => result.current.resume());
    expect(result.current.isPaused).toBe(false);
    expect(result.current.remainingSeconds).toBe(50);

    tick(49_000);
    expect(result.current.remainingSeconds).toBe(1);
    tick(1_000);
    expect(result.current.active).toBe(false);
  });

  it("pausing twice keeps the first frozen value", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    tick(5_000);
    act(() => result.current.pause());
    tick(5_000);
    act(() => result.current.pause());
    expect(result.current.remainingSeconds).toBe(55);
  });

  it("resume while running is a no-op", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    tick(5_000);
    act(() => result.current.resume());
    expect(result.current.remainingSeconds).toBe(55);
    expect(result.current.isPaused).toBe(false);
  });
});

describe("useRestTimer — adjust", () => {
  it("+30 on a running rest pushes the deadline and the total", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    tick(20_000);
    act(() => result.current.adjust(30));
    expect(result.current.remainingSeconds).toBe(70);
    expect(result.current.totalSeconds).toBe(90);
  });

  it("-15 below zero expires the rest right away (never a negative countdown)", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(10));
    act(() => result.current.adjust(-15));
    tick(250);
    expect(result.current.active).toBe(false);
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.totalSeconds).toBe(5); // floor
  });

  it("adjust while paused edits the frozen value", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    act(() => result.current.pause());
    act(() => result.current.adjust(15));
    expect(result.current.remainingSeconds).toBe(75);
    act(() => result.current.adjust(-100));
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isPaused).toBe(true);
  });
});

describe("useRestTimer — minimize keeps it running", () => {
  it("minimize hides the sheet but the countdown continues; expand shows it", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(30));
    act(() => result.current.minimize());
    expect(result.current.sheetOpen).toBe(false);
    expect(result.current.active).toBe(true);
    tick(10_000);
    expect(result.current.remainingSeconds).toBe(20);
    act(() => result.current.expand());
    expect(result.current.sheetOpen).toBe(true);
  });
});
