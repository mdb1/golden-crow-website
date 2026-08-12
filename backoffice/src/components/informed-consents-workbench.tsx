"use client";

import { useState } from "react";
import { ExternalLink, FileCheck2, Loader2 } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import {
  SingleFileUpload,
  type SingleFileValue,
} from "@/components/single-file-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";

function formatFileSize(size: number) {
  return `${Math.max(1, Math.round(size / 1000))} KB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
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

  function reportError(error: unknown, fallback: string) {
    setToast({
      id: Date.now(),
      tone: "error",
      message: error instanceof Error ? error.message : fallback,
      details: error instanceof SdkRequestError ? error.details : undefined,
    });
  }

  async function handleUpload() {
    if (!file) {
      setFileError("Select one PDF or image file.");
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
        message: "Consent uploaded.",
      });
    } catch (error) {
      reportError(error, "Unable to upload consent.");
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
      reportError(error, "Unable to load more consents.");
    } finally {
      setLoadingMore(false);
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
      <section className="border-b border-border/70 pb-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">Upload consent</h2>
          <HeaderUnclutterButton />
        </div>
        <div className="grid max-w-3xl gap-5">
          {!isPatientPortal ? (
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
          ) : null}
          <SingleFileUpload
            id={`${surface}-consent-file`}
            label="Consent file"
            value={file}
            onChange={(nextFile) => {
              setFile(nextFile);
              setFileError("");
            }}
            onError={setFileError}
            error={fileError}
          />
          <Button
            type="button"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-fit"
            onClick={() => void handleUpload()}
            disabled={saving || !file || (!isPatientPortal && !patientId)}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Upload consent
          </Button>
        </div>
      </section>

      <section>
        <h2 className="font-heading text-lg font-semibold">Consentimientos</h2>
        {records.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No consent files have been uploaded.
          </p>
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
                        {formatFileSize(record.file.size)} - {formatDate(record.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/api/sdk/2pq/informed-consents/${encodeURIComponent(record.id)}/file`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      Open file
                    </a>
                  </Button>
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
            Load more
          </Button>
        ) : null}
      </section>

      <ActionToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
