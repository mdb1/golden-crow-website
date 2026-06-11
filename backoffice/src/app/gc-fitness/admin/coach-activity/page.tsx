import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { listRecentCoachActivity } from "@/lib/gc-fitness/admin-actions";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "GC Fitness - <adminPanel>" (issue #170).
export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

export default async function CoachActivityPage() {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  const rows = await listRecentCoachActivity(160);

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title="Recent coach activity"
        subtitle="High-level usage events with recurring workout assignments collapsed into single rows."
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin">Back to admin</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Activity stream</CardTitle>
          <CardDescription>
            Events include coach actions, client first logins and recurrence summaries.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When (UTC)</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Recurrence</TableHead>
                  <TableHead>Occurrences</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground" colSpan={7}>
                      No recent coach activity found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.occurredAtISO ?? "—"}</TableCell>
                      <TableCell>
                        <Link
                          href={`/gc-fitness/admin/coaches/${row.coachUid}`}
                          className="font-medium underline underline-offset-2"
                        >
                          {row.coachName}
                        </Link>
                        <div className="text-xs text-muted-foreground">{row.coachEmail}</div>
                      </TableCell>
                      <TableCell>{row.summary}</TableCell>
                      <TableCell>
                        {row.clientUid || row.clientEmail ? (
                          <div className="space-y-0.5">
                            <div className="font-mono text-xs">{row.clientUid ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{row.clientEmail ?? "—"}</div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.recurrenceLabel ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.occurrences ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.kind}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
