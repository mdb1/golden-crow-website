import { getServerSession } from "@/lib/session";
import {
  searchPublisherAppColorCatalog,
  searchPublisherAppTextCatalog,
} from "@/lib/publisher-app-customization-catalog-server";

export const dynamic = "force-dynamic";

function queryNumber(
  searchParams: URLSearchParams,
  key: string,
  fallback: number,
) {
  const raw = searchParams.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? value : Number.NaN;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { kind } = await context.params;
  if (kind !== "colors" && kind !== "texts") {
    return Response.json(
      { error: "Unknown customization catalog." },
      { status: 404 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const cursor = queryNumber(searchParams, "cursor", 0);
  const limit = queryNumber(searchParams, "limit", 20);
  const query = searchParams.get("q")?.trim() || undefined;
  const group = searchParams.get("group")?.trim() || undefined;
  if (
    !Number.isInteger(cursor) ||
    cursor < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (query?.length ?? 0) > 500 ||
    (group?.length ?? 0) > 200
  ) {
    return Response.json({ error: "Invalid catalog query." }, { status: 400 });
  }

  const page =
    kind === "colors"
      ? searchPublisherAppColorCatalog({ query, group, cursor, limit })
      : searchPublisherAppTextCatalog({ query, group, cursor, limit });
  return Response.json(page, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
