import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { loadBodyWeightPoints } from "@/lib/gc-fitness/body-weight-logs";
import { civilDateAddDays } from "@/lib/gc-fitness/civil-date";
import { coachVisibleClientName } from "@/lib/gc-fitness/client-name";
import { FirestoreCollections } from "@/lib/gc-fitness/collections";
import {
  listNutritionLogsForClient,
  listNutritionPlansForClient,
} from "@/lib/gc-fitness/nutrition-actions";
import {
  nutritionAdherenceByMeal,
  nutritionCurrentStreak,
} from "@/lib/gc-fitness/nutrition-adherence";
import {
  buildNutritionPhaseBands,
  buildNutritionPhaseRows,
  buildNutritionStats,
  buildNutritionWeekGrid,
  civilWeekStart,
  collectNutritionNotes,
} from "@/lib/gc-fitness/nutrition-compliance";
import { failingMeals } from "@/lib/gc-fitness/nutrition-coach-reply";
import { localizedNamePair } from "@/lib/gc-fitness/localized-name";
import { buildNutritionPhaseStrip } from "@/lib/gc-fitness/nutrition-plan-form";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

import { BodyWeightTrendChart } from "../_components/BodyWeightTrendChart";
import { NutritionCoachActions } from "./_components/NutritionCoachActions";
import { NutritionComplianceGrid } from "./_components/NutritionComplianceGrid";
import { NutritionNotesFeed } from "./_components/NutritionNotesFeed";
import { NutritionPhaseStrip } from "./_components/NutritionPhaseStrip";
import { NutritionPhaseWeightTable } from "./_components/NutritionPhaseWeightTable";
import { NutritionCurrentTargets } from "./_components/NutritionCurrentTargets";
import { NutritionStats } from "./_components/NutritionStats";

export const generateMetadata = () => sectionMetadata("clients");

export const dynamic = "force-dynamic";

/** Weeks the grid can page back through. */
const GRID_WEEKS = 8;

/** Log window, matching every other per-client trend widget. */
const LOOKBACK_DAYS = 365;

/**
 * The coach's nutrition surface for one client (#914, extended by #919).
 *
 * The order is the order a coach thinks in: the PHASE STRIP (what has been, what is, what
 * is queued), then the targets in force TODAY, then whether they are being MET — stats,
 * the weekly grid, the client's own words — and last, whether the plan is WORKING: weight
 * with the phases painted behind it, and the table that puts kcal, adherencia and Δ peso
 * on one line. The strip leads because nutrition here is not a state but a sequence
 * ("agosto definición, septiembre volumen"), and the first question is almost always
 * "what block is he in", not "what are the numbers".
 *
 * Query budget: 1 read for the plans, 1 for the logs (`clientId` + `civilDate` range —
 * needs the composite index deployed in #919), 1 for the weigh-ins. Week navigation and
 * the chart's range selector are pure client state over data already shipped, so neither
 * costs a further read.
 */
export default async function ClientNutritionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trainer;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/login");
    throw err;
  }

  const clientSnap = await gcFitnessFirestore()
    .collection(FirestoreCollections.users)
    .doc(id)
    .get();
  if (!clientSnap.exists) notFound();
  const client = clientSnap.data() as {
    coachId?: string;
    displayName?: string;
    email?: string;
    coachNickname?: string;
  };
  if (client.coachId !== trainer.uid) notFound();

  const clientName = coachVisibleClientName({
    uid: id,
    displayName: client.displayName ?? client.email ?? id,
    email: client.email ?? "",
    coachNickname: client.coachNickname ?? null,
  });

  const t = await getTranslations("clients.detail.nutrition");
  const locale = await getLocale();

  // `listNutritionPlansForClient` re-checks ownership. That is deliberate duplication: the
  // page guard protects the render, the action guard protects the data — and the action is
  // also reachable from the form.
  const { plans, context } = await listNutritionPlansForClient(id);
  const phases = buildNutritionPhaseStrip(plans, context.todayCivil);
  const current = phases.find((phase) => phase.isActive) ?? null;

  // One year back, the same window every other trend widget on this client uses. It is
  // also what `adherenceIsPartial` is measured against — a phase older than this reports
  // the slice of it we actually read, and says so, rather than counting unread days as
  // unmarked and printing 8% for a month the client followed.
  const windowStart = civilDateAddDays(context.todayCivil, -(LOOKBACK_DAYS - 1)) ??
    context.todayCivil;

  const [logs, weightPoints] = await Promise.all([
    listNutritionLogsForClient(id, windowStart, context.todayCivil),
    loadBodyWeightPoints(id, context.clientTimezone),
  ]);

  // Oldest → newest; the grid opens on the last one. Eight weeks is what a coach scrolls
  // back through when a client says "hace como un mes que vengo mal".
  const weeks = Array.from({ length: GRID_WEEKS }, (_, offset) => {
    const anchor =
      civilDateAddDays(civilWeekStart(context.todayCivil), -(GRID_WEEKS - 1 - offset) * 7) ??
      context.todayCivil;
    return buildNutritionWeekGrid(plans, logs, anchor, context.todayCivil);
  });

  const stats = buildNutritionStats(plans, logs, context.todayCivil, current?.plan ?? null);
  // The streak comes straight from the twin the apps read, so "N días seguidos" cannot
  // mean one thing here and another on the client's phone.
  const streak = nutritionCurrentStreak(plans, logs, context.todayCivil);
  const notes = collectNutritionNotes(logs);

  // #926 — the meals worth a conversation, measured over the phase IN FORCE. A meal that
  // collapsed under a plan the coach already replaced is history, not a problem, and
  // surfacing it would send them to fix something they fixed last month.
  //
  // The breakdown comes from the same `nutritionAdherenceByMeal` the grid rows carry, on
  // purpose: a second count is a second chance to disagree with the client's own screen.
  const failing = current
    ? failingMeals(
        nutritionAdherenceByMeal(
          plans,
          logs,
          // Clamped to the read window: a phase that started before it would otherwise
          // count unread days as unmarked and report a failure nobody had.
          current.plan.startsOn > windowStart ? current.plan.startsOn : windowStart,
          context.todayCivil,
        ),
      )
    : [];
  const phaseRows = buildNutritionPhaseRows(
    plans,
    logs,
    weightPoints,
    context.todayCivil,
    current?.plan.id ?? null,
    windowStart,
  );
  const phaseBands = buildNutritionPhaseBands(
    phaseRows,
    windowStart,
    context.todayCivil,
    locale === "en" ? "en" : "es",
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
            <Link href={`/gc-fitness/clients/${id}`}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground text-sm">
              {clientName} · {t("subtitle")}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href={`/gc-fitness/clients/${id}/nutricion/asignar`}>{t("assign")}</Link>
        </Button>
      </div>

      <NutritionCurrentTargets phase={current} todayCivil={context.todayCivil} />

      <NutritionPhaseStrip
        clientId={id}
        phases={phases}
        todayCivil={context.todayCivil}
      />

      <NutritionStats
        last7Days={stats.last7Days}
        currentPhase={stats.currentPhase}
        streak={streak}
      />

      <NutritionCoachActions
        clientId={id}
        meals={failing}
        phaseName={
          current ? localizedNamePair(current.plan.name, locale).primary : null
        }
        locale={locale}
      />

      <NutritionComplianceGrid weeks={weeks} />

      <NutritionNotesFeed notes={notes} locale={locale} clientId={id} />

      {/* The chart is the existing one, reused — with the phases painted behind it. */}
      <BodyWeightTrendChart
        clientId={id}
        timezone={context.clientTimezone}
        points={weightPoints}
        phaseBands={phaseBands}
      />

      <NutritionPhaseWeightTable rows={phaseRows} locale={locale} />
    </div>
  );
}
