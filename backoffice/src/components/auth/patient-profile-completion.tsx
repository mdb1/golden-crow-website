"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sdkFetch } from "@/lib/sdk-client";

export function PatientProfileCompletion() {
  const router = useRouter();
  const requestRef = useRef<Promise<unknown> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    const request =
      requestRef.current ??
      sdkFetch("/auth/profile-setup/patient", {
        method: "PUT",
      });
    requestRef.current = request;

    void request
      .then(() => {
        if (active) {
          router.replace("/patient-portal/home");
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
    <main className="fixed inset-0 flex min-h-screen items-center justify-center bg-white px-5 text-slate-950">
      {failed ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-sm text-red-700">
            No pudimos completar tu acceso al portal de pacientes.
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
            className="size-6 animate-spin text-blue-600"
          />
          <p className="text-sm text-slate-600">
            Accediendo al portal de pacientes
          </p>
        </div>
      )}
    </main>
  );
}
