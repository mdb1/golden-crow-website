import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { AmbientBackdrop } from "@/components/ambient-backdrop";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PGFlexPortalHeader } from "@/components/pgflex-portal-header";
import { PGFlexPortalSidebar } from "@/components/pgflex-portal-sidebar";
import { PGFlexRouteGuard } from "@/components/pgflex-route-guard";
import { PublisherRouteGuard } from "@/components/publisher-route-guard";
import { Providers } from "./providers";
import { getAdminContextServer } from "@/lib/admin-context-server";
import { LANGUAGE_COOKIE_NAME, resolveAppLanguage } from "@/lib/language";
import { PATIENT_PORTAL_ENTRY_ROUTE } from "@/lib/patient-portal-routes";
import { PGFLEX_LOGIN_ROUTE } from "@/lib/pgflex-routes";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (session.user?.accessSurface === "patient-portal") {
    redirect(PATIENT_PORTAL_ENTRY_ROUTE);
  }

  let adminContext;

  try {
    adminContext = await getAdminContextServer(session.user?.project);
  } catch {
    redirect("/access-denied");
  }

  if (session.user?.accessSurface === "pgflex") {
    if (
      !adminContext.canAccessPGFlex ||
      adminContext.canAccessBackoffice ||
      adminContext.canAccessPatientPortal
    ) {
      redirect(PGFLEX_LOGIN_ROUTE);
    }

    return (
      <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
        <SidebarProvider defaultOpen={false}>
          <div className="flex min-h-screen w-full overflow-x-hidden bg-background text-foreground">
            <PGFlexPortalSidebar />
            <SidebarInset className="min-h-screen min-w-0 bg-background">
              <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-background">
                <PGFlexPortalHeader />
                <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-4 lg:p-6">
                  <Providers adminContext={adminContext}>
                    <PGFlexRouteGuard>{children}</PGFlexRouteGuard>
                  </Providers>
                </main>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </AppLanguageProvider>
    );
  }

  if (!adminContext.canAccessBackoffice) {
    redirect(
      adminContext.canAccessPatientPortal
        ? PATIENT_PORTAL_ENTRY_ROUTE
        : adminContext.canAccessPGFlex
          ? PGFLEX_LOGIN_ROUTE
          : "/access-denied",
    );
  }
  const cookieStore = await cookies();
  const initialLanguage = resolveAppLanguage(
    cookieStore.get(LANGUAGE_COOKIE_NAME)?.value,
  );

  return (
    <AppLanguageProvider initialLanguage={initialLanguage}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full overflow-x-hidden bg-background text-foreground">
          <AppSidebar adminContext={adminContext} />
          <SidebarInset className="min-h-screen min-w-0 bg-background">
            <div className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden bg-background">
              <AmbientBackdrop />
              <AppHeader user={session.user!} adminContext={adminContext} />
              <main className="relative z-10 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-6">
                <Providers adminContext={adminContext}>
                  <PublisherRouteGuard adminContext={adminContext}>
                    {children}
                  </PublisherRouteGuard>
                </Providers>
              </main>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AppLanguageProvider>
  );
}
