"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  CalendarDays,
  ClipboardCheck,
  Home,
  Library,
  MessagesSquare,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { GOLDENCROW_LOGO_DATA_URI } from "@/components/gc-fitness/goldencrow-logo-data";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { CoachCard } from "@/components/gc-fitness/coach-card";
import { useTrainerChats } from "@/lib/gc-fitness/chat-listener";
import { useActiveWorkoutSummaries } from "@/lib/gc-fitness/live-workout-listener";
import { useNewClientActivationBadges } from "@/lib/gc-fitness/new-client-activation-listener";
import { Badge } from "@/components/ui/badge";

const HIDDEN_SHELL_PATHS = new Set([
  "/gc-fitness/login",
  "/gc-fitness/forbidden",
]);

// Routes that keep the consolidated "Biblioteca" nav item highlighted. The
// redesign folds Workouts + Exercises + Habits behind one Library entry, but
// their standalone routes still exist (deep links, edit forms), so the pill
// stays active across all of them.
const LIBRARY_PATHS = [
  "/gc-fitness/library",
  "/gc-fitness/templates",
  "/gc-fitness/exercises",
  "/gc-fitness/habits",
];

// Grouped nav — destinations split into sensible sections with small section
// headers, each a generously-spaced row (active = solid gold pill).
type NavLeaf = {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Extra paths that should also light up this item. */
  matchPaths?: string[];
};
type NavSection = { sectionKey: string; items: NavLeaf[] };

const NAV_SECTIONS: NavSection[] = [
  {
    sectionKey: "overview",
    items: [
      { labelKey: "dashboard", href: "/gc-fitness/dashboard", icon: Home },
      { labelKey: "schedule", href: "/gc-fitness/schedule", icon: CalendarDays },
      { labelKey: "checklist", href: "/gc-fitness/checklist", icon: ClipboardCheck },
      { labelKey: "notifications", href: "/gc-fitness/notifications", icon: Bell },
    ],
  },
  {
    sectionKey: "clientsGroup",
    items: [
      { labelKey: "clients", href: "/gc-fitness/clients", icon: Users },
      { labelKey: "chat", href: "/gc-fitness/chat", icon: MessagesSquare },
    ],
  },
  {
    sectionKey: "libraryGroup",
    items: [
      {
        labelKey: "library",
        href: "/gc-fitness/library",
        icon: Library,
        matchPaths: LIBRARY_PATHS,
      },
    ],
  },
  {
    sectionKey: "accountGroup",
    items: [{ labelKey: "settings", href: "/gc-fitness/settings", icon: Settings }],
  },
];

export function GCFitnessShell({
  children,
  trainerUid,
  trainerEmail,
  isAdmin,
  birthdayNotificationCount,
}: {
  children: React.ReactNode;
  trainerUid: string | null;
  trainerEmail: string | null;
  isAdmin: boolean;
  birthdayNotificationCount: number;
}) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  const tNav = useTranslations("nav");
  const shellHidden = HIDDEN_SHELL_PATHS.has(pathname);
  const chatsQuery = useTrainerChats(!shellHidden && !!trainerUid);
  const activeWorkoutQuery = useActiveWorkoutSummaries(
    !shellHidden && !!trainerUid,
  );
  const newClientBadges = useNewClientActivationBadges({
    enabled: !shellHidden && !!trainerUid,
    pathname,
    trainerUid,
  });
  const inLiveWorkout =
    pathname.includes("/sessions/") && pathname.endsWith("/run");
  const unreadChatTotal = (chatsQuery.data ?? []).reduce((sum, chat) => {
    if (!trainerUid) return sum;
    return sum + Math.max(0, chat.unreadCount?.[trainerUid] ?? 0);
  }, 0);
  const notificationsBadge =
    pathname.startsWith("/gc-fitness/notifications")
      ? 0
      : newClientBadges.notifications + birthdayNotificationCount;
  const navBadges: Record<string, number> = {
    "/gc-fitness/chat": unreadChatTotal,
    "/gc-fitness/notifications": notificationsBadge,
    "/gc-fitness/clients": newClientBadges.clients,
  };

  if (shellHidden) {
    return children;
  }

  const resolvedSections: NavSection[] = isAdmin
    ? NAV_SECTIONS.map((section) =>
        section.sectionKey === "accountGroup"
          ? {
              ...section,
              items: [
                ...section.items,
                {
                  labelKey: "adminPanel",
                  href: "/gc-fitness/admin",
                  icon: Shield,
                },
              ],
            }
          : section,
      )
    : NAV_SECTIONS;

  function isItemActive(item: NavLeaf): boolean {
    if (inLiveWorkout) return false;
    const candidates = item.matchPaths ?? [item.href];
    return candidates.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  }

  const coachName = trainerEmail ? deriveName(trainerEmail) : t("appName");

  return (
    <SidebarProvider
      // Widen the collapsed (icon-only) rail from the shadcn default 3rem so the
      // larger, touch-friendly 44px nav buttons (see SidebarNavLink) sit centered
      // with breathing room instead of cramped 32px icons in a 48px strip.
      style={{ "--sidebar-width-icon": "3.75rem" } as React.CSSProperties}
    >
      <div className="gc-shell-bg flex min-h-screen w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-3 py-4 group-data-[collapsible=icon]:px-2">
            <Link
              href="/gc-fitness/dashboard"
              className="flex items-center gap-2.5 rounded-xl px-1 py-1 transition-colors hover:bg-sidebar-accent/60 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={GOLDENCROW_LOGO_DATA_URI}
                  alt=""
                  className="h-6 w-6 object-contain"
                />
              </span>
              <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="block truncate font-heading text-base font-bold leading-tight text-sidebar-foreground">
                  {t("coachPortal")}
                </span>
                <span className="block truncate text-xs text-sidebar-foreground/65">
                  {coachName}
                </span>
              </span>
            </Link>
          </SidebarHeader>

          <SidebarContent className="px-2">
            {activeWorkoutQuery.data && activeWorkoutQuery.data.length > 0 ? (
              <SidebarGroup>
                <SidebarGroupLabel>{tNav("activeWorkout")}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {activeWorkoutQuery.data.map((item) => {
                      const href = `/gc-fitness/clients/${item.clientId}/sessions/${item.assignmentId}/run`;
                      const active =
                        pathname === href || pathname.startsWith(`${href}/`);
                      return (
                        <SidebarMenuItem key={item.logId}>
                          <SidebarNavLink
                            href={href}
                            label={`${item.clientName} · ${item.workoutName}`}
                            isActive={active}
                            icon={<Activity className="h-4 w-4" />}
                            badge={null}
                          />
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}

            {resolvedSections.map((section) => (
              <SidebarGroup key={section.sectionKey} className="py-1">
                <SidebarGroupLabel className="px-3 text-[0.7rem] font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                  {tNav(section.sectionKey)}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarNavLink
                          href={item.href}
                          label={tNav(item.labelKey)}
                          isActive={isItemActive(item)}
                          icon={<item.icon className="h-4 w-4" />}
                          badge={navBadges[item.href] > 0 ? navBadges[item.href] : null}
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="px-3 pb-4 pt-2 group-data-[collapsible=icon]:px-2">
            <CoachCard email={trainerEmail ?? ""} isAdmin={isAdmin} />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-h-screen bg-transparent">
          {/* Mobile-only top bar: hamburger + brand. Desktop pages own their
              own title via the in-page PageHeader. */}
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-sm md:hidden">
            <SidebarTrigger className="-ml-1" />
            <span className="font-heading text-sm font-bold text-foreground">
              {t("coachPortal")}
            </span>
            {unreadChatTotal > 0 ? (
              <Badge
                variant="destructive"
                className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]"
              >
                {unreadChatTotal}
              </Badge>
            ) : null}
          </header>
          <main className="relative z-10 flex-1 overflow-auto">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function deriveName(email: string): string {
  const local = email.split("@")[0] ?? "";
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Coach"
  );
}

// SidebarNavLink — lives inside <SidebarProvider> so it can read mobile state
// from useSidebar(). On mobile, tapping a nav item navigates AND closes the
// drawer (otherwise the user lands on the new page with the sidebar still
// covering it).
function SidebarNavLink({
  href,
  label,
  isActive,
  icon,
  badge,
}: {
  href: string;
  label: string;
  isActive: boolean;
  icon: React.ReactNode;
  badge: number | null;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      asChild
      isActive={isActive}
      tooltip={label}
      // Collapsed (icon-only) rail: bump the shadcn default 32px square button to
      // a 44px circular hit target with a 20px icon so it's easy to tap and reads
      // as a proper icon rail. Expanded state is unchanged.
      className="group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:[&_svg]:size-5"
    >
      <Link
        href={href}
        onClick={() => {
          if (isMobile) setOpenMobile(false);
        }}
      >
        {icon}
        <span>{label}</span>
        {badge !== null ? (
          <Badge
            variant="destructive"
            className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]"
          >
            {badge}
          </Badge>
        ) : null}
      </Link>
    </SidebarMenuButton>
  );
}
