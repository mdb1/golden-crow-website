"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Dumbbell,
  Home,
  Library,
  ListChecks,
  MessagesSquare,
  Settings,
  Users,
} from "lucide-react";

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
import { getTrainerUnreadChatCount } from "@/lib/gc-fitness/chat-server-actions";

const HIDDEN_SHELL_PATHS = new Set([
  "/gc-fitness/login",
  "/gc-fitness/forbidden",
]);

const sections = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/gc-fitness/dashboard",
        icon: Home,
      },
      {
        label: "Clients",
        href: "/gc-fitness/clients",
        icon: Users,
      },
      {
        label: "Schedule",
        href: "/gc-fitness/schedule",
        icon: CalendarDays,
      },
    ],
  },
  {
    label: "Programming",
    items: [
      {
        label: "Workouts",
        href: "/gc-fitness/templates",
        icon: Dumbbell,
      },
      {
        label: "Library",
        href: "/gc-fitness/exercises",
        icon: Library,
      },
      {
        label: "Habits",
        href: "/gc-fitness/habits",
        icon: ListChecks,
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        label: "Chat",
        href: "/gc-fitness/chat",
        icon: MessagesSquare,
      },
      {
        label: "Settings",
        href: "/gc-fitness/settings",
        icon: Settings,
      },
    ],
  },
];

export function GCFitnessShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hiddenShell = HIDDEN_SHELL_PATHS.has(pathname);
  const unreadChatCount = useUnreadChatCount(!hiddenShell);

  if (hiddenShell) {
    return children;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar variant="floating" collapsible="icon" className="border-none bg-transparent p-2">
          <SidebarHeader className="glass-panel gap-3 px-3 py-3">
            <div className="px-2">
              <p className="section-eyebrow">Golden Crow</p>
              <p className="font-heading text-lg font-semibold text-sidebar-foreground">
                GC Fitness
              </p>
              <p className="mt-1 text-sm text-sidebar-foreground/70">
                Trainer coaching console.
              </p>
            </div>
          </SidebarHeader>
          <SidebarContent>
            {sections.map((section) => (
              <SidebarGroup key={section.label}>
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => {
                      const active =
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={item.label}
                          >
                            <Link href={item.href}>
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
                              {item.href === "/gc-fitness/chat" && unreadChatCount > 0 ? (
                                <span
                                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground"
                                  aria-label={`${unreadChatCount} unread chat messages`}
                                >
                                  {formatBadgeCount(unreadChatCount)}
                                </span>
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
              Manage clients, programming, assignments, habits, and chat from
              one trainer workspace.
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
                <p className="section-eyebrow">GC Fitness</p>
                <h1 className="truncate font-heading text-lg font-semibold text-foreground">
                  Trainer Backoffice
                </h1>
              </div>
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

function useUnreadChatCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const next = await getTrainerUnreadChatCount();
        if (!cancelled) setCount(next);
      } catch {
        if (!cancelled) setCount(0);
      }
    }

    void load();
    const id = window.setInterval(() => {
      void load();
    }, 30_000);
    const handleFocus = () => {
      void load();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled]);

  return count;
}

function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}
