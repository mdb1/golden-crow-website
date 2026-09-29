"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleMinus,
  CircleX,
  FileArchive,
  FileJson2,
  FlaskConical,
  LoaderCircle,
  PartyPopper,
  ScrollText,
  Trash2,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const RELATED_DELETION_STEPS = [
  "form_links",
  "samplings",
  "service_transaction",
  "files_and_codes",
  "case",
] as const;

type DeletionStep = (typeof RELATED_DELETION_STEPS)[number];
type DeletionScope = "case" | "related";
type ServerStepResult = {
  step: DeletionStep;
  status: "deleted" | "not_found";
  deletedCount: number;
  message: string;
  details?: string[];
};
type FailedStepResult = {
  step: DeletionStep;
  status: "failed";
  deletedCount: 0;
  message: string;
  log: string;
  details?: string[];
};
type PreservedStepResult = {
  step: DeletionStep;
  status: "preserved";
  deletedCount: 0;
  message: string;
  details?: string[];
};
type StepResult = ServerStepResult | FailedStepResult | PreservedStepResult;

const STEP_ICONS = {
  form_links: ScrollText,
  samplings: FlaskConical,
  service_transaction: FileJson2,
  files_and_codes: FileArchive,
  case: Trash2,
} satisfies Record<DeletionStep, typeof Trash2>;

function deletionCopy(language: "en" | "es") {
  return language === "es"
    ? {
        trigger: "Eliminar caso",
        title: "Eliminar caso 2PQ",
        description:
          "Elegí exactamente qué querés eliminar. El proceso se ejecutará por etapas y no se puede deshacer.",
        caseOnly: "Eliminar solo el caso",
        caseOnlyBody:
          "Elimina el caso y lo quita de su lote. Los samplings se conservan desvinculados; también permanecen los formularios, archivos, códigos y la transacción de servicio.",
        related: "Eliminar caso y todo lo relacionado",
        relatedBody:
          "Desvincula formularios y elimina samplings, logs de estado, la transacción de servicio, el PDF, objetos, archivos, reporte, códigos y finalmente el caso.",
        safety:
          "Cada artefacto se valida contra este caso antes de borrarse. Si una relación no coincide, el proceso se detiene y el caso permanece disponible.",
        cancel: "Cancelar",
        startCase: "Eliminar solo el caso",
        startRelated: "Iniciar limpieza completa",
        runningTitle: "Eliminando caso 2PQ",
        runningBody:
          "Las etapas se procesan una por una. No cierres esta ventana hasta que termine.",
        completeTitle: "Eliminación completada",
        completeBody:
          "Felicitaciones, el caso y el alcance seleccionado se procesaron correctamente.",
        failedTitle: "La eliminación se detuvo",
        failedBody:
          "Una etapa no pudo completarse. Las etapas posteriores no se ejecutaron y el caso no se borró si todavía no se había alcanzado el último paso.",
        close: "Finalizar",
        processing: "Procesando",
        deleted: "Eliminado",
        notFound: "No disponible",
        preserved: "Conservado",
        pending: "Pendiente",
        failed: "Falló",
        showLog: "Ver log",
        logTitle: "Log de la etapa",
        logDescription:
          "Request, respuesta y detalle técnico capturados para esta etapa fallida.",
        closeLog: "Cerrar log",
        records: "elementos",
        labels: {
          form_links: "Formularios y logs de estado",
          samplings: "Samplings vinculados",
          service_transaction: "Transacción y salida PDF",
          files_and_codes: "Archivo, reporte y códigos",
          case: "Caso 2PQ",
        },
        preservedMessages: {
          form_links: "Los formularios y logs permanecen intactos.",
          samplings: "Los samplings permanecen y se desvinculan del caso.",
          service_transaction: "La transacción y su salida permanecen intactas.",
          files_and_codes: "Los archivos, reportes y códigos permanecen intactos.",
        },
      }
    : {
        trigger: "Delete case",
        title: "Delete 2PQ case",
        description:
          "Choose exactly what to delete. The process runs in stages and cannot be undone.",
        caseOnly: "Delete only the case",
        caseOnlyBody:
          "Deletes the case and removes it from its batch. Samplings are preserved and unlinked; forms, files, codes, and the service transaction also remain.",
        related: "Delete case and everything related",
        relatedBody:
          "Detaches forms and deletes samplings, status logs, the service transaction, PDF output, objects, files, report, codes, and finally the case.",
        safety:
          "Every artifact is validated against this case before deletion. A mismatched relationship stops the process and preserves the case.",
        cancel: "Cancel",
        startCase: "Delete only the case",
        startRelated: "Start full cleanup",
        runningTitle: "Deleting 2PQ case",
        runningBody:
          "Stages are processed one by one. Keep this window open until the process finishes.",
        completeTitle: "Deletion complete",
        completeBody:
          "Congratulations, the case and selected scope were processed successfully.",
        failedTitle: "Deletion stopped",
        failedBody:
          "A stage could not be completed. Later stages were not run, and the case was preserved if the final step had not been reached.",
        close: "Finish",
        processing: "Processing",
        deleted: "Deleted",
        notFound: "Not available",
        preserved: "Preserved",
        pending: "Pending",
        failed: "Failed",
        showLog: "Show log",
        logTitle: "Stage log",
        logDescription:
          "Captured request, response, and technical details for this failed stage.",
        closeLog: "Close log",
        records: "items",
        labels: {
          form_links: "Forms and status logs",
          samplings: "Linked samplings",
          service_transaction: "Transaction and PDF output",
          files_and_codes: "File, report, and codes",
          case: "2PQ case",
        },
        preservedMessages: {
          form_links: "Forms and status logs remain intact.",
          samplings: "Samplings remain and are unlinked from the case.",
          service_transaction: "The transaction and its output remain intact.",
          files_and_codes: "Files, reports, and codes remain intact.",
        },
      };
}

export function TwoPQCaseDeleteDialog({
  caseId,
  caseLabel,
  trigger,
  onFinished,
}: {
  caseId: string;
  caseLabel?: string;
  trigger?: ReactNode;
  onFinished?: () => void;
}) {
  const { language } = useAppLanguage();
  const copy = deletionCopy(language);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<DeletionScope>("case");
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentStep, setCurrentStep] = useState<DeletionStep | null>(null);
  const [results, setResults] = useState<StepResult[]>([]);
  const [selectedLog, setSelectedLog] = useState<FailedStepResult | null>(null);
  const executionSteps =
    scope === "related" ? RELATED_DELETION_STEPS : (["case"] as const);
  const resultByStep = useMemo(
    () => new Map(results.map((result) => [result.step, result])),
    [results],
  );
  const completedExecutionSteps = executionSteps.filter((step) =>
    resultByStep.has(step),
  ).length;
  const progress =
    executionSteps.length > 0
      ? (completedExecutionSteps / executionSteps.length) * 100
      : 0;
  const failed = results.some((result) => result.status === "failed");
  const caseDeleted = resultByStep.get("case")?.status === "deleted";

  function reset() {
    setScope("case");
    setRunning(false);
    setFinished(false);
    setCurrentStep(null);
    setResults([]);
    setSelectedLog(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && running) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      const shouldRefresh = caseDeleted;
      reset();
      if (shouldRefresh) onFinished?.();
    }
  }

  async function runDeletion() {
    const preservedResults: PreservedStepResult[] =
      scope === "case"
        ? RELATED_DELETION_STEPS.filter((step) => step !== "case").map(
            (step) => ({
              step,
              status: "preserved" as const,
              deletedCount: 0 as const,
              message:
                copy.preservedMessages[
                  step as keyof typeof copy.preservedMessages
                ],
            }),
          )
        : [];
    setResults(preservedResults);
    setRunning(true);
    setFinished(false);

    for (const step of executionSteps) {
      setCurrentStep(step);
      const requestPath = `/2pq/cases/${encodeURIComponent(caseId)}/deletion/${step}?scope=${scope}`;
      try {
        const result = await sdkFetch<ServerStepResult>(requestPath, {
          method: "DELETE",
        });
        setResults((current) => [...current, result]);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : language === "es"
              ? "La etapa no pudo completarse."
              : "The stage could not be completed.";
        const log =
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
                .join("\n\n");
        setResults((current) => [
          ...current,
          { step, status: "failed", deletedCount: 0, message, log },
        ]);
        break;
      }
    }

    setCurrentStep(null);
    setRunning(false);
    setFinished(true);
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
        <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border",
                  finished && !failed
                    ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-600"
                    : "border-destructive/30 bg-destructive/8 text-destructive",
                )}
              >
                {running ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : finished && !failed ? (
                  <PartyPopper className="h-5 w-5" />
                ) : (
                  <Trash2 className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0">
                <DialogTitle>
                  {running
                    ? copy.runningTitle
                    : finished
                      ? failed
                        ? copy.failedTitle
                        : copy.completeTitle
                      : copy.title}
                </DialogTitle>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {caseLabel ? `${caseLabel} · ` : ""}
                  {caseId}
                </p>
              </div>
            </div>
            <DialogDescription>
              {running
                ? copy.runningBody
                : finished
                  ? failed
                    ? copy.failedBody
                    : copy.completeBody
                  : copy.description}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {!running && !finished ? (
              <div className="space-y-4">
                <RadioGroup
                  value={scope}
                  onValueChange={(value) => setScope(value as DeletionScope)}
                  className="grid gap-3 md:grid-cols-2"
                >
                  <label
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-md border p-5 transition-colors",
                      scope === "case"
                        ? "border-primary bg-primary/6"
                        : "border-border hover:bg-muted/45",
                    )}
                  >
                    <RadioGroupItem value="case" className="mt-0.5" />
                    <span>
                      <span className="block font-semibold text-foreground">
                        {copy.caseOnly}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                        {copy.caseOnlyBody}
                      </span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-md border p-5 transition-colors",
                      scope === "related"
                        ? "border-destructive bg-destructive/6"
                        : "border-border hover:bg-muted/45",
                    )}
                  >
                    <RadioGroupItem value="related" className="mt-0.5" />
                    <span>
                      <span className="block font-semibold text-foreground">
                        {copy.related}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                        {copy.relatedBody}
                      </span>
                    </span>
                  </label>
                </RadioGroup>
                <div className="rounded-md border border-amber-400/35 bg-amber-500/8 px-4 py-3 text-sm leading-6 text-amber-950 dark:text-amber-100">
                  {copy.safety}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {currentStep
                        ? `${copy.processing}: ${copy.labels[currentStep]}`
                        : finished
                          ? failed
                            ? copy.failedTitle
                            : copy.completeTitle
                          : copy.pending}
                    </span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {RELATED_DELETION_STEPS.map((step) => {
                    const result = resultByStep.get(step);
                    const StepIcon = STEP_ICONS[step];
                    const isCurrent = currentStep === step;
                    return (
                      <div
                        key={step}
                        className={cn(
                          "rounded-md border p-4",
                          isCurrent
                            ? "border-primary/45 bg-primary/6"
                            : result?.status === "failed"
                              ? "border-destructive/45 bg-destructive/6"
                              : result?.status === "deleted"
                                ? "border-emerald-400/35 bg-emerald-500/6"
                                : "border-border",
                          step === "case" ? "md:col-span-2" : "",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                              {isCurrent ? (
                                <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                              ) : result?.status === "failed" ? (
                                <CircleX className="h-4 w-4 text-destructive" />
                              ) : result?.status === "deleted" ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : result?.status === "not_found" ||
                                result?.status === "preserved" ? (
                                <CircleMinus className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <StepIcon className="h-4 w-4 text-muted-foreground" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">
                                {copy.labels[step]}
                              </p>
                              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                                {result?.message ?? copy.pending}
                              </p>
                              {result?.details?.length ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {result.details.map((detail) => (
                                    <Badge key={detail} variant="outline">
                                      {detail}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <Badge
                            variant={
                              result?.status === "failed"
                                ? "destructive"
                                : result?.status === "deleted"
                                  ? "success"
                                  : "outline"
                            }
                          >
                            {isCurrent
                              ? copy.processing
                              : result?.status === "deleted"
                                ? `${copy.deleted} · ${result.deletedCount} ${copy.records}`
                                : result?.status === "not_found"
                                  ? copy.notFound
                                  : result?.status === "preserved"
                                    ? copy.preserved
                                    : result?.status === "failed"
                                      ? copy.failed
                                      : copy.pending}
                          </Badge>
                        </div>
                        {result?.status === "failed" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => setSelectedLog(result)}
                          >
                            {copy.showLog}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {!running && !finished ? (
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
                  {scope === "related" ? copy.startRelated : copy.startCase}
                </Button>
              </>
            ) : finished ? (
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {copy.close}
              </Button>
            ) : (
              <Button type="button" disabled>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {copy.processing}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedLog)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedLog(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{copy.logTitle}</DialogTitle>
            <DialogDescription>{copy.logDescription}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[58vh] overflow-auto rounded-md border bg-muted/45 p-4 text-xs leading-5 whitespace-pre-wrap">
            {selectedLog?.log}
          </pre>
          <DialogFooter>
            <Button type="button" onClick={() => setSelectedLog(null)}>
              {copy.closeLog}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
