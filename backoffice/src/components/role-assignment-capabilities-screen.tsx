"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Shield, XCircle } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  type AdminRole,
} from "@/lib/admin-areas";
import type {
  AccessScope,
  CrudCapability,
  RoleAccessSpec,
} from "@/lib/two-pq-dashboard";
import { appText } from "@/lib/language";
import { cn } from "@/lib/utils";

const ROLE_TABS: AdminRole[] = [
  "full_admin",
  "institution_admin",
  "institution_doctor",
  "patient",
];

function getVisibleRoleTabs(currentRole: AdminRole): AdminRole[] {
  if (currentRole === "institution_doctor") {
    return ["institution_doctor"];
  }

  return ROLE_TABS;
}

const roleBadgeVariants: Record<AdminRole, ComponentProps<typeof Badge>["variant"]> = {
  full_admin: "destructive",
  institution_admin: "brand",
  institution_doctor: "success",
  patient: "outline",
};

const scopeMeta: Record<
  AccessScope,
  {
    label: string;
    description: string;
    className: string;
  }
> = {
  global: {
    label: "Global scope",
    description:
      "Covers every institution, doctor, patient, and role assignment in the backoffice.",
    className:
      "border-sky-300/60 bg-sky-100 text-sky-900 dark:border-sky-400/35 dark:bg-sky-500/12 dark:text-sky-100",
  },
  institution: {
    label: "Institution scope",
    description:
      "Stays inside one institution and the doctors, patients, and role assignments linked to it.",
    className:
      "border-blue-300/60 bg-blue-100 text-blue-900 dark:border-blue-400/35 dark:bg-blue-500/12 dark:text-blue-100",
  },
  assigned: {
    label: "Assigned lane",
    description:
      "Stays inside one doctor-owned lane instead of the whole institution surface.",
    className:
      "border-indigo-300/60 bg-indigo-100 text-indigo-900 dark:border-indigo-400/35 dark:bg-indigo-500/12 dark:text-indigo-100",
  },
  read_only: {
    label: "Read-only scope",
    description: "Can inspect the lane but cannot change the records inside it.",
    className:
      "border-cyan-300/60 bg-cyan-100 text-cyan-900 dark:border-cyan-400/35 dark:bg-cyan-500/12 dark:text-cyan-100",
  },
  no_access: {
    label: "No backoffice access",
    description: "This role assignment exists for permission modeling, not for admin work.",
    className:
      "border-rose-300/60 bg-rose-100 text-rose-900 dark:border-rose-400/35 dark:bg-rose-500/12 dark:text-rose-100",
  },
};

const capabilityMeta: Record<
  CrudCapability,
  {
    label: string;
    enabledClassName: string;
  }
> = {
  create: {
    label: "Create",
    enabledClassName:
      "border-emerald-300/60 bg-emerald-100 text-emerald-800 dark:border-emerald-400/35 dark:bg-emerald-500/12 dark:text-emerald-100",
  },
  read: {
    label: "Read",
    enabledClassName:
      "border-sky-300/60 bg-sky-100 text-sky-800 dark:border-sky-400/35 dark:bg-sky-500/12 dark:text-sky-100",
  },
  update: {
    label: "Update",
    enabledClassName:
      "border-indigo-300/60 bg-indigo-100 text-indigo-800 dark:border-indigo-400/35 dark:bg-indigo-500/12 dark:text-indigo-100",
  },
  delete: {
    label: "Delete",
    enabledClassName:
      "border-rose-300/60 bg-rose-100 text-rose-800 dark:border-rose-400/35 dark:bg-rose-500/12 dark:text-rose-100",
  },
};

const ROLE_ASSIGNMENT_ITEMS: Record<
  AdminRole,
  Array<{
    tone: "allow" | "limit";
    title: string;
    description: string;
  }>
> = {
  full_admin: [
    {
      tone: "allow",
      title: "Can assign every role type",
      description:
        "Full admins can create and update full admin, institution admin, institution doctor, and patient role assignments.",
    },
    {
      tone: "allow",
      title: "Can operate across every lane",
      description:
        "They can review and adjust role assignments across all institutions, doctors, and patient-linked records.",
    },
    {
      tone: "allow",
      title: "Can unblock broader admin work",
      description:
        "When a scope link changes, they can follow through into the institution, doctor, or patient surfaces that support that assignment.",
    },
    {
      tone: "limit",
      title: "Cannot rewrite bootstrap access",
      description:
        "Bootstrap permissions stay protected, so only non-bootstrap role assignments should be edited from the normal workflow.",
    },
    {
      tone: "limit",
      title: "Cannot ignore scope links",
      description:
        "Even with global reach, each role assignment still needs the right institution, doctor, and patient references.",
    },
  ],
  institution_admin: [
    {
      tone: "allow",
      title: "Can manage local role assignments",
      description:
        "Institution admins can create and update institution admin, institution doctor, and patient assignments inside their own institution.",
    },
    {
      tone: "allow",
      title: "Can staff their institution",
      description:
        "They can pair role changes with doctor and patient maintenance for the institution they administer.",
    },
    {
      tone: "allow",
      title: "Can inspect the local permission map",
      description:
        "They can review which emails are attached to their institution and how those assignments map to the doctor and patient hierarchy.",
    },
    {
      tone: "limit",
      title: "Cannot create full admins",
      description:
        "Promotion into the global admin lane stays reserved for existing full admins only.",
    },
    {
      tone: "limit",
      title: "Cannot cross institution boundaries",
      description:
        "They cannot edit doctors, patients, or role assignments linked to another institution.",
    },
  ],
  institution_doctor: [
    {
      tone: "allow",
      title: "Can stay inside one doctor lane",
      description:
        "Institution doctors can use the backoffice only for their own doctor profile and the patients attached to that doctor id.",
    },
    {
      tone: "allow",
      title: "Can manage patient-facing role assignments",
      description:
        "They can create and update patient assignments for patients that belong to their own lane.",
    },
    {
      tone: "allow",
      title: "Can review the surrounding context",
      description:
        "They can inspect the institution and doctor roster needed to understand where their patients sit in the hierarchy.",
    },
    {
      tone: "limit",
      title: "Cannot create admin lanes",
      description:
        "They cannot assign institution admin or institution doctor roles to other users.",
    },
    {
      tone: "limit",
      title: "Cannot touch peer records",
      description:
        "They cannot edit the institution root, another doctor profile, or patients and role assignments outside their own doctor scope.",
    },
  ],
  patient: [
    {
      tone: "allow",
      title: "Can exist as a scoped assignment",
      description:
        "The patient role assignment links an email to one patient record so the permission model stays explicit.",
    },
    {
      tone: "allow",
      title: "Can anchor patient-specific boundaries",
      description:
        "Admins and doctors can reason about patient-facing access because this role stores the patient lane directly.",
    },
    {
      tone: "limit",
      title: "Cannot enter the backoffice",
      description:
        "Patients do not use the Roles & permissions screen, the 2PQ dashboard, or any other admin surface.",
    },
    {
      tone: "limit",
      title: "Cannot manage records",
      description:
        "They cannot create, update, or delete institutions, doctors, patients, or role assignments.",
    },
    {
      tone: "limit",
      title: "Cannot grant permissions to others",
      description:
        "Patient assignments are informational boundaries, not operator accounts with delegation rights.",
    },
  ],
};

const ROLE_ASSIGNMENT_CAPABILITIES: CrudCapability[] = ["create", "read", "update", "delete"];

export function RoleAssignmentCapabilitiesScreen({
  entries,
  selectedRole,
  currentRole,
}: {
  entries: RoleAccessSpec[];
  selectedRole: AdminRole;
  currentRole: AdminRole;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const visibleRoleTabs = getVisibleRoleTabs(currentRole);
  const activeRole = visibleRoleTabs.includes(selectedRole) ? selectedRole : visibleRoleTabs[0];
  const activeEntry =
    entries.find((entry) => entry.role === activeRole) ??
    entries.find((entry) => visibleRoleTabs.includes(entry.role)) ??
    entries[0];
  const activeScope = scopeMeta[activeEntry.scope];
  const activeItems = ROLE_ASSIGNMENT_ITEMS[activeEntry.role];
  const hasSingleVisibleRole = visibleRoleTabs.length === 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={t("Access")}
        title={t("Role assignment capabilities")}
        description={t("A role-by-role explainer for what each assignment can do, where it is scoped, and where the boundary stops.")}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/roles">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("Back to roles")}
            </Link>
          </Button>
        }
      />

      <HelperBanner title={t("Checks mark allowed actions. Crosses call out the hard boundary.")} tone="blue">
        {t("Use this screen before creating or editing a role assignment so the scope, the allowed role types, and the blocked actions stay explicit.")}
      </HelperBanner>

      <section className="glass-panel flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow">{t("Tabs")}</p>
          <h2 className="font-heading text-xl font-semibold text-foreground">
            {t(hasSingleVisibleRole ? "Current role assignment lane" : "Four role assignment lanes")}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t(
              hasSingleVisibleRole
                ? "Only your current role lane is visible from this account."
                : "Each tab explains the scope and operating limits for one role assignment type."
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleRoleTabs.map((role) => {
            const isActive = role === activeEntry.role;

            return (
              <Button key={role} variant={isActive ? "default" : "outline"} size="sm" asChild>
                <Link href={`/roles/access?role=${role}`}>{t(ADMIN_ROLE_LABELS[role])}</Link>
              </Button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <article className="glass-panel flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={roleBadgeVariants[activeEntry.role]}>
              {t(ADMIN_ROLE_LABELS[activeEntry.role])}
            </Badge>
            {activeEntry.role === currentRole ? (
              <Badge variant="secondary">{t("Current role")}</Badge>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
                activeScope.className
              )}
            >
              {t(activeScope.label)}
            </span>
          </div>

          <p className="text-sm text-muted-foreground">
            {t(ADMIN_ROLE_DESCRIPTIONS[activeEntry.role])}
          </p>

          <div className="rounded-2xl border border-primary/20 bg-primary/7 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Shield className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="section-eyebrow text-primary">{t("Scope")}</p>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {t(activeScope.label)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(activeScope.description)}</p>
                <p className="mt-3 text-sm text-foreground/85">{t(activeEntry.note)}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="section-eyebrow">{t("Role assignment operations")}</p>
            <div className="flex flex-wrap gap-2">
              {ROLE_ASSIGNMENT_CAPABILITIES.map((capability) => {
                const isEnabled = activeEntry.capabilities.includes(capability);

                return (
                  <span
                    key={capability}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
                      isEnabled
                        ? capabilityMeta[capability].enabledClassName
                        : "border-border/70 bg-background/55 text-muted-foreground"
                    )}
                  >
                    {t(capabilityMeta[capability].label)}
                  </span>
                );
              })}
            </div>
          </div>
        </article>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {t("What this role can and cannot do")}
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {t("The list below mixes allowed actions and blocked actions so the lane stays readable one rule at a time.")}
            </p>
          </div>

          <div className="grid gap-3">
            {activeItems.map((item) => {
              const isAllowed = item.tone === "allow";

              return (
                <article
                  key={item.title}
                  className={cn(
                    "rounded-2xl border px-4 py-4",
                    isAllowed
                      ? "border-emerald-300/60 bg-emerald-50/90 dark:border-emerald-400/35 dark:bg-emerald-500/10"
                      : "border-rose-300/60 bg-rose-50/90 dark:border-rose-400/35 dark:bg-rose-500/10"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
                        isAllowed
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-100"
                      )}
                    >
                      {isAllowed ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{t(item.title)}</p>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
                            isAllowed
                              ? "border-emerald-300/70 bg-emerald-100 text-emerald-700 dark:border-emerald-400/35 dark:bg-emerald-500/12 dark:text-emerald-100"
                              : "border-rose-300/70 bg-rose-100 text-rose-700 dark:border-rose-400/35 dark:bg-rose-500/12 dark:text-rose-100"
                          )}
                        >
                          {isAllowed ? t("Allowed") : t("Blocked")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{t(item.description)}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
