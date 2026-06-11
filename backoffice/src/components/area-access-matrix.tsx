"use client";

import type { ComponentProps } from "react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Badge } from "@/components/ui/badge";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/admin-areas";
import { appText } from "@/lib/language";
import {
  CRUD_CAPABILITIES,
  type AccessScope,
  type CrudCapability,
  type RoleAccessSpec,
} from "@/lib/two-pq-dashboard";
import { cn } from "@/lib/utils";

const roleBadgeVariants: Record<AdminRole, ComponentProps<typeof Badge>["variant"]> = {
  full_admin: "destructive",
  institution_admin: "brand",
  institution_doctor: "success",
  patient: "outline",
};

const scopeMeta: Record<
  AccessScope,
  {
    label: string;
    className: string;
  }
> = {
  global: {
    label: "Global",
    className:
      "border-destructive/35 bg-destructive/10 text-destructive dark:border-destructive/35 dark:bg-destructive/15 dark:text-destructive",
  },
  institution: {
    label: "Institution scoped",
    className:
      "border-primary/35 bg-primary/10 text-primary dark:border-primary/35 dark:bg-primary/15 dark:text-primary",
  },
  assigned: {
    label: "Assigned scope",
    className:
      "border-violet-300/55 bg-violet-100 text-violet-800 dark:border-violet-400/35 dark:bg-violet-500/12 dark:text-violet-100",
  },
  read_only: {
    label: "Read only",
    className:
      "border-amber-300/55 bg-amber-100 text-amber-900 dark:border-amber-300/35 dark:bg-amber-400/12 dark:text-amber-100",
  },
  no_access: {
    label: "No access",
    className: "border-border/80 bg-background/55 text-muted-foreground",
  },
};

const capabilityMeta: Record<
  CrudCapability,
  {
    label: string;
    className: string;
  }
> = {
  create: {
    label: "Create",
    className:
      "border-emerald-300/60 bg-emerald-100 text-emerald-800 dark:border-emerald-400/35 dark:bg-emerald-500/12 dark:text-emerald-100",
  },
  read: {
    label: "Read",
    className:
      "border-sky-300/60 bg-sky-100 text-sky-800 dark:border-sky-400/35 dark:bg-sky-500/12 dark:text-sky-100",
  },
  update: {
    label: "Update",
    className:
      "border-violet-300/60 bg-violet-100 text-violet-800 dark:border-violet-400/35 dark:bg-violet-500/12 dark:text-violet-100",
  },
  delete: {
    label: "Delete",
    className:
      "border-rose-300/60 bg-rose-100 text-rose-800 dark:border-rose-400/35 dark:bg-rose-500/12 dark:text-rose-100",
  },
};

export function AreaAccessMatrix({
  title,
  description,
  entries,
  highlightRole,
  compact = false,
  className,
}: {
  title: string;
  description: string;
  entries: RoleAccessSpec[];
  highlightRole?: AdminRole;
  compact?: boolean;
  className?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-lg font-semibold text-foreground">{t(title)}</h3>
        <p className="max-w-3xl text-sm text-muted-foreground">{t(description)}</p>
      </div>

      <div
        className={cn(
          "grid gap-3",
          compact ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4"
        )}
      >
        {entries.map((entry) => (
          <article
            key={entry.role}
            className={cn(
              "rounded-2xl border border-border/70 bg-background/45 px-4 py-4",
              highlightRole === entry.role && "border-primary/45 bg-primary/7"
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={roleBadgeVariants[entry.role]}>
                {t(ADMIN_ROLE_LABELS[entry.role])}
              </Badge>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
                  scopeMeta[entry.scope].className
                )}
              >
                {t(scopeMeta[entry.scope].label)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {CRUD_CAPABILITIES.map((capability) => {
                const isEnabled = entry.capabilities.includes(capability);
                return (
                  <span
                    key={capability}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
                      isEnabled
                        ? capabilityMeta[capability].className
                        : "border-border/70 bg-background/55 text-muted-foreground"
                    )}
                  >
                    {t(capabilityMeta[capability].label)}
                  </span>
                );
              })}
            </div>

            <p className="mt-3 text-sm text-muted-foreground">{t(entry.note)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
