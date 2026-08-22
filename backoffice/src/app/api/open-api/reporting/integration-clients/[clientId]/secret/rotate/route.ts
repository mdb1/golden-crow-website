import { NextResponse } from "next/server";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { sdkFetchServer } from "@/lib/sdk-server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await context.params;

  try {
    const adminContext = await getAdminContextServer();
    if (adminContext.role !== "full_admin" && !adminContext.isBootstrap) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await sdkFetchServer(
      `/reporting/integration-clients/${encodeURIComponent(
        clientId,
      )}/secret/rotate`,
      {
        method: "POST",
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not rotate reporting integration client secret.",
      },
      { status: 500 },
    );
  }
}
