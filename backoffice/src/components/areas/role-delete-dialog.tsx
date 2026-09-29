"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArchiveRestore,
  CheckCircle2,
  CircleMinus,
  CircleX,
  ExternalLink,
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
  orphanedArtifacts?: OrphanedArtifactSummary;
};
type FailedStepResult = {
  step: DeletionStep;
  status: "failed";
  deletedCount: 0;
  message: string;
  log: string;
};
type StepResult = ServerStepResult | FailedStepResult;
type OrphanedArtifactKind = "reports" | "objects";
type OrphanedArtifactSummary = {
  kind: OrphanedArtifactKind;
  ownerIds: string[];
  codeCount: number;
  recordCount: number;
  totalCount: number;
};
type OrphanedArtifactItem = {
  collection:
    | "report_codes"
    | "uploaded_reports"
    | "object_codes"
    | "uploaded_objects";
  id: string;
  ownerId: string;
  code?: string;
  linkedRecordId?: string;
  fileName?: string;
  objectType?: string;
};
type OrphanedArtifactPage = {
  items: OrphanedArtifactItem[];
  nextCursors: {
    code: string | null;
    record: string | null;
  };
};

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
    en: "Report owner account",
    es: "Cuenta de propietario de reportes",
  },
  objects: {
    en: "Object owner account",
    es: "Cuenta de propietario de objetos",
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
          "Elimina las identidades de cuenta vinculadas, los perfiles, el progreso, Firebase Auth y finalmente el rol. Publicaciones, notas, eventos, reportes, objetos, archivos, ofertas y transacciones permanecen intactos.",
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
        nextStepTitle: "Siguiente paso: revisar registros sin propietario",
        nextStepBody:
          "Los códigos y registros asociados permanecen intactos. Revisalos ahora para decidir cuáles deberán reasignarse más adelante.",
        reviewReports: "Revisar reportes sin propietario",
        reviewObjects: "Revisar objetos sin propietario",
        orphanedReportsTitle: "Reportes y códigos sin propietario",
        orphanedObjectsTitle: "Objetos y códigos sin propietario",
        orphanedDescription:
          "Estos registros no se eliminaron ni se reasignaron. Siguen vinculados al identificador del propietario eliminado.",
        loadMore: "Cargar más",
        loadingArtifacts: "Cargando registros...",
        noArtifacts: "No se encontraron registros vinculados.",
        closeReview: "Cerrar revisión",
        codeRecords: "códigos",
        ownedRecords: "registros",
        openRecord: "Abrir",
        reviewFailed: "No se pudo cargar la lista de registros sin propietario.",
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
          "Deletes linked account identities, profiles, progress, Firebase Auth, and finally the role. Posts, notes, events, reports, objects, files, offers, and transactions remain intact.",
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
        nextStepTitle: "Next step: review ownerless records",
        nextStepBody:
          "Associated codes and records remain intact. Review them now to decide which ones should be reassigned later.",
        reviewReports: "Review ownerless reports",
        reviewObjects: "Review ownerless objects",
        orphanedReportsTitle: "Ownerless reports and codes",
        orphanedObjectsTitle: "Ownerless objects and codes",
        orphanedDescription:
          "These records were not deleted or reassigned. They still reference the deleted owner id.",
        loadMore: "Load more",
        loadingArtifacts: "Loading records...",
        noArtifacts: "No linked records were found.",
        closeReview: "Close review",
        codeRecords: "codes",
        ownedRecords: "records",
        openRecord: "Open",
        reviewFailed: "Unable to load the ownerless record list.",
      };
}

function orphanedArtifactHref(item: OrphanedArtifactItem) {
  if (item.collection === "report_codes") {
    return `/reports/${encodeURIComponent(item.id)}?from=report-codes`;
  }
  if (item.collection === "uploaded_reports") {
    return `/reports/uploads/${encodeURIComponent(item.id)}`;
  }
  return null;
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
  const [selectedOrphanSummary, setSelectedOrphanSummary] =
    useState<OrphanedArtifactSummary | null>(null);
  const [orphanedItems, setOrphanedItems] = useState<OrphanedArtifactItem[]>([]);
  const [orphanedNextCursors, setOrphanedNextCursors] = useState<
    OrphanedArtifactPage["nextCursors"] | null
  >(null);
  const [orphanedPending, setOrphanedPending] = useState(false);
  const [orphanedError, setOrphanedError] = useState<string | null>(null);
  const canDelete = canDeleteRoleRecord(adminContext, roleRecord);
  const steps =
    scope === "account" ? ACCOUNT_DELETION_STEPS : (["role"] as const);
  const failed = results.some((result) => result.status === "failed");
  const progress = steps.length > 0 ? (results.length / steps.length) * 100 : 0;
  const resultByStep = useMemo(
    () => new Map(results.map((result) => [result.step, result])),
    [results],
  );
  const orphanedSummaries = useMemo(
    () =>
      results.flatMap((result) =>
        result.status !== "failed" &&
        result.orphanedArtifacts &&
        result.orphanedArtifacts.totalCount > 0
          ? [result.orphanedArtifacts]
          : [],
      ),
    [results],
  );
  const orphanedHasMore = Boolean(
    orphanedNextCursors?.code || orphanedNextCursors?.record,
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
    setSelectedOrphanSummary(null);
    setOrphanedItems([]);
    setOrphanedNextCursors(null);
    setOrphanedPending(false);
    setOrphanedError(null);
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

  async function loadOrphanedArtifacts(
    summary: OrphanedArtifactSummary,
    append: boolean,
  ) {
    setOrphanedPending(true);
    setOrphanedError(null);

    try {
      const query = new URLSearchParams({
        kind: summary.kind,
        ownerIds: summary.ownerIds.join(","),
        limit: "20",
      });
      if (append && orphanedNextCursors) {
        if (orphanedNextCursors.code) {
          query.set("codeCursor", orphanedNextCursors.code);
        } else {
          query.set("codeDone", "1");
        }
        if (orphanedNextCursors.record) {
          query.set("recordCursor", orphanedNextCursors.record);
        } else {
          query.set("recordDone", "1");
        }
      }

      const page = await sdkFetch<OrphanedArtifactPage>(
        `/roles/deletion/orphaned-artifacts?${query.toString()}`,
      );
      setOrphanedItems((current) => {
        const combined = append ? [...current, ...page.items] : page.items;
        return [
          ...new Map(
            combined.map((item) => [`${item.collection}/${item.id}`, item]),
          ).values(),
        ];
      });
      setOrphanedNextCursors(page.nextCursors);
    } catch {
      setOrphanedError(copy.reviewFailed);
    } finally {
      setOrphanedPending(false);
    }
  }

  function openOrphanedArtifacts(summary: OrphanedArtifactSummary) {
    setSelectedOrphanSummary(summary);
    setOrphanedItems([]);
    setOrphanedNextCursors(null);
    setOrphanedError(null);
    void loadOrphanedArtifacts(summary, false);
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

            {finished && orphanedSummaries.length > 0 ? (
              <div className="rounded-md border border-violet-300/70 bg-violet-50/80 p-4 text-violet-950 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-100">
                <div className="flex items-start gap-3">
                  <ArchiveRestore className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{copy.nextStepTitle}</p>
                    <p className="mt-1 text-sm leading-6 text-violet-900/80 dark:text-violet-100/75">
                      {copy.nextStepBody}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {orphanedSummaries.map((summary) => (
                        <Button
                          key={summary.kind}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openOrphanedArtifacts(summary)}
                        >
                          <ArchiveRestore className="h-4 w-4" />
                          {summary.kind === "reports"
                            ? copy.reviewReports
                            : copy.reviewObjects}
                          <Badge variant="secondary">
                            {summary.totalCount}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
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

      <Dialog
        open={selectedOrphanSummary !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedOrphanSummary(null);
        }}
      >
        <DialogContent className="sm:max-w-6xl">
          <DialogHeader className="pr-10">
            <DialogTitle className="font-heading text-xl">
              {selectedOrphanSummary?.kind === "objects"
                ? copy.orphanedObjectsTitle
                : copy.orphanedReportsTitle}
            </DialogTitle>
            <DialogDescription>{copy.orphanedDescription}</DialogDescription>
          </DialogHeader>

          {selectedOrphanSummary ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {selectedOrphanSummary.codeCount} {copy.codeRecords}
                </Badge>
                <Badge variant="secondary">
                  {selectedOrphanSummary.recordCount} {copy.ownedRecords}
                </Badge>
                {selectedOrphanSummary.ownerIds.map((ownerId) => (
                  <Badge key={ownerId} variant="outline">
                    {ownerId}
                  </Badge>
                ))}
              </div>

              {orphanedError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {orphanedError}
                </div>
              ) : null}

              <div className="max-h-[58vh] overflow-auto rounded-md border border-border">
                {orphanedItems.length > 0 ? (
                  <div className="divide-y divide-border">
                    {orphanedItems.map((item) => {
                      const href = orphanedArtifactHref(item);
                      return (
                        <div
                          key={`${item.collection}/${item.id}`}
                          className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{item.collection}</Badge>
                              {item.objectType ? (
                                <Badge variant="secondary">
                                  {item.objectType}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 break-all font-mono text-sm font-medium text-foreground">
                              {item.code ?? item.id}
                            </p>
                            {item.fileName ? (
                              <p className="mt-1 break-words text-xs text-muted-foreground">
                                {item.fileName}
                              </p>
                            ) : null}
                          </div>
                          <dl className="grid gap-1 text-xs text-muted-foreground">
                            <div className="flex gap-2">
                              <dt>Document:</dt>
                              <dd className="break-all font-mono">{item.id}</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt>Owner:</dt>
                              <dd className="break-all font-mono">
                                {item.ownerId}
                              </dd>
                            </div>
                            {item.linkedRecordId ? (
                              <div className="flex gap-2">
                                <dt>Linked:</dt>
                                <dd className="break-all font-mono">
                                  {item.linkedRecordId}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                          {href ? (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={href}>
                                <ExternalLink className="h-4 w-4" />
                                {copy.openRecord}
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : orphanedPending ? (
                  <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    {copy.loadingArtifacts}
                  </div>
                ) : (
                  <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                    {copy.noArtifacts}
                  </div>
                )}
              </div>

              {orphanedHasMore ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={orphanedPending}
                    onClick={() =>
                      void loadOrphanedArtifacts(selectedOrphanSummary, true)
                    }
                  >
                    {orphanedPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArchiveRestore className="h-4 w-4" />
                    )}
                    {copy.loadMore}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              onClick={() => setSelectedOrphanSummary(null)}
            >
              {copy.closeReview}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
