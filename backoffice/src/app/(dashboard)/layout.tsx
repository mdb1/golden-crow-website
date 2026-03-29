import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { AmbientBackdrop } from "@/components/ambient-backdrop";
import { Providers } from "./providers";
import { getAdminContextServer } from "@/lib/admin-context-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  let adminContext;

  try {
    adminContext = await getAdminContextServer();
  } catch {
    redirect("/access-denied");
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar adminContext={adminContext} />
        <SidebarInset className="min-h-screen bg-transparent">
          <div className="relative flex min-h-screen flex-1 flex-col overflow-hidden">
            <AmbientBackdrop />
            <AppHeader user={session.user!} adminContext={adminContext} />
            <main className="relative z-10 flex-1 overflow-auto p-4 lg:p-6">
              <Providers adminContext={adminContext}>{children}</Providers>
            </main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
