import Link from "next/link";
import { ArrowRight, ClipboardList, FileClock, PlusCircle } from "lucide-react";
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
import { TWO_PQ_AREA_CONFIGS, translateTwoPQAreaConfig } from "@/lib/two-pq-areas";
import {
  TWO_PQ_FORM_LABELS,
  TWO_PQ_FORM_ROUTES,
  type TwoPQFormDraftRecord,
} from "@/lib/two-pq-forms";
import { appText, type AppLanguage } from "@/lib/language";
import { TwoPQContactSection } from "@/components/two-pq-contact-section";

type ScopeCardKey = "institutions" | "doctors" | "patients" | "roles";

function canSeeScopeCard(role: AdminContextRecord["role"], key: ScopeCardKey) {
  if (role === "institution_doctor") {
    return key === "patients" || key === "roles";
  }

  if (role === "institution_admin") {
    return key !== "institutions";
  }

  return true;
}

export function TwoPQDashboardHome({
  adminContext,
  language,
  metrics,
  formDraft,
}: {
  adminContext: AdminContextRecord;
  language: AppLanguage;
  metrics: {
    institutions: number;
    doctors: number;
    patients: number;
    roles: number;
  };
  formDraft?: TwoPQFormDraftRecord | null;
}) {
  const linkedEntityKeys = new Set(["cases", "sampling", "sequencing"]);
  const isDoctorDashboard = adminContext.role === "institution_doctor";
  const visibleLinkedEntityKeys = new Set(
    isDoctorDashboard ? ["cases", "sampling"] : Array.from(linkedEntityKeys)
  );
  const t = (text: string) => appText(language, text);
  const translatedAreas = TWO_PQ_AREA_CONFIGS.map((area) =>
    translateTwoPQAreaConfig(area, language)
  );
  const linkedEntityAreas = translatedAreas.filter((area) =>
    visibleLinkedEntityKeys.has(area.key)
  );
  const secondaryAreas = translatedAreas.filter(
    (area) => !linkedEntityKeys.has(area.key) && (!isDoctorDashboard || area.key === "shipments")
  );
  const linkedEntityGridClassName =
    linkedEntityAreas.length <= 2 ? "grid gap-4 md:grid-cols-2" : "grid gap-4 md:grid-cols-3";
  const secondaryGridClassName =
    secondaryAreas.length <= 1
      ? "grid max-w-xl gap-4"
      : "grid gap-4 md:grid-cols-2 xl:grid-cols-3";
  const draftHref = formDraft
    ? `${TWO_PQ_FORM_ROUTES[formDraft.formType]}?draft=1`
    : null;
  const scopeCards = [
    {
      key: "institutions",
      eyebrow: "Scope",
      value: metrics.institutions,
      description: "Institutions visible to this role",
      createLabel: t("+ New Institution"),
      createHref: "/areas/institutions/new",
      browseLabel: "Open Institutions",
      browseHref: "/areas/institutions",
      canCreate: canCreateInstitutionUi(adminContext),
      disabledTitle: "Only full admins can create institutions.",
    },
    {
      key: "doctors",
      eyebrow: "Scope",
      value: metrics.doctors,
      description: "Doctors available for 2PQ ownership",
      createLabel: t("+ New Doctor"),
      createHref: "/areas/doctors/new",
      browseLabel: "Open Doctors",
      browseHref: "/areas/doctors",
      canCreate: canCreateDoctorUi(adminContext),
      disabledTitle: "Only full admins and institution admins can create doctors.",
    },
    {
      key: "patients",
      eyebrow: "Scope",
      value: metrics.patients,
      description: "Patients available for linkage",
      createLabel: t("+ New Patient"),
      createHref: "/areas/patients/new",
      browseLabel: "Open Patients",
      browseHref: "/areas/patients",
      canCreate: canCreatePatientUi(adminContext),
      disabledTitle:
        "Only full admins, institution admins, and scoped institution doctors can create patients.",
    },
    {
      key: "roles",
      eyebrow: "Access",
      value: metrics.roles,
      description: "Role records defining the active lane",
      createLabel: t("+ New Role"),
      createHref: "/roles/new",
      browseLabel: "Open Roles",
      browseHref: "/roles",
      canCreate: getAssignableRoleOptions(adminContext.role).length > 0,
      disabledTitle: "The current role cannot create role assignments.",
    },
  ] as const;
  const visibleScopeCards = scopeCards.filter((card) =>
    canSeeScopeCard(adminContext.role, card.key)
  );
  const scopeGridClassName =
    visibleScopeCards.length <= 2
      ? "grid gap-3 md:grid-cols-2"
      : visibleScopeCards.length === 3
        ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        : "grid gap-3 md:grid-cols-2 xl:grid-cols-4";

  return (
    <div className="flex flex-col gap-8">
      <PageHero
        eyebrow="2PQ"
        title={t("2PQ Dashboard")}
        description={t("Jump directly into the live 2PQ areas.")}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/roles/access">
              {t("Role assignment capabilities")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />

      <section className="glass-panel border-indigo-100 [background:linear-gradient(160deg,rgba(248,250,255,0.98),rgba(238,242,255,0.98)_42%,rgba(224,231,255,0.92))] px-5 py-5 shadow-[0_18px_56px_rgba(199,210,254,0.36)] dark:border-indigo-400/28 dark:[background:linear-gradient(145deg,rgba(23,18,56,0.98),rgba(33,28,78,0.96)_45%,rgba(99,102,241,0.22))] dark:shadow-[0_24px_80px_-52px_rgba(129,140,248,0.82)]">
        <div className="flex flex-col gap-5">
          <div>
            <p className="section-eyebrow text-indigo-900/55 dark:text-indigo-100/72">
              {t("2PQ forms")}
            </p>
            <h2 className="font-heading text-2xl font-semibold text-indigo-950 dark:text-indigo-50">
              {t("Formularios y documentos")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-indigo-900/70 dark:text-indigo-50/72">
              {t("Complete guided form flows and review the joined submissions stored in")}{" "}
              <code>2pq_forms</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 basis-[42rem] flex-wrap gap-2">
              <Button className="min-h-11 w-full justify-center whitespace-normal rounded-xl bg-indigo-600 px-5 text-left leading-snug text-white shadow-[0_14px_32px_rgba(79,70,229,0.24)] hover:bg-indigo-700 sm:w-auto sm:shrink-0 sm:whitespace-nowrap" asChild>
                <Link href="/2pq-dashboard/forms/study-request/new">
                  <ClipboardList className="size-4" />
                  Completar formulario de solicitud de estudio
                </Link>
              </Button>
              <Button className="min-h-11 w-full justify-center whitespace-normal rounded-xl bg-indigo-600 px-5 text-left leading-snug text-white shadow-[0_14px_32px_rgba(79,70,229,0.2)] hover:bg-indigo-700 sm:w-auto sm:shrink-0 sm:whitespace-nowrap" asChild>
                <Link href="/2pq-dashboard/forms/sample/new">
                  <ClipboardList className="size-4" />
                  Completar formulario de muestra
                </Link>
              </Button>
              <Button className="min-h-11 w-full justify-center whitespace-normal rounded-xl bg-indigo-600 px-5 text-left leading-snug text-white shadow-[0_14px_32px_rgba(79,70,229,0.2)] hover:bg-indigo-700 sm:w-auto sm:shrink-0 sm:whitespace-nowrap" asChild>
                <Link href="/2pq-dashboard/forms/withdrawal-request/new">
                  <ClipboardList className="size-4" />
                  Completar formulario de solicitud de retiro
                </Link>
              </Button>
              {formDraft && draftHref ? (
                <Button
                  className="min-h-11 w-full justify-center whitespace-normal rounded-xl border border-rose-200 bg-white/76 px-5 text-left leading-snug text-rose-950 shadow-[0_14px_32px_rgba(244,63,94,0.14)] hover:bg-rose-50 dark:border-rose-300/24 dark:bg-rose-400/12 dark:text-rose-50 dark:hover:bg-rose-400/18 sm:w-auto sm:shrink-0 sm:whitespace-nowrap"
                  asChild
                >
                  <Link href={draftHref}>
                    <FileClock className="size-4" />
                    {t("Continue from draft")}
                    <span className="sr-only">
                      {" "}
                      {TWO_PQ_FORM_LABELS[formDraft.formType]}
                    </span>
                  </Link>
                </Button>
              ) : null}
            </div>
            <Button
              variant="outline"
              className="min-h-11 w-full shrink-0 rounded-xl border-indigo-200 bg-white/72 text-indigo-950 hover:bg-white dark:border-indigo-300/20 dark:bg-indigo-400/12 dark:text-indigo-50 sm:w-auto lg:ml-auto"
              asChild
            >
              <Link href="/2pq-dashboard/forms">
                {t("Open Forms")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow">{t("Scoped areas")}</p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">{t("Core scope controls")}</h2>
          <p className="max-w-4xl text-sm text-muted-foreground">
            {t("Review the live institutions, doctors, patients, and role assignments tied to this lane, then jump straight into creation or management from the dashboard.")}
          </p>
        </div>

        <div className={scopeGridClassName}>
          {visibleScopeCards.map((card) => (
            <article key={card.key} className="glass-panel flex flex-col px-4 py-4">
              <p className="section-eyebrow">{t(card.eyebrow)}</p>
              <p className="mt-2 font-heading text-2xl font-semibold text-foreground">
                {card.value}
              </p>
              <p className="text-sm text-muted-foreground">{t(card.description)}</p>

              <div className="mt-4 flex flex-col gap-2">
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
                    title={t(card.disabledTitle)}
                  >
                    <span className="flex items-center gap-2">
                      <PlusCircle className="h-4 w-4" />
                      {card.createLabel}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between rounded-xl"
                  asChild
                >
                  <Link href={card.browseHref}>
                    <span>{t(card.browseLabel)}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-panel border-emerald-100 [background:linear-gradient(160deg,rgba(249,253,250,0.98),rgba(240,253,244,0.98)_42%,rgba(220,252,231,0.92))] px-5 py-5 shadow-[0_18px_56px_rgba(187,247,208,0.32)] dark:border-emerald-400/28 dark:[background:linear-gradient(145deg,rgba(6,35,24,0.98),rgba(10,42,30,0.95)_45%,rgba(16,185,129,0.2))] dark:shadow-[0_24px_80px_-52px_rgba(16,185,129,0.8)]">
        <div className="flex flex-col gap-5">
          <div>
            <p className="section-eyebrow text-emerald-900/55 dark:text-emerald-100/72">{t("2PQ circuit")}</p>
            <h2 className="font-heading text-2xl font-semibold text-emerald-950 dark:text-emerald-50">
              {t("Linked entities")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-emerald-900/70 dark:text-emerald-50/72">
              {t(
                isDoctorDashboard
                  ? "Cases and biopsy records stay grouped here for the medical workflow."
                  : "Grouped parent-child entities for the new flow: sequencing batches, cases, and sampling records."
              )}
            </p>
          </div>

          <div className={linkedEntityGridClassName}>
            {linkedEntityAreas.map((area) => (
              <article
                key={area.key}
                className="flex h-full flex-col gap-4 rounded-[1.7rem] border border-emerald-100 [background:linear-gradient(180deg,rgba(255,255,255,0.82),rgba(240,253,244,0.82))] px-5 py-5 shadow-[0_12px_32px_rgba(220,252,231,0.82)] dark:border-emerald-300/18 dark:[background:linear-gradient(180deg,rgba(7,30,22,0.98),rgba(8,38,27,0.96)_52%,rgba(5,150,105,0.18))] dark:shadow-none"
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
                    {t("Linked entity")}
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
                      {t("Open area")}
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
          <p className="section-eyebrow">{t("Other 2PQ areas")}</p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            {t("Secondary workflow surfaces")}
          </h2>
          <p className="max-w-4xl text-sm text-muted-foreground">
            {t(
              isDoctorDashboard
                ? "Shipment operations stay available as the supporting area for this role."
                : "Shipment, reporting, and client operations stay here as separate supporting areas."
            )}
          </p>
        </div>

        <div className={secondaryGridClassName}>
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
                    {t("Open area")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <TwoPQContactSection />
    </div>
  );
}
