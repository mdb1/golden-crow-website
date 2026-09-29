"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleMinus,
  CircleX,
  FileText,
  LoaderCircle,
  PartyPopper,
  ShieldAlert,
  Trash2,
  UserRoundX,
} from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  canDeleteRoleRecord,
  type RoleManagementRecord,
} from "@/lib/admin-areas";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const ACCOUNT_DELETION_STEPS = [
  "linked_entity",
  "private_profile",
  "public_profile",
  "community",
  "reports",
  "objects",
  "stored_files",
  "learning",
  "firebase_auth",
  "role",
] as const;

type DeletionStep = (typeof ACCOUNT_DELETION_STEPS)[number];
type DeletionScope = "role" | "account";
type ServerStepResult = {
  step: DeletionStep;
  status: "deleted" | "not_found";
  deletedCount: number;
  message: string;
};
type FailedStepResult = {
  step: DeletionStep;
  status: "failed";
  deletedCount: 0;
  message: string;
  log: string;
};
type StepResult = ServerStepResult | FailedStepResult;

const STEP_LABELS: Record<DeletionStep, { en: string; es: string }> = {
  linked_entity: {
    en: "Linked patient, doctor, or professional entity",
    es: "Entidad vinculada de paciente, médico o profesional",
  },
  private_profile: { en: "Private profile", es: "Perfil privado" },
  public_profile: { en: "Public profile", es: "Perfil público" },
  community: {
    en: "Community account",
    es: "Cuenta de comunidad",
  },
  reports: {
    en: "Report owner, codes, and uploads",
    es: "Propietario, códigos y cargas de reportes",
  },
  objects: {
    en: "Object owner, codes, and uploads",
    es: "Propietario, códigos y cargas de objetos",
  },
  stored_files: {
    en: "Stored file metadata",
    es: "Metadatos de archivos almacenados",
  },
  learning: { en: "Learning progress", es: "Progreso de aprendizaje" },
  firebase_auth: { en: "Firebase Auth account", es: "Cuenta de Firebase Auth" },
  role: { en: "Role assignment", es: "Asignación de rol" },
};

function roleDeleteCopy(language: "en" | "es") {
  return language === "es"
    ? {
        trigger: "Eliminar rol",
        title: "Eliminar acceso y cuenta",
        description:
          "Elegí exactamente cuánto querés eliminar. Esta acción no se puede deshacer.",
        roleOnly: "Eliminar solo el rol",
        roleOnlyBody:
          "Quita la asignación de acceso del backoffice. La cuenta, los perfiles y sus datos permanecen intactos.",
        fullAccount: "Eliminar también toda la cuenta",
        fullAccountBody:
          "Limpia la entidad personal vinculada, la cuenta de comunidad, perfiles, reportes, objetos, archivos almacenados, aprendizaje, Firebase Auth y finalmente el rol. Las publicaciones y conversaciones permanecen intactas.",
        sharedOrganization:
          "Las organizaciones publicadoras son entidades compartidas y no se eliminan como parte de una cuenta personal.",
        cancel: "Cancelar",
        startRole: "Eliminar rol",
        startAccount: "Iniciar limpieza completa",
        runningTitle: "Eliminando cuenta",
        runningBody:
          "Cada etapa se procesa por separado. No cierres esta ventana hasta que termine.",
        completeTitle: "Limpieza completada",
        completeBody:
          "Felicitaciones, todas las etapas solicitadas se procesaron correctamente.",
        partialTitle: "Limpieza completada con pendientes",
        partialBody:
          "La limpieza terminó, pero una o más etapas no pudieron completarse. Revisá el detalle antes de cerrar.",
        close: "Cerrar",
        deleted: "Eliminado",
        notFound: "No disponible",
        failed: "Falló",
        showLog: "Ver log",
        logTitle: "Log de etapa de limpieza",
        logDescription:
          "Request, respuesta y detalle técnico capturados para esta etapa fallida.",
        closeLog: "Cerrar log",
        records: "registros",
        processing: "Procesando",
      }
    : {
        trigger: "Delete role",
        title: "Delete access and account",
        description:
          "Choose exactly how much to delete. This action cannot be undone.",
        roleOnly: "Delete only the role",
        roleOnlyBody:
          "Removes the backoffice access assignment. The account, profiles, and data remain intact.",
        fullAccount: "Delete the whole account too",
        fullAccountBody:
          "Cleans the linked personal entity, community account, profiles, reports, objects, stored files, learning, Firebase Auth, and finally the role. Posts and conversations remain intact.",
        sharedOrganization:
          "Publisher organizations are shared entities and are not deleted as part of a personal account.",
        cancel: "Cancel",
        startRole: "Delete role",
        startAccount: "Start full cleanup",
        runningTitle: "Deleting account",
        runningBody:
          "Each stage is processed separately. Keep this window open until it finishes.",
        completeTitle: "Cleanup complete",
        completeBody:
          "Congratulations, every requested cleanup stage completed successfully.",
        partialTitle: "Cleanup completed with pending items",
        partialBody:
          "Cleanup finished, but one or more stages could not be completed. Review the details before closing.",
        close: "Close",
        deleted: "Deleted",
        notFound: "Not available",
        failed: "Failed",
        showLog: "Show log",
        logTitle: "Cleanup stage log",
        logDescription:
          "Captured request, response, and technical details for this failed stage.",
        closeLog: "Close log",
        records: "records",
        processing: "Processing",
      };
}

export function RoleDeleteDialog({
  roleRecord,
  trigger,
  onFinished,
}: {
  roleRecord: RoleManagementRecord;
  trigger?: ReactNode;
  onFinished?: () => void;
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const copy = roleDeleteCopy(language);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<DeletionScope>("role");
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentStep, setCurrentStep] = useState<DeletionStep | null>(null);
  const [results, setResults] = useState<StepResult[]>([]);
  const [selectedLog, setSelectedLog] = useState<FailedStepResult | null>(null);
  const canDelete = canDeleteRoleRecord(adminContext, roleRecord);
  const steps =
    scope === "account" ? ACCOUNT_DELETION_STEPS : (["role"] as const);
  const failed = results.some((result) => result.status === "failed");
  const progress = steps.length > 0 ? (results.length / steps.length) * 100 : 0;
  const resultByStep = useMemo(
    () => new Map(results.map((result) => [result.step, result])),
    [results],
  );

  if (!canDelete) {
    return null;
  }

  function resetDialog() {
    setScope("role");
    setRunning(false);
    setFinished(false);
    setCurrentStep(null);
    setResults([]);
    setSelectedLog(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && running) {
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      const roleWasDeleted = resultByStep.get("role")?.status === "deleted";
      resetDialog();
      if (roleWasDeleted) {
        onFinished?.();
      }
    }
  }

  async function runDeletion() {
    setRunning(true);
    setFinished(false);
    setResults([]);

    for (const step of steps) {
      setCurrentStep(step);
      const requestPath = `/roles/${encodeURIComponent(roleRecord.email)}/deletion/${step}`;
      try {
        const result = await sdkFetch<ServerStepResult>(
          requestPath,
          { method: "DELETE" },
        );
        setResults((current) => [...current, result]);
      } catch (error) {
        const fallbackMessage =
          language === "es"
            ? "La etapa no pudo completarse."
            : "The cleanup stage could not be completed.";
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : fallbackMessage;
        const technicalDetails =
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
          {
            step,
            status: "failed",
            deletedCount: 0,
            message,
            log: [
              `Captured at: ${new Date().toISOString()}`,
              `Cleanup step: ${step}`,
              `Role email: ${roleRecord.email}`,
              technicalDetails,
            ].join("\n\n"),
          },
        ]);
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
            variant="destructive"
            size="icon-sm"
            aria-label={copy.trigger}
            title={copy.trigger}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-4xl"
        showCloseButton={!running && !finished}
        onInteractOutside={(event) => {
          if (running) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (running) event.preventDefault();
        }}
      >
        <DialogHeader className="pr-10">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              {finished && !failed ? (
                <PartyPopper className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0">
              <DialogTitle className="font-heading text-xl">
                {running
                  ? copy.runningTitle
                  : finished
                    ? failed
                      ? copy.partialTitle
                      : copy.completeTitle
                    : copy.title}
              </DialogTitle>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {roleRecord.email}
              </p>
            </div>
          </div>
          <DialogDescription>
            {running
              ? copy.runningBody
              : finished
                ? failed
                  ? copy.partialBody
                  : copy.completeBody
                : copy.description}
          </DialogDescription>
        </DialogHeader>

        {!running && !finished ? (
          <RadioGroup
            value={scope}
            onValueChange={(value) => setScope(value as DeletionScope)}
            className="grid gap-3 md:grid-cols-2"
          >
            <label
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border p-4 transition-colors",
                scope === "role"
                  ? "border-primary bg-primary/6"
                  : "border-border hover:bg-muted/45",
              )}
            >
              <RadioGroupItem value="role" className="mt-0.5" />
              <span>
                <span className="block font-semibold text-foreground">
                  {copy.roleOnly}
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {copy.roleOnlyBody}
                </span>
              </span>
            </label>
            <label
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border p-4 transition-colors",
                scope === "account"
                  ? "border-destructive bg-destructive/6"
                  : "border-border hover:bg-muted/45",
              )}
            >
              <RadioGroupItem value="account" className="mt-0.5" />
              <span>
                <span className="block font-semibold text-foreground">
                  {copy.fullAccount}
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {copy.fullAccountBody}
                </span>
              </span>
            </label>
          </RadioGroup>
        ) : null}

        {scope === "account" && !running && !finished ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/8 dark:text-amber-100">
            <UserRoundX className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{copy.sharedOrganization}</span>
          </div>
        ) : null}

        {running || finished ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {currentStep
                    ? `${copy.processing}: ${STEP_LABELS[currentStep][language]}`
                    : `${results.length}/${steps.length}`}
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {steps.map((step) => {
                const result = resultByStep.get(step);
                const active = currentStep === step;
                return (
                  <div
                    key={step}
                    className="flex min-h-24 items-start gap-3 rounded-md border border-border/80 bg-muted/20 p-3"
                  >
                    {active ? (
                      <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                    ) : result?.status === "deleted" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : result?.status === "not_found" ? (
                      <CircleMinus className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    ) : result?.status === "failed" ? (
                      <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <Checkbox disabled className="mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-foreground">
                          {STEP_LABELS[step][language]}
                        </p>
                        {result ? (
                          <Badge
                            variant={
                              result.status === "deleted"
                                ? "success"
                                : result.status === "not_found"
                                  ? "warning"
                                  : "destructive"
                            }
                          >
                            {result.status === "deleted"
                              ? copy.deleted
                              : result.status === "not_found"
                                ? copy.notFound
                                : copy.failed}
                          </Badge>
                        ) : null}
                      </div>
                      {result ? (
                        <>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {result.message}
                            {result.deletedCount > 1
                              ? ` · ${result.deletedCount} ${copy.records}`
                              : ""}
                          </p>
                          {result.status === "failed" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => setSelectedLog(result)}
                            >
                              <FileText className="h-4 w-4" />
                              {copy.showLog}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {finished ? (
            <Button onClick={() => handleOpenChange(false)}>
              {copy.close}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={running}
              >
                {copy.cancel}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void runDeletion()}
                disabled={running}
              >
                {running ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {scope === "account" ? copy.startAccount : copy.startRole}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
      </Dialog>

      <Dialog
        open={selectedLog !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedLog(null);
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader className="pr-10">
            <DialogTitle className="font-heading text-xl">
              {copy.logTitle}
            </DialogTitle>
            <DialogDescription>{copy.logDescription}</DialogDescription>
          </DialogHeader>

          {selectedLog ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">
                  {STEP_LABELS[selectedLog.step][language]}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {roleRecord.email}
                </span>
              </div>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/45 p-4 font-mono text-xs leading-5 text-foreground">
                {selectedLog.log}
              </pre>
            </div>
          ) : null}

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
