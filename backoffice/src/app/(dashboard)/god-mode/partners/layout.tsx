import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function PartnersLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await getAdminContextServer();
  if (!context.isBootstrap) redirect("/2pq-dashboard");
  return children;
}
