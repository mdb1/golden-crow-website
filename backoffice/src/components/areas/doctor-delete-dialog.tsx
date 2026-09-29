"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleMinus,
  CircleX,
  FileArchive,
  FolderKanban,
  LoaderCircle,
  PartyPopper,
  ShieldAlert,
  Stethoscope,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
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
import { isGlobalAdminRole, type DoctorListItem } from "@/lib/admin-areas";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const FULL_DELETION_STEPS = [
  "cases",
  "patients",
  "report_owner",
  "object_owner",
  "role",
  "doctor",
] as const;

type DeletionStep = (typeof FULL_DELETION_STEPS)[number];
type DeletionScope = "doctor" | "full";
type ServerStepResult = {
  step: DeletionStep;
  status: "deleted" | "not_found";
  deletedCount: number;
  message: string;
  details?: string[];
  hasMore?: boolean;
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
  cases: FolderKanban,
  patients: UsersRound,
  report_owner: FileArchive,
  object_owner: FileArchive,
  role: UserRound,
  doctor: Stethoscope,
} satisfies Record<DeletionStep, typeof Trash2>;

function copyFor(language: "en" | "es") {
  return language === "es"
    ? {
        trigger: "Eliminar médico",
        title: "Eliminar médico",
        description:
          "Elegí si querés eliminar solamente la entidad médica o ejecutar una limpieza completa por etapas.",
        doctorOnly: "Eliminar solo la entidad médica",
        doctorOnlyBody:
          "El médico se elimina, pero pacientes, casos, cuentas propietarias y asignaciones de rol permanecen intactos y pueden quedar sin médico.",
        full: "Eliminar médico y relaciones principales",
        fullBody:
          "Elimina secuencialmente casos y sus artefactos, pacientes y sus roles, cuentas propietarias, el rol médico y finalmente el médico.",
        fullUnavailable:
          "La limpieza completa está disponible solamente para Full Admin y 2PQ Admin. Este rol puede eliminar únicamente la entidad médica dentro de su alcance.",
        ownerSafety:
          "Eliminar las cuentas propietarias no elimina reportes, objetos ni códigos existentes. Esos registros permanecen huérfanos para revisión y reasignación.",
        patientSafety:
          "La limpieza de pacientes elimina sus registros y roles vinculados. Sus cuentas de Firebase Auth y perfiles no forman parte de este flujo.",
        cancel: "Cancelar",
        startDoctor: "Eliminar solo médico",
        startFull: "Iniciar limpieza completa",
        runningTitle: "Eliminando médico",
        runningBody:
          "Las etapas se ejecutan una por una con progreso real del backend. No cierres esta ventana.",
        completeTitle: "Limpieza completada",
        completeBody:
          "El médico y el alcance seleccionado se procesaron correctamente.",
        failedTitle: "La limpieza se detuvo",
        failedBody:
          "Una etapa falló y las posteriores no se ejecutaron. Revisá el log antes de finalizar.",
        finish: "Finalizar",
        processing: "Procesando",
        deleted: "Eliminado",
        notFound: "No disponible",
        preserved: "Conservado",
        pending: "Pendiente",
        failed: "Falló",
        showLog: "Ver log",
        closeLog: "Cerrar log",
        logTitle: "Log de la etapa",
        logDescription:
          "Request, respuesta y detalle técnico capturados para esta etapa fallida.",
        items: "elementos",
        labels: {
          cases: "Casos 2PQ vinculados",
          patients: "Pacientes vinculados",
          report_owner: "Cuenta propietaria de reportes",
          object_owner: "Cuenta propietaria de objetos",
          role: "Rol del médico",
          doctor: "Entidad médica",
        },
        preservedMessages: {
          cases: "Los casos 2PQ permanecen vinculados al identificador eliminado.",
          patients: "Los pacientes permanecen vinculados al identificador eliminado.",
          report_owner: "La cuenta propietaria de reportes permanece intacta.",
          object_owner: "La cuenta propietaria de objetos permanece intacta.",
          role: "El rol del médico permanece intacto.",
        },
      }
    : {
        trigger: "Delete doctor",
        title: "Delete doctor",
        description:
          "Choose whether to delete only the doctor entity or run a staged full cleanup.",
        doctorOnly: "Delete only the doctor entity",
        doctorOnlyBody:
          "The doctor is deleted, while patients, cases, owner accounts, and role assignments remain intact and may become doctorless.",
        full: "Delete doctor and main relationships",
        fullBody:
          "Sequentially deletes cases and their artifacts, patients and their roles, owner accounts, the doctor role, and finally the doctor.",
        fullUnavailable:
          "Full cleanup is available only to Full Admin and 2PQ Admin. This role can delete only the in-scope doctor entity.",
        ownerSafety:
          "Deleting owner accounts does not delete existing reports, objects, or codes. Those records remain orphaned for review and reassignment.",
        patientSafety:
          "Patient cleanup deletes patient records and linked roles. Their Firebase Auth accounts and profiles are outside this flow.",
        cancel: "Cancel",
        startDoctor: "Delete doctor only",
        startFull: "Start full cleanup",
        runningTitle: "Deleting doctor",
        runningBody:
          "Stages run one by one with persisted backend progress. Keep this window open.",
        completeTitle: "Cleanup complete",
        completeBody:
          "The doctor and selected scope were processed successfully.",
        failedTitle: "Cleanup stopped",
        failedBody:
          "A stage failed and later stages were not run. Review the log before finishing.",
        finish: "Finish",
        processing: "Processing",
        deleted: "Deleted",
        notFound: "Not available",
        preserved: "Preserved",
        pending: "Pending",
        failed: "Failed",
        showLog: "Show log",
        closeLog: "Close log",
        logTitle: "Stage log",
        logDescription:
          "Captured request, response, and technical details for this failed stage.",
        items: "items",
        labels: {
          cases: "Linked 2PQ cases",
          patients: "Linked patients",
          report_owner: "Report owner account",
          object_owner: "Object owner account",
          role: "Doctor role",
          doctor: "Doctor entity",
        },
        preservedMessages: {
          cases: "2PQ cases remain linked to the deleted identifier.",
          patients: "Patients remain linked to the deleted identifier.",
          report_owner: "The report owner account remains intact.",
          object_owner: "The object owner account remains intact.",
          role: "The doctor role remains intact.",
        },
      };
}

export function DoctorDeleteDialog({
  doctor,
  disabled = false,
  disabledReason,
  onFinished,
}: {
  doctor: DoctorListItem;
  disabled?: boolean;
  disabledReason?: string;
  onFinished?: () => void;
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const copy = copyFor(language);
  const canRunFullCleanup = isGlobalAdminRole(adminContext.role);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<DeletionScope>("doctor");
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [currentStep, setCurrentStep] = useState<DeletionStep | null>(null);
  const [currentItemCount, setCurrentItemCount] = useState(0);
  const [results, setResults] = useState<StepResult[]>([]);
  const [selectedLog, setSelectedLog] = useState<FailedStepResult | null>(null);
  const executionSteps =
    scope === "full" ? FULL_DELETION_STEPS : (["doctor"] as const);
  const resultByStep = useMemo(
    () => new Map(results.map((result) => [result.step, result])),
    [results],
  );
  const completedSteps = executionSteps.filter((step) =>
    resultByStep.has(step),
  ).length;
  const progress = (completedSteps / executionSteps.length) * 100;
  const failed = results.some((result) => result.status === "failed");

  function reset() {
    setScope("doctor");
    setRunning(false);
    setFinished(false);
    setAttempted(false);
    setCurrentStep(null);
    setCurrentItemCount(0);
    setResults([]);
    setSelectedLog(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && running) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      const shouldRefresh = attempted;
      reset();
      if (shouldRefresh) onFinished?.();
    }
  }

  async function executeStep(step: DeletionStep) {
    let totalDeleted = 0;
    let finalResult: ServerStepResult | null = null;
    const details: string[] = [];

    do {
      const requestPath = `/areas/doctors/${encodeURIComponent(doctor.id)}/deletion/${step}?scope=${scope}`;
      try {
        const result = await sdkFetch<ServerStepResult>(requestPath, {
          method: "DELETE",
        });
        finalResult = result;
        totalDeleted += result.deletedCount;
        setCurrentItemCount(totalDeleted);
        details.push(...(result.details ?? []));
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
        return {
          step,
          status: "failed" as const,
          deletedCount: 0 as const,
          message,
          log,
          details,
        };
      }
    } while (finalResult?.hasMore);

    return {
      ...(finalResult ?? {
        step,
        status: "not_found" as const,
        deletedCount: 0,
        message: copy.notFound,
      }),
      deletedCount: totalDeleted,
      details: [...new Set(details)],
      hasMore: false,
    };
  }

  async function runDeletion() {
    if (scope === "full" && !canRunFullCleanup) return;
    const preservedResults: PreservedStepResult[] =
      scope === "doctor"
        ? FULL_DELETION_STEPS.filter((step) => step !== "doctor").map(
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
    setAttempted(true);
    setResults(preservedResults);
    setRunning(true);
    setFinished(false);

    for (const step of executionSteps) {
      setCurrentStep(step);
      setCurrentItemCount(0);
      const result = await executeStep(step);
      setResults((current) => [...current, result]);
      if (result.status === "failed") break;
    }

    setCurrentStep(null);
    setCurrentItemCount(0);
    setRunning(false);
    setFinished(true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={disabled}
            title={disabled ? disabledReason : copy.trigger}
            aria-label={copy.trigger}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-5xl"
          showCloseButton={!running}
          onInteractOutside={(event) => {
            if (running) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (running) event.preventDefault();
          }}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border",
                  finished && !failed
                    ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-600"
                    : failed
                      ? "border-destructive/35 bg-destructive/10 text-destructive"
                      : "border-destructive/30 bg-destructive/8 text-destructive",
                )}
              >
                {running ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : finished && !failed ? (
                  <PartyPopper className="h-5 w-5" />
                ) : (
                  <ShieldAlert className="h-5 w-5" />
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
                  {doctor.fullName} · {doctor.id}
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
                  onValueChange={(value) =>
                    setScope(value as DeletionScope)
                  }
                  className="grid gap-3 md:grid-cols-2"
                >
                  <label
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-md border p-5 transition-colors",
                      scope === "doctor"
                        ? "border-primary bg-primary/6"
                        : "border-border hover:bg-muted/45",
                    )}
                  >
                    <RadioGroupItem value="doctor" className="mt-0.5" />
                    <span>
                      <span className="block font-semibold text-foreground">
                        {copy.doctorOnly}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                        {copy.doctorOnlyBody}
                      </span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      "flex gap-3 rounded-md border p-5 transition-colors",
                      canRunFullCleanup ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                      scope === "full"
                        ? "border-destructive bg-destructive/6"
                        : "border-border hover:bg-muted/45",
                    )}
                  >
                    <RadioGroupItem
                      value="full"
                      className="mt-0.5"
                      disabled={!canRunFullCleanup}
                    />
                    <span>
                      <span className="block font-semibold text-foreground">
                        {copy.full}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                        {copy.fullBody}
                      </span>
                    </span>
                  </label>
                </RadioGroup>

                {!canRunFullCleanup ? (
                  <div className="rounded-md border border-amber-400/35 bg-amber-500/8 px-4 py-3 text-sm leading-6 text-amber-950 dark:text-amber-100">
                    {copy.fullUnavailable}
                  </div>
                ) : null}
                {scope === "full" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-amber-400/35 bg-amber-500/8 px-4 py-3 text-sm leading-6 text-amber-950 dark:text-amber-100">
                      {copy.ownerSafety}
                    </div>
                    <div className="rounded-md border border-border bg-muted/25 px-4 py-3 text-sm leading-6 text-muted-foreground">
                      {copy.patientSafety}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {currentStep
                        ? `${copy.processing}: ${copy.labels[currentStep]}${currentItemCount > 0 ? ` · ${currentItemCount}` : ""}`
                        : failed
                          ? copy.failedTitle
                          : copy.completeTitle}
                    </span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {FULL_DELETION_STEPS.map((step) => {
                    const result = resultByStep.get(step);
                    const StepIcon = STEP_ICONS[step];
                    const active = currentStep === step;
                    return (
                      <div
                        key={step}
                        className={cn(
                          "rounded-md border p-4",
                          active
                            ? "border-primary/45 bg-primary/6"
                            : result?.status === "failed"
                              ? "border-destructive/45 bg-destructive/6"
                              : result?.status === "deleted"
                                ? "border-emerald-400/35 bg-emerald-500/6"
                                : "border-border",
                          step === "doctor" ? "md:col-span-2" : "",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
                              {active ? (
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
                            {active
                              ? copy.processing
                              : result?.status === "deleted"
                                ? `${copy.deleted} · ${result.deletedCount} ${copy.items}`
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
                  disabled={scope === "full" && !canRunFullCleanup}
                >
                  <Trash2 className="h-4 w-4" />
                  {scope === "full" ? copy.startFull : copy.startDoctor}
                </Button>
              </>
            ) : finished ? (
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {copy.finish}
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
