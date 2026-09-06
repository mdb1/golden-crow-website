"use client";

import Link from "next/link";
import { Building2, Home, Newspaper, UserRound } from "lucide-react";
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
import type { AdminContextRecord } from "@/lib/admin-areas";
import {
  PUBLISHER_PORTAL_ACCOUNT_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE,
  PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE,
  PUBLISHER_PORTAL_HOME_ROUTE,
  publisherPortalIndividualDetailRoute,
  publisherPortalOrganizationDetailRoute,
} from "@/lib/publisher-portal-routes";

function publisherProfileNavItem({
  role,
  organizationId,
  individualId,
}: Pick<AdminContextRecord, "role" | "organizationId" | "individualId">) {
  if (role === "individual_publisher") {
    return {
      href: individualId
        ? publisherPortalIndividualDetailRoute(individualId)
        : PUBLISHER_PORTAL_DISCOVER_INDIVIDUALS_ROUTE,
      label: "Individual publisher",
      icon: UserRound,
    } as const;
  }

  return {
    href: organizationId
      ? publisherPortalOrganizationDetailRoute(organizationId)
      : PUBLISHER_PORTAL_DISCOVER_ORGANIZATIONS_ROUTE,
    label: "Organization",
    icon: Building2,
  } as const;
}

function publisherPortalNav({
  role,
  organizationId,
  individualId,
}: Pick<AdminContextRecord, "role" | "organizationId" | "individualId">) {
  return [
    { href: PUBLISHER_PORTAL_HOME_ROUTE, label: "Home", icon: Home },
    publisherProfileNavItem({ role, organizationId, individualId }),
    {
      href: PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE,
      label: "Feed entries",
      icon: Newspaper,
    },
    {
      href: PUBLISHER_PORTAL_ACCOUNT_ROUTE,
      label: "My account",
      icon: UserRound,
    },
  ] as const;
}

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublisherPortalSidebar({
  role,
  organizationId,
  individualId,
}: {
  role: AdminContextRecord["role"];
  organizationId?: string;
  individualId?: string;
}) {
  const pathname = usePathname();
  const { language } = useAppLanguage();
  const navItems = publisherPortalNav({ role, organizationId, individualId });

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
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavItemActive(pathname, item.href)}
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
