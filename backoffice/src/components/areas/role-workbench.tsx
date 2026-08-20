"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Save } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { OptionSelectField } from "@/components/constrained-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_ROLE_LABELS,
  getAssignableRoleOptions,
  getAssignableRoleOptionsForContext,
  isInstitutionManagerRole,
  type DoctorListItem,
  type InstitutionRecord,
  type PatientListItem,
  type RoleManagementRecord,
} from "@/lib/admin-areas";
import type { DiscoverOrganizationRecord } from "@/lib/discover";
import type { DiscoverIndividualRecord } from "@/lib/discover";
import {
  canCreateRoleUi,
  canEditRoleUi,
  getRoleBadgeVariant,
  getRoleCreateRestrictionMessage,
  getRoleEditRestrictionMessage,
  ROLE_CAPABILITY_LINES,
} from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";
import { compactList } from "@/lib/moderation-utils";

type RoleFormState = {
  email: string;
  role: RoleManagementRecord["role"];
  organizationId: string;
  individualId: string;
  institutionId: string;
  doctorId: string;
  patientId: string;
  isActive: boolean;
  displayName: string;
  notes: string;
};

function toRoleFormState(
  record?: RoleManagementRecord | null,
  defaults?: {
    email?: string;
    institutionId?: string;
    doctorId?: string;
    role?: RoleManagementRecord["role"];
  }
): RoleFormState {
  return {
    email: record?.email ?? defaults?.email ?? "",
    role: record?.role ?? defaults?.role ?? "institution_admin",
    organizationId: record?.organizationId ?? "",
    individualId: record?.individualId ?? "",
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
  organizations = [],
  individuals = [],
  mode = "edit",
  initialEmail,
  initialInstitutionId,
  fixedRole,
}: {
  roleRecord?: RoleManagementRecord | null;
  institutions: InstitutionRecord[];
  doctors: DoctorListItem[];
  patients: PatientListItem[];
  organizations?: DiscoverOrganizationRecord[];
  individuals?: DiscoverIndividualRecord[];
  mode?: "create" | "edit";
  initialEmail?: string;
  initialInstitutionId?: string;
  fixedRole?: RoleManagementRecord["role"];
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const defaults = useMemo(
    () => ({
      email: initialEmail?.trim() || undefined,
      institutionId:
        isInstitutionManagerRole(adminContext.role) ||
        adminContext.role === "institution_doctor"
          ? adminContext.institutionId
          : initialInstitutionId,
      doctorId:
        adminContext.role === "institution_doctor"
          ? adminContext.doctorId
          : undefined,
      role: mode === "create" ? fixedRole : undefined,
    }),
    [
      adminContext.doctorId,
      adminContext.institutionId,
      adminContext.role,
      fixedRole,
      initialInstitutionId,
      initialEmail,
      mode,
    ]
  );
  const roleOptions =
    mode === "create"
      ? getAssignableRoleOptionsForContext(adminContext)
      : getAssignableRoleOptions(adminContext.role);
  const initialRole =
    mode === "create"
      ? fixedRole ?? roleOptions[0]?.value ?? "patient"
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
  const fixedRoleIsAssignable = fixedRole
    ? roleOptions.some((option) => option.value === fixedRole)
    : true;
  const isEditable =
    mode === "create"
      ? canCreateRoleUi(adminContext) && fixedRoleIsAssignable
      : roleRecord
        ? canEditRoleUi(adminContext, roleRecord)
        : false;
  const restrictionMessage =
    !isEditable && mode === "create"
      ? getRoleCreateRestrictionMessage(adminContext)
      : !isEditable && roleRecord
        ? getRoleEditRestrictionMessage(adminContext, roleRecord)
        : null;
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
  const organizationOptions = organizations.map((organization) => ({
    value: organization.id,
    label: `${organization.name} (${organization.id})`,
  }));
  const individualOptions = individuals.map((individual) => ({
    value: individual.id,
    label: `${individual.name} (${individual.id})`,
  }));

  const selectedOrganization = organizations.find(
    (organization) => organization.id === state.organizationId
  );
  const selectedIndividual = individuals.find(
    (individual) => individual.id === state.individualId
  );
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
          organizationId: "",
          individualId: "",
          institutionId: "",
          doctorId: "",
          patientId: "",
        };
      }

      if (nextRole === "organization_publisher") {
        return {
          ...current,
          role: nextRole,
          individualId: "",
          institutionId: "",
          doctorId: "",
          patientId: "",
        };
      }

      if (nextRole === "individual_publisher") {
        return {
          ...current,
          role: nextRole,
          organizationId: "",
          institutionId: "",
          doctorId: "",
          patientId: "",
        };
      }

      const institutionId =
        isInstitutionManagerRole(adminContext.role) || adminContext.role === "institution_doctor"
          ? adminContext.institutionId ?? current.institutionId
          : current.institutionId;

      if (isInstitutionManagerRole(nextRole)) {
        return {
          ...current,
          role: nextRole,
          organizationId: "",
          individualId: "",
          institutionId,
          doctorId: "",
          patientId: "",
        };
      }

      if (nextRole === "institution_doctor") {
        return {
          ...current,
          role: nextRole,
          organizationId: "",
          individualId: "",
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
        organizationId: "",
        individualId: "",
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
        message: t("Role email is required and must be valid."),
      });
      return;
    }

    if (
      state.role === "organization_publisher" &&
      !state.organizationId.trim()
    ) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Organization publisher roles require an organization."),
      });
      return;
    }

    if (
      state.role === "individual_publisher" &&
      !state.individualId.trim()
    ) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Individual publisher roles require an individual publisher."),
      });
      return;
    }

    if (
      state.role !== "full_admin" &&
      state.role !== "organization_publisher" &&
      state.role !== "individual_publisher" &&
      !state.institutionId.trim()
    ) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Institution-scoped roles require an institution."),
      });
      return;
    }

    if (state.role === "institution_doctor" && !state.doctorId.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Institution-doctor roles require a doctor link."),
      });
      return;
    }

    if (state.role === "patient" && (!state.doctorId.trim() || !state.patientId.trim())) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Patient roles require both a doctor and a patient link."),
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
            organizationId:
              state.role === "organization_publisher"
                ? state.organizationId
                : undefined,
            individualId:
              state.role === "individual_publisher"
                ? state.individualId
                : undefined,
            institutionId:
              state.role === "full_admin" ||
              state.role === "organization_publisher" ||
              state.role === "individual_publisher"
                ? undefined
                : state.institutionId,
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
        message: mode === "create" ? t("Role assignment created.") : t("Role assignment saved."),
      });
      router.push(`/roles/${encodeURIComponent(state.email)}`);
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          mode === "create"
            ? t("Unable to create the role assignment.")
            : t("Unable to save the role assignment."),
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
          <Link href="/roles">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("Back to roles")}
          </Link>
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
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? t("Create role assignment") : t("Role workbench")}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeaderUnclutterButton />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState(sourceState)}
              disabled={!changed || pending || !isEditable}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("Reset")}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={pending || !changed || !isEditable}
            >
              <Save className="h-3.5 w-3.5" />
              {pending
                ? mode === "create"
                  ? t("Creating...")
                  : t("Saving...")
                : mode === "create"
                  ? t("Create role")
                  : t("Save role")}
            </Button>
          </div>
        </div>

        {restrictionMessage ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {t(restrictionMessage)}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role-email">{t("User email")}</Label>
            <Input
              id="role-email"
              value={state.email}
              onChange={(event) =>
                setState((current) => ({ ...current, email: event.target.value }))
              }
              disabled={mode === "edit" || !isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-type">{t("Role")}</Label>
            <OptionSelectField
              options={roleOptions
                .filter((option) => option.value !== "patient")
                .map((option) => ({
                  ...option,
                  label: t(option.label),
                }))}
              value={state.role}
              onChange={(role) => applyRoleDefaults(role as RoleManagementRecord["role"])}
              placeholder={t("Select role")}
              disabled={!isEditable || Boolean(fixedRole)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-active">{t("Role state")}</Label>
            <OptionSelectField
              options={[
                { value: "active", label: t("Active") },
                { value: "inactive", label: t("Inactive") },
              ]}
              value={state.isActive ? "active" : "inactive"}
              onChange={(value) =>
                setState((current) => ({ ...current, isActive: value !== "inactive" }))
              }
              placeholder={t("Select role state")}
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-display-name">{t("Display name")}</Label>
            <Input
              id="role-display-name"
              value={state.displayName}
              onChange={(event) =>
                setState((current) => ({ ...current, displayName: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>

          {state.role === "organization_publisher" ? (
            <div className="space-y-2">
              <Label htmlFor="role-organization">{t("Organization")}</Label>
              <OptionSelectField
                options={organizationOptions}
                value={state.organizationId}
                onChange={(organizationId) =>
                  setState((current) => ({
                    ...current,
                    organizationId,
                    institutionId: "",
                    doctorId: "",
                    patientId: "",
                  }))
                }
                placeholder={t("Select organization")}
                emptyLabel={t("No organization")}
                disabled={!isEditable || adminContext.role !== "full_admin"}
              />
            </div>
          ) : null}

          {state.role === "individual_publisher" ? (
            <div className="space-y-2">
              <Label htmlFor="role-individual">{t("Individual publisher")}</Label>
              <OptionSelectField
                options={individualOptions}
                value={state.individualId}
                onChange={(individualId) =>
                  setState((current) => ({
                    ...current,
                    individualId,
                    organizationId: "",
                    institutionId: "",
                    doctorId: "",
                    patientId: "",
                  }))
                }
                placeholder={t("Select individual publisher")}
                emptyLabel={t("No individual publisher")}
                disabled={!isEditable || adminContext.role !== "full_admin"}
              />
            </div>
          ) : null}

          {state.role !== "full_admin" &&
          state.role !== "organization_publisher" &&
          state.role !== "individual_publisher" ? (
            <div className="space-y-2">
              <Label htmlFor="role-institution">{t("Institution")}</Label>
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
                placeholder={t("Select institution")}
                emptyLabel={t("No institution")}
                disabled={
                  !isEditable ||
                  isInstitutionManagerRole(adminContext.role) ||
                  adminContext.role === "institution_doctor"
                }
              />
            </div>
          ) : null}

          {state.role === "institution_doctor" || state.role === "patient" ? (
            <div className="space-y-2">
              <Label htmlFor="role-doctor">{t("Doctor link")}</Label>
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
                placeholder={t("Select doctor")}
                emptyLabel={t("No doctor")}
                disabled={!isEditable || adminContext.role === "institution_doctor"}
              />
            </div>
          ) : null}

          {state.role === "patient" ? (
            <div className="space-y-2">
              <Label htmlFor="role-patient">{t("Patient link")}</Label>
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
                placeholder={t("Select patient")}
                emptyLabel={t("No patient")}
                disabled={!isEditable}
              />
            </div>
          ) : null}

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="role-notes">{t("Notes")}</Label>
            <Textarea
              id="role-notes"
              value={state.notes}
              onChange={(event) =>
                setState((current) => ({ ...current, notes: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
        </div>
      </section>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {t("Permission tree")}
          </h3>
          <Badge variant={getRoleBadgeVariant(state.role)}>
            {t(ADMIN_ROLE_LABELS[state.role])}
          </Badge>
        </div>
        <div className="grid gap-2">
          {ROLE_CAPABILITY_LINES[state.role].map((line) => (
            <div
              key={line}
              className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3 text-sm text-foreground"
            >
              {t(line)}
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {t("Linked records")}
          </h3>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {state.role === "organization_publisher" ? (
            <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
              <p className="font-medium text-foreground">
                {selectedOrganization?.name ??
                  roleRecord?.organizationName ??
                  t("No organization")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {compactList([
                  selectedOrganization?.contactEmail,
                  selectedOrganization?.countryCode,
                  selectedOrganization?.websiteUrl,
                ]) || t("Discover organization scope")}
              </p>
              {state.organizationId ? (
                <Button variant="link" size="sm" className="px-0" asChild>
                  <Link href={`/discover/organizations/${state.organizationId}`}>
                    {t("Open organization")}
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          {state.role === "individual_publisher" ? (
            <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
              <p className="font-medium text-foreground">
                {selectedIndividual?.name ??
                  roleRecord?.individualName ??
                  t("No individual publisher")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {compactList([
                  selectedIndividual?.contactEmail,
                  selectedIndividual?.countryCode,
                  selectedIndividual?.websiteUrl,
                ]) || t("Discover individual publisher scope")}
              </p>
              {state.individualId ? (
                <Button variant="link" size="sm" className="px-0" asChild>
                  <Link href={`/discover/individuals/${state.individualId}`}>
                    {t("Open individual publisher")}
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          {state.role !== "organization_publisher" &&
          state.role !== "individual_publisher" ? (
            <>
              <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
                <p className="font-medium text-foreground">
                  {selectedInstitution?.name ?? roleRecord?.institutionName ?? t("No institution")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([
                    selectedInstitution?.contactEmail,
                    selectedInstitution?.city,
                    selectedInstitution?.country,
                  ]) || t("Institution scope")}
                </p>
                {state.institutionId ? (
                  <Button variant="link" size="sm" className="px-0" asChild>
                    <Link href={`/areas/institutions/${state.institutionId}`}>
                      {t("Open institution")}
                    </Link>
                  </Button>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
                <p className="font-medium text-foreground">
                  {selectedDoctor?.fullName ?? roleRecord?.doctorName ?? t("No doctor")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([
                    selectedDoctor?.authEmail,
                    selectedDoctor?.specialty,
                  ]) || t("Doctor scope")}
                </p>
                {state.doctorId ? (
                  <Button variant="link" size="sm" className="px-0" asChild>
                    <Link href={`/areas/doctors/${state.doctorId}`}>{t("Open doctor")}</Link>
                  </Button>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
                <p className="font-medium text-foreground">
                  {selectedPatient?.fullName ?? roleRecord?.patientName ?? t("No patient")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([
                    selectedPatient?.email,
                    selectedPatient?.medicalRecordNumber,
                  ]) || t("Patient scope")}
                </p>
                {state.patientId ? (
                  <Button variant="link" size="sm" className="px-0" asChild>
                    <Link href={`/areas/patients/${state.patientId}`}>{t("Open patient")}</Link>
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
