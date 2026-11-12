"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { publisherPortalPostLoginRoute } from "@/lib/publisher-portal-routes";
import { sdkFetch } from "@/lib/sdk-client";

export function PublisherProfileCompletion() {
  const router = useRouter();
  const requestRef = useRef<Promise<unknown> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    const request =
      requestRef.current ??
      sdkFetch("/auth/profile-setup/publisher", {
        method: "PUT",
      });
    requestRef.current = request;

    void request
      .then(() => {
        if (active) {
          const callback = new URLSearchParams(window.location.search).get(
            "callbackUrl",
          );
          router.replace(publisherPortalPostLoginRoute(callback));
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, router]);

  function retry() {
    requestRef.current = null;
    setAttempt((current) => current + 1);
  }

  return (
    <main className="fixed inset-0 flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      {failed ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-sm text-red-700">
            No pudimos completar tu acceso al portal de publicadores.
          </p>
          <Button type="button" variant="outline" onClick={retry}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div
          role="status"
          className="flex flex-col items-center gap-3 text-center"
        >
          <Loader2
            aria-hidden="true"
            className="size-6 animate-spin text-violet-600"
          />
          <p className="text-sm text-muted-foreground">
            Accediendo al portal de publicadores
          </p>
        </div>
      )}
    </main>
  );
}
