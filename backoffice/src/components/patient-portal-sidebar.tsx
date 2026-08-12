"use client";

import Link from "next/link";
import { Home, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const PATIENT_PORTAL_NAV = [
  { href: "/patient-portal/home", label: "Home", icon: Home },
  {
    href: "/patient-portal/my-account",
    label: "My account",
    icon: UserRound,
  },
] as const;

export function PatientPortalSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="border-none bg-transparent p-2"
    >
      <SidebarHeader className="px-4 py-4 group-data-[collapsible=icon]:hidden">
        <p className="font-heading text-lg font-semibold text-sidebar-foreground">
          Patient portal
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PATIENT_PORTAL_NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
