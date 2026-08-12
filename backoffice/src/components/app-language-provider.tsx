"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LANGUAGE_COOKIE_NAME,
  LANGUAGE_STORAGE_KEY,
  resolveAppLanguage,
  type AppLanguage,
} from "@/lib/language";

type AppLanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

function applyLanguage(language: AppLanguage) {
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; max-age=31536000; samesite=lax`;
}

function readStoredLanguage(initialLanguage: AppLanguage) {
  try {
    return resolveAppLanguage(
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ??
        document.documentElement.dataset.language ??
        initialLanguage
    );
  } catch {
    return initialLanguage;
  }
}

export function AppLanguageProvider({
  initialLanguage = "en",
  forcedLanguage,
  children,
}: {
  initialLanguage?: AppLanguage;
  forcedLanguage?: AppLanguage;
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<AppLanguage>(
    forcedLanguage ?? initialLanguage,
  );

  useEffect(() => {
    if (forcedLanguage) {
      setLanguageState(forcedLanguage);
      document.documentElement.lang = forcedLanguage;
      document.documentElement.dataset.language = forcedLanguage;
      return;
    }

    const storedLanguage = readStoredLanguage(initialLanguage);
    setLanguageState(storedLanguage);
    applyLanguage(storedLanguage);
  }, [forcedLanguage, initialLanguage]);

  const value = useMemo<AppLanguageContextValue>(
    () => ({
      language,
      setLanguage(nextLanguage) {
        if (forcedLanguage) {
          return;
        }
        setLanguageState(nextLanguage);
        applyLanguage(nextLanguage);
      },
    }),
    [forcedLanguage, language]
  );

  return (
    <AppLanguageContext.Provider value={value}>
      {children}
    </AppLanguageContext.Provider>
  );
}

export function useAppLanguage() {
  const context = useContext(AppLanguageContext);
  if (!context) {
    throw new Error("useAppLanguage must be used inside AppLanguageProvider");
  }
  return context;
}
