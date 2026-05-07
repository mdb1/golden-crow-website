import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const page = await readFile(
    join(process.cwd(), "public", "botfarm", "index.html"),
    "utf8",
  );

  return new Response(page, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
