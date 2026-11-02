import { handleAppRuntimeConfig } from "@/lib/open-api/reporting-handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAppRuntimeConfig(request);
}
