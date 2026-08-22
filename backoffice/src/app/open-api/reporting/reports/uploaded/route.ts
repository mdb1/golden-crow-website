import { handleUploadedReportNotification } from "@/lib/open-api/reporting-handlers";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleUploadedReportNotification(request);
}
