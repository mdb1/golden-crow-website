import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PatientPortalHeader } from "@/components/patient-portal-header";
import { PatientPortalSidebar } from "@/components/patient-portal-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Providers } from "@/app/(dashboard)/providers";

export default async function PatientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/patient-portal/login");
  }

  if (session.user?.accessSurface !== "patient-portal") {
    redirect("/2pq-dashboard");
  }

  let adminContext;
  try {
    adminContext = await getAdminContextServer(session.user.project);
  } catch {
    redirect("/patient-portal/login");
  }

  if (!adminContext.canAccessPatientPortal || adminContext.canAccessBackoffice) {
    redirect("/patient-portal/login");
  }

  return (
    <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full overflow-x-hidden bg-background text-foreground">
          <PatientPortalSidebar />
          <SidebarInset className="min-h-screen min-w-0 bg-background">
            <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-background">
              <PatientPortalHeader />
              <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-4 lg:p-6">
                <Providers adminContext={adminContext}>{children}</Providers>
              </main>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AppLanguageProvider>
  );
}
