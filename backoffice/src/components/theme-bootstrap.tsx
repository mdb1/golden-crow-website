"use client";

import { useEffect } from "react";

import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance";

export function ThemeBootstrap() {
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
      const theme = stored === "light" || stored === "dark" ? stored : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.documentElement.classList.toggle("dark", theme === "dark");
    } catch {
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
      document.documentElement.classList.remove("dark");
    }
  }, []);

  return null;
}
