import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileCheck2,
  HardDrive,
  Mail,
  UserRound,
} from "lucide-react";
import { ConsentCaseTraceabilityCard } from "@/components/consent-case-traceability";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InformedConsentDetailPayload } from "@/lib/informed-consents";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-AR", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(date);
}

function formatFileSize(size: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "unit",
    unit: "kilobyte",
    maximumFractionDigits: 1,
  }).format(size / 1000);
}

export function InformedConsentDetailWorkbench({
  initialPayload,
}: {
  initialPayload: InformedConsentDetailPayload;
}) {
  const { record } = initialPayload;
  const fileUrl = `/api/sdk/2pq/informed-consents/${encodeURIComponent(record.id)}/file`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/2pq-dashboard/consents">
            <ArrowLeft className="size-4" />
            Volver a consentimientos
          </Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          {record.id}
        </span>
        <Badge variant="outline">2pq-informed-consent</Badge>
      </div>

      <section className="glass-panel space-y-5 px-5 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <FileCheck2 className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="break-words font-heading text-xl font-semibold">
                {record.file.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Detalle del consentimiento informado
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <HeaderUnclutterButton />
            <Button variant="outline" size="sm" asChild>
              <a href={fileUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Abrir archivo
              </a>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <UserRound className="size-4" /> Paciente
            </div>
            <p className="mt-2 text-sm font-semibold">{record.patientName}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {record.patientId}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="size-4" /> Fecha de carga
            </div>
            <p className="mt-2 text-sm font-semibold">
              {formatDate(record.createdAt)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Actualizado {formatDate(record.updatedAt)}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Mail className="size-4" /> Cargado por
            </div>
            <p className="mt-2 break-all text-sm font-semibold">
              {record.createdByEmail}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <HardDrive className="size-4" /> Archivo
            </div>
            <p className="mt-2 text-sm font-semibold">
              {formatFileSize(record.file.size)}
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {record.file.type}
            </p>
          </div>
        </div>
      </section>

      <ConsentCaseTraceabilityCard initialPayload={initialPayload} />

      <section className="overflow-hidden rounded-[1.4rem] border border-border/70 bg-background shadow-sm">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <h2 className="font-heading text-lg font-semibold">
            Vista previa del archivo
          </h2>
          <span className="text-xs text-muted-foreground">
            {record.file.type}
          </span>
        </div>
        <iframe
          title={`Vista previa de ${record.file.name}`}
          src={fileUrl}
          className="h-[70vh] min-h-[34rem] w-full bg-white"
        />
      </section>
    </div>
  );
}
