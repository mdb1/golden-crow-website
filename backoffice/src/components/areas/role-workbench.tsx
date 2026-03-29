"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw, Save } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { OptionSelectField } from "@/components/constrained-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  getAssignableRoleOptions,
  type DoctorListItem,
  type InstitutionRecord,
  type PatientListItem,
  type RoleManagementRecord,
} from "@/lib/admin-areas";
import { getRoleBadgeVariant, ROLE_CAPABILITY_LINES } from "@/lib/areas-ui";
import { sdkFetch } from "@/lib/sdk-client";
import { compactList } from "@/lib/moderation-utils";

type RoleFormState = {
  email: string;
  role: RoleManagementRecord["role"];
  institutionId: string;
  doctorId: string;
  patientId: string;
  isActive: boolean;
  displayName: string;
  notes: string;
};

function toRoleFormState(
  record?: RoleManagementRecord | null,
  defaults?: { institutionId?: string; doctorId?: string }
): RoleFormState {
  return {
    email: record?.email ?? "",
    role: record?.role ?? "institution_admin",
    institutionId: record?.institutionId ?? defaults?.institutionId ?? "",
    doctorId: record?.doctorId ?? defaults?.doctorId ?? "",
    patientId: record?.patientId ?? "",
    isActive: record?.isActive ?? true,
    displayName: record?.displayName ?? "",
    notes: record?.notes ?? "",
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function RoleWorkbench({
  roleRecord,
  institutions,
  doctors,
  patients,
  mode = "edit",
}: {
  roleRecord?: RoleManagementRecord | null;
  institutions: InstitutionRecord[];
  doctors: DoctorListItem[];
  patients: PatientListItem[];
  mode?: "create" | "edit";
}) {
  const adminContext = useAdminContext();
  const router = useRouter();
  const defaults = {
    institutionId:
      adminContext.role === "institution_admin" || adminContext.role === "institution_doctor"
        ? adminContext.institutionId
        : undefined,
    doctorId: adminContext.role === "institution_doctor" ? adminContext.doctorId : undefined,
  };
  const initialRole =
    mode === "create"
      ? getAssignableRoleOptions(adminContext.role)[0]?.value ?? "patient"
      : roleRecord?.role ?? "patient";
  const [state, setState] = useState<RoleFormState>(() => ({
    ...toRoleFormState(roleRecord, defaults),
    role: initialRole,
  }));
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const sourceState = useMemo(
    () => ({
      ...toRoleFormState(roleRecord, defaults),
      role: initialRole,
    }),
    [defaults, initialRole, roleRecord]
  );
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);
  const roleOptions = getAssignableRoleOptions(adminContext.role);
  const institutionOptions = institutions.map((institution) => ({
    value: institution.id,
    label: `${institution.name} (${institution.id})`,
  }));
  const doctorOptions = doctors
    .filter((doctor) =>
      state.institutionId ? doctor.institutionId === state.institutionId : true
    )
    .map((doctor) => ({
      value: doctor.id,
      label: `${doctor.fullName} (${doctor.id})`,
    }));
  const patientOptions = patients
    .filter((patient) => {
      if (state.institutionId && patient.institutionId !== state.institutionId) {
        return false;
      }
      if (state.doctorId && patient.doctorId !== state.doctorId) {
        return false;
      }
      return true;
    })
    .map((patient) => ({
      value: patient.id,
      label: `${patient.fullName} (${patient.id})`,
    }));

  const selectedInstitution = institutions.find(
    (institution) => institution.id === state.institutionId
  );
  const selectedDoctor = doctors.find((doctor) => doctor.id === state.doctorId);
  const selectedPatient = patients.find((patient) => patient.id === state.patientId);

  function applyRoleDefaults(nextRole: RoleManagementRecord["role"]) {
    setState((current) => {
      if (nextRole === "full_admin") {
        return {
          ...current,
          role: nextRole,
          institutionId: "",
          doctorId: "",
          patientId: "",
        };
      }

      const institutionId =
        adminContext.role === "institution_admin" || adminContext.role === "institution_doctor"
          ? adminContext.institutionId ?? current.institutionId
          : current.institutionId;

      if (nextRole === "institution_admin") {
        return {
          ...current,
          role: nextRole,
          institutionId,
          doctorId: "",
          patientId: "",
        };
      }

      if (nextRole === "institution_doctor") {
        return {
          ...current,
          role: nextRole,
          institutionId,
          doctorId:
            adminContext.role === "institution_doctor"
              ? adminContext.doctorId ?? current.doctorId
              : current.doctorId,
          patientId: "",
        };
      }

      return {
        ...current,
        role: nextRole,
        institutionId,
        doctorId:
          adminContext.role === "institution_doctor"
            ? adminContext.doctorId ?? current.doctorId
            : current.doctorId,
      };
    });
  }

  async function handleSave() {
    if (!isValidEmail(state.email.trim())) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Role email is required and must be valid.",
      });
      return;
    }

    if (state.role !== "full_admin" && !state.institutionId.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Institution-scoped roles require an institution.",
      });
      return;
    }

    if (state.role === "institution_doctor" && !state.doctorId.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Institution-doctor roles require a doctor link.",
      });
      return;
    }

    if (state.role === "patient" && (!state.doctorId.trim() || !state.patientId.trim())) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Patient roles require both a doctor and a patient link.",
      });
      return;
    }

    setPending(true);

    try {
      await sdkFetch<{ role: RoleManagementRecord }>(
        `/roles/${encodeURIComponent(state.email)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            role: state.role,
            institutionId: state.role === "full_admin" ? undefined : state.institutionId,
            doctorId:
              state.role === "institution_doctor" || state.role === "patient"
                ? state.doctorId
                : undefined,
            patientId: state.role === "patient" ? state.patientId : undefined,
            isActive: state.isActive,
            displayName: state.displayName,
            notes: state.notes,
          }),
        }
      );

      setToast({
        id: Date.now(),
        tone: "success",
        message: mode === "create" ? "Role assignment created." : "Role assignment saved.",
      });
      router.push(`/roles/${encodeURIComponent(state.email)}`);
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          mode === "create"
            ? "Unable to create the role assignment."
            : "Unable to save the role assignment.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/roles">Back to roles</Link>
        </Button>
        {mode === "edit" && roleRecord ? (
          <span className="font-mono text-xs text-muted-foreground">
            {roleRecord.email}
          </span>
        ) : null}
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Access</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? "Create role assignment" : "Role workbench"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Roles are attached to emails, then constrained by institution,
              doctor, and patient links according to the permission tree.
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
              disabled={pending || !changed}
            >
              <Save className="h-3.5 w-3.5" />
              {pending
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                  ? "Create role"
                  : "Save role"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role-email">User email</Label>
            <Input
              id="role-email"
              value={state.email}
              onChange={(event) =>
                setState((current) => ({ ...current, email: event.target.value }))
              }
              disabled={mode === "edit"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-type">Role</Label>
            <OptionSelectField
              options={roleOptions}
              value={state.role}
              onChange={(role) => applyRoleDefaults(role as RoleManagementRecord["role"])}
              placeholder="Select role"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-active">Role state</Label>
            <OptionSelectField
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              value={state.isActive ? "active" : "inactive"}
              onChange={(value) =>
                setState((current) => ({ ...current, isActive: value !== "inactive" }))
              }
              placeholder="Select role state"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-display-name">Display name</Label>
            <Input
              id="role-display-name"
              value={state.displayName}
              onChange={(event) =>
                setState((current) => ({ ...current, displayName: event.target.value }))
              }
            />
          </div>

          {state.role !== "full_admin" ? (
            <div className="space-y-2">
              <Label htmlFor="role-institution">Institution</Label>
              <OptionSelectField
                options={institutionOptions}
                value={state.institutionId}
                onChange={(institutionId) =>
                  setState((current) => ({
                    ...current,
                    institutionId,
                    doctorId: "",
                    patientId: "",
                  }))
                }
                placeholder="Select institution"
                emptyLabel="No institution"
                disabled={
                  adminContext.role === "institution_admin" ||
                  adminContext.role === "institution_doctor"
                }
              />
            </div>
          ) : null}

          {state.role === "institution_doctor" || state.role === "patient" ? (
            <div className="space-y-2">
              <Label htmlFor="role-doctor">Doctor link</Label>
              <OptionSelectField
                options={doctorOptions}
                value={state.doctorId}
                onChange={(doctorId) => {
                  const doctor = doctors.find((entry) => entry.id === doctorId);
                  setState((current) => ({
                    ...current,
                    doctorId,
                    institutionId: doctor?.institutionId ?? current.institutionId,
                    patientId: current.role === "patient" ? "" : current.patientId,
                    email:
                      current.role === "institution_doctor" && doctor?.authEmail
                        ? doctor.authEmail
                        : current.email,
                  }));
                }}
                placeholder="Select doctor"
                emptyLabel="No doctor"
                disabled={adminContext.role === "institution_doctor"}
              />
            </div>
          ) : null}

          {state.role === "patient" ? (
            <div className="space-y-2">
              <Label htmlFor="role-patient">Patient link</Label>
              <OptionSelectField
                options={patientOptions}
                value={state.patientId}
                onChange={(patientId) => {
                  const patient = patients.find((entry) => entry.id === patientId);
                  setState((current) => ({
                    ...current,
                    patientId,
                    institutionId: patient?.institutionId ?? current.institutionId,
                    doctorId: patient?.doctorId ?? current.doctorId,
                    email: patient?.email ?? current.email,
                  }));
                }}
                placeholder="Select patient"
                emptyLabel="No patient"
              />
            </div>
          ) : null}

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="role-notes">Notes</Label>
            <Textarea
              id="role-notes"
              value={state.notes}
              onChange={(event) =>
                setState((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>
        </div>
      </section>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="section-eyebrow">Permission tree</p>
          <Badge variant={getRoleBadgeVariant(state.role)}>
            {ADMIN_ROLE_LABELS[state.role]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {ADMIN_ROLE_DESCRIPTIONS[state.role]}
        </p>
        <div className="grid gap-2">
          {ROLE_CAPABILITY_LINES[state.role].map((line) => (
            <div
              key={line}
              className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3 text-sm text-foreground"
            >
              {line}
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div>
          <p className="section-eyebrow">Resolved scope</p>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            Linked records
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Use these links to confirm the role points at the exact institution, doctor, and patient you expect.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
            <p className="font-medium text-foreground">
              {selectedInstitution?.name ?? roleRecord?.institutionName ?? "No institution"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {compactList([
                selectedInstitution?.contactEmail,
                selectedInstitution?.city,
                selectedInstitution?.country,
              ]) || "Institution scope"}
            </p>
            {state.institutionId ? (
              <Button variant="link" size="sm" className="px-0" asChild>
                <Link href={`/areas/institutions/${state.institutionId}`}>
                  Open institution
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
            <p className="font-medium text-foreground">
              {selectedDoctor?.fullName ?? roleRecord?.doctorName ?? "No doctor"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {compactList([
                selectedDoctor?.authEmail,
                selectedDoctor?.specialty,
              ]) || "Doctor scope"}
            </p>
            {state.doctorId ? (
              <Button variant="link" size="sm" className="px-0" asChild>
                <Link href={`/areas/doctors/${state.doctorId}`}>Open doctor</Link>
              </Button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
            <p className="font-medium text-foreground">
              {selectedPatient?.fullName ?? roleRecord?.patientName ?? "No patient"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {compactList([
                selectedPatient?.email,
                selectedPatient?.medicalRecordNumber,
              ]) || "Patient scope"}
            </p>
            {state.patientId ? (
              <Button variant="link" size="sm" className="px-0" asChild>
                <Link href={`/areas/patients/${state.patientId}`}>Open patient</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
