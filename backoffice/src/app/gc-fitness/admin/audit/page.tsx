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

import { ActivityFeedList, CATEGORY_LABEL } from "./_components/ActivityFeedList";

// Tab title: "GC Fitness - <adminPanel>" (issue #170).
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
  "exercise",
  "photo",
  "account",
  "coach",
  "admin",
];

const SOURCE_OPTIONS: Array<{ value: "all" | FeedSource; label: string }> = [
  { value: "all", label: "Todas las fuentes" },
  { value: "audit_log", label: "App (writes de Firestore)" },
  { value: "coach_activity", label: "Acciones de coach" },
  { value: "admin_operations", label: "Operaciones de admin" },
  { value: "progress_photos", label: "Fotos de progreso" },
  { value: "habit_logs", label: "Hábitos marcados" },
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
    return SOURCE_OPTIONS.some((o) => o.value === v) ? (v as "all" | FeedSource) : "all";
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
        title="Monitoring & observability"
        subtitle="Qué está pasando en la app: workouts terminados, rutinas y hábitos creados, fotos, altas de usuarios, cambios de suscripción y operaciones de admin. Todo enlaza al detalle."
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin">
              <ArrowLeft className="h-4 w-4" />
              Back to admin
            </Link>
          </Button>
        }
      />

      <PillTabs
        activeKey={tab}
        items={[
          { key: "timeline", label: "Actividad", href: buildTabHref("timeline") },
          { key: "deletions", label: "Eliminaciones", href: buildTabHref("deletions") },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
          <CardDescription>
            El rango de fechas se aplica en la query; el resto filtra la ventana
            cargada en memoria. Horarios en UTC.
          </CardDescription>
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
                Tipo de evento
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
                    {CATEGORY_LABEL[value]}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Fuente
              <select
                name="source"
                defaultValue={source}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Quién (uid / nombre / email)
              <Input name="actor" defaultValue={actorQuery} placeholder="contiene…" className="h-9" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Cliente (uid / nombre / email)
              <Input name="client" defaultValue={clientQuery} placeholder="contiene…" className="h-9" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Desde (UTC)
              <Input name="from" type="date" defaultValue={fromISO} className="h-9" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Hasta (UTC)
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
              Mostrar también los writes de bajo nivel (toques de{" "}
              <span className="font-mono">updatedAt</span>, escrituras por serie
              durante un workout, refrescos de suscripción sin cambio de plan)
            </label>

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" className="rounded-full">
                Aplicar filtros
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={`/gc-fitness/admin/audit?tab=${tab}`}>Limpiar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {tab === "deletions" ? "Eliminaciones" : "Actividad"}
          </CardTitle>
          <CardDescription>
            {tab === "deletions"
              ? "Todo lo que borró datos — bajas de coach/cliente, series de workouts eliminadas, hábitos y ejercicios dados de baja."
              : "Acciones de clientes, coaches y admins en un único feed, de lo más nuevo a lo más viejo."}{" "}
            {events.length} {events.length === 1 ? "evento" : "eventos"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadError ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No se pudo cargar el feed. Probá acotando el rango de fechas.
            </p>
          ) : (
            <ActivityFeedList
              events={events}
              today={today}
              timeZone={timeZone}
              emptyLabel={
                tab === "deletions"
                  ? "No hay eliminaciones para estos filtros."
                  : "No hay eventos para estos filtros."
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
