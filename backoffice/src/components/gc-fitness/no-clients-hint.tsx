"use client";

// no-clients-hint.tsx — golden-crow-website#535: every client picker that can be
// empty says so AND offers the way out («Agregar un cliente» → Clientes, where
// the add panel lives), instead of a dead-end «No hay clientes.».

import Link from "next/link";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function NoClientsHint({ message, className }: { message: string; className?: string }) {
  const t = useTranslations("clients.emptyPicker");
  return (
    <div
      className={cn("flex flex-col items-center gap-2 text-center text-sm text-muted-foreground", className)}
      data-testid="no-clients-hint"
    >
      <p>{message}</p>
      <Link
        href="/gc-fitness/clients"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UserPlus className="size-4" aria-hidden />
        {t("cta")}
      </Link>
    </div>
  );
}
