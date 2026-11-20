"use client";

// One exercise of the assign modal's per-exercise override editor (#507 —
// split out of assign-template-modal.tsx). Renders the superset group rest
// editor (on a block's first member), the "Sin peso" + reps↔time toggles, the
// per-set table and the notes / transition rest. Every write goes through the
// pure updaters in `lib/gc-fitness/assign-template-overrides.ts`.

import type { Dispatch, SetStateAction } from "react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExercisePreviewThumb } from "@/components/gc-fitness/exercise-preview-thumb";
import { cn } from "@/lib/utils";
import {
  SET_TYPES,
  SET_TYPE_LABELS_ES,
  SET_TYPE_LETTERS,
  SET_TYPE_TEXT_CLASS,
  setDisplayLabels,
} from "@/lib/gc-fitness/set-type";
import { parseDecimalInput } from "@/lib/gc-fitness/decimal-input";
import {
  ASSIGN_MAX_SET_ROWS,
  copyFirstSetToAllRows,
  restMinutesHint,
  withAppendedSetRow,
  withExerciseMetric,
  withoutSetRow,
  withRowField,
  withRowType,
  type AssignOverrideDraft,
  type AssignOverrideDrafts,
  type AssignTemplateDetailExercise,
} from "@/lib/gc-fitness/assign-template-overrides";

export function AssignExerciseOverrideCard({
  exercise,
  idx,
  exercises,
  draft,
  overrideDrafts,
  setOverrideDrafts,
}: {
  exercise: AssignTemplateDetailExercise;
  /** Position in `exercises` (for the superset neighbours). */
  idx: number;
  exercises: AssignTemplateDetailExercise[];
  draft: AssignOverrideDraft;
  overrideDrafts: AssignOverrideDrafts;
  setOverrideDrafts: Dispatch<SetStateAction<AssignOverrideDrafts>>;
}) {
  const t = useTranslations("schedule.assignModal");
  // Apply a pure updater to THIS exercise's draft. An updater returning
  // `undefined` means "nothing to change" (e.g. removing the last set).
  const update = (
    fn: (cur: AssignOverrideDraft) => AssignOverrideDraft | undefined,
  ) =>
    setOverrideDrafts((prev) => {
      const cur = prev[exercise.index];
      if (!cur) return prev;
      const next = fn(cur);
      return next ? { ...prev, [exercise.index]: next } : prev;
    });
  // 26-03 — effective metric cascade per PATTERNS.md §17.
  // Drives the SEGUNDOS↔REPS header swap + per-row input
  // field bind below. The trainer's per-assignment toggle
  // (draft.metric) wins over the template's metric.
  const effectiveMetric: "reps" | "time" =
    draft.metric ?? exercise.metric ?? exercise.sourceMetric ?? "reps";
  const group = exercise.supersetGroup ?? null;
  const prevGroup =
    idx > 0
      ? exercises[idx - 1].supersetGroup ?? null
      : null;
  const nextGroup =
    idx < exercises.length - 1
      ? exercises[idx + 1].supersetGroup ?? null
      : null;
  const isSupersetStart = group !== null && group !== prevGroup;
  const isInSuperset =
    group !== null && (group === prevGroup || group === nextGroup);
  // D10 — group-level rest for superset members. Round rest + after
  // rest are single fields shown once on the block start and written
  // through to EVERY member's draft (D1/D2). The displayed value is
  // the block's LAST member (canonical group rest).
  const supersetMemberIdxs = isInSuperset
    ? exercises
        .filter((e) => (e.supersetGroup ?? null) === group)
        .map((e) => e.index)
    : [];
  const lastMemberIdx =
    supersetMemberIdxs[supersetMemberIdxs.length - 1];
  const groupRoundRestValue =
    lastMemberIdx !== undefined
      ? overrideDrafts[lastMemberIdx]?.rest_seconds ?? ""
      : "";
  const groupAfterRestValue =
    lastMemberIdx !== undefined
      ? overrideDrafts[lastMemberIdx]?.transition_rest_seconds ?? ""
      : "";
  const writeGroupRest = (
    fieldKey: "rest_seconds" | "transition_rest_seconds",
    value: string,
  ) =>
    setOverrideDrafts((prev) => {
      const next = { ...prev };
      for (const mi of supersetMemberIdxs) {
        next[mi] = { ...next[mi], [fieldKey]: value };
      }
      return next;
    });
  return (
    <div
      className={
        isInSuperset
          ? "rounded-md border border-warning/40 bg-warning-soft p-3"
          : "rounded-md border border-border/60 bg-background/60 p-3"
      }
    >
      {isSupersetStart ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-warning">
          {t("supersetLabel", { group })}
        </p>
      ) : null}
      {/* D10 — single group rest editor per superset block (round
          rest + after-superset rest), write-through to all members. */}
      {isSupersetStart ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] font-medium text-warning">
            <span className="block truncate">
              {t("supersetGroupRoundRest")}
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={groupRoundRestValue}
              onChange={(event) =>
                writeGroupRest("rest_seconds", event.target.value)
              }
              className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            />
            <span className="mt-0.5 block h-3 text-[10px] font-normal text-muted-foreground">
              {restMinutesHint(groupRoundRestValue)}
            </span>
          </label>
          <label className="text-[11px] font-medium text-warning">
            <span className="block truncate">
              {t("supersetGroupAfterRest")}
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={groupAfterRestValue}
              onChange={(event) =>
                writeGroupRest(
                  "transition_rest_seconds",
                  event.target.value,
                )
              }
              className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            />
            <span className="mt-0.5 block h-3 text-[10px] font-normal text-muted-foreground">
              {restMinutesHint(groupAfterRestValue)}
            </span>
          </label>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <ExercisePreviewThumb
            src={exercise.previewUrl}
            alt={exercise.exerciseName}
            width={32}
            height={32}
          />
          <p className="min-w-0 break-words text-sm font-medium">{exercise.exerciseName}</p>
          {group ? (
            <span className="inline-flex h-5 items-center rounded-full bg-warning/20 px-2 text-[10px] font-semibold uppercase tracking-wide text-warning">
              {group}
            </span>
          ) : null}
          {/* 260610-j67 (issue #159) — "Sin peso" toggle. ON →
              override writes weightBySetKg: [] + hides the kg
              column for this exercise on the assignment. */}
          <button
            type="button"
            tabIndex={-1}
            aria-pressed={draft.noWeight}
            onClick={() =>
              update((cur) => ({ ...cur, noWeight: !cur.noWeight }))
            }
            className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium ${
              draft.noWeight
                ? "border-foreground bg-foreground text-background"
                : "border-border/70 bg-background text-foreground hover:border-foreground/30"
            }`}
          >
            {t("exerciseOverridesNoWeight")}
          </button>
          {/* Reps↔time toggle — lets the trainer switch this
              exercise to time-based (seconds/holds, e.g. for
              stretches) at assignment time, regardless of the
              template's metric. */}
          <div className="inline-flex shrink-0 items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              aria-pressed={effectiveMetric === "reps"}
              onClick={() =>
                update((cur) =>
                  withExerciseMetric(cur, "reps", exercise.durationSeconds ?? 60),
                )
              }
              className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-medium ${
                effectiveMetric === "reps"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-background text-foreground hover:border-foreground/30"
              }`}
            >
              {t("exerciseOverridesMetricReps")}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-pressed={effectiveMetric === "time"}
              onClick={() =>
                update((cur) =>
                  withExerciseMetric(cur, "time", exercise.durationSeconds ?? 60),
                )
              }
              className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-medium ${
                effectiveMetric === "time"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-background text-foreground hover:border-foreground/30"
              }`}
            >
              {t("exerciseOverridesMetricTime")}
            </button>
          </div>
        </div>
        {/* D10 — superset members edit rest at the group level
            (above); hide the per-member rest field. */}
        {isInSuperset ? null : (
        <div className="min-w-0 sm:w-[16rem]">
          <label className="min-w-0 text-[11px] font-medium text-muted-foreground">
            <span className="block truncate">{t("exerciseOverridesRest")}</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft.rest_seconds}
              onChange={(event) => {
                const value = event.target.value;
                update((cur) => ({ ...cur, rest_seconds: value }));
              }}
              className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            />
            <span className="mt-0.5 block h-3 text-[10px] font-normal text-muted-foreground">
              {restMinutesHint(draft.rest_seconds)}
            </span>
          </label>
        </div>
        )}
      </div>
      {/* Per-set table — one row per prescribed set. Mirrors the
          authoring form so the trainer assigns by editing the
          exact (reps × kg) prescription set-by-set rather than
          typing a comma-joined string. */}
      <div className="mt-2 flex flex-col gap-1.5">
        {/* 260610-j67 — when "Sin peso" is on, drop the kg column
            from both the header and per-set grids. */}
        <div
          className={
            draft.noWeight
              ? "grid grid-cols-[24px_minmax(52px,1fr)_40px] items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid-cols-[28px_minmax(80px,1fr)_max-content]"
              : "grid grid-cols-[24px_minmax(52px,1fr)_minmax(52px,1fr)_40px] items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid-cols-[28px_minmax(80px,1fr)_minmax(80px,1fr)_max-content]"
          }
        >
          <span>{t("exerciseOverridesSetHeader")}</span>
          <span>
            {effectiveMetric === "time"
              ? t("exerciseOverridesSeconds")
              : t("exerciseOverridesReps")}
          </span>
          {!draft.noWeight ? (
            <span>{t("exerciseOverridesWeightHeader")}</span>
          ) : null}
          <span aria-hidden="true" />
        </div>
        {draft.setRows.map((row, setIdx) => (
          <div
            key={`${exercise.exerciseId}-set-${setIdx + 1}`}
            className={
              draft.noWeight
                ? "grid grid-cols-[24px_minmax(52px,1fr)_40px] items-center gap-2 sm:grid-cols-[28px_minmax(80px,1fr)_max-content]"
                : "grid grid-cols-[24px_minmax(52px,1fr)_minmax(52px,1fr)_40px] items-center gap-2 sm:grid-cols-[28px_minmax(80px,1fr)_minmax(80px,1fr)_max-content]"
            }
          >
            {/* #582 — the `#` cell is the per-set type picker, same
                control the assignment EDIT dialog and the template
                form use. Hevy label: a colored letter for
                warm-up/fallo/drop, otherwise a number counting ONLY
                normal sets. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Tipo de la serie ${setIdx + 1}: ${SET_TYPE_LABELS_ES[row.type]}`}
                  title="Cambiar tipo de serie"
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-muted",
                    row.type === "normal"
                      ? "text-muted-foreground"
                      : cn("font-bold", SET_TYPE_TEXT_CLASS[row.type]),
                  )}
                >
                  {
                    setDisplayLabels(
                      draft.setRows.map((r) => r.type),
                    )[setIdx]
                  }
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {SET_TYPES.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onSelect={() =>
                      update((cur) => withRowType(cur, setIdx, type))
                    }
                    className={cn(
                      "gap-2",
                      type === row.type && "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 text-center font-semibold",
                        SET_TYPE_TEXT_CLASS[type],
                      )}
                    >
                      {SET_TYPE_LETTERS[type] ?? "#"}
                    </span>
                    {SET_TYPE_LABELS_ES[type]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* 26-03 — Primary input branches on effectiveMetric.
                Time exercises bind to row.duration (5..1800
                placeholder 60); reps stays as today. */}
            {effectiveMetric === "time" ? (
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={row.duration ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  update((cur) => withRowField(cur, setIdx, "duration", value));
                }}
                placeholder="60"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                aria-label={`Duración serie ${setIdx + 1} en segundos`}
              />
            ) : (
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={row.reps}
                onChange={(event) => {
                  const value = event.target.value;
                  update((cur) => withRowField(cur, setIdx, "reps", value));
                }}
                placeholder={t("exerciseOverridesRepsPlaceholder")}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              />
            )}
            {/* 260610-j67 — hide the kg input when "Sin peso". */}
            {!draft.noWeight ? (
              <input
                type="text"
                inputMode="decimal"
                value={row.kg}
                onChange={(event) => {
                  const value = event.target.value;
                  // #451 — accept "62,5" and "62.5"; drop a
                  // keystroke that makes the cell unparseable so
                  // garbage can't reach the payload as 0 kg.
                  if (
                    value.trim() !== "" &&
                    !Number.isFinite(parseDecimalInput(value))
                  ) {
                    return;
                  }
                  update((cur) => withRowField(cur, setIdx, "kg", value));
                }}
                placeholder={t("exerciseOverridesKgPlaceholder")}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              />
            ) : null}
            <div className="flex items-center justify-end gap-1">
              {setIdx === 0 ? (
                <button
                  type="button"
                  onClick={() => update((cur) => copyFirstSetToAllRows(cur, effectiveMetric))}
                  disabled={draft.setRows.length <= 1}
                  tabIndex={-1}
                  className="inline-flex h-7 w-9 items-center justify-center rounded-md border border-border/70 bg-background px-2 text-xs font-medium text-foreground hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:justify-start"
                  title={t("exerciseOverridesCopyToAll")}
                >
                  <Copy className="h-3.5 w-3.5 sm:hidden" />
                  <span className="hidden sm:inline">
                    {t("exerciseOverridesCopyToAll")}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => update((cur) => withoutSetRow(cur, setIdx))}
                disabled={draft.setRows.length <= 1}
                tabIndex={-1}
                aria-label={t("exerciseOverridesRemoveSet", { index: setIdx + 1 })}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update((cur) => withAppendedSetRow(cur, effectiveMetric))
          }
          disabled={draft.setRows.length >= ASSIGN_MAX_SET_ROWS}
          tabIndex={-1}
          className="mt-1 inline-flex h-7 items-center gap-1 self-start rounded-md border border-border/70 bg-background px-2 text-xs font-medium text-foreground hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + {t("exerciseOverridesAddSet")}
        </button>
      </div>
      <textarea
        value={draft.notes}
        onChange={(event) => {
          const value = event.target.value;
          update((cur) => ({ ...cur, notes: value }));
        }}
        placeholder={t("exerciseOverridesNotesPlaceholder")}
        className="mt-2 min-h-16 w-full rounded-md border bg-background px-2 py-2 text-sm"
      />
      {/* Transition rest sits below the coach notes — the client
          sees it after finishing this exercise. Superset members
          edit the after-superset rest at the group level (D10). */}
      {isInSuperset ? null : (
      <label className="mt-3 block rounded-md border border-warning/50 bg-warning-soft p-3 text-[11px] font-medium text-warning shadow-sm">
        <span className="block">{t("exerciseOverridesTransitionRest")}</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft.transition_rest_seconds}
          onChange={(event) => {
            const value = event.target.value;
            update((cur) => ({ ...cur, transition_rest_seconds: value }));
          }}
          className="mt-1 h-9 w-full rounded-md border border-warning/70 bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
        />
        <span className="mt-1 block text-[10px] font-normal text-warning/80">
          {restMinutesHint(draft.transition_rest_seconds)}
        </span>
      </label>
      )}
    </div>
  );
}
