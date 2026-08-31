"use client";

import { useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { signIn, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { useAppLanguage } from "@/components/app-language-provider";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import type { AdminContextRecord, ProjectKey } from "@/lib/admin-areas";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-areas";
import { auth } from "@/lib/firebase";
import { appText } from "@/lib/language";
import { getChromeMetadata } from "@/lib/moderation-config";
import { cn } from "@/lib/utils";
import { ArrowLeftRight } from "lucide-react";

interface AppHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  adminContext: AdminContextRecord;
}

function projectLabel(project: ProjectKey) {
  if (project === "pocket-gyms") {
    return "Pocket Gyms";
  }

  if (project === "gc-fitness") {
    return "GC Fitness";
  }

  return "PocketGenes";
}

function projectHomeHref(project: ProjectKey) {
  return project === "pocket-gyms" ? "/gym/dashboard" : "/";
}

function waitForFirebaseUser(): Promise<FirebaseUser | null> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    let unsubscribe: (() => void) | undefined;
    const timeout = window.setTimeout(() => {
      unsubscribe?.();
      resolve(null);
    }, 1800);

    unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        window.clearTimeout(timeout);
        unsubscribe?.();
        resolve(firebaseUser);
      },
      () => {
        window.clearTimeout(timeout);
        unsubscribe?.();
        resolve(null);
      }
    );
  });
}

export function AppHeader({ user, adminContext }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { language } = useAppLanguage();
  const metadata = getChromeMetadata(pathname);
  const [pendingSignOut, setPendingSignOut] = useState(false);
  const [pendingProjectSwitch, setPendingProjectSwitch] = useState(false);
  const isGodMode = adminContext.isBootstrap;
  const roleDescription = isGodMode
    ? "GOD MODE"
    : appText(language, ADMIN_ROLE_LABELS[adminContext.role]);
  const compactChromeTitle =
    pathname.startsWith("/areas") ||
    pathname.startsWith("/discover") ||
    pathname.startsWith("/god-mode") ||
    pathname.startsWith("/2pq-dashboard") ||
    pathname.startsWith("/pgflex") ||
    pathname.startsWith("/roles") ||
    pathname === "/my-account";
  const translatedMetadata = {
    eyebrow: appText(language, metadata.eyebrow),
    title: appText(language, metadata.title),
    description: appText(language, metadata.description),
  };
  const canSwitchLegacyProduct =
    (adminContext.project === "mydnamap" ||
      adminContext.project === "pocket-gyms") &&
    adminContext.projectAccess.includes("mydnamap") &&
    adminContext.projectAccess.includes("pocket-gyms");
  const targetProject: ProjectKey =
    adminContext.project === "pocket-gyms" ? "mydnamap" : "pocket-gyms";
  const targetProjectLabel = appText(language, projectLabel(targetProject));

  async function handleSignOut() {
    setPendingSignOut(true);
    try {
      await fetch("/api/sdk/auth/logout", {
        method: "POST",
      });
    } catch {
      // Best-effort logout of the SDK cookie before ending the NextAuth session.
    } finally {
      await signOut({ callbackUrl: "/login" });
    }
  }

  async function handleProjectSwitch() {
    setPendingProjectSwitch(true);
    try {
      const firebaseUser = await waitForFirebaseUser();
      const idToken = await firebaseUser?.getIdToken();

      if (firebaseUser && idToken) {
        const sessionRes = await fetch("/api/sdk/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ idToken }),
        });

        if (sessionRes.ok) {
          const signInResult = await signIn("credentials", {
            idToken,
            name: firebaseUser.displayName ?? user.name ?? "",
            email: firebaseUser.email ?? user.email ?? "",
            image: firebaseUser.photoURL ?? user.image ?? "",
            project: targetProject,
            redirect: false,
          });

          if (signInResult?.ok) {
            router.push(projectHomeHref(targetProject));
            router.refresh();
            return;
          }
        }
      }

      await signOut({ callbackUrl: "/login", redirect: true });
    } finally {
      setPendingProjectSwitch(false);
    }
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-20 h-(--app-header-height) border-b backdrop-blur-sm",
        isGodMode
          ? "border-amber-500/45 bg-gradient-to-r from-amber-100/92 via-yellow-50/88 to-background/84 shadow-[0_12px_28px_rgba(245,158,11,0.14)] dark:border-amber-300/30 dark:from-amber-950/70 dark:via-yellow-950/52 dark:to-background/78"
          : "border-border/80 bg-background/78",
      )}
    >
      <div className="flex h-(--app-header-height) items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className={cn("h-4", isGodMode && "bg-amber-700/30 dark:bg-amber-200/30")}
        />
        <div className="min-w-0 flex-1">
          {compactChromeTitle ? (
            <h1 className="truncate font-heading text-lg font-semibold text-foreground">
              {translatedMetadata.title}
            </h1>
          ) : (
            <>
              <p className="section-eyebrow">{translatedMetadata.eyebrow}</p>
              <div className="flex min-w-0 flex-col gap-0.5 lg:flex-row lg:items-baseline lg:gap-3">
                <h1 className="shrink-0 font-heading text-lg font-semibold text-foreground">
                  {translatedMetadata.title}
                </h1>
                <p className="line-clamp-2 hidden min-w-0 flex-1 text-sm leading-5 text-muted-foreground lg:block">
                  {translatedMetadata.description}
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <AppearanceToggle />
          <LanguageToggle />
          <div className="hidden text-right sm:block">
            <p
              className={cn(
                "text-sm font-medium",
                isGodMode ? "text-amber-950 dark:text-amber-50" : "text-foreground",
              )}
            >
              {user.name ?? appText(language, "Operator")}
            </p>
            <p
              className={cn(
                "text-xs",
                isGodMode
                  ? "font-black tracking-[0.16em] text-amber-900 dark:text-amber-100"
                  : "text-muted-foreground",
              )}
            >
              {user.email ?? appText(language, "Pocket Genes Admin")} ·{" "}
              {roleDescription}
            </p>
          </div>
          {canSwitchLegacyProduct && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleProjectSwitch}
              disabled={pendingProjectSwitch || pendingSignOut}
              title={appText(language, `Switch to ${projectLabel(targetProject)}`)}
              aria-label={appText(language, `Switch to ${projectLabel(targetProject)}`)}
              className="gap-1.5 px-2"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span className="hidden md:inline">
                {pendingProjectSwitch
                  ? appText(language, "Switching...")
                  : targetProjectLabel}
              </span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={pendingSignOut}
          >
            {pendingSignOut
              ? appText(language, "Signing out...")
              : appText(language, "Sign out")}
          </Button>
        </div>
      </div>
    </header>
  );
}
