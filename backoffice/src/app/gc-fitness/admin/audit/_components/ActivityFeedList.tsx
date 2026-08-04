// ActivityFeedList.tsx — the admin Monitoring & Observability feed (issue #671).
//
// A day-grouped, newest-first log of what is happening in the app, replacing the
// six-column table of raw Firestore writes. Every row answers WHO · WHAT · TO
// WHAT, and links to the detail: the workout log, the client's god-mode profile,
// the exercise. The actor and the client are their own links, so the row never
// nests one anchor inside another.
//
// Server Component (no interactivity): rendering happens once per filter submit.
// Las horas y el agrupado por día se muestran en la zona del proyecto (#736), no en UTC.

import Link from "next/link";
import {
  Activity,
  CalendarClock,
  Camera,
  Dumbbell,
  ListChecks,
  Repeat,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  ActivityFeedEvent,
  FeedPerson,
} from "@/lib/gc-fitness/activity-feed-actions";
import type { FeedCategory } from "@/lib/gc-fitness/activity-feed-model";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<FeedCategory, React.ComponentType<{ className?: string }>> = {
  workout: Dumbbell,
  schedule: CalendarClock,
  routine: Repeat,
  habit: ListChecks,
  exercise: Sparkles,
  photo: Camera,
  account: UserRound,
  coach: Activity,
  admin: ShieldAlert,
  other: Activity,
};

export const CATEGORY_LABEL: Record<FeedCategory, string> = {
  workout: "Workouts",
  schedule: "Agenda",
  routine: "Rutinas",
  habit: "Hábitos",
  exercise: "Ejercicios",
  photo: "Fotos",
  account: "Cuentas y suscripciones",
  coach: "Acciones de coach",
  admin: "Operaciones de admin",
  other: "Otros",
};

/** Token-based tint per category — no raw hex, both themes work. */
const CATEGORY_TONE: Record<FeedCategory, string> = {
  workout: "bg-chart-3/15 text-chart-3",
  schedule: "bg-chart-1/15 text-chart-1",
  routine: "bg-chart-2/15 text-chart-2",
  habit: "bg-chart-4/15 text-chart-4",
  exercise: "bg-chart-5/15 text-chart-5",
  photo: "bg-primary/15 text-primary",
  account: "bg-chart-1/15 text-chart-1",
  coach: "bg-muted text-foreground",
  admin: "bg-destructive/10 text-destructive",
  other: "bg-muted text-muted-foreground",
};

/**
 * #736 — todo lo de abajo se formatea en la zona horaria del proyecto, no en UTC.
 *
 * ⚠️ **El bug no era sólo la hora.** Estas tres funciones cortaban el ISO como string
 * (`iso.slice(11, 16)`, `iso.slice(0, 10)`), así que el AGRUPADO POR DÍA y los rótulos
 * "Hoy/Ayer" también eran UTC: un evento de las 22:00 de Buenos Aires cae en el día
 * siguiente en UTC y aparecía bajo el encabezado equivocado. Arreglar sólo la hora habría
 * dejado el feed más confuso, no menos — hora local bajo un título de otro día.
 *
 * La zona va FIJA y no sale del browser: esto es un Server Component, así que
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` devolvería la del SERVIDOR (UTC en
 * Vercel), que es exactamente el bug que se está arreglando. Fija también es lo coherente
 * con el resto del producto, donde la fecha civil es la de Buenos Aires (ver los twins de
 * `civil-date`).
 */
/** "2026-07-31T20:37:02.331Z" → "17:37" en la zona pedida. */
function timeOfDay(iso: string | null, timeZone: string): string {
  if (!iso) return "--:--";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "--:--";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ms);
}

/**
 * "2026-07-31T…" → el día CIVIL en el que cayó, que es la clave de agrupado.
 *
 * `en-CA` porque da "YYYY-MM-DD" — el mismo formato que `civilDateFormat`, así que la clave
 * que se calcula acá y el "hoy" que llega por prop son comparables sin normalizar nada.
 */
function dayKey(iso: string | null, timeZone: string): string {
  if (!iso) return "sin fecha";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "sin fecha";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}

function dayLabel(day: string, today: string, timeZone: string): string {
  if (day === today) return `Hoy · ${day}`;
  // Se resta desde el MEDIODÍA y no desde la medianoche: en un día de cambio de horario
  // de verano el día dura 23 o 25 horas, y restar 24 desde las 00:00 cae en el día
  // equivocado. Desde las 12:00 sobra margen en las dos direcciones.
  const yesterday = dayKey(new Date(Date.parse(`${today}T12:00:00.000Z`) - 86_400_000).toISOString(), timeZone);
  if (day === yesterday) return `Ayer · ${day}`;
  return day;
}

function PersonLink({ person, muted }: { person: FeedPerson; muted?: boolean }) {
  const className = cn(
    "font-medium underline-offset-2 hover:underline",
    muted && "text-muted-foreground",
  );
  return person.href ? (
    <Link href={person.href} className={className} title={person.email ?? person.uid ?? ""}>
      {person.name}
    </Link>
  ) : (
    <span className={className} title={person.email ?? person.uid ?? ""}>
      {person.name}
    </span>
  );
}

/** "Terminó un workout" → "terminó un workout" (reads as one sentence after the
 *  actor name, without lowercasing acronyms further along the phrase). */
function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLocaleLowerCase("es") + text.slice(1) : text;
}

function FeedRow({ event, timeZone }: { event: ActivityFeedEvent; timeZone: string }) {
  const Icon = CATEGORY_ICON[event.category] ?? Activity;
  const subject = event.subject?.trim();

  return (
    <li
      className={cn(
        "flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
        event.isDeletion && "bg-destructive/5",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          CATEGORY_TONE[event.category],
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm">
          {event.actor ? <PersonLink person={event.actor} /> : null}
          <span className="text-muted-foreground">
            {event.actor ? lowerFirst(event.title) : event.title}
          </span>
          {subject ? (
            event.href ? (
              <Link
                href={event.href}
                className="font-semibold underline-offset-2 hover:underline [overflow-wrap:anywhere]"
              >
                {subject}
              </Link>
            ) : (
              <span className="font-semibold [overflow-wrap:anywhere]">{subject}</span>
            )
          ) : event.href ? (
            <Link href={event.href} className="text-xs underline underline-offset-2">
              ver detalle
            </Link>
          ) : null}
          {event.client ? (
            <span className="text-muted-foreground">
              {" → "}
              <PersonLink person={event.client} muted />
            </span>
          ) : null}
        </div>

        {event.meta.length > 0 || event.notes?.length ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {event.meta
              .filter((m) => m && m.trim().length > 0)
              .map((m, i) => (
                <span key={`m${i}`} className="[overflow-wrap:anywhere]">
                  {i > 0 ? "· " : ""}
                  {m}
                </span>
              ))}
            {(event.notes ?? []).map((n, i) => (
              <Badge key={`n${i}`} variant="secondary" className="font-normal">
                {n}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {timeOfDay(event.occurredAtISO, timeZone)}
        </span>
        {event.occurrenceCount ? (
          <Badge variant="secondary" className="font-normal">
            ×{event.occurrenceCount}
          </Badge>
        ) : null}
        {event.significance === "low" ? (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            raw
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function ActivityFeedList({
  events,
  today,
  timeZone = "UTC",
  emptyLabel = "No hay eventos para estos filtros.",
}: {
  events: ActivityFeedEvent[];
  /** "YYYY-MM-DD" en `timeZone`, para los rótulos Hoy/Ayer — entra por prop para que esto siga siendo puro. */
  today: string;
  /**
   * Zona del usuario (#736). Default "UTC" para igualar a `getTrainerTimezone()` cuando la
   * cookie no está: sin default, un caller que la omita rompería el formateo en vez de
   * degradar al comportamiento anterior.
   */
  timeZone?: string;
  emptyLabel?: string;
}) {
  if (events.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const days: Array<{ day: string; items: ActivityFeedEvent[] }> = [];
  for (const event of events) {
    const key = dayKey(event.occurredAtISO, timeZone);
    const last = days[days.length - 1];
    if (last && last.day === key) last.items.push(event);
    else days.push({ day: key, items: [event] });
  }

  return (
    <div className="flex flex-col">
      {days.map((group) => (
        <section key={group.day}>
          <h3 className="sticky top-0 z-10 border-y bg-muted/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
            {dayLabel(group.day, today, timeZone)}
            <span className="ml-2 font-normal normal-case">
              {group.items.length} {group.items.length === 1 ? "evento" : "eventos"}
            </span>
          </h3>
          <ul className="divide-y">
            {group.items.map((event) => (
              <FeedRow key={event.id} event={event} timeZone={timeZone} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
