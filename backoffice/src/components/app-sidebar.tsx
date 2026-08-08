"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAppLanguage } from "@/components/app-language-provider";
import type { AdminContextRecord } from "@/lib/admin-areas";
import { BACKOFFICE_VERSION } from "@/lib/app-version";
import { appText } from "@/lib/language";
import { getProjectNav, getProjectSections } from "@/lib/moderation-config";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronDown } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppSidebar({
  adminContext,
}: {
  adminContext: AdminContextRecord;
}) {
  const pathname = usePathname();
  const { language } = useAppLanguage();
  const visibleSections = getProjectSections(
    adminContext.project,
    adminContext.role,
  );
  const visibleNav = getProjectNav(adminContext.project, adminContext.role);
  const productTitle =
    adminContext.project === "pocket-gyms"
      ? appText(language, "Pocket Gyms")
      : adminContext.project === "gc-fitness"
        ? appText(language, "GC Fitness")
        : appText(language, "PocketGenes");
  const showPocketGenesVersion = adminContext.project === "mydnamap";

  async function handleSwitchProject() {
    await signOut({ callbackUrl: "/login", redirect: true });
  }

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="border-none bg-transparent p-2"
    >
      <SidebarHeader className="glass-panel gap-2 px-3 py-3 group-data-[collapsible=icon]:hidden">
        <div className="px-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-semibold text-sidebar-foreground">
                {productTitle}
              </p>
              {showPocketGenesVersion ? (
                <p className="mt-0.5 truncate text-xs text-sidebar-foreground/60">
                  v{BACKOFFICE_VERSION}
                </p>
              ) : null}
            </div>
            {adminContext.projectAccess.length > 1 && (
              <button
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={handleSwitchProject}
                title={appText(language, "Switch project")}
              >
                <ChevronDown className="h-3 w-3" />
                {appText(language, "Switch")}
              </button>
            )}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {adminContext.isBootstrap ? (
          <SidebarGroup>
            <SidebarGroupLabel className="font-black tracking-[0.16em] text-amber-800 dark:text-amber-200">
              GOD MODE ACTIONS
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/god-mode/bookings"}
                    tooltip={appText(language, "See all bookings")}
                    className={cn(
                      "border border-amber-400/45 bg-amber-100/80 text-amber-950 hover:border-amber-500/70 hover:bg-amber-200/80 hover:text-amber-950 data-active:border-amber-600 data-active:bg-amber-300 data-active:text-amber-950 dark:border-amber-300/25 dark:bg-amber-400/12 dark:text-amber-100 dark:hover:bg-amber-400/20 dark:data-active:bg-amber-400/24",
                    )}
                  >
                    <Link href="/god-mode/bookings">
                      <CalendarDays className="h-4 w-4" />
                      <span>{appText(language, "See all bookings")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        {visibleSections.map((section) => {
          const items = visibleNav.filter(
            (item) => item.section === section.key,
          );
          if (items.length === 0) {
            return null;
          }

          return (
            <SidebarGroup key={section.key}>
              <SidebarGroupLabel>
                {appText(language, section.label)}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname === item.href ||
                          pathname.startsWith(item.href + "/");

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={appText(language, item.label)}
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{appText(language, item.label)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
