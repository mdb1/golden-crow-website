"use client";

import { useEffect, useState } from "react";
import { MoonStar, SunMedium } from "lucide-react";

import { Button } from "@/components/ui/button";

type AppearanceMode = "light" | "dark";

const STORAGE_KEY = "gc-fitness-appearance";

function resolveAppearance(value: string | null | undefined): AppearanceMode {
  return value === "dark" ? "dark" : "light";
}

function applyAppearance(mode: AppearanceMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document.documentElement.classList.toggle("dark", mode === "dark");
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export function GCFitnessAppearanceToggle() {
  const [mounted, setMounted] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceMode>("light");

  useEffect(() => {
    const fromStorage =
      typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
    const fromDOM = document.documentElement.dataset.theme;
    const current = resolveAppearance(fromStorage ?? fromDOM);
    applyAppearance(current);
    setAppearance(current);
    setMounted(true);
  }, []);

  function handleToggle() {
    const next = appearance === "light" ? "dark" : "light";
    applyAppearance(next);
    setAppearance(next);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 px-2.5 text-xs"
      onClick={handleToggle}
      disabled={!mounted}
      aria-label={appearance === "light" ? "Switch to dark theme" : "Switch to light theme"}
      title={appearance === "light" ? "Switch to dark theme" : "Switch to light theme"}
    >
      {appearance === "light" ? (
        <MoonStar className="h-3.5 w-3.5" />
      ) : (
        <SunMedium className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">{appearance === "light" ? "Dark" : "Light"}</span>
    </Button>
  );
}
