"use client";

import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { appText } from "@/lib/language";

export function PatientPortalHeader() {
  const pathname = usePathname();
  const { language } = useAppLanguage();
  const [pendingSignOut, setPendingSignOut] = useState(false);
  const title =
    pathname === "/patient-portal/my-account"
      ? appText(language, "Patient portal data")
      : pathname === "/patient-portal/consents"
        ? "Consentimientos"
        : appText(language, "Home");

  async function handleSignOut() {
    setPendingSignOut(true);
    try {
      await fetch("/api/sdk/auth/logout", { method: "POST" });
    } catch {
      // The NextAuth session is still cleared if the SDK logout is unavailable.
    } finally {
      await signOut({ callbackUrl: "/patient-portal/login" });
    }
  }

  return (
    <header className="sticky top-0 z-20 h-(--app-header-height) border-b border-border/80 bg-background/90 backdrop-blur-sm">
      <div className="flex h-(--app-header-height) items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="min-w-0 flex-1 truncate font-heading text-lg font-semibold text-foreground">
          {title}
        </h1>
        <AppearanceToggle />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleSignOut()}
          disabled={pendingSignOut}
        >
          {pendingSignOut
            ? appText(language, "Signing out...")
            : appText(language, "Sign out")}
        </Button>
      </div>
    </header>
  );
}
