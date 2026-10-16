"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  Eye,
  FileCheck2,
  FileUp,
  Link2,
  Loader2,
  Search,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAdminContext } from "@/components/admin-context-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import {
  SingleFileUpload,
  type SingleFileValue,
} from "@/components/single-file-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TwoPQRecordDeleteDialog } from "@/components/two-pq-record-delete-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  InformedConsentPage,
  InformedConsentPatientOption,
  InformedConsentPatientPage,
  InformedConsentRecord,
} from "@/lib/informed-consents";
import { isGlobalAdminRole } from "@/lib/admin-areas";
import { appText } from "@/lib/language";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";

function formatFileSize(size: number) {
  return `${Math.max(1, Math.round(size / 1000))} KB`;
}

function formatDate(value: string, locale?: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function mergePatients(
  current: InformedConsentPatientOption[],
  incoming: InformedConsentPatientOption[],
) {
  const patients = new Map(current.map((patient) => [patient.id, patient]));
  incoming.forEach((patient) => patients.set(patient.id, patient));
  return [...patients.values()];
}

function BackofficeConsentDeleteAction({
  record,
  onFinished,
}: {
  record: InformedConsentRecord;
  onFinished: () => void;
}) {
  const adminContext = useAdminContext();
  if (!isGlobalAdminRole(adminContext.role)) return null;

  return (
    <TwoPQRecordDeleteDialog
      areaKey="informed-consents"
      recordId={record.id}
      recordLabel={record.file.name}
      onFinished={onFinished}
    />
  );
}

export function InformedConsentsWorkbench({
  surface,
  initialPage,
  initialPatientPage,
}: {
  surface: "backoffice" | "patient-portal";
  initialPage: InformedConsentPage;
  initialPatientPage?: InformedConsentPatientPage;
}) {
  const isPatientPortal = surface === "patient-portal";
  const t = (text: string) => (isPatientPortal ? appText("es", text) : text);
  const [records, setRecords] = useState(initialPage.records);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [patients, setPatients] = useState(initialPatientPage?.patients ?? []);
  const [patientCursor, setPatientCursor] = useState(
    initialPatientPage?.nextCursor,
  );
  const [patientId, setPatientId] = useState("");
  const [file, setFile] = useState<SingleFileValue | null>(null);
  const [fileError, setFileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [linkFilter, setLinkFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch =
        !query ||
        [
          record.id,
          record.file.name,
          record.patientName,
          record.patientId,
          record.createdByEmail,
          record.caseId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesLink =
        linkFilter === "all" ||
        (linkFilter === "linked" ? Boolean(record.caseId) : !record.caseId);
      const createdDate = record.createdAt.slice(0, 10);
      const matchesFrom = !dateFrom || createdDate >= dateFrom;
      const matchesTo = !dateTo || createdDate <= dateTo;
      return matchesSearch && matchesLink && matchesFrom && matchesTo;
    });
  }, [dateFrom, dateTo, linkFilter, records, searchQuery]);

  function reportError(error: unknown, fallback: string) {
    setToast({
      id: Date.now(),
      tone: "error",
      message:
        error instanceof Error && !isPatientPortal ? error.message : fallback,
      details:
        error instanceof SdkRequestError && !isPatientPortal
          ? error.details
          : undefined,
    });
  }

  async function handleUpload() {
    if (!file) {
      setFileError(t("Select one PDF or image file."));
      return;
    }
    if (!isPatientPortal && !patientId) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Select the patient who owns this consent.",
      });
      return;
    }

    setSaving(true);
    try {
      const { record } = await sdkFetch<{ record: InformedConsentRecord }>(
        "/2pq/informed-consents",
        {
          method: "POST",
          body: JSON.stringify({
            ...(isPatientPortal ? {} : { patientId }),
            file,
          }),
        },
      );
      setRecords((current) => [record, ...current]);
      setFile(null);
      setFileError("");
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Consent uploaded."),
      });
    } catch (error) {
      reportError(error, t("Unable to upload consent."));
    } finally {
      setSaving(false);
    }
  }

  async function loadMoreRecords() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await sdkFetch<InformedConsentPage>(
        `/2pq/informed-consents?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setRecords((current) => [...current, ...page.records]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      reportError(error, t("Unable to load more consents."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function reloadRecords() {
    try {
      const page = await sdkFetch<InformedConsentPage>(
        "/2pq/informed-consents",
      );
      setRecords(page.records);
      setNextCursor(page.nextCursor);
    } catch (error) {
      reportError(error, t("Unable to reload consents."));
    }
  }

  async function loadMorePatients() {
    if (!patientCursor || loadingPatients) return;
    setLoadingPatients(true);
    try {
      const page = await sdkFetch<InformedConsentPatientPage>(
        `/2pq/informed-consents/patients?cursor=${encodeURIComponent(patientCursor)}`,
      );
      setPatients((current) => mergePatients(current, page.patients));
      setPatientCursor(page.nextCursor);
    } catch (error) {
      reportError(error, "Unable to load more patients.");
    } finally {
      setLoadingPatients(false);
    }
  }

  return (
    <div className="space-y-8">
      {isPatientPortal ? (
        <section className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg font-semibold">
              Consentimientos 2PQ
            </h2>
            <HeaderUnclutterButton />
          </div>
          <Button asChild>
            <Link href="/patient-portal/consents/new">
              <FileUp className="size-4" />
              {t("Upload consent")}
            </Link>
          </Button>
        </section>
      ) : (
        <section className="border-b border-border/70 pb-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold">
              {t("Upload consent")}
            </h2>
            <HeaderUnclutterButton />
          </div>
          <div className="grid max-w-3xl gap-5">
            <div className="space-y-2">
              <Label htmlFor="consent-patient">Patient</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger id="consent-patient" className="w-full">
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent align="start">
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.fullName} - {patient.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {patientCursor ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void loadMorePatients()}
                  disabled={loadingPatients}
                >
                  {loadingPatients ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Load more patients
                </Button>
              ) : null}
            </div>
            <SingleFileUpload
              id={`${surface}-consent-file`}
              label={t("Consent file")}
              value={file}
              onChange={(nextFile) => {
                setFile(nextFile);
                setFileError("");
              }}
              onError={setFileError}
              error={fileError}
              uploadLabel={t("Upload file")}
              removeLabel={t("Remove file")}
              emptyLabel={t("No file selected")}
              invalidTypeMessage={t("Select a PDF or supported image file.")}
              readErrorMessage={t("Unable to read the selected file.")}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-fit"
                onClick={() => void handleUpload()}
                disabled={saving || !file || !patientId}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("Upload consent")}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section>
        {!isPatientPortal ? (
          <>
            <h2 className="font-heading text-lg font-semibold">
              Consentimientos 2PQ
            </h2>
            <div className="mt-4 grid gap-3 rounded-xl border border-border/70 bg-background/70 p-4 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_12rem_11rem_11rem_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar archivo, paciente, caso o ID"
                  className="pl-9"
                />
              </div>
              <Select value={linkFilter} onValueChange={setLinkFilter}>
                <SelectTrigger aria-label="Filtrar por vínculo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los vínculos</SelectItem>
                  <SelectItem value="linked">Con caso vinculado</SelectItem>
                  <SelectItem value="unlinked">Sin caso vinculado</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  aria-label="Fecha desde"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  aria-label="Fecha hasta"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchQuery("");
                  setLinkFilter("all");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Limpiar
              </Button>
            </div>
          </>
        ) : null}
        {records.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("No consent files have been uploaded.")}
          </p>
        ) : !isPatientPortal && filteredRecords.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No hay consentimientos que coincidan con los filtros actuales.
          </p>
        ) : !isPatientPortal ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border/70 bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consentimiento</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Caso 2PQ</TableHead>
                  <TableHead>Fecha de carga</TableHead>
                  <TableHead>Última actualización</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <div className="flex min-w-[14rem] items-start gap-3">
                        <FileCheck2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                        <div className="min-w-0">
                          <p className="max-w-[20rem] truncate text-sm font-medium">
                            {record.file.name}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {record.id} · {formatFileSize(record.file.size)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{record.patientName}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {record.patientId}
                      </p>
                    </TableCell>
                    <TableCell>
                      {record.caseId ? (
                        <Link
                          href={`/2pq-dashboard/cases/${encodeURIComponent(record.caseId)}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:underline dark:text-orange-300"
                        >
                          <Link2 className="size-4" />
                          {record.caseId}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Sin vincular
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(record.createdAt, "es-AR")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(record.updatedAt, "es-AR")}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-max justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={`/2pq-dashboard/consents/${encodeURIComponent(record.id)}`}
                          >
                            <Eye className="size-4" />
                            Ver detalle
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`/api/sdk/2pq/informed-consents/${encodeURIComponent(record.id)}/file`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="size-4" />
                            Archivo
                          </a>
                        </Button>
                        <BackofficeConsentDeleteAction
                          record={record}
                          onFinished={() => void reloadRecords()}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-border/70 bg-background">
            <ul className="divide-y divide-border/70">
              {records.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <FileCheck2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {record.file.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {!isPatientPortal
                          ? `${record.patientName} - ${record.patientId} - `
                          : ""}
                        {formatFileSize(record.file.size)} -{" "}
                        {formatDate(
                          record.createdAt,
                          isPatientPortal ? "es-AR" : undefined,
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`/api/sdk/2pq/informed-consents/${encodeURIComponent(record.id)}/file`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="size-4" />
                        {t("Open file")}
                      </a>
                    </Button>
                    {!isPatientPortal ? (
                      <BackofficeConsentDeleteAction
                        record={record}
                        onFinished={() => void reloadRecords()}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {nextCursor ? (
          <Button
            type="button"
            className="mt-4"
            variant="outline"
            onClick={() => void loadMoreRecords()}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("Load more")}
          </Button>
        ) : null}
      </section>

      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={isPatientPortal ? "es" : "en"}
      />
    </div>
  );
}
