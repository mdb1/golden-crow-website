import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildServer } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildServer>>;

async function getApp() {
  if (!app) {
    app = await buildServer();
    await app.ready();
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const server = await getApp();

  const url = req.url || "/";
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  // Collect body for non-GET/HEAD requests
  let payload: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
    payload =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  const response = await server.inject({
    method: req.method as any,
    url,
    headers,
    payload,
  });

  // Forward status, headers, and body
  res.status(response.statusCode);
  for (const [key, value] of Object.entries(response.headers)) {
    if (value) res.setHeader(key, value as string);
  }
  res.send(response.rawPayload);
}
