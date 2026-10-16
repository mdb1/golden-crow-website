// jest.setup.ts — loaded via setupFilesAfterEnv in jest.config.cjs.
//
// Clock shift — the time-bomb detector's half that lives inside Jest (#451).
//
// When `TEST_CLOCK_SHIFT_DAYS` is set (by `npm run test:time-travel`), every
// test sees `Date` moved that many days away from today. ONLY `Date` is faked:
// timers, microtasks, performance and rAF stay real, so userEvent, waitFor and
// real timeouts behave exactly as in a normal run. `advanceTimers: true` keeps
// the shifted clock ticking in real time (a frozen Date breaks elapsed-time code).
//
// A test that installs its own fake timers (jest.useFakeTimers /
// setSystemTime — at the top of the file, in a hook or in the body) wins: the
// shift is only (re)installed while the real Date is in place, and only torn
// down while OUR fake Date is still the active one.
//
// Unset (the normal run, and the Vercel build) this is a no-op.

const RAW_SHIFT = process.env.TEST_CLOCK_SHIFT_DAYS;
const SHIFT_DAYS = RAW_SHIFT ? Number(RAW_SHIFT) : 0;

if (RAW_SHIFT && !Number.isFinite(SHIFT_DAYS)) {
  throw new Error(`TEST_CLOCK_SHIFT_DAYS must be a number (got ${JSON.stringify(RAW_SHIFT)}).`);
}

if (SHIFT_DAYS !== 0) {
  const RealDate = globalThis.Date;
  let shiftedDate: DateConstructor | null = null;

  const install = () => {
    jest.useFakeTimers({
      now: RealDate.now() + SHIFT_DAYS * 864e5,
      advanceTimers: true,
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    shiftedDate = globalThis.Date;
  };

  // Top level too, so module-scope fixtures (`const NOW = Date.now()`) shift.
  install();

  beforeEach(() => {
    if (globalThis.Date === RealDate) install();
  });

  afterEach(() => {
    if (shiftedDate && globalThis.Date === shiftedDate) {
      jest.useRealTimers();
      shiftedDate = null;
    }
  });
}

export {};
