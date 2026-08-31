import { redirect } from "next/navigation";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function DashboardIndexPage() {
  const adminContext = await getAdminContextServer();
  if (
    adminContext.role === "organization_publisher" ||
    adminContext.role === "individual_publisher"
  ) {
    redirect("/discover/feed-entries");
  }

  if (adminContext.role === "transport_dispatcher") {
    redirect("/pgflex/logistics");
  }

  redirect("/2pq-dashboard");
}
