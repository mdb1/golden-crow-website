// NutritionCoachActions.tsx — "qué conviene conversar" (#926).
//
// The grid says WHICH meal is falling over and the feed says WHY. Neither of them tells
// the coach to do anything, and neither gives them anywhere to do it from. This card is
// the answering half: the one or two meals that are structurally failing IN THE CURRENT
// PHASE, each with the conversation already half-written.
//
// ── Why it is scoped to the ACTIVE phase ────────────────────────────────────────────
//
// A meal that collapsed under the plan the coach replaced last month is not a problem, it
// is history — and surfacing it would send the coach to fix something they already fixed.
// The window is the phase in force, so the card answers "is what I am asking for right
// now working", which is the only version of the question that has an action behind it.
//
// ── Why there is no "edit this meal" button ─────────────────────────────────────────
//
// #926 proposed one. It is NOT built, deliberately: the coach's client surface has no
// phase editor at all — the only write paths are "assign a new phase" and the bulk assign
// in the library. A one-meal mini-editor here would fork the plan body away from the
// single path that validates it (`nutritionPlanFormSchema`), which is exactly how two
// surfaces end up writing two different shapes of the same document. The card links to
// the assign screen instead, and the missing editor is called out in the PR.

import Link from "next/link";
import { MessageSquareReply, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localizedNamePair } from "@/lib/gc-fitness/localized-name";
import {
  failingMealReplyDraft,
  nutritionNoteReplyHref,
  type FailingMeal,
} from "@/lib/gc-fitness/nutrition-coach-reply";

export interface NutritionCoachActionsProps {
  clientId: string;
  /** Already filtered and sorted worst-first by `failingMeals`. */
  meals: FailingMeal[];
  /** The phase these numbers are measured over, for the subtitle. */
  phaseName: string | null;
  locale: string;
}

export async function NutritionCoachActions({
  clientId,
  meals,
  phaseName,
  locale,
}: NutritionCoachActionsProps) {
  const t = await getTranslations("clients.detail.nutrition");

  // No card at all when nothing is failing. An empty "everything is fine" panel trains the
  // coach to skip the whole region, and then it is not read on the week it fills up.
  if (meals.length === 0) return null;

  return (
    <Card data-testid="nutrition-coach-actions">
      <CardHeader>
        <CardTitle className="text-base">{t("actionsTitle")}</CardTitle>
        <p className="text-muted-foreground text-xs">
          {phaseName ? t("actionsHelpPhase", { phase: phaseName }) : t("actionsHelp")}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {meals.map((meal) => {
          const name = localizedNamePair(meal.name, locale).primary || meal.mealId;
          const pattern = t("actionsPattern", {
            done: meal.done,
            expected: meal.expected,
          });
          return (
            <div
              key={meal.mealId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              data-testid={`nutrition-coach-action-${meal.mealId}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-muted-foreground text-xs tabular-nums">{pattern}</p>
              </div>
              <Button asChild variant="secondary" size="sm" className="h-8">
                <Link
                  href={nutritionNoteReplyHref(
                    clientId,
                    failingMealReplyDraft(
                      { name, done: meal.done, expected: meal.expected },
                      { pattern },
                    ),
                  )}
                  data-testid={`nutrition-coach-action-reply-${meal.mealId}`}
                >
                  <MessageSquareReply className="size-3.5" />
                  {t("actionsReply")}
                </Link>
              </Button>
            </div>
          );
        })}

        <div>
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
            <Link href={`/gc-fitness/clients/${clientId}/nutricion/asignar`}>
              <Pencil className="size-3.5" />
              {t("actionsAdjust")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
