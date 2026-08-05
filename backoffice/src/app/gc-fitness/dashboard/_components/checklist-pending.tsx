import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PendingChecklistItem } from "@/lib/gc-fitness/coach-checklist-actions";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";

import { ChecklistPendingList } from "./checklist-pending-list";

interface Props {
  items: PendingChecklistItem[];
}

/**
 * Dashboard widget: the coach's overdue + due-today checklist items, with a
 * button to the full checklist. Server component (read-only); toggling /
 * editing happens on the dedicated /gc-fitness/checklist page. Renders nothing
 * when there's nothing pending so it doesn't add noise to a clean dashboard —
 * the header already carries an always-on "Checklist" link for the empty case.
 */
export async function ChecklistPending({ items }: Props) {
  if (items.length === 0) return null;

  // #747 — the due HOUR has to read in the coach's zone, not the server's.
  const [t, timezone] = await Promise.all([
    getTranslations("dashboard"),
    getTrainerTimezone(),
  ]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="gc-page-title flex items-center gap-2 text-xl">
          <ClipboardCheck className="size-5" />
          {t("checklistPendingTitle")}
        </CardTitle>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href="/gc-fitness/checklist">{t("checklistViewAll")}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ChecklistPendingList items={items} timezone={timezone} />
      </CardContent>
    </Card>
  );
}
