import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  PackageCheck,
  Route,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PGFLEX_ACCOUNT_ROUTE,
  PGFLEX_ENTRY_ROUTE,
} from "@/lib/pgflex-routes";
import { cn } from "@/lib/utils";

type PGFlexQuickAccessCardProps = {
  actionLabel: string;
  body: string;
  href: string;
  icon: LucideIcon;
  title: string;
  tone: "primary" | "secondary" | "neutral";
};

const PGFLEX_ACTIVE_LOGISTICS_HREF = `${PGFLEX_ENTRY_ROUTE}?scope=active`;
const PGFLEX_FINISHED_LOGISTICS_HREF = `${PGFLEX_ENTRY_ROUTE}?scope=finished`;

function PGFlexQuickAccessCard({
  actionLabel,
  body,
  href,
  icon: Icon,
  title,
  tone,
}: PGFlexQuickAccessCardProps) {
  return (
    <article
      className={cn(
        "group relative flex min-h-56 flex-col justify-between overflow-hidden rounded-2xl border px-5 py-5 shadow-[0_18px_56px_-38px_rgba(15,23,42,0.55)] transition duration-200 hover:-translate-y-0.5",
        tone === "primary"
          ? "border-sky-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(240,249,255,0.96)_48%,rgba(219,234,254,0.78))] text-sky-950 hover:border-sky-300 hover:shadow-[0_24px_70px_-38px_rgba(2,132,199,0.48)] dark:border-sky-300/24 dark:bg-[linear-gradient(145deg,rgba(8,47,73,0.96),rgba(12,74,110,0.94)_48%,rgba(14,165,233,0.22))] dark:text-sky-50"
          : tone === "secondary"
            ? "border-emerald-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(236,253,245,0.96)_50%,rgba(240,253,250,0.8))] text-emerald-950 hover:border-emerald-300 hover:shadow-[0_24px_70px_-40px_rgba(5,150,105,0.42)] dark:border-emerald-300/24 dark:bg-[linear-gradient(145deg,rgba(6,78,59,0.96),rgba(6,95,70,0.9)_48%,rgba(20,184,166,0.2))] dark:text-emerald-50"
            : "border-border/80 bg-card/90 text-foreground hover:border-foreground/20 hover:bg-background hover:shadow-[0_22px_62px_-44px_rgba(15,23,42,0.55)] dark:bg-card/80",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"
      />
      <div className="relative flex flex-col gap-4">
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-2xl border shadow-inner",
            tone === "primary"
              ? "border-sky-200 bg-sky-100 text-sky-700"
              : tone === "secondary"
                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                : "border-border bg-background text-foreground",
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
        <Button
          variant={tone === "neutral" ? "outline" : "default"}
          className={cn(
            "h-11 w-full justify-center rounded-xl text-sm font-semibold",
            tone === "primary"
              ? "bg-sky-600 text-white shadow-[0_14px_36px_rgba(2,132,199,0.24)] hover:bg-sky-700"
              : tone === "secondary"
                ? "bg-emerald-600 text-white shadow-[0_14px_36px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
                : "border-foreground/20 bg-background text-foreground shadow-sm hover:bg-muted",
          )}
          asChild
        >
          <Link href={href}>
            {actionLabel}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export default function PGFlexHomePage() {
  return (
    <div className="min-h-[calc(100vh-var(--app-header-height)-3rem)] bg-background px-1 py-3 text-foreground">
      <section className="overflow-hidden rounded-2xl border border-sky-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(240,249,255,0.94)_54%,rgba(236,253,245,0.82))] p-5 shadow-sm dark:border-sky-300/20 dark:bg-[linear-gradient(145deg,rgba(2,6,23,0.96),rgba(8,47,73,0.9)_54%,rgba(6,78,59,0.44))]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-white/86 shadow-inner dark:border-sky-300/20 dark:bg-slate-950/50">
              <img
                src="/pgflex_icon.png"
                alt=""
                aria-hidden="true"
                className="h-9 w-9 object-contain"
              />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">
                Portal PGFlex
              </p>
              <h1 className="mt-1 font-heading text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
                Tus envíos asignados, sin distracciones
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Estás en el portal PGFlex. Desde acá podés revisar envíos
                activos, consultar el historial y entrar a tu cuenta.
              </p>
            </div>
          </div>
          <div className="flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-300/22 dark:bg-emerald-400/10 dark:text-emerald-100">
            <ShieldCheck className="size-3.5" />
            Solo transportista
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">
              Accesos rápidos
            </p>
            <h2 className="mt-1 font-heading text-3xl font-semibold text-foreground">
              Elegí qué necesitás revisar
            </h2>
          </div>
          <Route className="hidden size-6 text-sky-500 sm:block" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <PGFlexQuickAccessCard
            icon={PackageCheck}
            title="Envíos activos"
            body="Abrí la lista de retiros y entregas que todavía requieren seguimiento."
            actionLabel="Ver activos"
            href={PGFLEX_ACTIVE_LOGISTICS_HREF}
            tone="primary"
          />
          <PGFlexQuickAccessCard
            icon={Clock3}
            title="Historial"
            body="Consultá envíos finalizados para revisar recorridos y estados anteriores."
            actionLabel="Ver historial"
            href={PGFLEX_FINISHED_LOGISTICS_HREF}
            tone="secondary"
          />
          <PGFlexQuickAccessCard
            icon={UserRound}
            title="Mi cuenta"
            body="Revisá tus datos de acceso y la información asociada a tu perfil."
            actionLabel="Abrir mi cuenta"
            href={PGFLEX_ACCOUNT_ROUTE}
            tone="neutral"
          />
        </div>
      </section>
    </div>
  );
}
