// /gc-fitness/admin/audit — Monitoring & observability (issue #671 redesign).
//
// Reads as a LOG OF WHAT IS HAPPENING IN THE APP, not as a dump of Firestore
// writes: "Manolo terminó un workout · Full Body A · 1 h 2 min · 6.410 kg",
// "Nuevo usuario · marlon@…", "Cambió la suscripción · free → premium". Every
// row links to the thing it talks about.
//
// The old table rendered `audit_log` verbatim, which produced rows like
// `asg-oi1SgX6…-20260821-self-DF2F1298-… · templateSnapshot, updatedAt` — one
// per occurrence of a recurring series, naming nobody and nothing. The
// translation lives in `activity-feed-model.ts` (pure) + `activity-feed-actions.ts`
// (reader); this page is filters + layout.

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { PillTabs } from "@/components/gc-fitness/pill-tabs";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import {
  listActivityFeed,
  type ActivityFeedEvent,
  type FeedSource,
} from "@/lib/gc-fitness/activity-feed-actions";
import type { FeedCategory } from "@/lib/gc-fitness/activity-feed-model";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

import { ActivityFeedList } from "./_components/ActivityFeedList";

// Tab title: "Corvo - <adminPanel>" (issue #170).
export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

/**
 * #762 — the quick-filter checkboxes, in the order they render. `other` is
 * deliberately absent: it is the classifier's fallback for a collection this
 * reader does not know yet, so there is nothing an operator would go looking
 * for under that name. It is unfilterable-by-checkbox and therefore always
 * shown, which is the safe direction (a new event kind stays visible).
 */
const CATEGORY_OPTIONS: FeedCategory[] = [
  "workout",
  "schedule",
  "routine",
  "habit",
  // #949 — `nutrition` was missing from this list while nutrition events were
  // already being classified under it, so checking ANY box hid every nutrition
  // row (an unlisted category can never be in the surviving set).
  "nutrition",
  "exercise",
  "photo",
  "account",
  "coach",
  "admin",
];

const SOURCE_OPTIONS: Array<"all" | FeedSource> = [
  "all",
  "audit_log",
  "coach_activity",
  "admin_operations",
  "progress_photos",
  "habit_logs",
  "nutrition_logs",
];

function str(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** Repeated `?cat=` params — one per checked box. */
function strList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

export default async function AuditPage({
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
  const tab = str(sp.tab) === "deletions" ? "deletions" : "timeline";
  const source = (() => {
    const v = str(sp.source);
    return SOURCE_OPTIONS.some((o) => o === v) ? (v as "all" | FeedSource) : "all";
  })();
  // Checked boxes. An empty set = "todos" (an untouched form and an
  // everything-unchecked form are indistinguishable over the wire — HTML omits
  // unchecked boxes — so both mean no filter).
  const selectedCategories = strList(sp.cat).filter((v): v is FeedCategory =>
    (CATEGORY_OPTIONS as string[]).includes(v),
  );
  const allCategoriesSelected =
    selectedCategories.length === 0 || selectedCategories.length === CATEGORY_OPTIONS.length;
  const actorQuery = str(sp.actor).trim();
  const clientQuery = str(sp.client).trim();
  const fromISO = str(sp.from).trim();
  const toISO = str(sp.to).trim();
  const includeLowSignal = str(sp.raw) === "1";

  let events: ActivityFeedEvent[] = [];
  let loadError = false;
  try {
    events = await listActivityFeed({
      source,
      // All boxes checked ⇒ no filter at all, so `other` (which has no box —
      // see CATEGORY_OPTIONS) keeps showing instead of being filtered out by
      // an all-checked form submit.
      categories: allCategoriesSelected ? [] : selectedCategories,
      actorQuery,
      clientQuery,
      fromISO,
      toISO,
      includeLowSignal,
      deletionsOnly: tab === "deletions",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    loadError = true;
  }

  // #736 — "hoy" en la zona del USUARIO, no del servidor. `new Date().toISOString()`
  // devolvía el día UTC, que en Vercel es el día del servidor: cerca de la medianoche
  // argentina el encabezado "Hoy" se adelantaba y los eventos de la noche caían bajo la
  // fecha de mañana. Misma pareja de helpers que ya usa `workout-assignment-actions`.
  const timeZone = await getTrainerTimezone();
  const today = civilDateFormat(new Date(), timeZone);

  const t = await getTranslations("admin.audit");
  const tc = await getTranslations("admin.common");
  const categoryLabel = (category: FeedCategory): string => {
    switch (category) {
      case "workout":
        return t("categories.workout");
      case "schedule":
        return t("categories.schedule");
      case "routine":
        return t("categories.routine");
      case "habit":
        return t("categories.habit");
      case "nutrition":
        return t("categories.nutrition");
      case "exercise":
        return t("categories.exercise");
      case "photo":
        return t("categories.photo");
      case "account":
        return t("categories.account");
      case "coach":
        return t("categories.coach");
      case "admin":
        return t("categories.admin");
      case "other":
        return t("categories.other");
    }
  };
  const sourceLabel = (value: "all" | FeedSource): string => {
    switch (value) {
      case "all":
        return t("sources.all");
      case "audit_log":
        return t("sources.auditLog");
      case "coach_activity":
        return t("sources.coachActivity");
      case "admin_operations":
        return t("sources.adminOperations");
      case "progress_photos":
        return t("sources.progressPhotos");
      case "habit_logs":
        return t("sources.habitLogs");
      case "nutrition_logs":
        return t("sources.nutritionLogs");
      default:
        return value;
    }
  };

  const buildTabHref = (target: "timeline" | "deletions") => {
    const params = new URLSearchParams();
    params.set("tab", target);
    if (source !== "all") params.set("source", source);
    if (!allCategoriesSelected) {
      for (const c of selectedCategories) params.append("cat", c);
    }
    if (actorQuery) params.set("actor", actorQuery);
    if (clientQuery) params.set("client", clientQuery);
    if (fromISO) params.set("from", fromISO);
    if (toISO) params.set("to", toISO);
    if (includeLowSignal) params.set("raw", "1");
    return `/gc-fitness/admin/audit?${params.toString()}`;
  };

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

      <PillTabs
        activeKey={tab}
        items={[
          { key: "timeline", label: t("tabs.timeline"), href: buildTabHref("timeline") },
          { key: "deletions", label: t("tabs.deletions"), href: buildTabHref("deletions") },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("filters.title")}</CardTitle>
          <CardDescription>{t("filters.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action="/gc-fitness/admin/audit"
            method="get"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <input type="hidden" name="tab" value={tab} />

            {/* #762 — quick filters: todos marcados por defecto, destildar
                para sacar un tipo de evento del feed. */}
            <fieldset className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
              <legend className="text-xs font-medium text-muted-foreground">
                {t("filters.eventType")}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {CATEGORY_OPTIONS.map((value) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      name="cat"
                      value={value}
                      defaultChecked={
                        allCategoriesSelected || selectedCategories.includes(value)
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    {categoryLabel(value)}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("filters.source")}
              <select
                name="source"
                defaultValue={source}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {SOURCE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {sourceLabel(value)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("filters.actor")}
              <Input name="actor" defaultValue={actorQuery} placeholder={t("filters.contains")} className="h-9" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("filters.client")}
              <Input name="client" defaultValue={clientQuery} placeholder={t("filters.contains")} className="h-9" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("filters.from")}
              <Input name="from" type="date" defaultValue={fromISO} className="h-9" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("filters.to")}
              <Input name="to" type="date" defaultValue={toISO} className="h-9" />
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:col-span-2 lg:col-span-3">
              <input
                type="checkbox"
                name="raw"
                value="1"
                defaultChecked={includeLowSignal}
                className="h-4 w-4 rounded border-input"
              />
              {t.rich("filters.lowSignal", {
                code: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </label>

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" className="rounded-full">
                {t("filters.apply")}
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={`/gc-fitness/admin/audit?tab=${tab}`}>{t("filters.clear")}</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {tab === "deletions" ? t("tabs.deletions") : t("tabs.timeline")}
          </CardTitle>
          <CardDescription>
            {tab === "deletions" ? t("deletionsDescription") : t("timelineDescription")}{" "}
            {t("eventCountSentence", { count: events.length })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadError ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {t("loadError")}
            </p>
          ) : (
            <ActivityFeedList
              events={events}
              today={today}
              timeZone={timeZone}
              emptyLabel={
                tab === "deletions" ? t("emptyDeletions") : t("emptyEvents")
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
