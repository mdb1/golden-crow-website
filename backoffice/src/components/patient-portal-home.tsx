import Link from "next/link";
import {
  ArrowRight,
  FileCheck2,
  FileClock,
  FilePenLine,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { InformedConsentPatientHomeStatus } from "@/lib/informed-consents";
import { cn } from "@/lib/utils";

type PatientHomeAction = {
  actionLabel: string;
  body: string;
  href: string;
  icon: LucideIcon;
  title: string;
};

type PatientHomeCardProps = PatientHomeAction & {
  tone: "primary" | "neutral";
};

function consentActionForStatus(
  status: InformedConsentPatientHomeStatus | null,
): PatientHomeAction {
  if (!status) {
    return {
      actionLabel: "Abrir consentimientos",
      body: "Ingresá para firmar un consentimiento, continuar un borrador o consultar los que ya enviaste.",
      href: "/patient-portal/consents",
      icon: FileCheck2,
      title: "Gestionar consentimientos informados",
    };
  }

  if (status.hasDraft) {
    return {
      actionLabel: "Continuar desde borrador",
      body: "Retomá el proceso exactamente donde lo dejaste. Tu avance guardado sigue disponible.",
      href: "/patient-portal/consents/new?draft=1",
      icon: FileClock,
      title: "Continuar firma de consentimiento informado",
    };
  }

  if (status.hasSignedConsent) {
    return {
      actionLabel: "Ver consentimientos",
      body: "Consultá los consentimientos que ya completaste y accedé a sus archivos cuando lo necesites.",
      href: "/patient-portal/consents",
      icon: FileCheck2,
      title: "Ver consentimientos informados ya firmados",
    };
  }

  return {
    actionLabel: "Comenzar firma",
    body: "Completá el proceso guiado para leer, firmar y presentar tu consentimiento de forma segura.",
    href: "/patient-portal/consents/new",
    icon: FilePenLine,
    title: "Firmar consentimiento informado",
  };
}

function PatientHomeCard({
  actionLabel,
  body,
  href,
  icon: Icon,
  title,
  tone,
}: PatientHomeCardProps) {
  return (
    <article className="min-w-0">
      <Link
        href={href}
        aria-label={`${title}. ${actionLabel}`}
        className={cn(
          "group relative flex min-h-64 h-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border px-5 py-5 shadow-[0_18px_56px_-38px_rgba(15,23,42,0.55)] transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          tone === "primary"
            ? "border-violet-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.98)_48%,rgba(224,242,254,0.72))] text-violet-950 hover:border-violet-300 hover:shadow-[0_24px_70px_-38px_rgba(109,40,217,0.5)] dark:border-violet-400/24 dark:bg-[linear-gradient(145deg,rgba(35,24,73,0.96),rgba(45,31,92,0.94)_48%,rgba(14,116,144,0.24))] dark:text-violet-50"
            : "border-border/80 bg-card/90 text-foreground hover:border-foreground/20 hover:bg-background hover:shadow-[0_22px_62px_-44px_rgba(15,23,42,0.55)] dark:bg-card/80",
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"
        />

        <div className="relative flex min-w-0 flex-col gap-4">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-2xl border shadow-inner",
              tone === "primary"
                ? "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-300/25 dark:bg-violet-400/12 dark:text-violet-200"
                : "border-border bg-background text-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>

          <div className="min-w-0 space-y-2">
            <h2 className="text-balance font-heading text-xl font-semibold leading-snug sm:text-2xl">
              {title}
            </h2>
            <p className="max-w-2xl text-sm leading-6 opacity-80">{body}</p>
          </div>
        </div>

        <span
          className={cn(
            "relative mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-center text-sm font-semibold transition-colors",
            tone === "primary"
              ? "bg-violet-600 text-white shadow-[0_14px_36px_rgba(109,40,217,0.28)] group-hover:bg-violet-700"
              : "border border-foreground/20 bg-background text-foreground shadow-sm group-hover:bg-muted",
          )}
        >
          {actionLabel}
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </span>
      </Link>
    </article>
  );
}

export function PatientPortalHome({
  status,
}: {
  status: InformedConsentPatientHomeStatus | null;
}) {
  const consentAction = consentActionForStatus(status);

  return (
    <div className="mx-auto min-h-[calc(100vh-var(--app-header-height)-3rem)] w-full max-w-5xl bg-background px-1 py-3 text-foreground">
      <section aria-labelledby="patient-home-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200">
              Tu portal
            </p>
            <h1
              id="patient-home-heading"
              className="mt-1 text-balance font-heading text-3xl font-semibold text-foreground"
            >
              Elegí cómo continuar
            </h1>
          </div>
          <Sparkles
            aria-hidden="true"
            className="hidden size-6 text-violet-500 sm:block"
          />
        </div>

        <div className="grid items-stretch gap-4 md:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
          <PatientHomeCard {...consentAction} tone="primary" />
          <PatientHomeCard
            icon={UserRound}
            title="Mi cuenta"
            body="Revisá tus datos personales y la información vinculada a tu acceso."
            actionLabel="Abrir mi cuenta"
            href="/patient-portal/my-account"
            tone="neutral"
          />
        </div>
      </section>
    </div>
  );
}
