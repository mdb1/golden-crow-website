/** @jest-environment jsdom */
// __tests__/use-favorites.test.tsx — #297.
//
// The React-Query bridge over the favorites Server Actions. Pinned: the empty
// shape before load, `isFavorite`, and the OPTIMISTIC toggle — the cache flips
// before the server answers, the server's answer then wins, and a failed toggle
// rolls back to exactly what was there.

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockListFavorites = jest.fn();
const mockToggleFavorite = jest.fn();
jest.mock("../favorites-actions", () => ({
  listFavorites: () => mockListFavorites(),
  toggleFavorite: (...args: unknown[]) => mockToggleFavorite(...args),
}));

import { EMPTY_FAVORITES, type CoachFavorites } from "../favorites";
import { FAVORITES_QUERY_KEY, useFavorites } from "../use-favorites";

const LOADED: CoachFavorites = {
  exerciseIds: ["ex-1"],
  workoutTemplateIds: ["wt-1"],
  habitTemplateIds: [],
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mockListFavorites.mockReset().mockResolvedValue(LOADED);
  mockToggleFavorite.mockReset();
});
afterEach(() => client.clear());

it("starts empty + loading, then exposes the loaded favorites", async () => {
  const { result } = renderHook(() => useFavorites(), { wrapper });
  expect(result.current.favorites).toEqual(EMPTY_FAVORITES);
  expect(result.current.isLoading).toBe(true);
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.favorites).toEqual(LOADED);
  expect(result.current.isFavorite("exercise", "ex-1")).toBe(true);
  expect(result.current.isFavorite("exercise", "wt-1")).toBe(false);
  expect(result.current.isFavorite("workoutTemplate", "wt-1")).toBe(true);
  expect(mockListFavorites).toHaveBeenCalledTimes(1);
});

it("toggle ADDS optimistically, calls the action with next=true, then adopts the server state", async () => {
  const server = deferred<CoachFavorites>();
  mockToggleFavorite.mockReturnValue(server.promise);
  const { result } = renderHook(() => useFavorites(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  act(() => result.current.toggle("habitTemplate", "ht-9"));

  await waitFor(() => expect(result.current.isFavorite("habitTemplate", "ht-9")).toBe(true));
  expect(result.current.isToggling).toBe(true);
  expect(mockToggleFavorite).toHaveBeenCalledWith("habitTemplate", "ht-9", true);
  // Other kinds untouched by the optimistic write.
  expect(client.getQueryData(FAVORITES_QUERY_KEY)).toEqual({ ...LOADED, habitTemplateIds: ["ht-9"] });

  // The server is authoritative (e.g. another tab also starred something).
  const authoritative = { ...LOADED, habitTemplateIds: ["ht-9", "ht-other-tab"] };
  await act(async () => server.resolve(authoritative));
  await waitFor(() => expect(result.current.isToggling).toBe(false));
  expect(result.current.favorites).toEqual(authoritative);
});

it("toggle REMOVES an existing favorite optimistically (next=false)", async () => {
  const server = deferred<CoachFavorites>();
  mockToggleFavorite.mockReturnValue(server.promise);
  const { result } = renderHook(() => useFavorites(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.toggle("exercise", "ex-1"));
  // Gone BEFORE the server answers.
  await waitFor(() => expect(result.current.isFavorite("exercise", "ex-1")).toBe(false));
  expect(result.current.isToggling).toBe(true);
  expect(mockToggleFavorite).toHaveBeenCalledWith("exercise", "ex-1", false);
  await act(async () => server.resolve({ ...LOADED, exerciseIds: [] }));
  await waitFor(() => expect(result.current.isToggling).toBe(false));
});

it("a failed toggle rolls the cache back to exactly the previous favorites", async () => {
  const server = deferred<CoachFavorites>();
  mockToggleFavorite.mockReturnValue(server.promise);
  const { result } = renderHook(() => useFavorites(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  act(() => result.current.toggle("exercise", "ex-2"));
  await waitFor(() => expect(result.current.isFavorite("exercise", "ex-2")).toBe(true));

  await act(async () => server.reject(new Error("Forbidden")));
  await waitFor(() => expect(result.current.isToggling).toBe(false));
  expect(result.current.favorites).toEqual(LOADED);
});

it("toggling before the list has loaded applies to the empty shape", async () => {
  const list = deferred<CoachFavorites>();
  mockListFavorites.mockReturnValue(list.promise);
  mockToggleFavorite.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useFavorites(), { wrapper });
  act(() => result.current.toggle("exercise", "ex-new"));
  await waitFor(() =>
    expect(client.getQueryData(FAVORITES_QUERY_KEY)).toEqual({ ...EMPTY_FAVORITES, exerciseIds: ["ex-new"] }),
  );
  expect(mockToggleFavorite).toHaveBeenCalledWith("exercise", "ex-new", true);
});
