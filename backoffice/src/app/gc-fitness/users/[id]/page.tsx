import { redirect } from "next/navigation";

export default async function UserAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/gc-fitness/clients/${id}`);
}
