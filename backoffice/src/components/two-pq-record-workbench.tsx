"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { OptionSelectField } from "@/components/constrained-fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sdkFetch } from "@/lib/sdk-client";
import {
  type TwoPQAreaKey,
  type TwoPQDetailRecord,
  type TwoPQMutableFieldKey,
  type TwoPQRecord,
  getTwoPQAreaConfig,
} from "@/lib/two-pq-areas";

type FormState = Record<TwoPQMutableFieldKey, string>;

const CREATION_CONFETTI = [
  { left: "10%", top: "18%", color: "var(--chart-4)", delay: "0ms", duration: "1080ms" },
  { left: "18%", top: "10%", color: "var(--chart-2)", delay: "60ms", duration: "980ms" },
  { left: "28%", top: "16%", color: "var(--chart-1)", delay: "110ms", duration: "1120ms" },
  { left: "40%", top: "8%", color: "var(--chart-5)", delay: "170ms", duration: "1020ms" },
  { left: "56%", top: "12%", color: "var(--chart-3)", delay: "220ms", duration: "1180ms" },
  { left: "68%", top: "14%", color: "var(--chart-4)", delay: "280ms", duration: "1040ms" },
  { left: "80%", top: "9%", color: "var(--chart-1)", delay: "330ms", duration: "1140ms" },
  { left: "88%", top: "20%", color: "var(--chart-2)", delay: "390ms", duration: "990ms" },
] as const;

const EMPTY_FORM_STATE: FormState = {
  institutionId: "",
  doctorId: "",
  patientId: "",
  caseLabel: "",
  caseStatus: "",
  caseType: "",
  priority: "",
  sampleId: "",
  shipmentId: "",
  trackingNumber: "",
  requestedAt: "",
  dueAt: "",
  sampleType: "",
  collectionDate: "",
  receptionDate: "",
  processingStatus: "",
  runId: "",
  qcStatus: "",
  carrier: "",
  dispatchDate: "",
  deliveryDate: "",
  deliveryStatus: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  platform: "",
  scheduling: "",
  analysisStatus: "",
  providerName: "",
  providerFormat: "",
  phoneNumber: "",
  reportCode: "",
  uploadedReportId: "",
  clientCaseStatus: "",
  reportDelivery: "",
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  preferredLanguage: "",
  country: "",
  roleEmail: "",
  accessStatus: "",
  communicationStatus: "",
  notes: "",
};

function normalizeDateInput(value?: string) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function toFormState(
  record?: Partial<TwoPQRecord>,
  defaults?: { institutionId?: string; doctorId?: string }
): FormState {
  return {
    ...EMPTY_FORM_STATE,
    institutionId: record?.institutionId ?? defaults?.institutionId ?? "",
    doctorId: record?.doctorId ?? defaults?.doctorId ?? "",
    patientId: record?.patientId ?? "",
    caseLabel: record?.caseLabel ?? "",
    caseStatus: record?.caseStatus ?? "",
    caseType: record?.caseType ?? "",
    priority: record?.priority ?? "",
    sampleId: record?.sampleId ?? "",
    shipmentId: record?.shipmentId ?? "",
    trackingNumber: record?.trackingNumber ?? "",
    requestedAt: normalizeDateInput(record?.requestedAt),
    dueAt: normalizeDateInput(record?.dueAt),
    sampleType: record?.sampleType ?? "",
    collectionDate: normalizeDateInput(record?.collectionDate),
    receptionDate: normalizeDateInput(record?.receptionDate),
    processingStatus: record?.processingStatus ?? "",
    runId: record?.runId ?? "",
    qcStatus: record?.qcStatus ?? "",
    carrier: record?.carrier ?? "",
    dispatchDate: normalizeDateInput(record?.dispatchDate),
    deliveryDate: normalizeDateInput(record?.deliveryDate),
    deliveryStatus: record?.deliveryStatus ?? "",
    contactName: record?.contactName ?? "",
    contactEmail: record?.contactEmail ?? "",
    contactPhone: record?.contactPhone ?? "",
    platform: record?.platform ?? "",
    scheduling: record?.scheduling ?? "",
    analysisStatus: record?.analysisStatus ?? "",
    providerName: record?.providerName ?? "",
    providerFormat: record?.providerFormat ?? "",
    phoneNumber: record?.phoneNumber ?? "",
    reportCode: record?.reportCode ?? "",
    uploadedReportId: record?.uploadedReportId ?? "",
    clientCaseStatus: record?.clientCaseStatus ?? "",
    reportDelivery: record?.reportDelivery ?? "",
    clientName: record?.clientName ?? "",
    clientEmail: record?.clientEmail ?? "",
    clientPhone: record?.clientPhone ?? "",
    preferredLanguage: record?.preferredLanguage ?? "",
    country: record?.country ?? "",
    roleEmail: record?.roleEmail ?? "",
    accessStatus: record?.accessStatus ?? "",
    communicationStatus: record?.communicationStatus ?? "",
    notes: record?.notes ?? "",
  };
}

function getFieldKeys(areaKey: TwoPQAreaKey) {
  const area = getTwoPQAreaConfig(areaKey);
  if (!area) {
    return [] as TwoPQMutableFieldKey[];
  }

  return area.fieldGroups.flatMap((group) => group.fields.map((field) => field.key));
}

export function TwoPQRecordWorkbench({
  areaKey,
  detail,
  institutions,
  doctors,
  patients,
  mode = "edit",
}: {
  areaKey: TwoPQAreaKey;
  detail?: TwoPQDetailRecord;
  institutions: Array<{ id: string; name: string }>;
  doctors: Array<{ id: string; fullName: string; institutionId: string }>;
  patients: Array<{ id: string; fullName: string; institutionId: string; doctorId: string }>;
  mode?: "create" | "edit";
}) {
  const area = getTwoPQAreaConfig(areaKey)!;
  const adminContext = useAdminContext();
  const router = useRouter();
  const scopedInstitutionId =
    adminContext.role === "institution_admin" || adminContext.role === "institution_doctor"
      ? adminContext.institutionId
      : undefined;
  const scopedDoctorId =
    adminContext.role === "institution_doctor" ? adminContext.doctorId : undefined;
  const defaults = useMemo(
    () => ({
      institutionId: scopedInstitutionId ?? detail?.record.institutionId,
      doctorId: scopedDoctorId ?? detail?.record.doctorId,
    }),
    [detail?.record.doctorId, detail?.record.institutionId, scopedDoctorId, scopedInstitutionId]
  );
  const [state, setState] = useState<FormState>(() => toFormState(detail?.record, defaults));
  const [pendingAction, setPendingAction] = useState<
    null | "create" | "replace" | "update" | "delete"
  >(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);

  const sourceState = useMemo(
    () => toFormState(detail?.record, defaults),
    [defaults, detail?.record]
  );
  const changedKeys = useMemo(
    () =>
      (Object.keys(state) as TwoPQMutableFieldKey[]).filter(
        (key) => state[key] !== sourceState[key]
      ),
    [sourceState, state]
  );
  const changed = changedKeys.length > 0;
  const availableDoctors = useMemo(
    () =>
      doctors.filter((doctor) =>
        state.institutionId ? doctor.institutionId === state.institutionId : true
      ),
    [doctors, state.institutionId]
  );
  const availablePatients = useMemo(
    () =>
      patients.filter((patient) => {
        if (state.institutionId && patient.institutionId !== state.institutionId) {
          return false;
        }
        if (state.doctorId && patient.doctorId !== state.doctorId) {
          return false;
        }
        return true;
      }),
    [patients, state.doctorId, state.institutionId]
  );

  const institutionOptions = institutions.map((institution) => ({
    value: institution.id,
    label: `${institution.name} (${institution.id})`,
  }));
  const doctorOptions = availableDoctors.map((doctor) => ({
    value: doctor.id,
    label: `${doctor.fullName} (${doctor.id})`,
  }));
  const patientOptions = availablePatients.map((patient) => ({
    value: patient.id,
    label: `${patient.fullName} (${patient.id})`,
  }));
  const canReplace = mode === "create" ? false : Boolean(detail?.record.canReplace);
  const canUpdate = mode === "create" ? false : Boolean(detail?.record.canUpdate);
  const canDelete = mode === "create" ? false : Boolean(detail?.record.canDelete);

  function buildPayload(keys: TwoPQMutableFieldKey[]) {
    return keys.reduce<Record<string, string>>((payload, key) => {
      payload[key] = state[key];
      return payload;
    }, {});
  }

  function validateRequiredFields() {
    for (const group of area.fieldGroups) {
      for (const field of group.fields) {
        if (field.required && !state[field.key].trim()) {
          setToast({
            id: Date.now(),
            tone: "error",
            message: `${field.label} is required.`,
          });
          return false;
        }
      }
    }

    return true;
  }

  async function handleCreate() {
    if (!validateRequiredFields()) {
      return;
    }

    setPendingAction("create");
    try {
      const response = await sdkFetch<{ record: TwoPQRecord }>(`/2pq/${area.key}`, {
        method: "POST",
        body: JSON.stringify(buildPayload(getFieldKeys(areaKey))),
      });
      setCreatedRecordId(response.record.id);
      setToast({
        id: Date.now(),
        tone: "success",
        message: `${area.label} record created.`,
      });
    } catch {
      setCreatedRecordId(null);
      setToast({
        id: Date.now(),
        tone: "error",
        message: `Unable to create ${area.label.toLowerCase()} record.`,
      });
      setPendingAction(null);
    }
  }

  function handleContinue() {
    if (!createdRecordId) {
      return;
    }

    router.push(`${area.route}?createdId=${encodeURIComponent(createdRecordId)}`);
  }

  async function handleReplace() {
    if (!detail || !validateRequiredFields()) {
      return;
    }

    setPendingAction("replace");
    try {
      await sdkFetch<{ record: TwoPQRecord }>(`/2pq/${area.key}/${detail.record.id}`, {
        method: "PUT",
        body: JSON.stringify(buildPayload(getFieldKeys(areaKey))),
      });
      setToast({
        id: Date.now(),
        tone: "success",
        message: `${area.label} record replaced.`,
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: `Unable to replace ${area.label.toLowerCase()} record.`,
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUpdate() {
    if (!detail || !changed) {
      return;
    }

    setPendingAction("update");
    try {
      await sdkFetch<{ record: TwoPQRecord }>(`/2pq/${area.key}/${detail.record.id}`, {
        method: "PATCH",
        body: JSON.stringify(buildPayload(changedKeys)),
      });
      setToast({
        id: Date.now(),
        tone: "success",
        message: `${area.label} record updated.`,
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: `Unable to update ${area.label.toLowerCase()} record.`,
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    if (!detail) {
      return;
    }

    setPendingAction("delete");
    try {
      await sdkFetch(`/2pq/${area.key}/${detail.record.id}`, {
        method: "DELETE",
      });
      router.push(area.route);
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: `Unable to delete ${area.label.toLowerCase()} record.`,
      });
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />
      {createdRecordId ? (
        <div className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-background/36 backdrop-blur-[3px]" />
          <div className="pointer-events-auto animate-in fade-in-0 zoom-in-95 relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-emerald-300/38 bg-[linear-gradient(155deg,rgba(74,222,128,0.34),rgba(7,30,22,0.97)_52%,rgba(5,150,105,0.92))] px-6 py-8 text-center shadow-[0_34px_120px_rgba(34,197,94,0.34)]">
            {CREATION_CONFETTI.map((particle, index) => (
              <span
                key={`${particle.left}-${particle.delay}-${index}`}
                className="two-pq-confetti absolute h-3 w-3 rounded-[5px]"
                style={{
                  left: particle.left,
                  top: particle.top,
                  background: particle.color,
                  animationDelay: particle.delay,
                  animationDuration: particle.duration,
                }}
              />
            ))}
            <div className="relative flex flex-col items-center">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-200/18 text-emerald-50 shadow-[0_0_0_14px_rgba(74,222,128,0.12)]">
                <span className="two-pq-success-ring absolute inset-0 rounded-full border border-emerald-200/55" />
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-50/88">
                Entity Created
              </p>
              <h3 className="mt-2 font-heading text-3xl font-semibold text-white">
                {area.label} record launched
              </h3>
              <p className="mt-2 max-w-md text-sm text-emerald-50/84">
                New record <span className="font-mono text-emerald-50">{createdRecordId}</span> is
                live and ready in the full {area.navLabel.toLowerCase()} list.
              </p>
              <Button
                onClick={handleContinue}
                className="mt-6 h-12 rounded-[1.1rem] border border-emerald-100/12 bg-[linear-gradient(180deg,rgba(110,231,183,0.98),rgba(16,185,129,0.96))] px-6 text-sm font-semibold text-emerald-950 shadow-[0_18px_48px_rgba(16,185,129,0.26)]"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={area.route}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to {area.navLabel.toLowerCase()}
          </Link>
        </Button>
        {detail ? (
          <span className="font-mono text-xs text-muted-foreground">{detail.record.id}</span>
        ) : null}
        <Badge variant="outline">{area.collectionKey}</Badge>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">2PQ</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? area.createLabel : `${area.label} workbench`}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{area.summary}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState(sourceState)}
              disabled={!changed || pendingAction !== null}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            {mode === "create" ? null : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleReplace()}
                  disabled={!canReplace || !changed || pendingAction !== null}
                >
                  <Save className="h-3.5 w-3.5" />
                  {pendingAction === "replace" ? "Replacing..." : "Replace"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleUpdate()}
                  disabled={!canUpdate || !changed || pendingAction !== null}
                >
                  <Save className="h-3.5 w-3.5" />
                  {pendingAction === "update" ? "Updating..." : "Update"}
                </Button>
                {canDelete ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={pendingAction !== null}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogMedia className="bg-destructive/12 text-destructive">
                          <AlertTriangle className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Delete {area.label} record?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes the Firestore document from <code>{area.collectionKey}</code>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => void handleDelete()}
                        >
                          Delete record
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="brand">Create</Badge>
          <Badge variant={canReplace ? "brand" : "outline"}>Replace</Badge>
          <Badge variant={canUpdate ? "success" : "outline"}>Update</Badge>
          <Badge variant={canDelete ? "destructive" : "outline"}>Delete</Badge>
        </div>

        {mode === "create" ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-0">
            <div className="pointer-events-auto mx-auto md:ml-[calc(var(--sidebar-width)+1rem)] md:mr-6 lg:mr-8">
              <div className="two-pq-create-dock rounded-[1.7rem] border border-white/12 bg-background/72 p-4 shadow-[0_-10px_38px_rgba(7,16,24,0.12),0_20px_48px_rgba(7,16,24,0.18)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/54">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/86">
                      Launch New Record
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {changed
                        ? `${changedKeys.length} field${changedKeys.length === 1 ? "" : "s"} staged for this ${area.label.toLowerCase()} record.`
                        : `Fill the required fields, then launch the ${area.label.toLowerCase()} record.`}
                    </p>
                  </div>
                  <Button
                    onClick={() => void handleCreate()}
                    disabled={pendingAction !== null}
                    className="h-16 w-full rounded-[1.35rem] border border-sky-200/12 bg-[linear-gradient(180deg,rgba(56,189,248,0.98),rgba(37,99,235,0.96))] text-base font-semibold text-white shadow-[0_18px_52px_rgba(37,99,235,0.34)] disabled:opacity-100 lg:min-w-[20rem] lg:w-auto lg:px-10"
                  >
                    {createdRecordId ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : pendingAction === "create" ? (
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                    ) : (
                      <Sparkles className="h-5 w-5" />
                    )}
                    {createdRecordId
                      ? "Record created"
                      : pendingAction === "create"
                        ? "Creating record..."
                        : "Create Record"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className={mode === "create" ? "grid gap-4 pb-40 md:pb-44" : "grid gap-4"}>
          {area.fieldGroups.map((group) => (
            <section
              key={group.title}
              className="rounded-2xl border border-border/70 bg-background/45 px-4 py-4"
            >
              <h3 className="font-heading text-lg font-semibold text-foreground">{group.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {group.fields.map((field) => {
                  const options =
                    field.optionSource === "institutions"
                      ? institutionOptions
                      : field.optionSource === "doctors"
                        ? doctorOptions
                        : field.optionSource === "patients"
                          ? patientOptions
                          : field.options;
                  const disabled =
                    pendingAction !== null ||
                    (field.key === "institutionId" && Boolean(scopedInstitutionId)) ||
                    (field.key === "doctorId" && Boolean(scopedDoctorId));

                  return (
                    <div
                      key={field.key}
                      className={field.type === "textarea" ? "space-y-2 md:col-span-2" : "space-y-2"}
                    >
                      <Label htmlFor={`${area.key}-${field.key}`}>{field.label}</Label>
                      {field.type === "textarea" ? (
                        <Textarea
                          id={`${area.key}-${field.key}`}
                          value={state[field.key]}
                          onChange={(event) =>
                            setState((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                          disabled={disabled}
                        />
                      ) : field.type === "select" ? (
                        <OptionSelectField
                          options={options ?? []}
                          value={state[field.key]}
                          onChange={(value) =>
                            setState((current) => {
                              const next = { ...current, [field.key]: value };
                              if (field.key === "institutionId" && current.institutionId !== value) {
                                next.doctorId = "";
                                next.patientId = "";
                              }
                              if (field.key === "doctorId" && current.doctorId !== value) {
                                next.patientId = "";
                              }
                              return next;
                            })
                          }
                          placeholder={field.placeholder ?? `Select ${field.label.toLowerCase()}`}
                          emptyLabel={`No ${field.label.toLowerCase()}`}
                          disabled={disabled}
                        />
                      ) : (
                        <Input
                          id={`${area.key}-${field.key}`}
                          type={field.type === "date" ? "date" : field.type === "email" ? "email" : "text"}
                          value={state[field.key]}
                          onChange={(event) =>
                            setState((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                          disabled={disabled}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
