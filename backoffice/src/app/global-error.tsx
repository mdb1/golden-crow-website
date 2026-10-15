"use client";

// global-error.tsx — the last boundary, replacing Next's built-in
// "This page couldn't load" page for anything that escapes every route
// boundary (an error in a layout, or the router itself failing after a
// deploy changed the JS under an open tab).
//
// It replaces the ROOT layout, so no next-intl provider and no portal shell
// exist here: the copy is inline and picked from the browser language. A
// stale tab reloads itself once (see `reloadOntoCurrentDeployment` — latched
// per tab, so it can never loop); anything else gets Reload / Back.

import { useEffect, useState } from "react";

import {
  isStaleDeploymentError,
  reloadOntoCurrentDeployment,
} from "@/lib/gc-fitness/stale-deployment";

import "./globals.css";

const COPY = {
  es: {
    staleTitle: "Hay una versión nueva del sistema",
    staleBody:
      "Esta pestaña quedó en la versión anterior. Recargá para seguir: las rutinas y los planes nutricionales que estabas editando se recuperan solos.",
    title: "Algo salió mal al cargar esta página",
    body: "Recargá la página para intentarlo de nuevo. Si estabas editando una rutina o un plan nutricional, tus cambios se recuperan al volver a abrirlo.",
    reload: "Recargar",
    back: "Volver",
  },
  en: {
    staleTitle: "There is a new version of the system",
    staleBody:
      "This tab is still on the previous version. Reload to keep going — routines and nutrition plans you were editing come back on their own.",
    title: "Something went wrong loading this page",
    body: "Reload the page to try again. If you were editing a routine or a nutrition plan, your changes come back when you reopen it.",
    reload: "Reload",
    back: "Go back",
  },
} as const;

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<"es" | "en">("es");
  const stale = isStaleDeploymentError(error);

  useEffect(() => {
    console.error("[global-error]", error);
    if (!navigator.language.toLowerCase().startsWith("es")) setLang("en");
    if (stale) reloadOntoCurrentDeployment();
  }, [error, stale]);

  const copy = COPY[lang];

  return (
    <html lang={lang}>
      <body className="font-sans antialiased">
        <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="flex max-w-md flex-col gap-4">
            <h1 className="text-xl font-semibold">
              {stale ? copy.staleTitle : copy.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {stale ? copy.staleBody : copy.body}
            </p>
            {error.digest ? (
              <p className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5">{error.digest}</code>
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {copy.reload}
              </button>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="rounded-full border px-4 py-2 text-sm font-medium"
              >
                {copy.back}
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
