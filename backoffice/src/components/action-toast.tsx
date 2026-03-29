"use client";

import { useEffect } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActionToastState {
  id: number;
  tone: "success" | "error";
  message: string;
}

export function ActionToast({
  toast,
  onDismiss,
}: {
  toast: ActionToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(onDismiss, 2800);
    return () => window.clearTimeout(timeout);
  }, [toast?.id]);

  if (!toast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] w-[min(26rem,calc(100vw-2rem))]">
      <div
        className={cn(
          "pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-sm",
          toast.tone === "success"
            ? "border-emerald-400/35 bg-emerald-50/95 text-emerald-950 dark:bg-emerald-950/90 dark:text-emerald-50"
            : "border-destructive/35 bg-white/96 text-destructive dark:bg-slate-950/92"
        )}
      >
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            toast.tone === "success"
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-200"
              : "bg-destructive/10 text-destructive"
          )}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <CircleAlert className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {toast.tone === "success" ? "Saved" : "Action failed"}
          </p>
          <p className="mt-0.5 text-sm opacity-90">{toast.message}</p>
        </div>
      </div>
    </div>
  );
}
