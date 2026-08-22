import { handleTwoPQCaseLookup } from "@/lib/open-api/reporting-handlers";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ caseCode: string }> },
) {
  const { caseCode } = await context.params;
  return handleTwoPQCaseLookup(request, caseCode);
}
