/**
 * @jest-environment jsdom
 */

// use-form-draft.test.ts
//
// #382 — the per-tab draft that lets a reload (stale deployment, F5) bring a
// long form back. The FIRST THREE LINES must stay the jsdom docblock: the
// backoffice jest config defaults to `testEnvironment: "node"`.
//
// "Reload" here is unmount + a fresh mount with the same key, against the same
// sessionStorage — exactly what the browser does to the hook.

import { act, renderHook } from "@testing-library/react";

import {
  clearAllFormDrafts,
  formDraftKey,
  readFormDraft,
  useFormDraft,
  writeFormDraft,
} from "@/lib/gc-fitness/use-form-draft";

type Form = { name: string; reps: number; note?: string };

const KEY = formDraftKey("exercise", "ex-1");
const PRISTINE: Form = { name: "Sentadilla", reps: 10 };

function mount(
  value: Form,
  options: { key?: string | null; omit?: (keyof Form)[] } = {},
) {
  const onRestore = jest.fn();
  const hook = renderHook(
    ({ v }: { v: Form }) =>
      useFormDraft<Form>({
        key: options.key === undefined ? KEY : options.key,
        value: v,
        onRestore,
        omit: options.omit,
        debounceMs: 50,
      }),
    { initialProps: { v: value } },
  );
  return { ...hook, onRestore };
}

beforeEach(() => {
  jest.useFakeTimers();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useFormDraft", () => {
  it("saves an edit and restores it after a reload, with the notice up", () => {
    const first = mount(PRISTINE);
    first.rerender({ v: { name: "Sentadilla búlgara", reps: 12 } });
    act(() => jest.advanceTimersByTime(60));
    first.unmount();

    const second = mount(PRISTINE);
    expect(second.onRestore).toHaveBeenCalledWith({
      name: "Sentadilla búlgara",
      reps: 12,
    });
    expect(second.result.current.restored).toBe(true);
  });

  it("keeps the last keystrokes even if the reload lands inside the debounce", () => {
    const first = mount(PRISTINE);
    first.rerender({ v: { name: "Sentadilla", reps: 15 } });
    first.unmount(); // no timer advance: the unmount flush must save it

    expect(readFormDraft<Form>(KEY)).toEqual({ name: "Sentadilla", reps: 15 });
  });

  it("a reload that unmounts before re-rendering keeps the draft it found", () => {
    writeFormDraft(KEY, { name: "Borrador", reps: 4 });
    const form = mount(PRISTINE); // onRestore is a mock: the value never changes
    form.unmount();

    expect(readFormDraft<Form>(KEY)).toEqual({ name: "Borrador", reps: 4 });
  });

  it("writes nothing for a form nobody touched", () => {
    const first = mount(PRISTINE);
    act(() => jest.advanceTimersByTime(60));
    first.unmount();

    expect(readFormDraft(KEY)).toBeNull();
    expect(mount(PRISTINE).onRestore).not.toHaveBeenCalled();
  });

  it("clears the draft after a successful submit", () => {
    const first = mount(PRISTINE);
    first.rerender({ v: { name: "Sentadilla", reps: 8 } });
    act(() => jest.advanceTimersByTime(60));
    act(() => first.result.current.clear());
    first.unmount();

    expect(readFormDraft(KEY)).toBeNull();
    expect(first.result.current.restored).toBe(false);
  });

  it("discards the draft when the coach cancels — the reset is not an edit", () => {
    writeFormDraft(KEY, { name: "Borrador viejo", reps: 3 });
    const form = mount(PRISTINE);
    expect(form.result.current.restored).toBe(true);

    act(() => form.result.current.discard(PRISTINE));
    form.rerender({ v: PRISTINE }); // the caller resets the form
    act(() => jest.advanceTimersByTime(60));
    form.unmount();

    expect(readFormDraft(KEY)).toBeNull();
  });

  it("never stores the omitted (sensitive) fields", () => {
    const first = mount(PRISTINE, { omit: ["note"] });
    first.rerender({ v: { name: "Sentadilla", reps: 9, note: "lesión de rodilla" } });
    act(() => jest.advanceTimersByTime(60));
    first.unmount();

    expect(readFormDraft<Form>(KEY)).toEqual({ name: "Sentadilla", reps: 9 });
    expect(JSON.stringify(window.sessionStorage)).not.toContain("rodilla");
  });

  it("keeps drafts per form AND per entity", () => {
    writeFormDraft(formDraftKey("exercise", "ex-2"), { name: "Otro", reps: 1 });
    expect(mount(PRISTINE).onRestore).not.toHaveBeenCalled();
    expect(formDraftKey("habit", "ex-1")).not.toBe(KEY);
    expect(formDraftKey("habit", null)).toBe("draft:habit:new");
  });

  it("uses sessionStorage only — nothing outlives the tab", () => {
    const first = mount(PRISTINE);
    first.rerender({ v: { name: "Sentadilla", reps: 20 } });
    act(() => jest.advanceTimersByTime(60));

    expect(window.sessionStorage.getItem(KEY)).not.toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("is off when the key is null (view mode)", () => {
    const first = mount(PRISTINE, { key: null });
    first.rerender({ v: { name: "Sentadilla", reps: 20 } });
    act(() => jest.advanceTimersByTime(60));
    first.unmount();

    expect(window.sessionStorage.length).toBe(0);
  });

  it("drops a corrupt or foreign entry instead of restoring it", () => {
    window.sessionStorage.setItem(KEY, "{not json");
    expect(mount(PRISTINE).onRestore).not.toHaveBeenCalled();
    window.sessionStorage.setItem(KEY, JSON.stringify({ v: 99, data: {} }));
    expect(mount(PRISTINE).onRestore).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe("clearAllFormDrafts (sign-out)", () => {
  it("removes every form draft and nothing else", () => {
    writeFormDraft(KEY, { name: "a", reps: 1 });
    writeFormDraft(formDraftKey("habit", "new:client-1"), { name: "b" });
    window.sessionStorage.setItem("gc-fitness:stale-auto-reload-at", "1");

    clearAllFormDrafts();

    expect(readFormDraft(KEY)).toBeNull();
    expect(readFormDraft(formDraftKey("habit", "new:client-1"))).toBeNull();
    expect(window.sessionStorage.getItem("gc-fitness:stale-auto-reload-at")).toBe("1");
  });
});
