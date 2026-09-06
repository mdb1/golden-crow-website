import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PublisherPortalHeader } from "@/components/publisher-portal-header";
import { PublisherPortalSidebar } from "@/components/publisher-portal-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Providers } from "@/app/(dashboard)/providers";
import { PATIENT_PORTAL_ENTRY_ROUTE } from "@/lib/patient-portal-routes";
import { PGFLEX_ENTRY_ROUTE } from "@/lib/pgflex-routes";
import { PUBLISHER_PORTAL_LOGIN_ROUTE } from "@/lib/publisher-portal-routes";

export default async function PublisherPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect(PUBLISHER_PORTAL_LOGIN_ROUTE);
  }

  if (session.user?.accessSurface === "patient-portal") {
    redirect(PATIENT_PORTAL_ENTRY_ROUTE);
  }

  if (session.user?.accessSurface === "pgflex") {
    redirect(PGFLEX_ENTRY_ROUTE);
  }

  if (session.user?.accessSurface !== "publisher-portal") {
    redirect("/2pq-dashboard");
  }

  let adminContext;
  try {
    adminContext = await getAdminContextServer(session.user.project);
  } catch {
    redirect(PUBLISHER_PORTAL_LOGIN_ROUTE);
  }

  if (
    !adminContext.canAccessPublisherPortal ||
    adminContext.canAccessBackoffice ||
    adminContext.canAccessPatientPortal ||
    adminContext.canAccessPGFlex
  ) {
    redirect(PUBLISHER_PORTAL_LOGIN_ROUTE);
  }

  return (
    <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full overflow-x-hidden bg-background text-foreground">
          <PublisherPortalSidebar
            role={adminContext.role}
            organizationId={adminContext.organizationId}
            individualId={adminContext.individualId}
          />
          <SidebarInset className="min-h-screen min-w-0 bg-background">
            <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-background">
              <PublisherPortalHeader />
              <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-4 lg:p-6">
                <Providers adminContext={adminContext}>
                  <div className="mx-auto w-full max-w-5xl">{children}</div>
                </Providers>
              </main>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AppLanguageProvider>
  );
}
