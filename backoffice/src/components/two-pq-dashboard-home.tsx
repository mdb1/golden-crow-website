import Link from "next/link";
import { ArrowRight, PlusCircle } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getAssignableRoleOptions,
  type AdminContextRecord,
} from "@/lib/admin-areas";
import {
  canCreateDoctorUi,
  canCreateInstitutionUi,
  canCreatePatientUi,
} from "@/lib/areas-ui";
import { TWO_PQ_AREA_CONFIGS } from "@/lib/two-pq-areas";

export function TwoPQDashboardHome({
  adminContext,
  metrics,
}: {
  adminContext: AdminContextRecord;
  metrics: {
    institutions: number;
    doctors: number;
    patients: number;
    roles: number;
  };
}) {
  const linkedEntityKeys = new Set(["cases", "sampling", "sequencing"]);
  const linkedEntityAreas = TWO_PQ_AREA_CONFIGS.filter((area) => linkedEntityKeys.has(area.key));
  const secondaryAreas = TWO_PQ_AREA_CONFIGS.filter((area) => !linkedEntityKeys.has(area.key));
  const scopeCards = [
    {
      key: "institutions",
      eyebrow: "Scope",
      value: metrics.institutions,
      description: "Institutions visible to this role",
      createLabel: "+ new institution",
      createHref: "/areas/institutions/new",
      canCreate: canCreateInstitutionUi(adminContext),
      disabledTitle: "Only full admins can create institutions.",
    },
    {
      key: "doctors",
      eyebrow: "Scope",
      value: metrics.doctors,
      description: "Doctors available for 2PQ ownership",
      createLabel: "+ new doctor",
      createHref: "/areas/doctors/new",
      canCreate: canCreateDoctorUi(adminContext),
      disabledTitle: "Only full admins and institution admins can create doctors.",
    },
    {
      key: "patients",
      eyebrow: "Scope",
      value: metrics.patients,
      description: "Patients available for linkage",
      createLabel: "+ new patient",
      createHref: "/areas/patients/new",
      canCreate: canCreatePatientUi(adminContext),
      disabledTitle:
        "Only full admins, institution admins, and scoped institution doctors can create patients.",
    },
    {
      key: "roles",
      eyebrow: "Access",
      value: metrics.roles,
      description: "Role records defining the active lane",
      createLabel: "+ new role",
      createHref: "/roles/new",
      canCreate: getAssignableRoleOptions(adminContext.role).length > 0,
      disabledTitle: "The current role cannot create role assignments.",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <PageHero
        eyebrow="2PQ"
        title="2PQ Dashboard"
        description="Jump directly into the live 2PQ areas."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/roles/access">
              Role assignment capabilities
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {scopeCards.map((card) => (
          <article key={card.key} className="glass-panel flex flex-col px-4 py-4">
            <p className="section-eyebrow">{card.eyebrow}</p>
            <p className="mt-2 font-heading text-2xl font-semibold text-foreground">
              {card.value}
            </p>
            <p className="text-sm text-muted-foreground">{card.description}</p>

            <div className="mt-4">
              {card.canCreate ? (
                <Button size="sm" className="w-full justify-between rounded-xl" asChild>
                  <Link href={card.createHref}>
                    <span className="flex items-center gap-2">
                      <PlusCircle className="h-4 w-4" />
                      {card.createLabel}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="w-full justify-between rounded-xl"
                  disabled
                  title={card.disabledTitle}
                >
                  <span className="flex items-center gap-2">
                    <PlusCircle className="h-4 w-4" />
                    {card.createLabel}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="glass-panel border-emerald-100 bg-[linear-gradient(160deg,rgba(249,253,250,0.98),rgba(240,253,244,0.98)_42%,rgba(220,252,231,0.92))] px-5 py-5 shadow-[0_18px_56px_rgba(187,247,208,0.32)] dark:border-emerald-400/28 dark:bg-[linear-gradient(145deg,rgba(6,35,24,0.98),rgba(10,42,30,0.95)_45%,rgba(16,185,129,0.2))] dark:shadow-[0_24px_80px_-52px_rgba(16,185,129,0.8)]">
        <div className="flex flex-col gap-5">
          <div>
            <p className="section-eyebrow text-emerald-900/55 dark:text-emerald-100/72">2PQ circuit</p>
            <h2 className="font-heading text-2xl font-semibold text-emerald-950 dark:text-emerald-50">
              Linked entities
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-emerald-900/70 dark:text-emerald-50/72">
              Grouped parent-child entities for the new flow: sequencing batches, cases, and
              sampling records.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {linkedEntityAreas.map((area) => (
              <article
                key={area.key}
                className="flex h-full flex-col gap-4 rounded-[1.7rem] border border-emerald-100 bg-white/82 px-5 py-5 shadow-[0_12px_32px_rgba(220,252,231,0.82)] dark:border-emerald-300/18 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(16,185,129,0.12))] dark:shadow-none"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-900 dark:bg-emerald-400/14 dark:text-emerald-50">
                  <area.icon className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="font-heading text-2xl font-semibold text-emerald-950 dark:text-emerald-50">
                    {area.label}
                  </h2>
                  <p className="mt-1 text-sm text-emerald-900/68 dark:text-emerald-50/72">{area.summary}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/18 dark:bg-emerald-400/12 dark:text-emerald-50"
                  >
                    {area.collectionKey}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/18 dark:bg-emerald-400/12 dark:text-emerald-50"
                  >
                    Linked entity
                  </Badge>
                </div>

                <div className="mt-auto flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="border-emerald-100 bg-white/80 text-emerald-900 shadow-[0_10px_24px_rgba(220,252,231,0.78)] hover:bg-emerald-50 dark:border-emerald-200/18 dark:bg-emerald-950/24 dark:text-emerald-50 dark:shadow-none dark:hover:bg-emerald-900/34"
                  >
                    <Link href={area.route}>
                      Open area
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow">Other 2PQ areas</p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Secondary workflow surfaces
          </h2>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Shipment, reporting, and client operations stay here as separate supporting areas.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {secondaryAreas.map((area) => (
            <article key={area.key} className="glass-panel flex flex-col gap-4 px-5 py-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <area.icon className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-heading text-2xl font-semibold text-foreground">{area.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{area.summary}</p>
              </div>

              <div>
                <Badge variant="outline">{area.collectionKey}</Badge>
              </div>

              <div className="mt-auto flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={area.route}>
                    Open area
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
