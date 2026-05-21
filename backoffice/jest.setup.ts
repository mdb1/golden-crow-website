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
