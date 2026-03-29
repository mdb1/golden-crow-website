const SDK_PROXY_PATH = "/api/sdk";

/**
 * Client-side SDK fetch. Used by "use client" components.
 * Relies on credentials: "include" to send the session cookie from the browser.
 */
export async function sdkFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${SDK_PROXY_PATH}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`SDK ${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
