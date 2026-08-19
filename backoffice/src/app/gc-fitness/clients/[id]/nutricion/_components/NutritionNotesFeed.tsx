// NutritionNotesFeed.tsx — what the client actually said, dated and per meal (#919).
//
// This is the part of the screen a coach really reads. A percentage says something went
// wrong; the notes say WHAT. Two Fridays in a row reading "salí tarde del trabajo" is a
// plan put in the wrong place — a dinner scheduled at an hour this person does not have —
// not an undisciplined client, and only the dates sitting next to each other make that
// visible.
//
// When the client loaded what they actually ate, the delta table appears under the note:
//
//            Kcal  Prot  Carb  Gras
//   Tenías    780    55    78    22
//   Comiste   950    48    95    38
//   Dif.     +170    −7   +17   +16
//
// "Me pasé 170 kcal y me faltaron 7 g de proteína" is actionable; "no cumpliste" is not.
// The line under it is printed ON SCREEN and not just in a comment: what they ate is
// CONTEXT, it never moves adherence. The moment a macro number starts scoring, this
// becomes the food tracker #908 explicitly asks us not to build.
//
// A blank cell means the delta is UNKNOWABLE — the coach set no target for that macro, or
// the client left it empty. It is never rendered as `+0`, which would quietly claim they
// hit a number nobody wrote.

import Link from "next/link";
import { MessageSquareReply } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { localizedNamePair } from "@/lib/gc-fitness/localized-name";
import {
  nutritionNoteReplyDraft,
  nutritionNoteReplyHref,
} from "@/lib/gc-fitness/nutrition-coach-reply";
import type { NutritionNoteEntry } from "@/lib/gc-fitness/nutrition-compliance";
import { macroDeltaIsEmpty, type MacroTargets } from "@/lib/gc-fitness/nutrition-schema";

const MACRO_KEYS = ["kcal", "proteinG", "carbsG", "fatG"] as const;

export interface NutritionNotesFeedProps {
  notes: NutritionNoteEntry[];
  locale: string;
  /**
   * Whose notes these are. Needed for the reply link (#926) — without it the feed can
   * show a coach the problem and offer no way to answer it, which is the exact hole that
   * issue exists to close.
   */
  clientId: string;
}

export async function NutritionNotesFeed({
  notes,
  locale,
  clientId,
}: NutritionNotesFeedProps) {
  const t = await getTranslations("clients.detail.nutrition");

  return (
    <Card data-testid="nutrition-notes-feed">
      <CardHeader>
        <CardTitle className="text-base">{t("notes")}</CardTitle>
        <p className="text-muted-foreground text-xs">{t("notesHelp")}</p>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm" data-testid="nutrition-notes-empty">
            {t("notesEmpty")}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {notes.map((entry) => {
              const mealName =
                localizedNamePair(entry.mealName, locale).primary || entry.mealId;
              const statusLabel =
                entry.status === "missed"
                  ? t("noteStatusMissed")
                  : entry.status === "different"
                    ? t("noteStatusDifferent")
                    : t("noteStatusDone");
              return (
                <li
                  key={`${entry.civilDate}-${entry.mealId}`}
                  data-testid="nutrition-note"
                  className="rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatCivilDateLabel(
                        entry.civilDate,
                        { weekday: "short", day: "numeric", month: "short" },
                        locale,
                      )}
                    </span>
                    <span className="text-sm font-medium">{mealName}</span>
                    <Badge
                      variant={entry.status === "missed" ? "destructive" : "secondary"}
                      className="text-[0.7rem]"
                    >
                      {statusLabel}
                    </Badge>
                  </div>

                  {entry.note ? (
                    <p className="mt-2 text-sm whitespace-pre-wrap">{entry.note}</p>
                  ) : null}

                  {/* The answering half (#926). A plain link, not an action: it opens the
                      coach's own inbox on this client's thread with the note quoted in
                      the composer, so nothing is sent until the coach writes and hits
                      send. The note is quoted as TEXT because the chat's `replyTo`
                      mechanic points at a message id and a note has none. */}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-8 px-2 text-xs"
                    data-testid={`nutrition-note-reply-${entry.civilDate}-${entry.mealId}`}
                  >
                    <Link
                      href={nutritionNoteReplyHref(
                        clientId,
                        nutritionNoteReplyDraft({
                          mealName,
                          civilDate: entry.civilDate,
                          note: entry.note,
                          locale,
                        }),
                      )}
                    >
                      <MessageSquareReply className="size-3.5" />
                      {t("noteReply")}
                    </Link>
                  </Button>

                  {entry.actualMacros && !macroDeltaIsEmpty(entry.delta) ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="text-xs tabular-nums">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="pr-3 text-left font-medium" />
                            <th className="px-2 text-right font-medium">{t("kcal")}</th>
                            <th className="px-2 text-right font-medium">{t("protein")}</th>
                            <th className="px-2 text-right font-medium">{t("carbs")}</th>
                            <th className="pl-2 text-right font-medium">{t("fat")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <MacroRow
                            label={t("macrosTarget")}
                            values={entry.targets}
                            placeholder={t("noMacro")}
                          />
                          <MacroRow
                            label={t("macrosActual")}
                            values={entry.actualMacros}
                            placeholder={t("noMacro")}
                          />
                          <tr className="font-medium">
                            <th scope="row" className="pr-3 text-left font-medium">
                              {t("macrosDelta")}
                            </th>
                            {MACRO_KEYS.map((key) => {
                              const value = entry.delta[key];
                              return (
                                <td key={key} className="px-2 text-right">
                                  {value === null
                                    ? t("noMacro")
                                    : `${value > 0 ? "+" : ""}${value}`}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}

        {/* Printed, not merely commented: the rule only holds if the coach can see it. */}
        <p className="text-muted-foreground mt-4 text-xs">{t("macrosNeverScored")}</p>
      </CardContent>
    </Card>
  );
}

function MacroRow({
  label,
  values,
  placeholder,
}: {
  label: string;
  values: MacroTargets | null;
  placeholder: string;
}) {
  return (
    <tr>
      <th scope="row" className="text-muted-foreground pr-3 text-left font-normal">
        {label}
      </th>
      {MACRO_KEYS.map((key) => {
        const value = values?.[key];
        return (
          <td key={key} className="px-2 text-right">
            {typeof value === "number" ? value : placeholder}
          </td>
        );
      })}
    </tr>
  );
}
