"use client";

// client-picker.tsx
//
// Renders the trainer's client roster as a list of links to
// /gc-fitness/schedule?clientId=<uid>. Server Component owns the roster
// fetch; this client component renders the interactive list.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ClientRosterEntry } from "@/lib/gc-fitness/client-roster";

interface ClientPickerProps {
  clients: ClientRosterEntry[];
}

export function ClientPicker({ clients }: ClientPickerProps) {
  const t = useTranslations("schedule.clientPicker");
  const tCommon = useTranslations("common");
  const activeClients = clients.filter((c) => !c.pendingProvisioning);
  const pendingClients = clients.filter((c) => c.pendingProvisioning);

  if (clients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("emptyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pickTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose a client to open their weekly workout schedule and assign sessions.
        </p>
      </CardHeader>
      <CardContent>
        {activeClients.length > 0 ? (
          <div className="mb-4 rounded-lg border border-border/70 bg-background/40 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Activos
            </p>
            <ul className="mb-4 flex flex-col gap-1">
              {activeClients.map((c) => (
                <li key={c.uid}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    asChild
                  >
                    <Link href={`/gc-fitness/schedule?clientId=${c.uid}`}>
                      <span className="font-medium">{c.displayName}</span>
                      {c.email && c.email !== c.displayName ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.email}
                        </span>
                      ) : null}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {pendingClients.length > 0 ? (
          <div className="rounded-lg border border-amber-500/35 bg-amber-500/8 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pendientes
            </p>
            <ul className="flex flex-col gap-1">
              {pendingClients.map((c) => (
                <li key={c.uid}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    asChild
                  >
                    <Link href={`/gc-fitness/clients/pending/${encodeURIComponent(c.email)}`}>
                      <span className="font-medium">{c.displayName}</span>
                      <Badge variant="secondary" className="ml-2">
                        {tCommon("pendingSignIn")}
                      </Badge>
                      {c.email && c.email !== c.displayName ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.email}
                        </span>
                      ) : null}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
