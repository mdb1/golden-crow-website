"use client";

import { useEffect } from "react";

import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance";
import {
  LANGUAGE_STORAGE_KEY,
  resolveAppLanguage,
} from "@/lib/language";

export function ThemeBootstrap() {
  useEffect(() => {
    try {
      const stored =
        window.localStorage.getItem("gc-fitness-appearance") ??
        window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
      const theme = stored === "light" || stored === "dark" ? stored : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.documentElement.classList.toggle("dark", theme === "dark");
    } catch {
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
      document.documentElement.classList.remove("dark");
    }

    try {
      const language = resolveAppLanguage(
        window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      );
      document.documentElement.lang = language;
      document.documentElement.dataset.language = language;
    } catch {
      document.documentElement.lang = "en";
      document.documentElement.dataset.language = "en";
    }
  }, []);

  return null;
}
