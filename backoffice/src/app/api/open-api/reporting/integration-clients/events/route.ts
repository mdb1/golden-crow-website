import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { sdkFetchServer } from "@/lib/sdk-server";

const ListIntegrationClientEventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  cursor: z.string().trim().min(1).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedQuery = ListIntegrationClientEventsQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: parsedQuery.error.issues[0]?.message ?? "Invalid query." },
      { status: 400 },
    );
  }

  try {
    const context = await getAdminContextServer();
    if (context.role !== "full_admin" && !context.isBootstrap) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const params = new URLSearchParams();
    if (parsedQuery.data.limit) {
      params.set("limit", String(parsedQuery.data.limit));
    }
    if (parsedQuery.data.cursor) {
      params.set("cursor", parsedQuery.data.cursor);
    }
    const query = params.toString();
    const events = await sdkFetchServer(
      `/reporting/integration-clients/events${query ? `?${query}` : ""}`,
    );

    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load reporting API access events.",
      },
      { status: 500 },
    );
  }
}
