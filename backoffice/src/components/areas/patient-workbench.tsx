"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { OptionSelectField } from "@/components/constrained-fields";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
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
import type {
  DoctorListItem,
  InstitutionRecord,
  PatientDetailRecord,
  PatientRecord,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import { isInstitutionManagerRole, PERSON_STATUS_OPTIONS } from "@/lib/admin-areas";
import {
  canEditPatientUi,
  getStatusBadgeVariant,
} from "@/lib/areas-ui";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { compactList } from "@/lib/moderation-utils";

type PatientFormState = {
  institutionId: string;
  doctorId: string;
  email: string;
  fullName: string;
  medicalRecordNumber: string;
  birthDate: string;
  sex: string;
  status: "active" | "inactive";
  notes: string;
};

function toPatientFormState(
  patient?: PatientRecord | null,
  defaults?: {
    institutionId?: string;
    doctorId?: string;
  }
): PatientFormState {
  return {
    institutionId: patient?.institutionId ?? defaults?.institutionId ?? "",
    doctorId: patient?.doctorId ?? defaults?.doctorId ?? "",
    email: patient?.email ?? "",
    fullName: patient?.fullName ?? "",
    medicalRecordNumber: patient?.medicalRecordNumber ?? "",
    birthDate: patient?.birthDate ? patient.birthDate.slice(0, 10) : "",
    sex: patient?.sex ?? "",
    status: patient?.status ?? "active",
    notes: patient?.notes ?? "",
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function PatientWorkbench({
  detail,
  institutions,
  doctors,
  mode = "edit",
  initialInstitutionId,
  initialDoctorId,
}: {
  detail?: PatientDetailRecord;
  institutions: InstitutionRecord[];
  doctors: DoctorListItem[];
  mode?: "create" | "edit";
  initialInstitutionId?: string;
  initialDoctorId?: string;
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const scopedInstitutionId =
    isInstitutionManagerRole(adminContext.role) || adminContext.role === "institution_doctor"
      ? adminContext.institutionId
      : undefined;
  const scopedDoctorId =
    adminContext.role === "institution_doctor" ? adminContext.doctorId : undefined;
  const defaultInstitutionId =
    scopedInstitutionId ?? initialInstitutionId ?? detail?.patient.institutionId;
  const suggestedDoctorId = scopedDoctorId ?? initialDoctorId ?? detail?.patient.doctorId;
  const defaultDoctorId = doctors.some(
    (doctor) =>
      doctor.id === suggestedDoctorId &&
      (!defaultInstitutionId || doctor.institutionId === defaultInstitutionId)
  )
    ? suggestedDoctorId
    : "";
  const defaults = {
    institutionId: defaultInstitutionId,
    doctorId: defaultDoctorId,
  };
  const [state, setState] = useState<PatientFormState>(() =>
    toPatientFormState(detail?.patient, defaults)
  );
  const [pending, setPending] = useState(false);
  const [grantingPortalAccess, setGrantingPortalAccess] = useState(false);
  const [portalAccessGranted, setPortalAccessGranted] = useState(
    Boolean(
      detail?.roleRecord?.role === "patient" &&
        detail.roleRecord.isActive &&
        detail.roleRecord.canAccessPatientPortal,
    ),
  );
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const sourceState = useMemo(
    () => toPatientFormState(detail?.patient, defaults),
    [defaults.doctorId, defaults.institutionId, detail?.patient]
  );
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);
  const isEditable =
    mode === "create" ||
    (detail ? canEditPatientUi(adminContext, detail.patient) : false);
  const institutionOptions = institutions.map((institution) => ({
    value: institution.id,
    label: `${institution.name} (${institution.id})`,
  }));
  const availableDoctors = doctors.filter((doctor) => {
    if (!state.institutionId) {
      return true;
    }
    return doctor.institutionId === state.institutionId;
  });
  const doctorOptions = availableDoctors.map((doctor) => ({
    value: doctor.id,
    label: `${doctor.fullName} (${doctor.id})`,
  }));
  const selectedInstitution = institutions.find(
    (institution) => institution.id === state.institutionId
  );
  const selectedDoctor = doctors.find((doctor) => doctor.id === state.doctorId);

  async function handleSave() {
    if (!state.institutionId.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Select an institution for this patient."),
      });
      return;
    }

    if (!state.doctorId.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Select a doctor for this patient."),
      });
      return;
    }

    if (!isValidEmail(state.email.trim())) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Patient email is required and must be valid."),
      });
      return;
    }

    if (!state.fullName.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Patient full name is required."),
      });
      return;
    }

    setPending(true);

    try {
      const body = {
        institutionId: state.institutionId,
        doctorId: state.doctorId,
        email: state.email,
        fullName: state.fullName,
        medicalRecordNumber: state.medicalRecordNumber,
        birthDate: state.birthDate,
        sex: state.sex,
        status: state.status,
        notes: state.notes,
      };

      if (mode === "create") {
        const response = await sdkFetch<{ patient: PatientRecord }>("/areas/patients", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setToast({
          id: Date.now(),
          tone: "success",
          message: t("Patient created."),
        });
        router.push(`/areas/patients/${response.patient.id}`);
        router.refresh();
        return;
      }

      if (!detail) {
        return;
      }

      await sdkFetch<{ patient: PatientRecord }>(`/areas/patients/${detail.patient.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Patient changes saved."),
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: mode === "create" ? t("Unable to create the patient.") : t("Unable to save the patient."),
      });
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!detail) {
      return;
    }

    setPending(true);
    try {
      await sdkFetch(`/areas/patients/${detail.patient.id}`, {
        method: "DELETE",
      });
      router.push("/areas/patients");
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to delete the patient."),
      });
      setPending(false);
    }
  }

  async function handleGrantPatientPortalAccess() {
    if (!detail) {
      return;
    }

    setGrantingPortalAccess(true);
    try {
      await sdkFetch<{ role: RoleManagementRecord }>(
        `/areas/patients/${encodeURIComponent(detail.patient.id)}/patient-portal-access`,
        { method: "POST" },
      );
      setPortalAccessGranted(true);
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Patient portal access granted."),
      });
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("Unable to grant patient portal access."),
      });
    } finally {
      setGrantingPortalAccess(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/areas/patients">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("Back to patients")}
          </Link>
        </Button>
        {detail ? (
          <span className="font-mono text-xs text-muted-foreground">
            {detail.patient.id}
          </span>
        ) : null}
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? t("Create patient") : t("Patient workbench")}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeaderUnclutterButton />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState(sourceState)}
              disabled={!changed || pending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("Reset")}
            </Button>
            {detail && isEditable ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={pending}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("Delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia className="bg-destructive/12 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                    </AlertDialogMedia>
                    <AlertDialogTitle>{t("Delete patient")} {detail.patient.fullName}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("This removes the patient record and any linked patient role assignment.")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => void handleDelete()}
                    >
                      {t("Delete patient")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={pending || !isEditable || (!changed && mode === "edit")}
            >
              <Save className="h-3.5 w-3.5" />
              {pending
                ? mode === "create"
                  ? t("Creating...")
                  : t("Saving...")
                : mode === "create"
                  ? t("Create patient")
                  : t("Save patient")}
            </Button>
          </div>
        </div>

        {!isEditable ? (
          <div className="rounded-2xl border border-border/80 bg-background/65 px-4 py-3 text-sm text-muted-foreground">
            {t("This patient record is read only for the current role.")}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="patient-institution">{t("Institution")}</Label>
              <OptionSelectField
                options={institutionOptions}
                value={state.institutionId}
                onChange={(institutionId) => {
                  const nextInstitutionDoctors = doctors.filter(
                    (doctor) => doctor.institutionId === institutionId
                  );
                  setState((current) => ({
                    ...current,
                    institutionId,
                    doctorId:
                      nextInstitutionDoctors.some(
                        (doctor) => doctor.id === current.doctorId
                      )
                      ? current.doctorId
                      : "",
                  }));
                }}
                placeholder={t("Select institution")}
                emptyLabel={t("No institution")}
                disabled={!isEditable || Boolean(scopedInstitutionId)}
              />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-doctor">{t("Doctor")}</Label>
              <OptionSelectField
                options={doctorOptions}
                value={state.doctorId}
                onChange={(doctorId) =>
                  setState((current) => ({ ...current, doctorId }))
                }
                placeholder={t("Select doctor")}
                emptyLabel={t("No doctor")}
                disabled={!isEditable || Boolean(scopedDoctorId)}
              />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-email">{t("Email")}</Label>
            <Input
              id="patient-email"
              value={state.email}
              onChange={(event) =>
                setState((current) => ({ ...current, email: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-full-name">{t("Full name")}</Label>
            <Input
              id="patient-full-name"
              value={state.fullName}
              onChange={(event) =>
                setState((current) => ({ ...current, fullName: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-mrn">{t("Medical record number")}</Label>
            <Input
              id="patient-mrn"
              value={state.medicalRecordNumber}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  medicalRecordNumber: event.target.value,
                }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-birth-date">{t("Birth date")}</Label>
            <Input
              id="patient-birth-date"
              type="date"
              value={state.birthDate}
              onChange={(event) =>
                setState((current) => ({ ...current, birthDate: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-sex">{t("Sex / gender")}</Label>
            <Input
              id="patient-sex"
              value={state.sex}
              onChange={(event) =>
                setState((current) => ({ ...current, sex: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-status">{t("Status")}</Label>
            <OptionSelectField
              options={PERSON_STATUS_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.label),
              }))}
              value={state.status}
              onChange={(status) =>
                setState((current) => ({
                  ...current,
                  status: status === "inactive" ? "inactive" : "active",
                }))
              }
              placeholder={t("Select status")}
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="patient-notes">{t("Notes")}</Label>
            <Textarea
              id="patient-notes"
              value={state.notes}
              onChange={(event) =>
                setState((current) => ({ ...current, notes: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
        </div>
      </section>

      {detail ? (
        <section className="glass-panel flex flex-col gap-5 px-5 py-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {t("Patient portal access")}
              </h3>
              <Badge variant={portalAccessGranted ? "success" : "secondary"}>
                {portalAccessGranted ? t("Access granted") : t("No access")}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {portalAccessGranted
                ? t("This patient can sign in through the patient portal and open its patient-only pages.")
                : t("This patient does not currently have access to either the patient portal or the backoffice. Granting access creates an active patient role for the portal only.")}
            </p>
          </div>

          {detail.roleRecord && detail.roleRecord.role !== "patient" ? (
            <div className="rounded-lg border border-amber-400/35 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
              {t("This email already has a non-patient role. Patient portal access cannot be combined with backoffice access.")}
            </div>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="min-h-14 w-full bg-emerald-600 text-base font-semibold text-white shadow-[0_14px_32px_rgba(5,150,105,0.2)] hover:bg-emerald-700 sm:w-fit sm:min-w-80"
            onClick={() => void handleGrantPatientPortalAccess()}
            disabled={
              portalAccessGranted ||
              grantingPortalAccess ||
              !isEditable ||
              (detail.roleRecord !== null && detail.roleRecord.role !== "patient")
            }
          >
            {portalAccessGranted ? (
              <CheckCircle2 className="size-5" />
            ) : (
              <KeyRound className="size-5" />
            )}
            {portalAccessGranted
              ? t("Patient portal access granted")
              : grantingPortalAccess
                ? t("Granting access...")
                : t("Give access to the patient portal")}
          </Button>
        </section>
      ) : null}

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {t("Linked institution and doctor")}
          </h3>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">
                {selectedInstitution?.name ?? detail?.institution?.name ?? t("No institution")}
              </p>
              {selectedInstitution || detail?.institution ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {selectedInstitution?.id ?? detail?.institution?.id}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {compactList([
                selectedInstitution?.contactEmail ?? detail?.institution?.contactEmail,
                selectedInstitution?.city ?? detail?.institution?.city,
                selectedInstitution?.country ?? detail?.institution?.country,
              ]) || t("Institution link")}
            </p>
            {(selectedInstitution || detail?.institution) ? (
              <Button variant="link" size="sm" className="px-0" asChild>
                <Link href={`/areas/institutions/${selectedInstitution?.id ?? detail?.institution?.id}`}>
                  {t("Open institution")}
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">
                {selectedDoctor?.fullName ?? detail?.doctor?.fullName ?? t("No doctor")}
              </p>
              {selectedDoctor || detail?.doctor ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {selectedDoctor?.id ?? detail?.doctor?.id}
                </span>
              ) : null}
              {detail ? (
                <Badge variant={getStatusBadgeVariant(detail.patient.status)}>
                  {t(detail.patient.status)}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {compactList([
                selectedDoctor?.authEmail ?? detail?.doctor?.authEmail,
                selectedDoctor?.specialty ?? detail?.doctor?.specialty,
              ]) || t("Doctor link")}
            </p>
            {(selectedDoctor || detail?.doctor) ? (
              <Button variant="link" size="sm" className="px-0" asChild>
                <Link href={`/areas/doctors/${selectedDoctor?.id ?? detail?.doctor?.id}`}>
                  {t("Open doctor")}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

    </div>
  );
}
