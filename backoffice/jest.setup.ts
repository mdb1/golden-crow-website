// jest.setup.ts
//
// Runs after the test framework loads but before each test file. Used to
// polyfill DOM APIs that jsdom doesn't ship — required by the shadcn /
// radix-ui primitives we use in component tests:
//
//   - `ResizeObserver` — cmdk's `Command` primitive (the popover/combobox
//     foundation) calls `new ResizeObserver()` on mount. jsdom doesn't
//     ship it. Without this polyfill T3 (multi-select interaction) throws
//     a ReferenceError before the test even reaches its assertions.
//
//   - `Element.prototype.scrollIntoView` — Radix's `Combobox` calls
//     `.scrollIntoView()` on the focused option. jsdom doesn't implement
//     it; the no-op shim below silences the noise.
//
//   - `window.matchMedia` — shadcn's Sonner toast wrapper queries the
//     prefers-color-scheme media query at import time via `next-themes`.
//     Without a shim it throws.
//
// All shims are scoped to the test runtime — they NEVER bleed into the
// production bundle.

// NODE_ENV must be "test": Jest only defaults it when unset, and Vercel builds
// run with NODE_ENV=production — React then loads its production bundle, which
// has no act(), and every component test fails with "React.act is not a
// function" (the 2026-10-16 deploy of #452). `npm run build` sets it.
if (process.env.NODE_ENV !== "test") {
  throw new Error(
    `Jest must run with NODE_ENV=test (got ${JSON.stringify(process.env.NODE_ENV)}). Use \`NODE_ENV=test npx jest\`.`,
  );
}

import "@testing-library/jest-dom";

class ResizeObserverShim {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Use defineProperty to avoid clobbering an existing native impl if jsdom
// ever ships one in a future version.
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverShim })
    .ResizeObserver = ResizeObserverShim;
}

if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* jsdom no-op */
  };
}

// next-themes touches `window.matchMedia` synchronously at module init.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// jsdom's `HTMLElement.prototype.hasPointerCapture` is not implemented;
// Radix Combobox checks it on focus management. Shim returns false.
if (
  typeof HTMLElement !== "undefined" &&
  typeof HTMLElement.prototype.hasPointerCapture !== "function"
) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (
  typeof HTMLElement !== "undefined" &&
  typeof HTMLElement.prototype.releasePointerCapture !== "function"
) {
  HTMLElement.prototype.releasePointerCapture = () => undefined;
}

// ---------------------------------------------------------------------------
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

