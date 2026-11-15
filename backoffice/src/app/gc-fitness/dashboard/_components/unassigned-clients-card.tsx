import Link from "next/link";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import type { UnassignedClientRow } from "@/lib/gc-fitness/coach-attention-actions";

interface Props {
  rows: UnassignedClientRow[];
  /** #513 — the coach has more active clients than were checked. */
  truncated?: boolean;
  /** How many active clients were checked (shown when `truncated`). */
  scanned?: number;
}

/**
 * 260612-e9t (#245): dashboard urgency card. Lists the active clients with
 * NOTHING assigned in the next 4 days (no workout assignment AND no active
 * habit), each linking to the schedule prefiltered to that client so the
 * trainer can assign immediately. Renders an "all caught up" empty state when
 * everyone is covered. Server component (read-only).
 */
export async function UnassignedClientsCard({ rows, truncated = false, scanned = 0 }: Props) {
  const t = await getTranslations("dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="gc-page-title flex items-center gap-2 text-xl">
          <CalendarPlus className="size-5" />
          {t("unassignedSoonTitle")}
        </CardTitle>
        <CardDescription>{t("unassignedSoonSubtitle")}</CardDescription>
        {truncated ? (
          // #513 — say the list is partial instead of silently dropping the
          // clients past the cap (same wording idea as the apps, #1588).
          <p className="text-xs text-muted-foreground" data-testid="unassigned-soon-truncated">
            {t("unassignedSoonTruncated", { count: scanned })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" />
            {truncated
              ? t("unassignedSoonEmptyTruncated", { count: scanned })
              : t("unassignedSoonEmpty")}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <li key={row.uid}>
                <Link
                  href={`/gc-fitness/schedule?clientId=${row.uid}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ClientAvatar name={row.displayName} photoURL={row.photoURL} />
                    <span className="truncate font-medium">
                      {row.displayName}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    tabIndex={-1}
                  >
                    {t("unassignedSoonAssignCta")}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
