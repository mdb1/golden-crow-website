import { NextResponse } from "next/server";
import { getAdminContextOrNull } from "@/lib/admin-context-server";
import { isGlobalAdminRole } from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await context.params;

  try {
    const adminContext = await getAdminContextOrNull();
    if (!adminContext) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (!isGlobalAdminRole(adminContext.role) && !adminContext.isBootstrap) {
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
