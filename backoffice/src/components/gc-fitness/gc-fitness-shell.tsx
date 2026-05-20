"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

  if (HIDDEN_SHELL_PATHS.has(pathname)) {
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
