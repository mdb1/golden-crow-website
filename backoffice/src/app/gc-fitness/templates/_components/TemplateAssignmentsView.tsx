"use client";

// TemplateAssignmentsView.tsx
//
// The "Asignaciones" view of the Entrenamientos library: today/future workout
// assignments grouped by template → client, mirroring the habits assignments
// grouping. Data comes from the `listWorkoutAssignmentGroups` Server Action
// (recurring occurrences collapse into a per-client session count + next date).

import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import { useWorkoutAssignmentGroups } from "@/lib/gc-fitness/library-usage-listeners";

export function TemplateAssignmentsView({ locale }: { locale: string }) {
  const t = useTranslations("templates.list");
  const { data, isLoading } = useWorkoutAssignmentGroups(true);
  const esFirst = locale.startsWith("es");
  const groups = data ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t("assignmentsEmpty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const title =
          (esFirst
            ? g.templateName.es || g.templateName.en
            : g.templateName.en || g.templateName.es) || g.templateId;
        return (
          <Card key={g.templateId} className="overflow-hidden">
            <CardContent className="flex flex-col gap-0 p-0">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
                <h3 className="min-w-0 truncate text-base font-semibold text-foreground">
                  {title}
                </h3>
                <Badge variant="violet" className="shrink-0 font-medium">
                  {t("assignmentsClientCount", { count: g.clientCount })}
                </Badge>
              </div>
              <ul className="divide-y divide-border">
                {g.clients.map((c) => (
                  <li
                    key={c.uid}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <ClientAvatar name={c.name} photoURL={c.photoURL} size="sm" />
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {c.name}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="secondary" className="font-normal">
                        {t("assignmentsSessions", { count: c.sessions })}
                      </Badge>
                      <span>{t("assignmentsNext", { date: c.nextScheduledFor })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
