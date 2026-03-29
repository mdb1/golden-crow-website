"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw, Save } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InstitutionDetailRecord, InstitutionRecord } from "@/lib/admin-areas";
import { canCreateDoctorUi, canEditInstitutionUi } from "@/lib/areas-ui";
import { sdkFetch } from "@/lib/sdk-client";
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

  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);

  async function handleSave() {
    if (!state.name.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Institution name is required.",
      });
      return;
    }

    if (!isValidEmail(state.contactEmail)) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Enter a valid institution contact email.",
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
          message: "Institution created.",
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
        message: "Institution changes saved.",
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          mode === "create"
            ? "Unable to create the institution."
            : "Unable to save the institution.",
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
          <Link href="/areas/institutions">Back to institutions</Link>
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
            <p className="section-eyebrow">Areas</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? "Create institution" : "Institution workbench"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Keep institution records direct and operational: one durable id,
              one readable descriptor set, and linked doctor operations from the
              same screen.
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
                  ? "Create institution"
                  : "Save institution"}
            </Button>
          </div>
        </div>

        {!isEditable ? (
          <div className="rounded-2xl border border-border/80 bg-background/65 px-4 py-3 text-sm text-muted-foreground">
            This institution is read only for the current role.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="institution-code">Institution code</Label>
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
            <Label htmlFor="institution-name">Institution name</Label>
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
            <Label htmlFor="institution-legal-name">Legal name</Label>
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
            <Label htmlFor="institution-email">Contact email</Label>
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
            <Label htmlFor="institution-phone">Contact phone</Label>
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
            <Label htmlFor="institution-address-line-1">Address line 1</Label>
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
            <Label htmlFor="institution-address-line-2">Address line 2</Label>
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
            <Label htmlFor="institution-city">City</Label>
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
            <Label htmlFor="institution-state">State / region</Label>
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
            <Label htmlFor="institution-country">Country</Label>
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
            <Label htmlFor="institution-notes">Notes</Label>
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
              <p className="section-eyebrow">Institution doctors</p>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Doctors attached to this institution
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Review the whole team here. Institution admins can add more
                doctors; institution doctors can inspect peers but only edit
                their own doctor record.
              </p>
            </div>
            {canCreateDoctorUi(adminContext, detail.institution.id) ? (
              <Button size="sm" asChild>
                <Link href={`/areas/doctors/new?institutionId=${detail.institution.id}`}>
                  Add doctor
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3">
            {detail.doctors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No doctors are attached to this institution yet.
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
                      ]) || "Doctor record"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{doctor.patientCount} patients</Badge>
                    {doctor.roleEmail ? (
                      <Badge variant={doctor.roleActive ? "brand" : "warning"}>
                        {doctor.roleActive ? "Role active" : "Role inactive"}
                      </Badge>
                    ) : (
                      <Badge variant="warning">No role</Badge>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/areas/doctors/${doctor.id}`}>
                        Open
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
