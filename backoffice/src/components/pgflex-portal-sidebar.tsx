"use client";

import Link from "next/link";
import { Home, PackageCheck, UserRound } from "lucide-react";
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
  PGFLEX_ACCOUNT_ROUTE,
  PGFLEX_ENTRY_ROUTE,
  PGFLEX_HOME_ROUTE,
} from "@/lib/pgflex-routes";

const PGFLEX_NAV = [
  { href: PGFLEX_HOME_ROUTE, label: "Home", icon: Home },
  { href: PGFLEX_ENTRY_ROUTE, label: "PGFlex", icon: PackageCheck },
  {
    href: PGFLEX_ACCOUNT_ROUTE,
    label: "My account",
    icon: UserRound,
  },
] as const;

export function PGFlexPortalSidebar() {
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
          {appText(language, "PGFlex portal")}
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PGFLEX_NAV.map((item) => {
                const isActive =
                  item.href === PGFLEX_ENTRY_ROUTE
                    ? pathname === item.href ||
                      pathname.startsWith(`${item.href}/`)
                    : pathname === item.href;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={appText(language, item.label)}
                    >
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{appText(language, item.label)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
