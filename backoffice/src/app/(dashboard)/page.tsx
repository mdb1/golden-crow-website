import { redirect } from "next/navigation";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function DashboardIndexPage() {
  const adminContext = await getAdminContextServer();
  if (adminContext.role === "organization_publisher") {
    redirect("/discover/feed-entries");
  }

  redirect("/2pq-dashboard");
}
