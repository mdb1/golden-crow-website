"use client";

import Link from "next/link";
import { Home, Newspaper, UserRound } from "lucide-react";
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
import {
  PUBLISHER_PORTAL_ACCOUNT_ROUTE,
  PUBLISHER_PORTAL_HOME_ROUTE,
} from "@/lib/publisher-portal-routes";

const PUBLISHER_PORTAL_NAV = [
  { href: PUBLISHER_PORTAL_HOME_ROUTE, label: "Home", icon: Home },
  {
    href: PUBLISHER_PORTAL_ACCOUNT_ROUTE,
    label: "My account",
    icon: UserRound,
  },
] as const;

export function PublisherPortalSidebar() {
  const pathname = usePathname();
  const { language } = useAppLanguage();

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="border-none bg-transparent p-2"
    >
      <SidebarHeader className="px-4 py-4 group-data-[collapsible=icon]:hidden">
        <p className="flex items-center gap-2 font-heading text-lg font-semibold text-sidebar-foreground">
          <Newspaper className="size-4 text-violet-600" />
          {appText(language, "Publisher portal")}
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PUBLISHER_PORTAL_NAV.map((item) => (
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
