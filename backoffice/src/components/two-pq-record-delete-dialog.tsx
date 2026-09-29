"use client";

import { useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleX,
  FileCheck2,
  Layers3,
  Link2Off,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

type DeletableAreaKey = "sampling" | "sequencing" | "informed-consents";
type DeletionState = "confirm" | "running" | "success" | "failed";

function deletionCopy(language: "en" | "es", areaKey: DeletableAreaKey) {
  const isSampling = areaKey === "sampling";
  const isConsent = areaKey === "informed-consents";
  if (language === "es") {
    return {
      trigger: isConsent
        ? "Eliminar consentimiento"
        : isSampling
          ? "Eliminar sampling"
          : "Eliminar lote",
      title: isConsent
        ? "Eliminar consentimiento informado"
        : isSampling
          ? "Eliminar sampling 2PQ"
          : "Eliminar lote de secuenciación",
      description: isConsent
        ? "Revisá qué se eliminará y qué registros vinculados se conservarán antes de continuar."
        : isSampling
          ? "Revisá qué ocurrirá con este sampling y su caso antes de continuar."
          : "Revisá qué ocurrirá con el lote y sus casos antes de continuar.",
      recordTitle: isConsent
        ? "Consentimiento y archivo"
        : isSampling
          ? "Registro de sampling"
          : "Lote de secuenciación",
      recordBody: isConsent
        ? "El consentimiento y el PDF o imagen guardado dentro de su registro se eliminarán de forma permanente."
        : isSampling
          ? "El sampling se eliminará de forma permanente."
          : "El lote se eliminará de forma permanente.",
      relationTitle: isConsent
        ? "Paciente y responsables"
        : isSampling
          ? "Caso vinculado"
          : "Casos vinculados",
      relationBody: isConsent
        ? "El paciente, el médico y la institución vinculados se conservan sin cambios."
        : isSampling
          ? "El caso se conserva, se elimina la referencia a este sampling y se resincronizan sus archivos y códigos cuando corresponda."
          : "Los casos se conservan, quedan sin lote padre y se resincronizan sus archivos y códigos cuando corresponda.",
      historicalTitle: isConsent
        ? "Otros registros clínicos"
        : "Registros históricos",
      historicalBody: isConsent
        ? "Casos, formularios, muestras y los demás registros clínicos permanecen intactos."
        : "Los formularios clínicos y demás registros históricos permanecen intactos.",
      warning: isConsent
        ? "Esta acción no se puede deshacer. El archivo está embebido en el consentimiento y se elimina junto con él; no se ejecutan eliminaciones en cascada."
        : "Esta acción no se puede deshacer. Si una sincronización posterior falla, el log mostrará el detalle y la lista se actualizará al finalizar.",
      cancel: "Cancelar",
      delete: isConsent
        ? "Eliminar consentimiento"
        : isSampling
          ? "Eliminar sampling"
          : "Eliminar lote",
      runningTitle: isConsent
        ? "Eliminando consentimiento"
        : isSampling
          ? "Eliminando sampling"
          : "Eliminando lote",
      runningBody: isConsent
        ? "El backend está eliminando el consentimiento y su archivo embebido. No cierres esta ventana."
        : "El backend está actualizando las relaciones y las copias sincronizadas. No cierres esta ventana.",
      successTitle: "Eliminación completada",
      successBody: isConsent
        ? "El consentimiento y su archivo fueron eliminados. Los registros vinculados permanecen intactos."
        : isSampling
          ? "El sampling fue eliminado y su caso vinculado quedó actualizado."
          : "El lote fue eliminado y sus casos vinculados quedaron preservados y actualizados.",
      failedTitle: "La eliminación informó un error",
      failedBody:
        "La operación puede haber completado algunos cambios antes del error. Revisá el log y finalizá para recargar el estado real de la lista.",
      finish: "Finalizar",
      showLog: "Ver log",
      logTitle: "Log de eliminación",
      logDescription:
        "Request, respuesta y detalle técnico capturados para esta operación.",
      closeLog: "Cerrar log",
    };
  }

  return {
    trigger: isConsent
      ? "Delete consent"
      : isSampling
        ? "Delete sampling"
        : "Delete batch",
    title: isConsent
      ? "Delete informed consent"
      : isSampling
        ? "Delete 2PQ sampling"
        : "Delete sequencing batch",
    description: isConsent
      ? "Review what will be deleted and which linked records will be preserved before continuing."
      : isSampling
        ? "Review what will happen to this sampling and its case before continuing."
        : "Review what will happen to this batch and its cases before continuing.",
    recordTitle: isConsent
      ? "Consent and file"
      : isSampling
        ? "Sampling record"
        : "Sequencing batch",
    recordBody: isConsent
      ? "The consent and the PDF or image stored inside its record will be permanently deleted."
      : isSampling
        ? "The sampling will be permanently deleted."
        : "The batch will be permanently deleted.",
    relationTitle: isConsent
      ? "Patient and responsible parties"
      : isSampling
        ? "Linked case"
        : "Linked cases",
    relationBody: isConsent
      ? "The linked patient, doctor, and institution are preserved without changes."
      : isSampling
        ? "The case is preserved, its sampling reference is removed, and its files and codes are synchronized when applicable."
        : "Cases are preserved, their parent batch is removed, and their files and codes are synchronized when applicable.",
    historicalTitle: isConsent
      ? "Other clinical records"
      : "Historical records",
    historicalBody: isConsent
      ? "Cases, forms, samples, and all other clinical records remain intact."
      : "Clinical forms and all other historical records remain intact.",
    warning: isConsent
      ? "This action cannot be undone. The file is embedded in the consent and is deleted with it; no cascading deletions are performed."
      : "This action cannot be undone. If a later synchronization fails, the log will show the details and the list will refresh when you finish.",
    cancel: "Cancel",
    delete: isConsent
      ? "Delete consent"
      : isSampling
        ? "Delete sampling"
        : "Delete batch",
    runningTitle: isConsent
      ? "Deleting consent"
      : isSampling
        ? "Deleting sampling"
        : "Deleting batch",
    runningBody: isConsent
      ? "The backend is deleting the consent and its embedded file. Keep this window open."
      : "The backend is updating relationships and synchronized snapshots. Keep this window open.",
    successTitle: "Deletion complete",
    successBody: isConsent
      ? "The consent and its file were deleted. Linked records remain intact."
      : isSampling
        ? "The sampling was deleted and its linked case was updated."
        : "The batch was deleted and its linked cases were preserved and updated.",
    failedTitle: "Deletion reported an error",
    failedBody:
      "The operation may have completed some changes before the error. Review the log and finish to reload the list's real state.",
    finish: "Finish",
    showLog: "Show log",
    logTitle: "Deletion log",
    logDescription:
      "Captured request, response, and technical details for this operation.",
    closeLog: "Close log",
  };
}

export function TwoPQRecordDeleteDialog({
  areaKey,
  recordId,
  recordLabel,
  trigger,
  onFinished,
}: {
  areaKey: DeletableAreaKey;
  recordId: string;
  recordLabel?: string;
  trigger?: ReactNode;
  onFinished?: () => void;
}) {
  const { language } = useAppLanguage();
  const copy = deletionCopy(language, areaKey);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DeletionState>("confirm");
  const [attempted, setAttempted] = useState(false);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  function reset() {
    setState("confirm");
    setAttempted(false);
    setErrorLog(null);
    setLogOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && state === "running") return;
    setOpen(nextOpen);
    if (!nextOpen) {
      const shouldRefresh = attempted;
      reset();
      if (shouldRefresh) onFinished?.();
    }
  }

  async function runDeletion() {
    const requestPath = `/2pq/${areaKey}/${encodeURIComponent(recordId)}`;
    setAttempted(true);
    setState("running");
    setErrorLog(null);
    setLogOpen(false);
    try {
      await sdkFetch(requestPath, { method: "DELETE" });
      setState("success");
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : language === "es"
            ? "La operación no pudo completarse."
            : "The operation could not be completed.";
      setErrorLog(
        error instanceof SdkRequestError
          ? error.details
          : [
              `Request: DELETE ${requestPath}`,
              `Error name: ${error instanceof Error ? error.name : typeof error}`,
              `Message: ${message}`,
              error instanceof Error && error.stack
                ? `Client stack:\n${error.stack}`
                : null,
            ]
              .filter(Boolean)
              .join("\n\n"),
      );
      setState("failed");
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
              title={copy.trigger}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">{copy.trigger}</span>
            </Button>
          )}
        </DialogTrigger>

        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border",
                  state === "success"
                    ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-600"
                    : state === "failed"
                      ? "border-destructive/35 bg-destructive/10 text-destructive"
                      : "border-destructive/30 bg-destructive/8 text-destructive",
                )}
              >
                {state === "running" ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : state === "success" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : state === "failed" ? (
                  <CircleX className="h-5 w-5" />
                ) : (
                  <Trash2 className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0">
                <DialogTitle>
                  {state === "running"
                    ? copy.runningTitle
                    : state === "success"
                      ? copy.successTitle
                      : state === "failed"
                        ? copy.failedTitle
                        : copy.title}
                </DialogTitle>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {recordLabel ? `${recordLabel} · ` : ""}
                  {recordId}
                </p>
              </div>
            </div>
            <DialogDescription>
              {state === "running"
                ? copy.runningBody
                : state === "success"
                  ? copy.successBody
                  : state === "failed"
                    ? copy.failedBody
                    : copy.description}
            </DialogDescription>
          </DialogHeader>

          {state === "confirm" ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-destructive/30 bg-destructive/6 p-4">
                  <Trash2 className="h-5 w-5 text-destructive" />
                  <p className="mt-3 font-semibold text-foreground">
                    {copy.recordTitle}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {copy.recordBody}
                  </p>
                </div>
                <div className="rounded-md border border-emerald-400/30 bg-emerald-500/6 p-4">
                  <Link2Off className="h-5 w-5 text-emerald-600" />
                  <p className="mt-3 font-semibold text-foreground">
                    {copy.relationTitle}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {copy.relationBody}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-4">
                  <FileCheck2 className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-3 font-semibold text-foreground">
                    {copy.historicalTitle}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {copy.historicalBody}
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-amber-400/35 bg-amber-500/8 px-4 py-3 text-sm leading-6 text-amber-950 dark:text-amber-100">
                {copy.warning}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "flex min-h-40 flex-col items-center justify-center rounded-md border px-6 py-8 text-center",
                state === "success"
                  ? "border-emerald-400/35 bg-emerald-500/6"
                  : state === "failed"
                    ? "border-destructive/35 bg-destructive/6"
                    : "border-primary/30 bg-primary/5",
              )}
            >
              {state === "running" ? (
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
              ) : state === "success" ? (
                <Layers3 className="h-8 w-8 text-emerald-600" />
              ) : (
                <CircleX className="h-8 w-8 text-destructive" />
              )}
              <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
                {state === "running"
                  ? copy.runningBody
                  : state === "success"
                    ? copy.successBody
                    : copy.failedBody}
              </p>
              {state === "failed" && errorLog ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setLogOpen(true)}
                >
                  {copy.showLog}
                </Button>
              ) : null}
            </div>
          )}

          <DialogFooter>
            {state === "confirm" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  {copy.cancel}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void runDeletion()}
                >
                  <Trash2 className="h-4 w-4" />
                  {copy.delete}
                </Button>
              </>
            ) : state === "running" ? (
              <Button type="button" disabled>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {copy.runningTitle}
              </Button>
            ) : (
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {copy.finish}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={logOpen && Boolean(errorLog)}
        onOpenChange={setLogOpen}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{copy.logTitle}</DialogTitle>
            <DialogDescription>{copy.logDescription}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[58vh] overflow-auto rounded-md border bg-muted/45 p-4 text-xs leading-5 whitespace-pre-wrap">
            {errorLog}
          </pre>
          <DialogFooter>
            <Button type="button" onClick={() => setLogOpen(false)}>
              {copy.closeLog}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
