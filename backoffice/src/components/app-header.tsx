"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { useAppLanguage } from "@/components/app-language-provider";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import type { AdminContextRecord } from "@/lib/admin-areas";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-areas";
import { appText } from "@/lib/language";
import { getChromeMetadata } from "@/lib/moderation-config";

interface AppHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  adminContext: AdminContextRecord;
}

export function AppHeader({ user, adminContext }: AppHeaderProps) {
  const pathname = usePathname();
  const { language } = useAppLanguage();
  const metadata = getChromeMetadata(pathname);
  const [pendingSignOut, setPendingSignOut] = useState(false);
  const translatedMetadata = {
    eyebrow: appText(language, metadata.eyebrow),
    title: appText(language, metadata.title),
    description: appText(language, metadata.description),
  };

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

  return (
    <header className="sticky top-0 z-20 h-(--app-header-height) border-b border-border/80 bg-background/78 backdrop-blur-sm">
      <div className="flex h-(--app-header-height) items-center gap-3 px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-4" />
      <div className="min-w-0 flex-1">
        <p className="section-eyebrow">{translatedMetadata.eyebrow}</p>
        <div className="flex flex-col gap-0.5 lg:flex-row lg:items-baseline lg:gap-3">
          <h1 className="font-heading text-lg font-semibold text-foreground">
            {translatedMetadata.title}
          </h1>
          <p className="hidden text-sm text-muted-foreground lg:block">
            {translatedMetadata.description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <AppearanceToggle />
        <LanguageToggle />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-foreground">
            {user.name ?? appText(language, "Operator")}
          </p>
          <p className="text-xs text-muted-foreground">
            {user.email ?? appText(language, "Pocket Genes Admin")} ·{" "}
            {appText(language, ADMIN_ROLE_LABELS[adminContext.role])}
          </p>
        </div>
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
