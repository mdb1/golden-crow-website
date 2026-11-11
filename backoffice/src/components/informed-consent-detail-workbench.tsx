import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  HardDrive,
  Mail,
  UserRound,
} from "lucide-react";
import { ConsentCaseTraceabilityCard } from "@/components/consent-case-traceability";
import { InformedConsentDetailHeader } from "@/components/informed-consent-detail-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  informedConsentFileHref,
  type InformedConsentDetailPayload,
  type InformedConsentStudyRequest,
} from "@/lib/informed-consents";

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
  reviewRequest,
}: {
  initialPayload: InformedConsentDetailPayload;
  reviewRequest: InformedConsentStudyRequest | null;
}) {
  const { record } = initialPayload;
  const uploadedAt = reviewRequest?.consent.uploadedAt;
  const fileUrl = informedConsentFileHref(record.id);
  const previewUrl = uploadedAt
    ? `${fileUrl}?version=${encodeURIComponent(uploadedAt)}`
    : fileUrl;

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
        <InformedConsentDetailHeader
          key={record.id}
          consentId={record.id}
          fileName={record.file.name}
          reviewStatus={record.reviewStatus}
          reviewRequest={reviewRequest}
        />

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
          src={previewUrl}
          className="h-[70vh] min-h-[34rem] w-full bg-white"
        />
      </section>
    </div>
  );
}
