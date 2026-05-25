"use client";

import { useEffect } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ActionToastState {
  id: number;
  tone: "success" | "error";
  message: string;
  details?: string;
  durationMs?: number;
}

export function ActionToast({
  toast,
  onDismiss,
  onViewLog,
}: {
  toast: ActionToastState | null;
  onDismiss: () => void;
  onViewLog?: (() => void) | null;
}) {
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(
      onDismiss,
      toast.durationMs ?? (toast.tone === "error" ? 15000 : 2800)
    );
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast]);

  if (!toast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-[calc(var(--app-header-height)+1.5rem)] z-[80] w-[min(26rem,calc(100vw-2rem))]">
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
          {toast.tone === "error" && toast.details && onViewLog ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onViewLog}
                className="h-8 border-destructive/25 bg-white/85 text-destructive hover:bg-destructive/5"
              >
                View log
              </Button>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          className={cn(
            "h-8 w-8 shrink-0 rounded-full",
            toast.tone === "success"
              ? "text-emerald-800 hover:bg-emerald-100/80"
              : "text-destructive hover:bg-destructive/8"
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  );
}
