import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  FileText,
  type LucideIcon,
  Newspaper,
  PenLine,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE,
  publisherPortalFeedEntryCreateRoute,
} from "@/lib/publisher-portal-routes";
import { cn } from "@/lib/utils";

type PublisherPortalHomeProps = {
  displayName: string;
  email: string;
  roleLabel: string;
  hasPublishedFeedEntry: boolean;
};

type QuickAccessCardProps = {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel: string;
  href?: string;
  disabled?: boolean;
  tone: "primary" | "secondary";
};

function QuickAccessCard({
  icon: Icon,
  title,
  body,
  actionLabel,
  href,
  disabled = false,
  tone,
}: QuickAccessCardProps) {
  const content = (
    <article
      aria-disabled={disabled || undefined}
      className={cn(
        "group relative flex min-h-56 flex-col justify-between overflow-hidden rounded-2xl border px-5 py-5 shadow-[0_18px_56px_-38px_rgba(15,23,42,0.55)] transition duration-200",
        disabled
          ? "border-border/70 bg-muted/35 text-muted-foreground"
          : tone === "primary"
            ? "border-violet-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.96)_48%,rgba(224,242,254,0.72))] text-violet-950 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_24px_70px_-38px_rgba(109,40,217,0.5)] dark:border-violet-400/24 dark:bg-[linear-gradient(145deg,rgba(35,24,73,0.96),rgba(45,31,92,0.94)_48%,rgba(14,116,144,0.24))] dark:text-violet-50"
            : "border-sky-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(240,249,255,0.95)_50%,rgba(236,253,245,0.78))] text-sky-950 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_24px_70px_-40px_rgba(14,116,144,0.45)] dark:border-sky-400/24 dark:bg-[linear-gradient(145deg,rgba(12,35,54,0.96),rgba(15,54,76,0.94)_48%,rgba(16,185,129,0.2))] dark:text-sky-50",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent",
          disabled && "via-muted-foreground/20",
        )}
      />
      <div className="relative flex flex-col gap-4">
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-2xl border shadow-inner",
            disabled
              ? "border-border bg-background/60 text-muted-foreground"
              : tone === "primary"
                ? "border-violet-200 bg-violet-100 text-violet-700"
                : "border-sky-200 bg-sky-100 text-sky-700",
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="space-y-2">
          <h2 className="font-heading text-2xl font-semibold leading-tight">
            {title}
          </h2>
          <p className="text-sm leading-6 opacity-80">{body}</p>
        </div>
      </div>

      <div className="relative mt-6">
        {disabled || !href ? (
          <Button
            type="button"
            disabled
            className="h-11 w-full justify-center rounded-xl"
            variant="outline"
          >
            {actionLabel}
          </Button>
        ) : (
          <Button
            className={cn(
              "h-11 w-full justify-center rounded-xl text-sm font-semibold",
              tone === "primary"
                ? "bg-violet-600 text-white shadow-[0_14px_36px_rgba(109,40,217,0.28)] hover:bg-violet-700"
                : "bg-sky-600 text-white shadow-[0_14px_36px_rgba(2,132,199,0.22)] hover:bg-sky-700",
            )}
            asChild
          >
            <Link href={href}>
              {actionLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        )}
      </div>
    </article>
  );

  return content;
}

export function PublisherPortalHome({
  displayName,
  email,
  roleLabel,
  hasPublishedFeedEntry,
}: PublisherPortalHomeProps) {
  const newFeedEntryHref = publisherPortalFeedEntryCreateRoute();

  return (
    <div className="min-h-[calc(100vh-var(--app-header-height)-3rem)] bg-background px-1 py-3 text-foreground">
      <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Newspaper className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {displayName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {email}
              </span>
            </span>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
            <BadgeCheck className="size-3.5" />
            {roleLabel}
          </span>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
              Tu tablero
            </p>
            <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
              {hasPublishedFeedEntry
                ? "Seguís construyendo tu presencia"
                : "Empezá con una primera nota"}
            </h1>
          </div>
          <Sparkles className="hidden size-6 text-violet-500 sm:block" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {hasPublishedFeedEntry ? (
            <>
              <QuickAccessCard
                icon={BookOpenText}
                title="Ver mis notas publicadas"
                body="Entrá a tu lista para revisar lo que ya está visible y mantener tu actividad ordenada."
                actionLabel="Abrir mis notas"
                href={PUBLISHER_PORTAL_DISCOVER_FEED_ENTRIES_ROUTE}
                tone="secondary"
              />
              <QuickAccessCard
                icon={PenLine}
                title="Crear una nueva entrada"
                body="Compartí una novedad, recurso, evento o actualización útil para la comunidad."
                actionLabel="Crear nueva entrada"
                href={newFeedEntryHref}
                tone="primary"
              />
            </>
          ) : (
            <>
              <QuickAccessCard
                icon={PenLine}
                title="Creá tu primera nota"
                body="Tu portal empieza con una publicación clara: una noticia, un recurso o una invitación para que las personas conozcan tu trabajo."
                actionLabel="Crear mi primera entrada"
                href={newFeedEntryHref}
                tone="primary"
              />
              <QuickAccessCard
                icon={FileText}
                title="Ver mis notas publicadas"
                body="Cuando publiques la primera, este acceso se activa para que puedas volver a verla y seguir editando tu espacio."
                actionLabel="Disponible después de publicar"
                disabled
                tone="secondary"
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
