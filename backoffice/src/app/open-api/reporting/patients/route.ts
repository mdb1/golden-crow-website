import { handlePatientLookup } from "@/lib/open-api/reporting-handlers";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handlePatientLookup(request);
}
