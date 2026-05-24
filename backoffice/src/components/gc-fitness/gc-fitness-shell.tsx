"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  Dumbbell,
  Home,
  Library,
  ListChecks,
  MessagesSquare,
  Settings,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

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
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from "@/components/gc-fitness/sign-out-button";
import { LanguagePicker } from "@/components/gc-fitness/language-picker";
import { useTrainerChats } from "@/lib/gc-fitness/chat-listener";
import { Badge } from "@/components/ui/badge";

const HIDDEN_SHELL_PATHS = new Set([
  "/gc-fitness/login",
  "/gc-fitness/forbidden",
]);

// Sidebar nav metadata. `labelKey` and `sectionKey` are looked up against the
// `nav` namespace in the next-intl message catalogs (Plan 13-03).
const sections = [
  {
    sectionKey: "overview",
    items: [
      { labelKey: "dashboard", href: "/gc-fitness/dashboard", icon: Home },
      { labelKey: "clients", href: "/gc-fitness/clients", icon: Users },
      { labelKey: "schedule", href: "/gc-fitness/schedule", icon: CalendarDays },
      {
        labelKey: "recentLogs",
        href: "/gc-fitness/recent-logs",
        icon: Activity,
      },
    ],
  },
  {
    sectionKey: "programming",
    items: [
      { labelKey: "workouts", href: "/gc-fitness/templates", icon: Dumbbell },
      { labelKey: "library", href: "/gc-fitness/exercises", icon: Library },
      { labelKey: "habits", href: "/gc-fitness/habits", icon: ListChecks },
    ],
  },
  {
    sectionKey: "communication",
    items: [
      { labelKey: "chat", href: "/gc-fitness/chat", icon: MessagesSquare },
      { labelKey: "settings", href: "/gc-fitness/settings", icon: Settings },
    ],
  },
] as const;

export function GCFitnessShell({
  children,
  trainerUid,
}: {
  children: React.ReactNode;
  trainerUid: string | null;
}) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  const tNav = useTranslations("nav");
  const shellHidden = HIDDEN_SHELL_PATHS.has(pathname);
  const chatsQuery = useTrainerChats(!shellHidden && !!trainerUid);
  const unreadChatTotal = (chatsQuery.data ?? []).reduce((sum, chat) => {
    if (!trainerUid) return sum;
    return sum + Math.max(0, chat.unreadCount?.[trainerUid] ?? 0);
  }, 0);

  if (shellHidden) {
    return children;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar variant="floating" collapsible="icon" className="border-none bg-transparent p-2">
          <SidebarHeader className="glass-panel gap-3 px-3 py-3">
            <div className="px-2">
              <p className="section-eyebrow">{t("eyebrow")}</p>
              <p className="font-heading text-lg font-semibold text-sidebar-foreground">
                {t("appName")}
              </p>
              <p className="mt-1 text-sm text-sidebar-foreground/70">
                {t("tagline")}
              </p>
            </div>
          </SidebarHeader>
          <SidebarContent>
            {sections.map((section) => (
              <SidebarGroup key={section.sectionKey}>
                <SidebarGroupLabel>{tNav(section.sectionKey)}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => {
                      const active =
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                      const label = tNav(item.labelKey);
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={label}
                          >
                            <Link href={item.href}>
                              <item.icon className="h-4 w-4" />
                              <span>{label}</span>
                              {item.href === "/gc-fitness/chat" && unreadChatTotal > 0 ? (
                                <Badge
                                  variant="destructive"
                                  className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]"
                                >
                                  {unreadChatTotal}
                                </Badge>
                              ) : null}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter className="gap-3 px-4 pb-4 pt-2">
            <p className="text-xs text-sidebar-foreground/65">
              {t("footerBlurb")}
            </p>
            <SignOutButton />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-h-screen bg-transparent">
          <header className="sticky top-0 z-20 border-b border-border/80 bg-background/78 backdrop-blur-sm">
            <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="h-4" />
              <div className="min-w-0 flex-1">
                <p className="section-eyebrow">{t("headerEyebrow")}</p>
                <h1 className="truncate font-heading text-lg font-semibold text-foreground">
                  {t("headerTitle")}
                </h1>
              </div>
              <LanguagePicker />
            </div>
          </header>
          <main className="relative z-10 flex-1 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
