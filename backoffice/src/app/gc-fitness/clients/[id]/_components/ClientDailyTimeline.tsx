"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRightLeft,
  CalendarDays,
  Camera,
  CheckCircle2,
  Dumbbell,
  MessageSquare,
  NotebookText,
  Plus,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  getClientDailyTimelineDay,
  type ClientDailyTimelineDay,
} from "@/lib/gc-fitness/client-daily-timeline-actions";
import {
  formatClientActivityDate,
  formatClientActivityDateTime,
} from "@/lib/gc-fitness/client-activity-time";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { Button } from "@/components/ui/button";
import { WorkoutAssignmentDeleteDialog } from "@/components/gc-fitness/workout-assignment-delete-dialog";

export function ClientDailyTimeline({
  clientId,
  availableDates,
  initialDay,
  todayCivil,
  timezone,
}: {
  clientId: string;
  availableDates: string[];
  initialDay: ClientDailyTimelineDay;
  todayCivil: string;
  timezone: string;
}) {
  const locale = useLocale();
  const t = useTranslations("clients.detail.timeline");
  const tCommon = useTranslations("common");
  const initialDate =
    availableDates.find((day) => day === todayCivil) ?? availableDates[0] ?? initialDay.date;

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [daysByDate, setDaysByDate] = useState<Record<string, ClientDailyTimelineDay>>(
    () => ({ [initialDay.date]: initialDay }),
  );
  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 260522-ki7 Task F — switched from inline AlertDialog to shared
  // WorkoutAssignmentDeleteDialog. The dialog owns the deletion lifecycle
  // (deleteAssignment call, toast, pending state). We hold the trigger
  // payload here so the cell knows which workout was selected.
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    scheduledFor: string;
    templateName: string;
    seriesId?: string | null;
  } | null>(null);
  const dayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [didUserPickDay, setDidUserPickDay] = useState(false);
  const didAutoCenterInitialDay = useRef(false);

  const selected = daysByDate[selectedDate] ?? null;

  const loadedCounts = useMemo(
    () => ({
      loaded: Object.keys(daysByDate).length,
      activity: Object.values(daysByDate).filter((day) =>
        hasActivity(day),
      ).length,
    }),
    [daysByDate],
  );

  useEffect(() => {
    if (didAutoCenterInitialDay.current) return;
    const node = dayButtonRefs.current[selectedDate];
    if (!node) return;
    node.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
    didAutoCenterInitialDay.current = true;
  }, [selectedDate]);

  useEffect(() => {
    if (!didUserPickDay) return;
    const node = dayButtonRefs.current[selectedDate];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDate, didUserPickDay]);

  async function loadDay(day: string) {
    setDidUserPickDay(true);
    if (daysByDate[day] || loadingDate === day) {
      setSelectedDate(day);
      return;
    }

    setSelectedDate(day);
    setLoadingDate(day);
    setError(null);
    try {
      const loaded = await getClientDailyTimelineDay(clientId, day);
      setDaysByDate((prev) => ({ ...prev, [day]: loaded }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotLoad"));
    } finally {
      setLoadingDate((current) => (current === day ? null : current));
    }
  }

  // 260522-ki7 Task F — invoked by WorkoutAssignmentDeleteDialog after a
  // successful Server-Action delete. The dialog already surfaced the
  // success toast and is closing itself.
  //
  // - deletedCount === 1 → simple single-doc delete. Drop the row in place
  //   (mirrors the previous inline optimistic UX from 260521-tjl, just
  //   moved to post-success since the dialog now owns the request).
  // - deletedCount > 1 → cascade across the series. Multiple days may be
  //   affected — clear the in-memory cache and reload the currently-selected
  //   day. Other cached days will lazy-load on next selection.
  function handleDeleteSuccess(
    id: string,
    result: { ok: true; deletedCount: number },
  ) {
    if (result.deletedCount <= 1) {
      const ownerDate = Object.keys(daysByDate).find((d) =>
        daysByDate[d]?.workouts.some((w) => w.id === id),
      );
      if (!ownerDate) return;
      setDaysByDate((prev) => ({
        ...prev,
        [ownerDate]: {
          ...prev[ownerDate],
          workouts: prev[ownerDate].workouts.filter((w) => w.id !== id),
        },
      }));
      return;
    }

    // Cascade: drop all cached days and re-fetch the selected one.
    setDaysByDate({ [initialDay.date]: initialDay });
    setLoadingDate(selectedDate);
    setError(null);
    getClientDailyTimelineDay(clientId, selectedDate)
      .then((loaded) => {
        setDaysByDate({ [selectedDate]: loaded });
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : t("couldNotRefresh"),
        );
      })
      .finally(() => {
        setLoadingDate((current) =>
          current === selectedDate ? null : current,
        );
      });
  }

  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm lg:col-span-2">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <CalendarDays className="size-4" />
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("daysLoaded", { count: loadedCounts.loaded })}
        </div>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {availableDates.map((day) => {
          const dayData = daysByDate[day];
          const isLoaded = Boolean(dayData);
          const hasData = isLoaded ? hasActivity(dayData) : false;
          const isSelected = day === selectedDate;
          return (
            <button
              key={day}
              ref={(node) => {
                dayButtonRefs.current[day] = node;
              }}
              type="button"
              onClick={() => void loadDay(day)}
              className={[
                "min-w-28 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted",
              ].join(" ")}
            >
              <span className="block font-medium">{shortDate(day, locale)}</span>
              <span
                className={
                  isSelected ? "text-primary-foreground/75" : "text-muted-foreground"
                }
              >
                {loadingDate === day
                  ? t("loading")
                  : !isLoaded
                    ? t("tapToLoad")
                    : hasData
                      ? t("activity")
                      : t("noData")}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loadingDate === selectedDate && !selected ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LoadingBlock title={t("workouts")} />
          <LoadingBlock title={t("habits")} />
          <LoadingBlock title={t("progressPhotos")} />
          <LoadingBlock title={t("chat")} />
          <LoadingBlock title={t("coachNotes")} />
        </div>
      ) : selected ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TimelineBlock
            icon={<Dumbbell className="size-4" />}
            title={t("workouts")}
            action={
              <Link
                href={`/gc-fitness/schedule?clientId=${clientId}&date=${selected.date}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3" />
                {selected.workouts.length > 0 ? t("addAfterLast") : t("assignWorkout")}
              </Link>
            }
          >
            {selected.workouts.length === 0 && selected.workoutLogs.length === 0 ? (
              <Empty>{t("restOrNone")}</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {selected.workouts.map((workout) => (
                  <li key={workout.id} className="rounded-md bg-muted px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-medium">{workout.name}</span>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{workout.status}</span>
                          {workout.scheduledTime ? <span>• {workout.scheduledTime}</span> : null}
                        </div>
                      </div>
                      {workout.status === "scheduled" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setDeleteTarget({
                              id: workout.id,
                              scheduledFor: selected.date,
                              templateName: workout.name,
                              seriesId: workout.seriesId ?? null,
                            })
                          }
                          aria-label={t("removeWorkoutLabel", { name: workout.name })}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    {workout.originallyScheduledFor ? (
                      <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <ArrowRightLeft className="size-3" aria-hidden="true" />
                        <span>
                          {`Originalmente ${formatTimelineCivilDate(
                            workout.originallyScheduledFor,
                            locale,
                          )}, el cliente lo movió a ${formatTimelineCivilDate(
                            selected.date,
                            locale,
                          )}.`}
                        </span>
                      </p>
                    ) : null}
                    {workout.meetingNotes ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                        {workout.meetingNotes}
                      </p>
                    ) : null}
                  </li>
                ))}
                {selected.workoutLogs.map((log) => (
                  <li key={log.id} className="rounded-md bg-muted px-3 py-2">
                    <span className="font-medium">{t("loggedPrefix", { name: log.name })}</span>
                    <span className="ml-2 text-muted-foreground">
                      {t("setsSuffix", { count: log.setCount })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TimelineBlock>

          <TimelineBlock icon={<CheckCircle2 className="size-4" />} title={t("habits")}>
            {selected.habits.length === 0 ? (
              <Empty>{t("noHabitLogs")}</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {selected.habits.map((habit) => (
                  <li
                    key={habit.id}
                    className={[
                      "flex items-center justify-between rounded-md px-3 py-2",
                      habit.future ? "bg-muted/40 text-muted-foreground" : "bg-muted",
                    ].join(" ")}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{habit.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {habit.future
                          ? t("habitStatusFuture")
                          : habit.completed
                            ? t("habitStatusDone")
                            : t("habitStatusPending")}
                      </span>
                    </div>
                    <span className={habit.completed ? "text-emerald-600" : "text-muted-foreground"}>
                      {habit.value}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TimelineBlock>

          <TimelineBlock icon={<Camera className="size-4" />} title={t("progressPhotos")}>
            {selected.photos.length === 0 ? (
              <Empty>{t("noPhotos")}</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {selected.photos.map((photo) => (
                  <li key={photo.id} className="rounded-md bg-muted px-3 py-3">
                    <div className="flex items-start gap-3">
                      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-background">
                        {photo.url ? (
                          <Image
                            src={photo.url}
                            alt={photo.caption || t("progressPhotoAlt")}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                            {t("noPreview")}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium uppercase">{photo.angle ?? t("photoAngleFallback")}</span>
                          <span className="text-xs text-muted-foreground">
                            {photo.checkInDate ??
                              (photo.takenAt || photo.createdAt
                                ? formatClientActivityDate(photo.takenAt ?? photo.createdAt ?? null, timezone)
                                : tCommon("noDate"))}
                          </span>
                        </div>
                        {photo.caption ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{photo.caption}</p>
                        ) : null}
                        <Link
                          href="#progress-photos"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {t("viewSideBySide")}
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TimelineBlock>

          <TimelineBlock icon={<MessageSquare className="size-4" />} title={t("chat")}>
            {selected.messages.length === 0 ? (
              <Empty>{t("noMessages")}</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {selected.messages.map((message) => (
                  <li
                    key={message.id}
                    className={[
                      "max-w-[90%] rounded-2xl px-3 py-2",
                      message.sender === "coach"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto bg-muted text-foreground",
                    ].join(" ")}
                  >
                    <span className="block whitespace-pre-wrap">{message.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </TimelineBlock>

          <TimelineBlock icon={<NotebookText className="size-4" />} title={t("coachNotes")}>
            {selected.notes.length === 0 ? (
              <Empty>{t("noNotes")}</Empty>
            ) : (
              <div className="space-y-2">
                {selected.notes.map((note) => (
                  <div key={note.id} className="rounded-md bg-muted px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {note.createdAt
                        ? formatClientActivityDateTime(note.createdAt, timezone)
                        : tCommon("emDash")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TimelineBlock>

        </div>
      ) : (
        <div className="rounded-md border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          {t("selectDayPrompt")}
        </div>
      )}

      {deleteTarget ? (
        <WorkoutAssignmentDeleteDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          assignmentId={deleteTarget.id}
          scheduledFor={deleteTarget.scheduledFor}
          templateName={deleteTarget.templateName}
          seriesId={deleteTarget.seriesId ?? null}
          onDeleted={(result) => {
            handleDeleteSuccess(deleteTarget.id, result);
            setDeleteTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Render a `"YYYY-MM-DD"` civil-date as "miércoles 28 may" (Spanish
 * weekday + day + abbreviated month) without letting the trainer's
 * browser timezone shift the weekday. UTC-anchored parse keeps the
 * label stable across regions; the trainer reads it as a civil-date
 * label, not a moment in time.
 */
function formatTimelineCivilDate(civilDate: string, locale: string): string {
  return formatCivilDateLabel(
    civilDate,
    {
      weekday: "long",
      day: "numeric",
      month: "short",
    },
    locale,
  );
}

function hasActivity(day: ClientDailyTimelineDay): boolean {
  return (
    day.workouts.length +
      day.workoutLogs.length +
      day.habits.length +
      day.photos.length +
      day.messages.length +
      day.notes.length >
    0
  );
}

function TimelineBlock({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function LoadingBlock({ title }: { title: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 h-4 w-32 rounded bg-muted" aria-hidden="true" />
      <span className="sr-only">{title}</span>
      <div className="h-24 rounded bg-muted/60" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function shortDate(date: string, locale: string): string {
  return formatCivilDateLabel(date, { month: "short", day: "numeric" }, locale);
}
