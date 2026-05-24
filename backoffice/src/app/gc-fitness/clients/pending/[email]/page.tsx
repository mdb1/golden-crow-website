import ClientDetailPage from "../../[id]/page";

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
