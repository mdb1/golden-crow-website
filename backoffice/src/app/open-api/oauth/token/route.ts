import { handleOAuthTokenExchange } from "@/lib/open-api/reporting-handlers";

export async function POST(request: Request) {
  return handleOAuthTokenExchange(request);
}
