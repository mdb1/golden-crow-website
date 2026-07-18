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
import { appText } from "@/lib/language";
import { getProjectNav, getProjectSections } from "@/lib/moderation-config";
import { ChevronDown } from "lucide-react";
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
            <p className="truncate font-heading text-lg font-semibold text-sidebar-foreground">
              {adminContext.project === "pocket-gyms"
                ? appText(language, "Pocket Gyms")
                : adminContext.project === "gc-fitness"
                  ? appText(language, "GC Fitness")
                  : appText(language, "PocketGenes")}
            </p>
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
