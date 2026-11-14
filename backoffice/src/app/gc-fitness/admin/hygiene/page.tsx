import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { listDataHygienePage, type DataHygienePage } from "@/lib/gc-fitness/data-hygiene-actions";

import { DataHygieneFeed } from "./DataHygieneFeed";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "Corvo - <adminPanel>" (issue #170).
export const generateMetadata = () => sectionMetadata("adminPanel");

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
  const emptyPage: DataHygienePage = {
    rows: [],
    nextOffset: null,
    hasMore: false,
    summary: {
      user: 0,
      chat: 0,
      photo: 0,
      template: 0,
      assignment: 0,
      log: 0,
      exercise: 0,
    },
  };
  let loadError: string | null = null;
  let initialPage = emptyPage;
  try {
    initialPage = await listDataHygienePage(Number.isFinite(offset) ? offset : 0, 20);
  } catch (err) {
    console.error("[gc-fitness/admin/hygiene] failed to load initial scan", err);
    loadError = err instanceof Error ? err.message : "Unable to load hygiene scan.";
  }

  const t = await getTranslations("admin.hygiene");
  const tc = await getTranslations("admin.common");

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin">
              <ArrowLeft className="h-4 w-4" />
              {tc("backToAdmin")}
            </Link>
          </Button>
        }
      />

      {op && ok === "1" ? (
        <div className="rounded-2xl border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-4 py-3 text-sm text-[color:var(--badge-success-fg)]">
          {tc("actionCompleted", { op })}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("aboutTitle")}</CardTitle>
          <CardDescription>{t("aboutDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("aboutBody")}
        </CardContent>
      </Card>

      <DataHygieneFeed initialPage={initialPage} loadError={loadError} />
    </div>
  );
}
