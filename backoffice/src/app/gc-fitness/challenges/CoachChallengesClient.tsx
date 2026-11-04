"use client";

// gc-fitness #1475 (S6) — la página de desafíos del coach: formulario para crear un desafío
// para TODO el equipo + la lista (en curso / terminados) con el ranking de los que se
// sumaron. El doc lo escribe `createCoachChallenge`; acá sólo se arma el pedido y se pinta.

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Trash2, Trophy, Users } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { civilDateAddDays, civilDaysBetween, formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { createCoachChallenge, deleteCoachChallenge } from "@/lib/gc-fitness/coach-challenge-actions";
import {
  COACH_CHALLENGE_NAME_MAX,
  COACH_CHALLENGE_START_LOOKAHEAD_DAYS,
  type CoachChallengeCadence,
  type CoachChallengeKind,
  type CoachChallengeSummary,
} from "@/lib/gc-fitness/coach-challenges";
import { cn } from "@/lib/utils";

interface Props {
  challenges: CoachChallengeSummary[];
  /** Cuántos clientes reales se invitarían (la vista previa). */
  inviteeCount: number;
  /** IANA del coach, resuelta en el servidor (#747). */
  timezone: string;
  /** Hoy (`YYYY-MM-DD`) en la zona del coach. */
  today: string;
  nowMs: number;
}

const SEGMENT_BASE =
  "h-10 flex-1 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Segmented<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-1 rounded-full bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={cn(
            SEGMENT_BASE,
            value === option.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CoachChallengesClient({ challenges, inviteeCount, timezone, today, nowMs }: Props) {
  const t = useTranslations("coachChallenges");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<CoachChallengeKind>("workouts");
  const [cadence, setCadence] = useState<CoachChallengeCadence>("total");
  const [target, setTarget] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(civilDateAddDays(today, 6) ?? today);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<CoachChallengeSummary | null>(null);

  const maxStart = civilDateAddDays(today, COACH_CHALLENGE_START_LOOKAHEAD_DAYS) ?? today;
  const span = civilDaysBetween(startDate, endDate);
  const durationDays = span === null ? null : span + 1;
  const weeklyMismatch = cadence === "weekly" && durationDays !== null && durationDays > 0 && durationDays % 7 !== 0;
  const nameLength = Array.from(name.trim()).length;

  const numberFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);
  const active = challenges.filter((c) => c.status === "active");
  const ended = challenges.filter((c) => c.status === "ended");

  function errorText(code: string): string {
    switch (code) {
      case "name.invalid":
        return t("errors.name");
      case "kind.invalid":
        return t("errors.kind");
      case "cadence.invalid":
        return t("errors.cadence");
      case "target.invalid":
        return t("errors.target");
      case "startDate.invalid":
        return t("errors.startDate");
      case "startDate.startPast":
        return t("errors.startPast");
      case "startDate.startTooFar":
        return t("errors.startTooFar");
      case "endDate.invalid":
        return t("errors.endDate");
      case "endDate.endBeforeStart":
        return t("errors.endBeforeStart");
      case "endDate.tooLong":
        return t("errors.tooLong");
      case "endDate.notWeeks":
        return t("errors.notWeeks");
      case "timezone.invalid":
        return t("errors.timezone");
      case "members.noMembers":
        return t("errors.noMembers");
      case "members.tooManyMembers":
        return t("errors.tooManyMembers");
      case "notFound":
        return t("errors.notFound");
      default:
        return t("errors.generic");
    }
  }

  function targetLabel(): string {
    if (kind === "workouts") {
      return cadence === "weekly" ? t("targetLabelWorkoutsWeekly") : t("targetLabelWorkoutsTotal");
    }
    return cadence === "weekly" ? t("targetLabelVolumeWeekly") : t("targetLabelVolumeTotal");
  }

  function goalLine(c: CoachChallengeSummary): string {
    if (c.kind === "workouts") {
      return c.cadence === "weekly"
        ? t("goalWorkoutsWeekly", { target: c.target })
        : t("goalWorkoutsTotal", { target: c.target });
    }
    const formatted = numberFormat.format(c.target);
    return c.cadence === "weekly"
      ? t("goalVolumeWeekly", { target: formatted })
      : t("goalVolumeTotal", { target: formatted });
  }

  function progressText(c: CoachChallengeSummary, progress: number): string {
    if (c.cadence === "weekly") return t("progressWeeks", { done: progress, total: c.weekCount ?? 0 });
    if (c.kind === "workouts") return `${progress}/${c.target}`;
    return `${numberFormat.format(progress)} / ${numberFormat.format(c.target)} kg`;
  }

  function dayLabel(civil: string): string {
    return formatCivilDateLabel(civil, { day: "numeric", month: "short", year: "numeric" }, locale);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await createCoachChallenge({
          name,
          kind,
          cadence,
          target: target.trim() === "" ? null : Number(target.replace(",", ".")),
          startDate,
          endDate,
        });
        if (!result.ok) {
          setError(errorText(result.error));
          return;
        }
        toast.success(t("created"));
        setName("");
        setTarget("");
        router.refresh();
      } catch {
        setError(t("errors.generic"));
      }
    });
  }

  function confirmDelete() {
    const challenge = toDelete;
    if (!challenge) return;
    startTransition(async () => {
      try {
        const result = await deleteCoachChallenge(challenge.id);
        if (!result.ok) {
          toast.error(errorText(result.error));
        } else {
          toast.success(t("deleted"));
        }
        setToDelete(null);
        router.refresh();
      } catch {
        toast.error(t("errors.generic"));
      }
    });
  }

  function renderChallenge(c: CoachChallengeSummary) {
    const upcoming = c.status === "active" && Date.parse(c.startsAt) > nowMs;
    return (
      <Card key={c.id} data-testid={`coach-challenge-${c.id}`}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              <Trophy className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="break-words">{c.name}</span>
              {c.status === "ended" ? (
                <Badge variant="secondary">{t("endedBadge")}</Badge>
              ) : upcoming ? (
                <Badge variant="brand">{t("upcomingBadge")}</Badge>
              ) : (
                <Badge variant="success">{t("activeBadge")}</Badge>
              )}
              {c.hidden ? <Badge variant="rose">{t("hiddenBadge")}</Badge> : null}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {goalLine(c)} · {t("window", { start: dayLabel(c.startDate), end: dayLabel(c.endDate) })}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {t("counts", { joined: c.joinedCount, invited: c.invitedCount })}
              </span>
              {c.pendingCount > 0 ? <span>{t("pending", { count: c.pendingCount })}</span> : null}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
            aria-label={t("deleteAria", { name: c.name })}
            onClick={() => setToDelete(c)}
            disabled={pending}
          >
            <Trash2 className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {c.standings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noStandings")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="w-10 py-2 pr-2 font-medium">{t("colRank")}</th>
                    <th className="py-2 pr-2 font-medium">{t("colName")}</th>
                    <th className="py-2 text-right font-medium">{t("colProgress")}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.standings.map((row) => (
                    <tr key={row.uid} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-2 font-semibold tabular-nums">{row.rank}</td>
                      <td className="py-2 pr-2">
                        <span className="break-words">{row.name}</span>
                        {row.completedAt ? (
                          <Badge variant="success" className="ml-2">
                            {t("completedBadge")}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2 text-right tabular-nums">{progressText(c, row.progress)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="gc-page-title text-xl">{t("newTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("formNote")}</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="challenge-name">{t("nameLabel")}</Label>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    nameLength > COACH_CHALLENGE_NAME_MAX ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {t("nameCounter", { count: nameLength })}
                </span>
              </div>
              <Input
                id="challenge-name"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/[\r\n]/g, " "))}
                placeholder={t("namePlaceholder")}
                className="h-11"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>{t("kindLabel")}</Label>
                <Segmented
                  name={t("kindLabel")}
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "workouts", label: t("kindWorkouts") },
                    { value: "volume", label: t("kindVolume") },
                  ]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("cadenceLabel")}</Label>
                <Segmented
                  name={t("cadenceLabel")}
                  value={cadence}
                  onChange={setCadence}
                  options={[
                    { value: "total", label: t("cadenceTotal") },
                    { value: "weekly", label: t("cadenceWeekly") },
                  ]}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="challenge-target">{targetLabel()}</Label>
              <Input
                id="challenge-target"
                inputMode={kind === "workouts" ? "numeric" : "decimal"}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-11"
                required
              />
              <p className="text-xs text-muted-foreground">
                {kind === "workouts" ? t("targetHintWorkouts") : t("targetHintVolume")}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="challenge-start">{t("startLabel")}</Label>
                <Input
                  id="challenge-start"
                  type="date"
                  min={today}
                  max={maxStart}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="challenge-end">{t("endLabel")}</Label>
                <Input
                  id="challenge-end"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                {durationDays !== null && durationDays > 0 ? `${t("durationPreview", { days: durationDays })} · ` : ""}
                {t("datesHint", { timezone })}
              </p>
              {weeklyMismatch ? <p className="text-destructive">{t("weeklyHint")}</p> : null}
            </div>

            <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="inline-flex items-center gap-2 text-sm font-medium">
                <Users className="size-4 text-primary" aria-hidden />
                {inviteeCount > 0 ? t("invitePreview", { count: inviteeCount }) : t("noClients")}
              </p>
              <Button
                type="submit"
                className="h-11 rounded-full px-6"
                disabled={pending || inviteeCount === 0 || weeklyMismatch}
              >
                {pending ? t("creating") : t("createCta")}
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="gc-page-title text-xl">{t("activeTitle")}</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyActive")}</p>
        ) : (
          active.map(renderChallenge)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="gc-page-title text-xl">{t("endedTitle")}</h2>
        {ended.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyEnded")}</p>
        ) : (
          ended.map(renderChallenge)
        )}
      </section>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !pending && !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name: toDelete?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
