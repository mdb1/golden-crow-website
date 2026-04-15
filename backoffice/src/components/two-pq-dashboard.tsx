import type { ComponentProps } from "react";
import Link from "next/link";
import { ArrowRight, Database, Lock } from "lucide-react";
import { AreaAccessMatrix } from "@/components/area-access-matrix";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ADMIN_ROLE_LABELS,
  type AdminContextRecord,
  type AdminRole,
} from "@/lib/admin-areas";
import {
  BACKOFFICE_AREAS,
  CRUD_CAPABILITIES,
  TWO_PQ_WORKFLOW_AREAS,
  canAccessTwoPQRoute,
  getSurfaceSpec,
  type BackofficeAreaSpec,
  type CrudCapability,
  type RoleAccessSpec,
  type TwoPQTone,
  type TwoPQWorkflowAreaSpec,
} from "@/lib/two-pq-dashboard";
import { cn } from "@/lib/utils";

const toneClasses: Record<
  TwoPQTone,
  {
    panel: string;
    icon: string;
    soft: string;
    chip: string;
    node: string;
  }
> = {
  blue: {
    panel: "border-sky-400/28 bg-sky-500/8",
    icon: "bg-sky-500/14 text-sky-100",
    soft: "border-sky-400/18 bg-sky-500/6",
    chip: "border-sky-400/28 bg-sky-500/12 text-sky-100",
    node: "border-sky-400/30 bg-sky-500/16 text-sky-50",
  },
  mint: {
    panel: "border-emerald-400/26 bg-emerald-500/8",
    icon: "bg-emerald-500/14 text-emerald-100",
    soft: "border-emerald-400/18 bg-emerald-500/6",
    chip: "border-emerald-400/28 bg-emerald-500/12 text-emerald-100",
    node: "border-emerald-400/30 bg-emerald-500/16 text-emerald-50",
  },
  amber: {
    panel: "border-amber-300/28 bg-amber-400/8",
    icon: "bg-amber-400/14 text-amber-100",
    soft: "border-amber-300/18 bg-amber-400/6",
    chip: "border-amber-300/28 bg-amber-400/12 text-amber-100",
    node: "border-amber-300/30 bg-amber-400/16 text-amber-50",
  },
  violet: {
    panel: "border-violet-400/28 bg-violet-500/8",
    icon: "bg-violet-500/14 text-violet-100",
    soft: "border-violet-400/18 bg-violet-500/6",
    chip: "border-violet-400/28 bg-violet-500/12 text-violet-100",
    node: "border-violet-400/30 bg-violet-500/16 text-violet-50",
  },
  rose: {
    panel: "border-rose-400/28 bg-rose-500/8",
    icon: "bg-rose-500/14 text-rose-100",
    soft: "border-rose-400/18 bg-rose-500/6",
    chip: "border-rose-400/28 bg-rose-500/12 text-rose-100",
    node: "border-rose-400/30 bg-rose-500/16 text-rose-50",
  },
  slate: {
    panel: "border-slate-300/22 bg-slate-400/6",
    icon: "bg-slate-400/12 text-slate-100",
    soft: "border-slate-300/18 bg-slate-400/6",
    chip: "border-slate-300/22 bg-slate-400/10 text-slate-100",
    node: "border-slate-300/24 bg-slate-400/14 text-slate-50",
  },
};

const capabilityClasses: Record<CrudCapability, string> = {
  create: "border-emerald-400/35 bg-emerald-500/12 text-emerald-100",
  read: "border-sky-400/35 bg-sky-500/12 text-sky-100",
  update: "border-violet-400/35 bg-violet-500/12 text-violet-100",
  delete: "border-rose-400/35 bg-rose-500/12 text-rose-100",
};

const roleBadgeVariants: Record<AdminRole, ComponentProps<typeof Badge>["variant"]> = {
  full_admin: "destructive",
  institution_admin: "brand",
  institution_doctor: "success",
  patient: "outline",
};

interface TwoPQDashboardMetrics {
  institutions: number;
  doctors: number;
  patients: number;
  roles: number;
  reportCodes?: number;
  authUsers?: string;
}

function getRoleAccess(area: { roleAccess: RoleAccessSpec[] }, role: AdminRole) {
  return area.roleAccess.find((entry) => entry.role === role) ?? area.roleAccess[0];
}

function getRoleScopeSummary(adminContext: AdminContextRecord) {
  if (adminContext.role === "full_admin") {
    return "Global lane";
  }

  if (adminContext.role === "institution_admin") {
    return adminContext.institutionId
      ? `Institution · ${adminContext.institutionId}`
      : "Institution scoped";
  }

  if (adminContext.role === "institution_doctor") {
    return adminContext.doctorId
      ? `Doctor lane · ${adminContext.doctorId}`
      : "Assigned doctor lane";
  }

  return "Locked";
}

function CapabilityPills({
  activeCapabilities,
}: {
  activeCapabilities: CrudCapability[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CRUD_CAPABILITIES.map((capability) => {
        const active = activeCapabilities.includes(capability);
        return (
          <span
            key={capability}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
              active
                ? capabilityClasses[capability]
                : "border-border/70 bg-background/55 text-muted-foreground"
            )}
          >
            {capability}
          </span>
        );
      })}
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: TwoPQTone;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border px-4 py-4 backdrop-blur-sm",
        toneClasses[tone].panel
      )}
    >
      <p className="section-eyebrow">2PQ metric</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-heading text-2xl font-semibold text-foreground">{value}</span>
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </article>
  );
}

function WorkflowListCard({
  title,
  items,
  adminRole,
  countLookup,
}: {
  title: string;
  items: Array<{
    label: string;
    href: string;
    tone: TwoPQTone;
    visibleRoles?: AdminRole[];
    count?: number | string;
  }>;
  adminRole: AdminRole;
  countLookup?: Record<string, string | number>;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/42 p-4">
      <p className="font-heading text-xl font-semibold text-foreground">{title}</p>
      <div className="mt-4 grid gap-3">
        {items.map((item) => {
          const accessible = canAccessTwoPQRoute(adminRole, item.visibleRoles);
          const count = item.count ?? countLookup?.[item.label];
          return accessible ? (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 transition-transform hover:-translate-y-0.5",
                toneClasses[item.tone].soft
              )}
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">Open area</p>
              </div>
              <div className="flex items-center gap-2">
                {count !== undefined ? (
                  <span className="font-mono text-xs text-muted-foreground">{count}</span>
                ) : null}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </Link>
          ) : (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/50 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">Locked for current role</p>
              </div>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BackofficeAreaCard({
  area,
  adminRole,
}: {
  area: BackofficeAreaSpec;
  adminRole: AdminRole;
}) {
  const accessible = canAccessTwoPQRoute(adminRole, area.visibleRoles);

  return (
    <article
      className={cn(
        "glass-panel flex h-full flex-col gap-4 px-4 py-4",
        accessible ? "" : "border-border/70 opacity-85"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", toneClasses[area.tone].icon)}>
          <area.icon className="h-5 w-5" />
        </div>
        <Badge variant={accessible ? "brand" : "outline"}>
          {accessible ? "Accessible" : "Locked"}
        </Badge>
      </div>

      <div>
        <h3 className="font-heading text-xl font-semibold text-foreground">{area.label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{area.description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {area.chips.map((chip) => (
          <span
            key={chip}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
              toneClasses[area.tone].chip
            )}
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {accessible ? "Open the live area." : "Visible here for cross-role clarity."}
        </p>
        {accessible ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={area.href}>
              Open
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : (
          <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Locked
          </span>
        )}
      </div>
    </article>
  );
}

function WorkflowFieldGroup({
  areaTone,
  title,
  description,
  fields,
}: {
  areaTone: TwoPQTone;
  title: string;
  description: string;
  fields: TwoPQWorkflowAreaSpec["fieldGroups"][number]["fields"];
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border px-4 py-4",
        toneClasses[areaTone].soft
      )}
    >
      <h4 className="font-medium text-foreground">{title}</h4>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 grid gap-3">
        {fields.map((field) => (
          <div
            key={field.label}
            className="rounded-xl border border-border/70 bg-background/60 px-3 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{field.label}</p>
              <span className="rounded-full border border-border/70 bg-background/50 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {field.source}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{field.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkflowAreaCard({
  area,
  adminContext,
}: {
  area: TwoPQWorkflowAreaSpec;
  adminContext: AdminContextRecord;
}) {
  const currentAccess = getRoleAccess(area, adminContext.role);

  return (
    <article id={`area-${area.key}`} className="glass-panel scroll-mt-24 px-5 py-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", toneClasses[area.tone].icon)}>
              <area.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="section-eyebrow">2PQ area</p>
              <h3 className="font-heading text-2xl font-semibold text-foreground">{area.label}</h3>
              <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{area.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {area.chips.map((chip) => (
              <span
                key={chip}
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
                  toneClasses[area.tone].chip
                )}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="grid gap-4">
            <section
              className={cn(
                "rounded-2xl border px-4 py-4",
                toneClasses[area.tone].panel
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={roleBadgeVariants[adminContext.role]}>
                  {ADMIN_ROLE_LABELS[adminContext.role]}
                </Badge>
                <span className="rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Current lane
                </span>
              </div>
              <p className="mt-3 text-sm text-foreground">{currentAccess.note}</p>
              <div className="mt-4">
                <CapabilityPills activeCapabilities={currentAccess.capabilities} />
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-background/45 px-4 py-4">
              <p className="section-eyebrow">Linked routes</p>
              <p className="mt-1 text-sm text-muted-foreground">{area.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {area.quickLinks.map((link) => {
                  const accessible = canAccessTwoPQRoute(
                    adminContext.role,
                    link.visibleRoles
                  );

                  return accessible ? (
                    <Button key={link.label} variant="outline" size="sm" asChild>
                      <Link href={link.href}>
                        {link.label}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : (
                    <span
                      key={link.label}
                      className="inline-flex items-center rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
                    >
                      Locked · {link.label}
                    </span>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {area.fieldGroups.map((group) => (
              <WorkflowFieldGroup
                key={group.title}
                areaTone={area.tone}
                title={group.title}
                description={group.description}
                fields={group.fields}
              />
            ))}
          </div>
        </div>

        <AreaAccessMatrix
          title="Role access"
          description="Every 2PQ area exposes the same CRUD language so operators can see scope and action limits before they click."
          entries={area.roleAccess}
          highlightRole={adminContext.role}
          compact
        />
      </div>
    </article>
  );
}

export function TwoPQDashboard({
  adminContext,
  metrics,
}: {
  adminContext: AdminContextRecord;
  metrics: TwoPQDashboardMetrics;
}) {
  const sequencingArea = TWO_PQ_WORKFLOW_AREAS.find(
    (area) => area.key === "sequencing_runs"
  )!;
  const reportsArea = TWO_PQ_WORKFLOW_AREAS.find((area) => area.key === "reports")!;
  const clientsArea = TWO_PQ_WORKFLOW_AREAS.find((area) => area.key === "clients")!;
  const accessibleAreaCount = BACKOFFICE_AREAS.filter((area) =>
    canAccessTwoPQRoute(adminContext.role, area.visibleRoles)
  ).length;
  const roleScopeSummary = getRoleScopeSummary(adminContext);

  return (
    <div className="flex flex-col gap-8">
      <PageHero
        eyebrow="2PQ"
        title="2PQ Dashboard"
        description="A PDF-inspired workflow shell for cases, samples, shipments, sequencing runs, reports, and clients, mapped directly onto the current institution-doctor-patient permission model."
        actions={
          <>
            <Button size="sm" asChild>
              <Link href="/areas/institutions">
                Open institutions
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/roles">
                Open roles
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </>
        }
      />

      <HelperBanner
        title="The 2PQ shell mirrors the PDF, but the permissions stay grounded in the live admin model."
        tone="blue"
      >
        Full admins keep global reach. Institution admins stay inside one institution. Institution
        doctors stay inside their own doctor lane and patients. The pills below show that boundary
        before the operator opens an area.
      </HelperBanner>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          label="Institutions"
          value={metrics.institutions}
          detail="Root records visible from the current lane."
          tone="blue"
        />
        <MetricTile
          label="Doctors"
          value={metrics.doctors}
          detail="Clinician records available from this scope."
          tone="mint"
        />
        <MetricTile
          label="Patients"
          value={metrics.patients}
          detail="Patient sheets visible to the current role."
          tone="amber"
        />
        <MetricTile
          label="Roles"
          value={metrics.roles}
          detail="Email-scoped access records driving the pills on this page."
          tone="slate"
        />
        <MetricTile
          label={metrics.reportCodes !== undefined ? "Report codes" : "Accessible areas"}
          value={metrics.reportCodes ?? accessibleAreaCount}
          detail={
            metrics.reportCodes !== undefined
              ? "Live report code count from the full-admin report surface."
              : "Backoffice areas currently open to this role."
          }
          tone="rose"
        />
      </section>

      <section className="glass-panel border-emerald-400/22 bg-[linear-gradient(145deg,rgba(7,35,25,0.96),rgba(9,24,18,0.94)_54%,rgba(16,185,129,0.16))] px-5 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="section-eyebrow text-emerald-100/72">2PQ links</p>
            <h2 className="font-heading text-2xl font-semibold text-emerald-50">
              Linked entities
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-emerald-50/70">
              Open the three related CRUD areas together: sequencing batches, cases, and sampling
              children.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "2PQ Sequencing", href: "/2pq-dashboard/sequencing" },
              { label: "2PQ Cases", href: "/2pq-dashboard/cases" },
              { label: "2PQ Sampling", href: "/2pq-dashboard/sampling" },
            ].map((item) => (
              <Button
                key={item.href}
                variant="outline"
                size="sm"
                asChild
                className="border-emerald-200/14 bg-emerald-950/20 text-emerald-50 hover:bg-emerald-900/32"
              >
                <Link href={item.href}>
                  {item.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel overflow-hidden px-5 py-5">
        <div className="flex flex-col gap-2">
          <p className="section-eyebrow">Workflow map</p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Case-management style 2PQ map
          </h2>
          <p className="max-w-4xl text-sm text-muted-foreground">
            The layout follows the first PDF page closely: left navigation blocks, a central case
            ring, right-side sequencing and reporting panels, and lower data rails.
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <div className="grid gap-4">
            <WorkflowListCard
              title="2PQ Navigation"
              adminRole={adminContext.role}
              items={[
                { label: "Dashboard", href: "#area-dashboard", tone: "blue" },
                { label: "Cases", href: "#area-cases", tone: "blue" },
                { label: "Samples", href: "#area-samples", tone: "mint" },
                { label: "Shipments", href: "#area-shipments", tone: "amber" },
              ]}
            />

            <WorkflowListCard
              title="Scoped model"
              adminRole={adminContext.role}
              countLookup={{
                Institutions: metrics.institutions,
                Doctors: metrics.doctors,
                Patients: metrics.patients,
                "Roles & permissions": metrics.roles,
              }}
              items={[
                {
                  label: "Institutions",
                  href: "/areas/institutions",
                  tone: "blue",
                  visibleRoles: ["full_admin", "institution_admin", "institution_doctor"],
                },
                {
                  label: "Doctors",
                  href: "/areas/doctors",
                  tone: "mint",
                  visibleRoles: ["full_admin", "institution_admin", "institution_doctor"],
                },
                {
                  label: "Patients",
                  href: "/areas/patients",
                  tone: "amber",
                  visibleRoles: ["full_admin", "institution_admin", "institution_doctor"],
                },
                {
                  label: "Roles & permissions",
                  href: "/roles",
                  tone: "slate",
                  visibleRoles: ["full_admin", "institution_admin", "institution_doctor"],
                },
              ]}
            />
          </div>

          <div className="rounded-[2rem] border border-border/70 bg-background/42 p-4">
            <div className="relative min-h-[620px] overflow-hidden rounded-[1.75rem] border border-border/70 bg-[radial-gradient(circle_at_center,rgba(126,181,255,0.12),transparent_54%)]">
              <div className="absolute left-1/2 top-1/2 h-[390px] w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_60%)]" />
              <div className="absolute left-1/2 top-1/2 h-[490px] w-[490px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-border/60" />

              <Link
                href="#area-cases"
                className={cn(
                  "absolute left-[18%] top-[18%] rounded-[1.25rem] border px-4 py-3 text-sm font-medium shadow-[0_18px_40px_-30px_rgba(0,0,0,0.85)]",
                  toneClasses.blue.node
                )}
              >
                Case ID
              </Link>
              <Link
                href="#area-shipments"
                className={cn(
                  "absolute left-1/2 top-[10%] -translate-x-1/2 rounded-[1.25rem] border px-4 py-3 text-sm font-medium shadow-[0_18px_40px_-30px_rgba(0,0,0,0.85)]",
                  toneClasses.blue.node
                )}
              >
                Kit Logistics
              </Link>
              <Link
                href="#area-shipments"
                className={cn(
                  "absolute right-[8%] top-[20%] rounded-[1.25rem] border px-4 py-3 text-sm font-medium shadow-[0_18px_40px_-30px_rgba(0,0,0,0.85)]",
                  toneClasses.mint.node
                )}
              >
                Sample Shipment
              </Link>
              <Link
                href="#area-samples"
                className={cn(
                  "absolute right-[10%] top-[44%] rounded-[1.25rem] border px-4 py-3 text-sm font-medium shadow-[0_18px_40px_-30px_rgba(0,0,0,0.85)]",
                  toneClasses.amber.node
                )}
              >
                Sample Processing
              </Link>
              <Link
                href="#area-sequencing_runs"
                className={cn(
                  "absolute right-[12%] bottom-[20%] rounded-[1.25rem] border px-4 py-3 text-sm font-medium shadow-[0_18px_40px_-30px_rgba(0,0,0,0.85)]",
                  toneClasses.rose.node
                )}
              >
                Sequencing
              </Link>
              <Link
                href="#area-dashboard"
                className={cn(
                  "absolute left-[12%] bottom-[22%] rounded-[1.25rem] border px-4 py-3 text-sm font-medium shadow-[0_18px_40px_-30px_rgba(0,0,0,0.85)]",
                  toneClasses.mint.node
                )}
              >
                Sample Reception
              </Link>
              <Link
                href="#area-reports"
                className={cn(
                  "absolute left-1/2 bottom-[10%] -translate-x-1/2 rounded-[1.25rem] border px-4 py-3 text-sm font-medium shadow-[0_18px_40px_-30px_rgba(0,0,0,0.85)]",
                  toneClasses.violet.node
                )}
              >
                Reporting
              </Link>

              <div className="absolute left-1/2 top-1/2 w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/92 px-5 py-8 text-center shadow-[0_24px_70px_-42px_rgba(126,181,255,0.8)]">
                <p className="section-eyebrow">2PQ case hub</p>
                <h3 className="font-heading text-3xl font-semibold text-foreground">Case ID</h3>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <p>Case | Status</p>
                  <p>Shipment | Sample ID</p>
                  <p>Tracking | Reports</p>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Badge variant={roleBadgeVariants[adminContext.role]}>
                    {ADMIN_ROLE_LABELS[adminContext.role]}
                  </Badge>
                  <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {roleScopeSummary}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {metrics.institutions} institutions
                  </span>
                  <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {metrics.doctors} doctors
                  </span>
                  <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {metrics.patients} patients
                  </span>
                </div>
              </div>

              <div className="absolute bottom-3 left-3 right-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/75 px-3 py-3">
                  <p className="font-medium text-foreground">Shipments</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em]", toneClasses.blue.chip)}>
                      Shipment ID
                    </span>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em]", toneClasses.blue.chip)}>
                      Tracking
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/75 px-3 py-3">
                  <p className="font-medium text-foreground">Samples</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em]", toneClasses.mint.chip)}>
                      Sample ID
                    </span>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em]", toneClasses.mint.chip)}>
                      Run ID
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/75 px-3 py-3">
                  <p className="font-medium text-foreground">Reports</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em]", toneClasses.rose.chip)}>
                      Report code
                    </span>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em]", toneClasses.rose.chip)}>
                      Delivery
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Database className="h-4 w-4" />
              <span>Database-backed surfaces stay live underneath the 2PQ orchestration shell.</span>
            </div>
          </div>

          <div className="grid gap-4">
            <section
              className={cn(
                "rounded-[1.75rem] border px-4 py-4",
                toneClasses[sequencingArea.tone].panel
              )}
            >
              <p className="font-heading text-2xl font-semibold text-foreground">
                {sequencingArea.label}
              </p>
              <div className="mt-4 grid gap-3">
                {["Scheduling", "Contact name", "Email", "Phone number"].map((label) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-border/70 bg-background/55 px-3 py-3 text-sm text-foreground"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </section>

            <section
              className={cn(
                "rounded-[1.75rem] border px-4 py-4",
                toneClasses[reportsArea.tone].panel
              )}
            >
              <p className="font-heading text-2xl font-semibold text-foreground">
                {reportsArea.label}
              </p>
              <div className="mt-4 grid gap-3">
                {["Client case status", "Report delivery", "Provider format"].map((label) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-border/70 bg-background/55 px-3 py-3 text-sm text-foreground"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </section>

            <section
              className={cn(
                "rounded-[1.75rem] border px-4 py-4",
                toneClasses[clientsArea.tone].panel
              )}
            >
              <p className="font-heading text-2xl font-semibold text-foreground">
                {clientsArea.label}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Institutions", "Doctors", "Patients", "Roles"].map((label) => (
                  <span
                    key={label}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em]",
                      toneClasses[clientsArea.tone].chip
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow">All areas</p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Backoffice access at a glance
          </h2>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Every live area is listed here, even if the current role cannot open it, so the shell
            stays explicit about where access begins and where it stops.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {BACKOFFICE_AREAS.map((area) => (
            <BackofficeAreaCard key={area.key} area={area} adminRole={adminContext.role} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow">Workflow areas</p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Detailed 2PQ CRUD surfaces
          </h2>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Each area below uses the same structure: a current-lane summary, linked live routes,
            grouped fields, and a role-by-role CRUD matrix with pills and color.
          </p>
        </div>

        <div className="grid gap-5">
          {TWO_PQ_WORKFLOW_AREAS.map((area) => (
            <WorkflowAreaCard key={area.key} area={area} adminContext={adminContext} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow">Interoperability</p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Current institution model alignment
          </h2>
          <p className="max-w-4xl text-sm text-muted-foreground">
            These are the live surfaces that already exist today. The 2PQ shell above routes into
            them instead of creating a second permission system.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {(["institutions", "doctors", "patients", "roles"] as const).map((key) => {
            const surface = getSurfaceSpec(key)!;

            return (
              <article key={surface.key} className="glass-panel flex flex-col gap-4 px-5 py-5">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {surface.highlights.map((highlight) => (
                      <span
                        key={highlight}
                        className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
                      >
                        {highlight}
                      </span>
                    ))}
                  </div>
                  <div>
                    <h3 className="font-heading text-2xl font-semibold text-foreground">
                      {surface.label}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">{surface.description}</p>
                  </div>
                </div>

                <AreaAccessMatrix
                  title="Surface access"
                  description="The live permissions here are the same ones the SDK is already enforcing."
                  entries={surface.roleAccess}
                  highlightRole={adminContext.role}
                  compact
                />
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
