import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { listDataHygienePage } from "@/lib/gc-fitness/data-hygiene-actions";

import { DataHygieneFeed } from "./DataHygieneFeed";

export const dynamic = "force-dynamic";

export default async function DataHygienePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  const sp = await searchParams;
  const op = typeof sp.op === "string" ? sp.op : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const offset = typeof sp.offset === "string" ? Number.parseInt(sp.offset, 10) : 0;
  const initialPage = await listDataHygienePage(Number.isFinite(offset) ? offset : 0, 20);

  return (
    <div className="gc-page flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Data hygiene</h1>
          <p className="text-sm text-muted-foreground">
            Inspect orphaned users, chats, images, workouts and other suspicious records before they pile up.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/gc-fitness/admin">Back to admin</Link>
        </Button>
      </div>

      {op && ok === "1" ? (
        <div className="rounded-lg border border-emerald-400/45 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
          Action completed: {op}.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>What this page does</CardTitle>
          <CardDescription>
            The scan is intentionally conservative: it only shows records that look orphaned or structurally odd in the current sample window.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Deletions are explicit, destructive and require a browser confirmation. For users, the action reuses the existing trainer/client cascade logic when possible.
        </CardContent>
      </Card>

      <DataHygieneFeed initialPage={initialPage} />
    </div>
  );
}
