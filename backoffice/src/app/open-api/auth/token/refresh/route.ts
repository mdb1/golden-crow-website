import { handleReportingTokenRefresh } from "@/lib/open-api/reporting-handlers";

export async function POST(request: Request) {
  return handleReportingTokenRefresh(request);
}
