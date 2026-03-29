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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TWO_PQ_AREA_CONFIGS.map((area) => (
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
      </section>
    </div>
  );
}
