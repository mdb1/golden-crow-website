"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw, Save } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { AreaDeleteDialog } from "@/components/areas/area-delete-dialog";
import { OptionSelectField } from "@/components/constrained-fields";
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
import { PERSON_STATUS_OPTIONS } from "@/lib/admin-areas";
import {
  canDeletePatientUi,
  canCreatePatientUi,
  canEditDoctorUi,
  getStatusBadgeVariant,
} from "@/lib/areas-ui";
import { sdkFetch } from "@/lib/sdk-client";
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
  const router = useRouter();
  const scopedInstitutionId =
    adminContext.role === "institution_admin" || adminContext.role === "institution_doctor"
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
        message: "Select an institution for this doctor.",
      });
      return;
    }

    if (!isValidEmail(state.authEmail.trim())) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Doctor auth email is required and must be valid.",
      });
      return;
    }

    if (!state.fullName.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Doctor full name is required.",
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
          message: "Doctor created.",
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
        message: "Doctor changes saved.",
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: mode === "create" ? "Unable to create the doctor." : "Unable to save the doctor.",
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
          <Link href="/areas/doctors">Back to doctors</Link>
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
            <p className="section-eyebrow">Areas</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? "Create doctor" : "Doctor workbench"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Doctors stay tied to one institution. The institution is selected
              on create, then the doctor detail becomes the main edit surface.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState(sourceState)}
              disabled={!changed || pending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={pending || !isEditable || (!changed && mode === "edit")}
            >
              <Save className="h-3.5 w-3.5" />
              {pending
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                  ? "Create doctor"
                  : "Save doctor"}
            </Button>
          </div>
        </div>

        {!isEditable ? (
          <div className="rounded-2xl border border-border/80 bg-background/65 px-4 py-3 text-sm text-muted-foreground">
            This doctor record is read only for the current role.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="doctor-institution">Institution</Label>
            {mode === "create" ? (
              <OptionSelectField
                options={institutionOptions}
                value={state.institutionId}
                onChange={(institutionId) =>
                  setState((current) => ({ ...current, institutionId }))
                }
                placeholder="Select institution"
                emptyLabel="No institution"
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
            <Label htmlFor="doctor-status">Status</Label>
            <OptionSelectField
              options={PERSON_STATUS_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              value={state.status}
              onChange={(status) =>
                setState((current) => ({
                  ...current,
                  status: status === "inactive" ? "inactive" : "active",
                }))
              }
              placeholder="Select status"
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctor-email">Auth email</Label>
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
            <Label htmlFor="doctor-auth-uid">Auth uid</Label>
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
            <Label htmlFor="doctor-full-name">Full name</Label>
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
            <Label htmlFor="doctor-specialty">Specialty</Label>
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
            <Label htmlFor="doctor-license">License number</Label>
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
            <Label htmlFor="doctor-phone">Contact phone</Label>
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
            <Label htmlFor="doctor-notes">Notes</Label>
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
              <p className="section-eyebrow">Institution</p>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Linked institution
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Doctors can read the whole institution and the rest of the team
                here, but edit only their own doctor file.
              </p>
            </div>
            {detail.institution ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/areas/institutions/${detail.institution.id}`}>
                  Open institution
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">
                {detail.institution?.name ?? "Missing institution"}
              </p>
              {detail.institution ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {detail.institution.id}
                </span>
              ) : null}
              <Badge variant={getStatusBadgeVariant(detail.doctor.status)}>
                {detail.doctor.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {compactList([
                detail.institution?.contactEmail,
                detail.institution?.city,
                detail.institution?.country,
              ]) || "Institution details"}
            </p>
          </div>
        </section>
      ) : null}

      {detail ? (
        <section className="glass-panel flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-eyebrow">Patients</p>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Patients tied to this doctor
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Doctors can CRUD only their own patients. Institution admins and
                full admins can use the same list as the direct patient handoff.
              </p>
            </div>
            {canCreatePatientUi(adminContext, detail.doctor.institutionId, detail.doctor.id) ? (
              <Button size="sm" asChild>
                <Link
                  href={`/areas/patients/new?institutionId=${detail.doctor.institutionId}&doctorId=${detail.doctor.id}`}
                >
                  Add patient
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3">
            {detail.patients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No patients are tied to this doctor yet.
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
                      ]) || "Patient record"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(patient.status)}>
                      {patient.status}
                    </Badge>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/areas/patients/${patient.id}`}>
                        Open
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <AreaDeleteDialog
                      kind="patient"
                      id={patient.id}
                      name={patient.fullName}
                      endpoint={`/areas/patients/${patient.id}`}
                      disabled={!canDeletePatientUi(adminContext, patient)}
                      disabledReason="Current role cannot delete this patient."
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
