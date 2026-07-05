"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw, Save } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { AreaDeleteDialog } from "@/components/areas/area-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getAssignableRoleOptions,
  type InstitutionDetailRecord,
  type InstitutionRecord,
} from "@/lib/admin-areas";
import {
  canCreateDoctorUi,
  canCreateRoleUi,
  canDeleteDoctorUi,
  canEditInstitutionUi,
} from "@/lib/areas-ui";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { compactList } from "@/lib/moderation-utils";

type InstitutionFormState = {
  code: string;
  name: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  notes: string;
};

function toInstitutionFormState(institution?: InstitutionRecord | null): InstitutionFormState {
  return {
    code: institution?.code ?? "",
    name: institution?.name ?? "",
    legalName: institution?.legalName ?? "",
    contactEmail: institution?.contactEmail ?? "",
    contactPhone: institution?.contactPhone ?? "",
    addressLine1: institution?.addressLine1 ?? "",
    addressLine2: institution?.addressLine2 ?? "",
    city: institution?.city ?? "",
    state: institution?.state ?? "",
    country: institution?.country ?? "",
    notes: institution?.notes ?? "",
  };
}

function isValidEmail(value: string) {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function InstitutionWorkbench({
  detail,
  mode = "edit",
}: {
  detail?: InstitutionDetailRecord;
  mode?: "create" | "edit";
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const [state, setState] = useState<InstitutionFormState>(() =>
    toInstitutionFormState(detail?.institution)
  );
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const sourceState = useMemo(
    () => toInstitutionFormState(detail?.institution),
    [detail?.institution]
  );
  const isEditable =
    mode === "create" ||
    (detail ? canEditInstitutionUi(adminContext, detail.institution.id) : false);
  const canCreateInstitutionOperator =
    canCreateRoleUi(adminContext) &&
    getAssignableRoleOptions(adminContext.role).some(
      (option) => option.value === "institution_operator"
    );
  const canCreateLaboratoryStaff =
    canCreateRoleUi(adminContext) &&
    getAssignableRoleOptions(adminContext.role).some(
      (option) => option.value === "institution_laboratory_staff"
    );
  const administrativeOperators =
    detail?.institutionAdmins.filter(
      (record) => record.role === "institution_operator"
    ) ?? [];
  const laboratoryStaff =
    detail?.institutionAdmins.filter(
      (record) => record.role === "institution_laboratory_staff"
    ) ?? [];

  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);

  async function handleSave() {
    if (!state.name.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Institution name is required."),
      });
      return;
    }

    if (!isValidEmail(state.contactEmail)) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Enter a valid institution contact email."),
      });
      return;
    }

    setPending(true);

    try {
      const body = {
        code: state.code,
        name: state.name,
        legalName: state.legalName,
        contactEmail: state.contactEmail,
        contactPhone: state.contactPhone,
        addressLine1: state.addressLine1,
        addressLine2: state.addressLine2,
        city: state.city,
        state: state.state,
        country: state.country,
        notes: state.notes,
      };

      if (mode === "create") {
        const response = await sdkFetch<{ institution: InstitutionRecord }>(
          "/areas/institutions",
          {
            method: "POST",
            body: JSON.stringify(body),
          }
        );

        setToast({
          id: Date.now(),
          tone: "success",
          message: t("Institution created."),
        });
        router.push(`/areas/institutions/${response.institution.id}`);
        router.refresh();
        return;
      }

      if (!detail) {
        return;
      }

      await sdkFetch<{ institution: InstitutionRecord }>(
        `/areas/institutions/${detail.institution.id}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        }
      );

      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Institution changes saved."),
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          mode === "create"
            ? t("Unable to create the institution.")
            : t("Unable to save the institution."),
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
          <Link href="/areas/institutions">{t("Back to institutions")}</Link>
        </Button>
        {detail ? (
          <span className="font-mono text-xs text-muted-foreground">
            {detail.institution.id}
          </span>
        ) : null}
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">{t("Areas")}</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? t("Create institution") : t("Institution workbench")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("Keep institution records direct and operational: one durable id, one readable descriptor set, and linked doctor operations from the same screen.")}
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
                  ? t("Create institution")
                  : t("Save institution")}
            </Button>
          </div>
        </div>

        {!isEditable ? (
          <div className="rounded-2xl border border-border/80 bg-background/65 px-4 py-3 text-sm text-muted-foreground">
            {t("This institution is read only for the current role.")}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="institution-code">{t("Institution code")}</Label>
            <Input
              id="institution-code"
              value={state.code}
              onChange={(event) =>
                setState((current) => ({ ...current, code: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="institution-name">{t("Institution name")}</Label>
            <Input
              id="institution-name"
              value={state.name}
              onChange={(event) =>
                setState((current) => ({ ...current, name: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="institution-legal-name">{t("Legal name")}</Label>
            <Input
              id="institution-legal-name"
              value={state.legalName}
              onChange={(event) =>
                setState((current) => ({ ...current, legalName: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="institution-email">{t("Contact email")}</Label>
            <Input
              id="institution-email"
              value={state.contactEmail}
              onChange={(event) =>
                setState((current) => ({ ...current, contactEmail: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="institution-phone">{t("Contact phone")}</Label>
            <Input
              id="institution-phone"
              value={state.contactPhone}
              onChange={(event) =>
                setState((current) => ({ ...current, contactPhone: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="institution-address-line-1">{t("Address line 1")}</Label>
            <Input
              id="institution-address-line-1"
              value={state.addressLine1}
              onChange={(event) =>
                setState((current) => ({ ...current, addressLine1: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="institution-address-line-2">{t("Address line 2")}</Label>
            <Input
              id="institution-address-line-2"
              value={state.addressLine2}
              onChange={(event) =>
                setState((current) => ({ ...current, addressLine2: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="institution-city">{t("City")}</Label>
            <Input
              id="institution-city"
              value={state.city}
              onChange={(event) =>
                setState((current) => ({ ...current, city: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="institution-state">{t("State / region")}</Label>
            <Input
              id="institution-state"
              value={state.state}
              onChange={(event) =>
                setState((current) => ({ ...current, state: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="institution-country">{t("Country")}</Label>
            <Input
              id="institution-country"
              value={state.country}
              onChange={(event) =>
                setState((current) => ({ ...current, country: event.target.value }))
              }
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="institution-notes">{t("Notes")}</Label>
            <Textarea
              id="institution-notes"
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
              <p className="section-eyebrow">{t("Institution doctors")}</p>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {t("Doctors attached to this institution")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Review the whole team here. Institution admins can add more doctors; institution doctors can inspect peers but only edit their own doctor record.")}
              </p>
            </div>
            {canCreateDoctorUi(adminContext, detail.institution.id) ? (
              <Button size="sm" asChild>
                <Link href={`/areas/doctors/new?institutionId=${detail.institution.id}`}>
                  {t("Add doctor")}
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3">
            {detail.doctors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("No doctors are attached to this institution yet.")}
              </p>
            ) : (
              detail.doctors.map((doctor) => (
                <div
                  key={doctor.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-background/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{doctor.fullName}</p>
                      <span className="font-mono text-xs text-muted-foreground">
                        {doctor.id}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {compactList([
                        doctor.authEmail,
                        doctor.specialty,
                        doctor.licenseNumber,
                      ]) || t("Doctor record")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{doctor.patientCount} {t("patients")}</Badge>
                    {doctor.roleEmail ? (
                      <Badge variant={doctor.roleActive ? "brand" : "warning"}>
                        {doctor.roleActive ? t("Role active") : t("Role inactive")}
                      </Badge>
                    ) : (
                      <Badge variant="warning">{t("No role")}</Badge>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/areas/doctors/${doctor.id}`}>
                        {t("Open")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <AreaDeleteDialog
                      kind="doctor"
                      id={doctor.id}
                      name={doctor.fullName}
                      endpoint={`/areas/doctors/${doctor.id}`}
                      disabled={!canDeleteDoctorUi(adminContext, doctor)}
                      disabledReason={t("Only full admins and institution admins can delete doctors in scope.")}
                      onDeleted={() => router.refresh()}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {detail ? (
        <section className="glass-panel flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-eyebrow">{t("Administrative operators")}</p>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {t("Administrative operators attached to this institution")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Administrative operators belong to this institution and do not have patient assignments underneath them.")}
              </p>
            </div>
            {canCreateInstitutionOperator ? (
              <Button size="sm" asChild>
                <Link
                  href={`/roles/new?role=institution_operator&institutionId=${detail.institution.id}`}
                >
                  {t("Add administrative operator")}
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3">
            {administrativeOperators.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("No administrative operators are attached to this institution yet.")}
              </p>
            ) : (
              administrativeOperators.map((record) => (
                <div
                  key={record.email}
                  className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-background/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">
                        {record.displayName || record.email}
                      </p>
                      <span className="font-mono text-xs text-muted-foreground">
                        {record.email}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {compactList([record.notes, record.institutionName]) ||
                        t("Institution staff role")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={record.isActive ? "brand" : "warning"}>
                      {record.isActive ? t("Role active") : t("Role inactive")}
                    </Badge>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/roles/${encodeURIComponent(record.email)}`}>
                        {t("Open")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {detail ? (
        <section className="glass-panel flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-eyebrow">{t("Laboratory staff")}</p>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {t("Laboratory staff attached to this institution")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Laboratory staff belong to this institution and do not have patient assignments underneath them.")}
              </p>
            </div>
            {canCreateLaboratoryStaff ? (
              <Button size="sm" asChild>
                <Link
                  href={`/roles/new?role=institution_laboratory_staff&institutionId=${detail.institution.id}`}
                >
                  {t("Add laboratory staff")}
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3">
            {laboratoryStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("No laboratory staff are attached to this institution yet.")}
              </p>
            ) : (
              laboratoryStaff.map((record) => (
                <div
                  key={record.email}
                  className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-background/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">
                        {record.displayName || record.email}
                      </p>
                      <span className="font-mono text-xs text-muted-foreground">
                        {record.email}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {compactList([record.notes, record.institutionName]) ||
                        t("Institution staff role")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={record.isActive ? "brand" : "warning"}>
                      {record.isActive ? t("Role active") : t("Role inactive")}
                    </Badge>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/roles/${encodeURIComponent(record.email)}`}>
                        {t("Open")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
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
