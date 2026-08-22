import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { sdkFetchServer } from "@/lib/sdk-server";

const CreateIntegrationClientSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict();

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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create reporting integration client.",
      },
      { status: 500 },
    );
  }
}
