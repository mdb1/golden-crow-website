"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  FileCheck2,
  Link2,
  Loader2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CaseConsentTraceabilityPayload,
  InformedConsentDetailPayload,
} from "@/lib/informed-consents";
import { sdkFetch } from "@/lib/sdk-client";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

const traceCardClassName =
  "rounded-[1.4rem] border border-orange-300/90 bg-orange-50/90 px-5 py-5 text-orange-950 shadow-[0_14px_34px_rgba(249,115,22,0.14)] dark:border-orange-300/28 dark:bg-orange-500/12 dark:text-orange-50";

export function ConsentCaseTraceabilityCard({
  initialPayload,
}: {
  initialPayload: InformedConsentDetailPayload;
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [editing, setEditing] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(
    initialPayload.linkedCase?.id ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function persist(caseId: string | null) {
    setPending(true);
    setError("");
    try {
      const nextPayload = await sdkFetch<InformedConsentDetailPayload>(
        `/2pq/informed-consents/${encodeURIComponent(payload.record.id)}/case`,
        {
          method: "PATCH",
          body: JSON.stringify({ caseId }),
        },
      );
      setPayload(nextPayload);
      setSelectedCaseId(nextPayload.linkedCase?.id ?? "");
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo actualizar el vínculo.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={traceCardClassName}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="size-5 text-orange-600 dark:text-orange-300" />
            <h2 className="font-heading text-lg font-semibold">
              Trazabilidad del caso 2PQ
            </h2>
          </div>
          {payload.linkedCase ? (
            <div className="mt-4 space-y-1 text-sm">
              <p className="font-semibold">
                {payload.linkedCase.caseLabel} · {payload.linkedCase.id}
              </p>
              <p className="text-orange-950/70 dark:text-orange-50/70">
                Estado: {payload.linkedCase.caseStatus ?? "Sin estado"} · Última
                actualización: {formatDate(payload.linkedCase.updatedAt)}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-orange-950/70 dark:text-orange-50/70">
              Este consentimiento todavía no está vinculado a un caso 2PQ.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {payload.linkedCase ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                href={`/2pq-dashboard/cases/${encodeURIComponent(payload.linkedCase.id)}`}
              >
                Abrir caso
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing((current) => !current)}
            disabled={pending}
          >
            <Link2 className="size-4" />
            {payload.linkedCase ? "Cambiar" : "Vincular caso"}
          </Button>
          {payload.linkedCase ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void persist(null)}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Unlink className="size-4" />
              )}
              Quitar
            </Button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="mt-5 rounded-xl border border-orange-200 bg-white/70 p-4 dark:border-orange-300/20 dark:bg-orange-950/20">
          <p className="mb-3 text-sm font-medium">
            Seleccione un caso del mismo paciente, institución y médico.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
              <SelectTrigger className="min-w-0 flex-1 bg-white dark:bg-orange-950/30">
                <SelectValue placeholder="Seleccionar caso 2PQ" />
              </SelectTrigger>
              <SelectContent>
                {payload.caseOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.caseLabel} · {option.id}
                    {option.informedConsentId &&
                    option.informedConsentId !== payload.record.id
                      ? ` · reemplaza ${option.informedConsentId}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => void persist(selectedCaseId)}
              disabled={!selectedCaseId || pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmar vínculo
            </Button>
          </div>
          <p className="mt-3 text-xs text-orange-950/65 dark:text-orange-50/65">
            Si el caso o este consentimiento ya tenían otro vínculo, se quitará
            primero y se actualizarán ambos documentos en una sola transacción.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </section>
  );
}

export function CaseConsentTraceabilityCard({
  initialPayload,
  canManage,
}: {
  initialPayload: CaseConsentTraceabilityPayload;
  canManage: boolean;
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [editing, setEditing] = useState(false);
  const [selectedConsentId, setSelectedConsentId] = useState(
    initialPayload.linkedConsent?.id ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    const nextPayload = await sdkFetch<CaseConsentTraceabilityPayload>(
      `/2pq/cases/${encodeURIComponent(payload.case.id)}/informed-consent`,
    );
    setPayload(nextPayload);
    setSelectedConsentId(nextPayload.linkedConsent?.id ?? "");
  }

  async function persist(consentId: string, caseId: string | null) {
    setPending(true);
    setError("");
    try {
      await sdkFetch(
        `/2pq/informed-consents/${encodeURIComponent(consentId)}/case`,
        {
          method: "PATCH",
          body: JSON.stringify({ caseId }),
        },
      );
      await reload();
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo actualizar el vínculo.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={traceCardClassName}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-5 text-orange-600 dark:text-orange-300" />
            <h2 className="font-heading text-lg font-semibold">
              Trazabilidad del consentimiento informado
            </h2>
          </div>
          {payload.linkedConsent ? (
            <div className="mt-4 space-y-1 text-sm">
              <p className="font-semibold">
                {payload.linkedConsent.file.name} · {payload.linkedConsent.id}
              </p>
              <p className="text-orange-950/70 dark:text-orange-50/70">
                Subido por {payload.linkedConsent.createdByEmail} el{" "}
                {formatDate(payload.linkedConsent.createdAt)}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-orange-950/70 dark:text-orange-50/70">
              Este caso todavía no tiene un consentimiento informado vinculado.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {payload.linkedConsent ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                href={`/2pq-dashboard/consents/${encodeURIComponent(payload.linkedConsent.id)}`}
              >
                Abrir consentimiento
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing((current) => !current)}
              disabled={pending}
            >
              <Link2 className="size-4" />
              {payload.linkedConsent ? "Cambiar" : "Vincular consentimiento"}
            </Button>
          ) : null}
          {canManage && payload.linkedConsent ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void persist(payload.linkedConsent!.id, null)
              }
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Unlink className="size-4" />
              )}
              Quitar
            </Button>
          ) : null}
        </div>
      </div>

      {editing && canManage ? (
        <div className="mt-5 rounded-xl border border-orange-200 bg-white/70 p-4 dark:border-orange-300/20 dark:bg-orange-950/20">
          <p className="mb-3 text-sm font-medium">
            Seleccione un consentimiento de {payload.case.patientName}.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              value={selectedConsentId}
              onValueChange={setSelectedConsentId}
            >
              <SelectTrigger className="min-w-0 flex-1 bg-white dark:bg-orange-950/30">
                <SelectValue placeholder="Seleccionar consentimiento" />
              </SelectTrigger>
              <SelectContent>
                {payload.consentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.file.name} · {option.id}
                    {option.caseId && option.caseId !== payload.case.id
                      ? ` · reemplaza ${option.caseId}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() =>
                void persist(selectedConsentId, payload.case.id)
              }
              disabled={!selectedConsentId || pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmar vínculo
            </Button>
          </div>
          <p className="mt-3 text-xs text-orange-950/65 dark:text-orange-50/65">
            El cambio es recíproco: los vínculos anteriores quedan liberados y
            ambas entidades apuntan entre sí al terminar.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </section>
  );
}
