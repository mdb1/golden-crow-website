"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import type { AdminContextRecord } from "@/lib/admin-areas";
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
  const visibleSections = getProjectSections(adminContext.project, adminContext.role);
  const visibleNav = getProjectNav(adminContext.project, adminContext.role);

  async function handleSwitchProject() {
    await signOut({ callbackUrl: "/login", redirect: true });
  }

  return (
    <Sidebar variant="floating" collapsible="icon" className="border-none bg-transparent p-2">
      <SidebarHeader className="glass-panel gap-3 px-3 py-3">
        <div className="px-2">
          <p className="section-eyebrow">Golden Crow</p>
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading text-lg font-semibold text-sidebar-foreground">
              {adminContext.project === "pocket-gyms" ? "Pocket Gyms" : "MyDNAMap"}
            </p>
            {adminContext.projectAccess.length > 1 && (
              <button
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={handleSwitchProject}
                title="Switch project"
              >
                <ChevronDown className="h-3 w-3" />
                Switch
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-sidebar-foreground/70">
            {adminContext.project === "pocket-gyms"
              ? "Gym operations console."
              : "Readable operations console for the live Firebase model."}
          </p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {visibleSections.map((section) => {
          const items = visibleNav.filter((item) => item.section === section.key);
          if (items.length === 0) {
            return null;
          }

          return (
            <SidebarGroup key={section.key}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname === item.href || pathname.startsWith(item.href + "/");

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
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
      <SidebarSeparator />
      <SidebarFooter className="px-4 pb-4 pt-2 text-xs text-sidebar-foreground/65">
        {adminContext.role === "full_admin"
          ? "Full admins can reach the global moderation surfaces and the institution-area model from the same shell."
          : adminContext.role === "institution_admin"
            ? "Institution admins stay scoped to one institution, its doctors, its patients, and local role assignments."
            : "Institution doctors stay scoped to one institution, their own doctor record, and their own patients."}
      </SidebarFooter>
    </Sidebar>
  );
}
