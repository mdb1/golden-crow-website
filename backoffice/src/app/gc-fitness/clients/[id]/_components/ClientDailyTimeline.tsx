"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  Dumbbell,
  MessageSquare,
  NotebookText,
  Plus,
} from "lucide-react";

import {
  getClientDailyTimelineDay,
  type ClientDailyTimelineDay,
} from "@/lib/gc-fitness/client-daily-timeline-actions";

export function ClientDailyTimeline({
  clientId,
  availableDates,
  initialDay,
}: {
  clientId: string;
  availableDates: string[];
  initialDay: ClientDailyTimelineDay;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const initialDate =
    availableDates.find((day) => day === today) ?? availableDates[0] ?? initialDay.date;

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [daysByDate, setDaysByDate] = useState<Record<string, ClientDailyTimelineDay>>(
    () => ({ [initialDay.date]: initialDay }),
  );
  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function loadDay(day: string) {
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
      setError(err instanceof Error ? err.message : "Could not load this day.");
    } finally {
      setLoadingDate((current) => (current === day ? null : current));
    }
  }

  return (
    <section className="rounded-md border bg-card p-4 lg:col-span-2">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <CalendarDays className="size-4" />
            Daily client view
          </h2>
          <p className="text-sm text-muted-foreground">
            Loads the selected day on demand to keep Firestore reads low.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {loadedCounts.loaded} days loaded
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
              type="button"
              onClick={() => void loadDay(day)}
              className={[
                "min-w-28 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted",
              ].join(" ")}
            >
              <span className="block font-medium">{shortDate(day)}</span>
              <span
                className={
                  isSelected ? "text-primary-foreground/75" : "text-muted-foreground"
                }
              >
                {loadingDate === day
                  ? "Loading..."
                  : !isLoaded
                    ? "Tap to load"
                    : hasData
                      ? "Activity"
                      : "No data"}
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
          <LoadingBlock title="Workouts" />
          <LoadingBlock title="Habits" />
          <LoadingBlock title="Progress photos" />
          <LoadingBlock title="Chat" />
          <LoadingBlock title="Coach notes" />
          <LoadingBlock title="Reminders" />
        </div>
      ) : selected ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TimelineBlock
            icon={<Dumbbell className="size-4" />}
            title="Workouts"
            action={
              <Link
                href={`/gc-fitness/schedule?clientId=${clientId}&date=${selected.date}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3" />
                {selected.workouts.length > 0 ? "Add after last workout" : "Assign workout"}
              </Link>
            }
          >
            {selected.workouts.length === 0 && selected.workoutLogs.length === 0 ? (
              <Empty>Rest or no workout assigned.</Empty>
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
                    </div>
                    {workout.meetingNotes ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                        {workout.meetingNotes}
                      </p>
                    ) : null}
                  </li>
                ))}
                {selected.workoutLogs.map((log) => (
                  <li key={log.id} className="rounded-md bg-muted px-3 py-2">
                    <span className="font-medium">Logged: {log.name}</span>
                    <span className="ml-2 text-muted-foreground">{log.setCount} sets</span>
                  </li>
                ))}
              </ul>
            )}
          </TimelineBlock>

          <TimelineBlock icon={<CheckCircle2 className="size-4" />} title="Habits">
            {selected.habits.length === 0 ? (
              <Empty>No habit logs for this day.</Empty>
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
                        {habit.future ? "future" : habit.completed ? "done" : "pending"}
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

          <TimelineBlock icon={<Camera className="size-4" />} title="Progress photos">
            {selected.photos.length === 0 ? (
              <Empty>No photos uploaded.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {selected.photos.map((photo) => (
                  <li key={photo.id} className="rounded-md bg-muted px-3 py-3">
                    <div className="flex items-start gap-3">
                      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-background">
                        {photo.url ? (
                          <Image
                            src={photo.url}
                            alt={photo.caption || "Progress photo"}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                            No preview
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium uppercase">{photo.angle ?? "photo"}</span>
                          <span className="text-xs text-muted-foreground">
                            {photo.checkInDate ??
                              (photo.takenAt || photo.createdAt
                                ? new Date(photo.takenAt ?? photo.createdAt ?? "").toLocaleDateString()
                                : "No date")}
                          </span>
                        </div>
                        {photo.caption ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{photo.caption}</p>
                        ) : null}
                        <Link
                          href="#progress-photos"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View side-by-side
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TimelineBlock>

          <TimelineBlock icon={<MessageSquare className="size-4" />} title="Chat">
            {selected.messages.length === 0 ? (
              <Empty>No messages that day.</Empty>
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
                    <span className="block text-[10px] uppercase opacity-70">
                      {message.sender === "coach" ? "Coach" : "Client"}
                    </span>
                    <span className="block whitespace-pre-wrap">{message.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </TimelineBlock>

          <TimelineBlock icon={<NotebookText className="size-4" />} title="Coach notes">
            {selected.notes.length === 0 ? (
              <Empty>No notes saved for this day.</Empty>
            ) : (
              <div className="space-y-2">
                {selected.notes.map((note) => (
                  <div key={note.id} className="rounded-md bg-muted px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {note.createdAt ? new Date(note.createdAt).toLocaleString() : "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TimelineBlock>

          <TimelineBlock icon={<Clock3 className="size-4" />} title="Reminders">
            {selected.reminders.length === 0 ? (
              <Empty>No reminders due this day.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {selected.reminders.map((reminder) => (
                  <li
                    key={reminder.id}
                    className={[
                      "flex items-center justify-between rounded-md px-3 py-2",
                      reminder.future ? "bg-muted/40 text-muted-foreground" : "bg-muted",
                    ].join(" ")}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{reminder.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {reminder.cadence ?? "daily"}
                        {reminder.time ? ` • ${reminder.time}` : ""}
                      </span>
                    </div>
                    <span className={reminder.completed ? "text-emerald-600" : "text-muted-foreground"}>
                      {reminder.future ? "visual only" : reminder.completed ? "done" : "pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TimelineBlock>
        </div>
      ) : (
        <div className="rounded-md border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          Select a day to load its details.
        </div>
      )}
    </section>
  );
}

function hasActivity(day: ClientDailyTimelineDay): boolean {
  return (
    day.workouts.length +
      day.workoutLogs.length +
      day.habits.length +
      day.photos.length +
      day.messages.length +
      day.notes.length +
      day.reminders.length >
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

function shortDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
