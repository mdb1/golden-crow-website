"use client";

// CoachCard — the signed-in coach identity card that anchors the bottom of the
// GC Fitness sidebar (redesign 2026-06). Mirrors the reference design: avatar +
// name + plan, and tucks the secondary controls (theme, language, sign out)
// behind a dropdown so the rail stays clean.
//
// Display name is derived from the coach email (no extra Firestore read — the
// roster reduction work keeps page loads lean). Theme + locale logic is inlined
// here so the whole footer is a single trigger.

import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut, MoonStar, SunMedium } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getGCFitnessAuth } from "@/lib/firebase/gc-fitness-client";

type AppearanceMode = "light" | "dark";
const APPEARANCE_KEY = "gc-fitness-appearance";

function deriveName(email: string): string {
  const local = email.split("@")[0] ?? "coach";
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Coach"
  );
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "·"
  );
}

function applyAppearance(mode: AppearanceMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document.documentElement.classList.toggle("dark", mode === "dark");
  window.localStorage.setItem(APPEARANCE_KEY, mode);
}

export function CoachCard({
  email,
  isAdmin,
}: {
  email: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("shell");
  const tLang = useTranslations("shell.languagePicker");
  const [appearance, setAppearance] = useState<AppearanceMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(APPEARANCE_KEY);
    const current: AppearanceMode = stored === "dark" ? "dark" : "light";
    setAppearance(current);
    setMounted(true);
  }, []);

  const name = deriveName(email);
  const plan = isAdmin ? "Admin" : "Coach";

  function toggleAppearance() {
    const next: AppearanceMode = appearance === "light" ? "dark" : "light";
    applyAppearance(next);
    setAppearance(next);
  }

  async function setLocale(choice: "auto" | "en" | "es") {
    try {
      await fetch("/api/gc-fitness/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: choice }),
      });
    } catch {
      // best-effort — refresh re-resolves on the server anyway
    }
    router.refresh();
  }

  async function handleSignOut() {
    try {
      await signOut(getGCFitnessAuth());
    } catch {
      // best-effort — server cookie clear is the source of truth
    }
    try {
      await fetch("/api/gc-fitness/logout", { method: "POST" });
    } catch {
      // best-effort
    }
    window.location.href = "/gc-fitness/login";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-2xl border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {initials(name)}
          </span>
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold text-sidebar-foreground">
              {name}
            </span>
            <span className="block truncate text-xs text-sidebar-foreground/65">
              {plan} {isAdmin ? "" : "Premium"}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!mounted}
          onSelect={(e) => {
            e.preventDefault();
            toggleAppearance();
          }}
        >
          {appearance === "light" ? (
            <MoonStar className="h-4 w-4" />
          ) : (
            <SunMedium className="h-4 w-4" />
          )}
          {appearance === "light" ? t("themeDark") : t("themeLight")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {tLang("label")}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setLocale("auto")}>
          {tLang("auto")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocale("en")}>
          {tLang("english")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocale("es")}>
          {tLang("spanish")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleSignOut()} variant="destructive">
          <LogOut className="h-4 w-4" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
