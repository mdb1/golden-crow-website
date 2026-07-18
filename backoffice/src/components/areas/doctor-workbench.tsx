"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, RotateCcw, Save } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { AreaDeleteDialog } from "@/components/areas/area-delete-dialog";
import { OptionSelectField } from "@/components/constrained-fields";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  DoctorDetailRecord,
  DoctorRecord,
  InstitutionRecord,
} from "@/lib/admin-areas";
import { isInstitutionManagerRole, PERSON_STATUS_OPTIONS } from "@/lib/admin-areas";
import {
  canDeletePatientUi,
  canCreatePatientUi,
  canEditDoctorUi,
  getStatusBadgeVariant,
} from "@/lib/areas-ui";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { compactList } from "@/lib/moderation-utils";

type DoctorFormState = {
  institutionId: string;
  authEmail: string;
  authUid: string;
  fullName: string;
  specialty: string;
  licenseNumber: string;
  contactPhone: string;
  status: "active" | "inactive";
  notes: string;
};

function toDoctorFormState(
  doctor?: DoctorRecord | null,
  fallbackInstitutionId?: string
): DoctorFormState {
  return {
    institutionId: doctor?.institutionId ?? fallbackInstitutionId ?? "",
    authEmail: doctor?.authEmail ?? "",
    authUid: doctor?.authUid ?? "",
    fullName: doctor?.fullName ?? "",
    specialty: doctor?.specialty ?? "",
    licenseNumber: doctor?.licenseNumber ?? "",
    contactPhone: doctor?.contactPhone ?? "",
    status: doctor?.status ?? "active",
    notes: doctor?.notes ?? "",
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function DoctorWorkbench({
  detail,
  institutions,
  mode = "edit",
  initialInstitutionId,
}: {
  detail?: DoctorDetailRecord;
  institutions: InstitutionRecord[];
  mode?: "create" | "edit";
  initialInstitutionId?: string;
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const scopedInstitutionId =
    isInstitutionManagerRole(adminContext.role) || adminContext.role === "institution_doctor"
      ? adminContext.institutionId
      : undefined;
  const defaultInstitutionId =
    scopedInstitutionId ?? initialInstitutionId ?? detail?.doctor.institutionId;
  const [state, setState] = useState<DoctorFormState>(() =>
    toDoctorFormState(detail?.doctor, defaultInstitutionId)
  );
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const sourceState = useMemo(
    () => toDoctorFormState(detail?.doctor, defaultInstitutionId),
    [defaultInstitutionId, detail?.doctor]
  );
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);
  const isEditable =
    mode === "create" ||
    (detail ? canEditDoctorUi(adminContext, detail.doctor) : false);
  const selectedInstitution = institutions.find(
    (institution) => institution.id === state.institutionId
  );

  async function handleSave() {
    if (!state.institutionId.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Select an institution for this doctor."),
      });
      return;
    }

    if (!isValidEmail(state.authEmail.trim())) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Doctor auth email is required and must be valid."),
      });
      return;
    }

    if (!state.fullName.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Doctor full name is required."),
      });
      return;
    }

    setPending(true);

    try {
      const body = {
        institutionId: state.institutionId,
        authEmail: state.authEmail,
        authUid: state.authUid,
        fullName: state.fullName,
        specialty: state.specialty,
        licenseNumber: state.licenseNumber,
        contactPhone: state.contactPhone,
        status: state.status,
        notes: state.notes,
      };

      if (mode === "create") {
        const response = await sdkFetch<{ doctor: DoctorRecord }>("/areas/doctors", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setToast({
          id: Date.now(),
          tone: "success",
          message: t("Doctor created."),
        });
        router.push(`/areas/doctors/${response.doctor.id}`);
        router.refresh();
        return;
      }

      if (!detail) {
        return;
      }

      await sdkFetch<{ doctor: DoctorRecord }>(`/areas/doctors/${detail.doctor.id}`, {
        method: "PUT",
        body: JSON.stringify({
          authEmail: state.authEmail,
          authUid: state.authUid,
          fullName: state.fullName,
          specialty: state.specialty,
          licenseNumber: state.licenseNumber,
          contactPhone: state.contactPhone,
          status: state.status,
          notes: state.notes,
        }),
      });
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Doctor changes saved."),
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: mode === "create" ? t("Unable to create the doctor.") : t("Unable to save the doctor."),
      });
    } finally {
      setPending(false);
    }
  }

  const institutionOptions = institutions.map((institution) => ({
    value: institution.id,
    label: `${institution.name} (${institution.id})`,
  }));

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/areas/doctors">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("Back to doctors")}
          </Link>
        </Button>
        {detail ? (
          <span className="font-mono text-xs text-muted-foreground">
            {detail.doctor.id}
          </span>
        ) : null}
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? t("Create doctor") : t("Doctor workbench")}
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
                  ? t("Create doctor")
                  : t("Save doctor")}
            </Button>
          </div>
        </div>

        {!isEditable ? (
          <div className="rounded-2xl border border-border/80 bg-background/65 px-4 py-3 text-sm text-muted-foreground">
            {t("This doctor record is read only for the current role.")}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="doctor-institution">{t("Institution")}</Label>
            {mode === "create" ? (
              <OptionSelectField
                options={institutionOptions}
                value={state.institutionId}
                onChange={(institutionId) =>
                  setState((current) => ({ ...current, institutionId }))
                }
                placeholder={t("Select institution")}
                emptyLabel={t("No institution")}
                disabled={!isEditable || Boolean(scopedInstitutionId)}
              />
            ) : (
              <Input
                id="doctor-institution"
                value={selectedInstitution?.name ?? detail?.institution?.name ?? state.institutionId}
                disabled
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctor-status">{t("Status")}</Label>
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
          <div className="space-y-2">
            <Label htmlFor="doctor-email">{t("Auth email")}</Label>
            <Input
              id="doctor-email"
              value={state.authEmail}
              onChange={(event) =>
                setState((current) => ({ ...current, authEmail: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctor-auth-uid">{t("Auth uid")}</Label>
            <Input
              id="doctor-auth-uid"
              value={state.authUid}
              onChange={(event) =>
                setState((current) => ({ ...current, authUid: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctor-full-name">{t("Full name")}</Label>
            <Input
              id="doctor-full-name"
              value={state.fullName}
              onChange={(event) =>
                setState((current) => ({ ...current, fullName: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctor-specialty">{t("Specialty")}</Label>
            <Input
              id="doctor-specialty"
              value={state.specialty}
              onChange={(event) =>
                setState((current) => ({ ...current, specialty: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctor-license">{t("License number")}</Label>
            <Input
              id="doctor-license"
              value={state.licenseNumber}
              onChange={(event) =>
                setState((current) => ({ ...current, licenseNumber: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctor-phone">{t("Contact phone")}</Label>
            <Input
              id="doctor-phone"
              value={state.contactPhone}
              onChange={(event) =>
                setState((current) => ({ ...current, contactPhone: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="doctor-notes">{t("Notes")}</Label>
            <Textarea
              id="doctor-notes"
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
        <section className="glass-panel flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {t("Linked institution")}
              </h3>
            </div>
            {detail.institution ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/areas/institutions/${detail.institution.id}`}>
                  {t("Open institution")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">
                {detail.institution?.name ?? t("Missing institution")}
              </p>
              {detail.institution ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {detail.institution.id}
                </span>
              ) : null}
              <Badge variant={getStatusBadgeVariant(detail.doctor.status)}>
                {t(detail.doctor.status)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {compactList([
                detail.institution?.contactEmail,
                detail.institution?.city,
                detail.institution?.country,
              ]) || t("Institution details")}
            </p>
          </div>
        </section>
      ) : null}

      {detail ? (
        <section className="glass-panel flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {t("Patients tied to this doctor")}
              </h3>
            </div>
            {canCreatePatientUi(adminContext, detail.doctor.institutionId, detail.doctor.id) ? (
              <Button size="sm" asChild>
                <Link
                  href={`/areas/patients/new?institutionId=${detail.doctor.institutionId}&doctorId=${detail.doctor.id}`}
                >
                  {t("Add patient")}
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3">
            {detail.patients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("No patients are tied to this doctor yet.")}
              </p>
            ) : (
              detail.patients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-background/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{patient.fullName}</p>
                      <span className="font-mono text-xs text-muted-foreground">
                        {patient.id}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {compactList([
                        patient.email,
                        patient.medicalRecordNumber,
                        patient.sex,
                      ]) || t("Patient record")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(patient.status)}>
                      {t(patient.status)}
                    </Badge>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/areas/patients/${patient.id}`}>
                        {t("Open")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <AreaDeleteDialog
                      kind="patient"
                      id={patient.id}
                      name={patient.fullName}
                      endpoint={`/areas/patients/${patient.id}`}
                      disabled={!canDeletePatientUi(adminContext, patient)}
                      disabledReason={t("Current role cannot delete this patient.")}
                      onDeleted={() => router.refresh()}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

    </div>
  );
}
