import { NextResponse } from "next/server";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { sdkFetchServer } from "@/lib/sdk-server";

export async function POST() {
  try {
    const context = await getAdminContextServer();
    if (context.role !== "full_admin" && !context.isBootstrap) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const token = await sdkFetchServer("/reporting/access-tokens", {
      method: "POST",
      body: JSON.stringify({}),
    });

    return NextResponse.json(token, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not issue reporting access token.",
      },
      { status: 500 },
    );
  }
}
