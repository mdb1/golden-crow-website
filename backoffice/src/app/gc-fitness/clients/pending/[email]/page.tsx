import ClientDetailPage from "../../[id]/page";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <clients>" (issue #170).
export const generateMetadata = () => sectionMetadata("clients");

export const dynamic = "force-dynamic";

export default async function PendingClientDetailPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const { email } = await params;
  return ClientDetailPage({
    params: Promise.resolve({ id: `mirror:${decodeURIComponent(email)}` }),
  });
}
