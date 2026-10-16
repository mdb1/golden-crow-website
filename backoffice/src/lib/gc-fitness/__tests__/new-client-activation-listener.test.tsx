/** @jest-environment jsdom */
// __tests__/new-client-activation-listener.test.tsx
//
// The sidebar "new client" badges (notifications + clients). "Seen" is a
// per-trainer, per-surface timestamp in localStorage. Pinned:
//   - first sight of the feed marks everything as seen (no badge storm on a new
//     browser), and stores it;
//   - activations newer than the stored mark are counted;
//   - visiting a surface (or a sub-route of it) clears THAT surface only;
//   - marks are isolated per trainer;
//   - garbage in storage resets to "seen up to now";
//   - disabled / no trainer → nothing is fetched or written.

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockListRecentLogs = jest.fn();
jest.mock("../recent-logs-actions", () => ({
  listRecentLogsForTrainerPage: (...args: unknown[]) => mockListRecentLogs(...args),
}));

import { useNewClientActivationBadges } from "../new-client-activation-listener";

const T1 = "2026-06-10T10:00:00.000Z";
const T2 = "2026-06-11T10:00:00.000Z";
const T3 = "2026-06-12T10:00:00.000Z";
const ms = (iso: string) => String(new Date(iso).getTime());
const KEY = (uid: string, surface: "notifications" | "clients") =>
  `gc-fitness:new-client-activations-seen:${uid}:${surface}`;

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function feed(...eventAts: Array<string | null>) {
  mockListRecentLogs.mockResolvedValue({ logs: eventAts.map((eventAt, i) => ({ id: `e${i}`, eventAt })) });
}

function render(props: { enabled?: boolean; pathname?: string; trainerUid?: string | null } = {}) {
  return renderHook(
    (p: { enabled: boolean; pathname: string; trainerUid: string | null }) => useNewClientActivationBadges(p),
    {
      wrapper,
      initialProps: {
        enabled: props.enabled ?? true,
        pathname: props.pathname ?? "/gc-fitness/dashboard",
        trainerUid: props.trainerUid === undefined ? "coach-a" : props.trainerUid,
      },
    },
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.localStorage.clear();
  mockListRecentLogs.mockReset();
});
afterEach(() => client.clear());

it("fetches the signup feed (20, no cursor, no client filter)", async () => {
  feed(T1);
  render();
  await waitFor(() => expect(mockListRecentLogs).toHaveBeenCalled());
  expect(mockListRecentLogs).toHaveBeenCalledWith(null, 20, null, "signup");
});

it("first sight: everything counts as seen and the mark is stored for both surfaces", async () => {
  feed(T1, T3, T2);
  const { result } = render();
  await waitFor(() => expect(window.localStorage.getItem(KEY("coach-a", "clients"))).toBe(ms(T3)));
  expect(window.localStorage.getItem(KEY("coach-a", "notifications"))).toBe(ms(T3));
  expect(result.current).toEqual({ notifications: 0, clients: 0 });
});

it("counts activations newer than each surface's stored mark", async () => {
  window.localStorage.setItem(KEY("coach-a", "notifications"), ms(T1));
  window.localStorage.setItem(KEY("coach-a", "clients"), ms(T2));
  feed(T1, T2, T3);
  const { result } = render();
  await waitFor(() => expect(result.current).toEqual({ notifications: 2, clients: 1 }));
});

it("visiting /gc-fitness/notifications (or a sub-route) clears ONLY the notifications badge", async () => {
  window.localStorage.setItem(KEY("coach-a", "notifications"), ms(T1));
  window.localStorage.setItem(KEY("coach-a", "clients"), ms(T1));
  feed(T1, T2, T3);
  const { result, rerender } = render();
  await waitFor(() => expect(result.current).toEqual({ notifications: 2, clients: 2 }));

  rerender({ enabled: true, pathname: "/gc-fitness/notifications/abc", trainerUid: "coach-a" });
  await waitFor(() => expect(result.current).toEqual({ notifications: 0, clients: 2 }));
  expect(window.localStorage.getItem(KEY("coach-a", "notifications"))).toBe(ms(T3));
  expect(window.localStorage.getItem(KEY("coach-a", "clients"))).toBe(ms(T1));

  rerender({ enabled: true, pathname: "/gc-fitness/clients", trainerUid: "coach-a" });
  await waitFor(() => expect(result.current).toEqual({ notifications: 0, clients: 0 }));
  expect(window.localStorage.getItem(KEY("coach-a", "clients"))).toBe(ms(T3));
});

it("a path that merely starts with the surface name does not clear it", async () => {
  window.localStorage.setItem(KEY("coach-a", "notifications"), ms(T1));
  window.localStorage.setItem(KEY("coach-a", "clients"), ms(T1));
  feed(T1, T2);
  const { result } = render({ pathname: "/gc-fitness/clientsettings" });
  await waitFor(() => expect(result.current).toEqual({ notifications: 1, clients: 1 }));
  expect(window.localStorage.getItem(KEY("coach-a", "clients"))).toBe(ms(T1));
});

it("marks are per trainer: another coach on the same browser starts fresh", async () => {
  window.localStorage.setItem(KEY("coach-a", "notifications"), ms(T1));
  window.localStorage.setItem(KEY("coach-a", "clients"), ms(T1));
  feed(T1, T2, T3);
  const { result } = render({ trainerUid: "coach-b" });
  await waitFor(() => expect(window.localStorage.getItem(KEY("coach-b", "clients"))).toBe(ms(T3)));
  expect(result.current).toEqual({ notifications: 0, clients: 0 });
  expect(window.localStorage.getItem(KEY("coach-a", "clients"))).toBe(ms(T1));
});

it.each(["abc", "-5", ""])("a corrupt stored mark (%p) resets to 'seen up to the latest'", async (raw) => {
  window.localStorage.setItem(KEY("coach-a", "clients"), raw);
  window.localStorage.setItem(KEY("coach-a", "notifications"), ms(T1));
  feed(T1, T2, T3);
  const { result } = render();
  await waitFor(() => expect(result.current).toEqual({ notifications: 2, clients: 0 }));
  expect(window.localStorage.getItem(KEY("coach-a", "clients"))).toBe(ms(T3));
});

it("ignores activations with a missing or unparseable eventAt", async () => {
  window.localStorage.setItem(KEY("coach-a", "notifications"), ms(T1));
  window.localStorage.setItem(KEY("coach-a", "clients"), ms(T1));
  feed(null, "not-a-date", T2);
  const { result } = render();
  await waitFor(() => expect(result.current).toEqual({ notifications: 1, clients: 1 }));
});

it("disabled: no fetch, no storage writes, zero badges", async () => {
  const { result } = render({ enabled: false });
  await new Promise((r) => setTimeout(r, 20));
  expect(mockListRecentLogs).not.toHaveBeenCalled();
  expect(window.localStorage.length).toBe(0);
  expect(result.current).toEqual({ notifications: 0, clients: 0 });
});

it("no trainer uid: nothing is written to storage", async () => {
  feed(T1, T2);
  const { result } = render({ trainerUid: null });
  await waitFor(() => expect(mockListRecentLogs).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(window.localStorage.length).toBe(0);
  expect(result.current).toEqual({ notifications: 0, clients: 0 });
});
