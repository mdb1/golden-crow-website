// stale-aware-query-caches.test.ts
//
// #382 — a stale-deployment error raised inside React Query must reach the
// banner, and every OTHER error must flow exactly as before.
//
// The stale error is built with Next's own `UnrecognizedActionError` class,
// the one its server-action reducer throws when the server answers 404 +
// `x-nextjs-action-not-found: 1`. If a Next upgrade renames or reshapes it,
// this goes red instead of the banner silently going quiet.

import { QueryClient } from "@tanstack/react-query";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

import { staleAwareQueryCaches } from "@/lib/gc-fitness/stale-aware-query-caches";
import {
  hasReportedStaleDeployment,
  isStaleDeploymentError,
  resetStaleDeploymentForTests,
} from "@/lib/gc-fitness/stale-deployment";

function realNextError(): Error {
  return new UnrecognizedActionError(
    'Server Action "40a599bf0ba5a8e99a03f2f1e6e29733170e1d1939" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
  );
}

function client(): QueryClient {
  return new QueryClient({
    ...staleAwareQueryCaches(),
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

beforeEach(() => resetStaleDeploymentForTests());

describe("Next's real UnrecognizedActionError", () => {
  it("is recognized as a stale deployment", () => {
    expect(isStaleDeploymentError(realNextError())).toBe(true);
  });
});

describe("staleAwareQueryCaches", () => {
  it("reports a stale error from a query (the polling case)", async () => {
    await expect(
      client().fetchQuery({
        queryKey: ["live-workouts"],
        queryFn: () => Promise.reject(realNextError()),
      }),
    ).rejects.toThrow(/was not found on the server/);
    expect(hasReportedStaleDeployment()).toBe(true);
  });

  it("reports a stale error from a mutation", async () => {
    const queryClient = client();
    const mutation = queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.reject(realNextError()) });
    await expect(mutation.execute(undefined)).rejects.toThrow();
    expect(hasReportedStaleDeployment()).toBe(true);
  });

  it("leaves every other error alone — still thrown, banner quiet", async () => {
    await expect(
      client().fetchQuery({
        queryKey: ["habits"],
        queryFn: () => Promise.reject(new Error("Forbidden")),
      }),
    ).rejects.toThrow("Forbidden");
    expect(hasReportedStaleDeployment()).toBe(false);
  });
});
