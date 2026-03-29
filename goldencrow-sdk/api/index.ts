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
  server.server.emit("request", req, res);
}
