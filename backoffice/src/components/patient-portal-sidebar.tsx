"use client";

import Link from "next/link";
import { FileCheck2, Home, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAppLanguage } from "@/components/app-language-provider";
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
import { appText } from "@/lib/language";

const PATIENT_PORTAL_NAV = [
  { href: "/patient-portal/home", label: "Home", icon: Home },
  {
    href: "/patient-portal/consents",
    label: "Consentimientos",
    icon: FileCheck2,
  },
  {
    href: "/patient-portal/my-account",
    label: "My account",
    icon: UserRound,
  },
] as const;

export function PatientPortalSidebar() {
  const pathname = usePathname();
  const { language } = useAppLanguage();

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="border-none bg-transparent p-2"
    >
      <SidebarHeader className="px-4 py-4 group-data-[collapsible=icon]:hidden">
        <p className="font-heading text-lg font-semibold text-sidebar-foreground">
          {appText(language, "Patient portal")}
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
                    tooltip={appText(language, item.label)}
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{appText(language, item.label)}</span>
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
