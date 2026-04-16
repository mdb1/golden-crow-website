"use client";

import { useEffect, useState } from "react";
import { MonitorCog, MoonStar, SunMedium } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APPEARANCE_STORAGE_KEY,
  resolveAppearance,
  toggleAppearance,
  type AppearanceMode,
} from "@/lib/appearance";

function applyAppearance(mode: AppearanceMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document.documentElement.classList.toggle("dark", mode === "dark");
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
}

function readAppearance(): AppearanceMode {
  return resolveAppearance(document.documentElement.dataset.theme);
}

export function AppearanceToggle() {
  const [appearance, setAppearance] = useState<AppearanceMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const currentAppearance = readAppearance();
    setAppearance(currentAppearance);
    setMounted(true);
  }, []);

  function handleToggle() {
    const nextAppearance = toggleAppearance(appearance);
    applyAppearance(nextAppearance);
    setAppearance(nextAppearance);
  }

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="justify-center px-2 sm:min-w-[116px] sm:justify-start"
        disabled
      >
        <MonitorCog className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Appearance</span>
      </Button>
    );
  }

  const isLight = appearance === "light";

  return (
    <Button
      variant="outline"
      size="sm"
      className="justify-center px-2 sm:min-w-[116px] sm:justify-start"
      onClick={handleToggle}
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      title={`Switch to ${isLight ? "dark" : "light"} mode`}
    >
      {isLight ? (
        <SunMedium className="h-3.5 w-3.5" />
      ) : (
        <MoonStar className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">
        {isLight ? "Light mode" : "Dark mode"}
      </span>
    </Button>
  );
}
