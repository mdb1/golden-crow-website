import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { sdkFetchServer } from "@/lib/sdk-server";

const CreateIntegrationClientSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict();

const ListIntegrationClientsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  cursor: z.string().trim().min(1).optional(),
});

function sdkErrorResponse(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Could not manage reporting integration clients.",
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedQuery = ListIntegrationClientsQuerySchema.safeParse({
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
    const clients = await sdkFetchServer(
      `/reporting/integration-clients${query ? `?${query}` : ""}`,
    );

    return NextResponse.json(clients);
  } catch (error) {
    return sdkErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedBody = CreateIntegrationClientSchema.safeParse(payload);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 },
    );
  }

  try {
    const context = await getAdminContextServer();
    if (context.role !== "full_admin" && !context.isBootstrap) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const client = await sdkFetchServer("/reporting/integration-clients", {
      method: "POST",
      body: JSON.stringify(parsedBody.data),
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    return sdkErrorResponse(error);
  }
}
