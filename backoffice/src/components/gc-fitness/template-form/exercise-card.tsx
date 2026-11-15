"use client";

// One exercise of the template form's "details" step (#507 — split out of
// template-form.tsx): drag handle, reorder/remove, the exercise picker, the
// reps↔time chips, "Sin peso", sets / rest, the per-set table, notes,
// transition rest and the superset pills. Reads everything from the form
// controller, so the markup is the one that lived inline.

import { Controller } from "react-hook-form";
import { ArrowUp, ArrowDown, GripVertical, Trash2 } from "lucide-react";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  SET_TYPES,
  plannedSetType,
  setDisplayLabels,
  SET_TYPE_LETTERS,
  SET_TYPE_LABELS_ES,
  SET_TYPE_TEXT_CLASS,
} from "@/lib/gc-fitness/set-type";
import { getSupersetGroupRest, getSupersetMembership, normalizeSupersetGroup } from "@/lib/gc-fitness/superset-groups";
import { ExercisePickerPopover } from "../exercise-picker-popover";
import { parseDecimalInput } from "@/lib/gc-fitness/decimal-input";

import { supersetAccentFor } from "./superset-accents";
import { weightArrayAfterClear } from "./template-form-model";
import { InfoTooltip } from "./info-tooltip";
import type { SortableListeners } from "./sortable-exercise-row";
import type { TemplateFormController } from "./use-template-form-controller";

export function TemplateExerciseCard({
  ctrl,
  field,
  index,
  dragListeners,
}: {
  ctrl: TemplateFormController;
  field: TemplateFormController["fields"][number];
  index: number;
  dragListeners: SortableListeners;
}) {
  const {
    pickerInitialFilters,
    setsDraft,
    setSetsDraft,
    setRepsDraft,
    setSetRepsDraft,
    setWeightDraft,
    setSetWeightDraft,
    setDurationDraft,
    setSetDurationDraft,
    durationSecondsDraft,
    setDurationSecondsDraft,
    restSecondsDraft,
    setRestSecondsDraft,
    transitionRestSecondsDraft,
    setTransitionRestSecondsDraft,
    supersetRoundRestDraft,
    setSupersetRoundRestDraft,
    supersetAfterRestDraft,
    setSupersetAfterRestDraft,
    fields,
    move,
    t,
    form,
    exerciseMetricById,
    watchedExercises,
    supersetPillLabels,
    moveUpLabel,
    moveDownLabel,
    removeLabel,
    requestRemove,
    toFiniteNumberArray,
    syncSetArrays,
    setSetType,
    syncSupersetGroupSets,
    toggleSupersetGroup,
    writeSupersetGroupRoundRest,
    writeSupersetGroupAfterRest,
  } = ctrl;
  // 26-03 — effective-metric cascade per PATTERNS.md §16
  // Shared 1: templateExercise.metric ?? exercise.metric
  // ?? "reps". `form.watch` here makes the card re-render
  // when the trainer flips the chip toggle (or picks a
  // different exercise above).
  const templateMetric = form.watch(
    `exercises.${index}.metric` as const,
  );
  const selectedExerciseId = form.watch(
    `exercises.${index}.exerciseId` as const,
  );
  const sourceMetric = selectedExerciseId
    ? exerciseMetricById.get(selectedExerciseId)
    : undefined;
  const effectiveMetric: "reps" | "time" =
    templateMetric ?? sourceMetric ?? "reps";
  // 260610-j67 (issue #159) — no-weight ("Sin peso") state.
  // An EXPLICIT empty `weightBySetKg: []` array is the
  // reps-only sentinel; nil/array-with-values = legacy kg UI.
  const watchedWeightBySet = form.watch(
    `exercises.${index}.weightBySetKg` as const,
  );
  const isNoWeight =
    Array.isArray(watchedWeightBySet) &&
    watchedWeightBySet.length === 0;
  const supersetMembership = getSupersetMembership(
    watchedExercises,
    index,
  );
  const supersetGroup = supersetMembership.group;
  const isSupersetLeader = supersetMembership.isLeader;
  const isSupersetFollower = supersetMembership.isFollower;
  // D9 — a REAL superset (2+ members). Only then do we hide the
  // per-member rest inputs and surface the single group rest
  // fields (on the leader). A lone labelled exercise keeps its
  // own per-exercise rest fields.
  const isSupersetMember = supersetMembership.isGrouped;
  const supersetAccent = supersetGroup
    ? supersetAccentFor(supersetGroup)
    : null;
  const groupRest = isSupersetMember
    ? getSupersetGroupRest(watchedExercises, supersetGroup)
    : null;
  // True when the trainer hasn't explicitly chosen a
  // per-template override — we show a small "Heredado"
  // hint next to the chips so they know the value is
  // coming from the source exercise.
  const metricInherited = templateMetric === undefined;
  return (
    <Card
      className={cn(
        isSupersetMember && supersetAccent
          ? cn("border-l-4", supersetAccent.card)
          : undefined,
      )}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("dragHandle")}
              className="cursor-grab touch-none active:cursor-grabbing"
              {...dragListeners}
              tabIndex={-1}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-muted-foreground">
              #{index + 1}
            </span>
            {isSupersetMember && supersetGroup && supersetAccent ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                  supersetAccent.badge,
                )}
              >
                {t("supersetBlockLabel", { group: supersetGroup })}
              </span>
            ) : null}
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => move(index, index - 1)}
              disabled={index === 0}
              aria-label={moveUpLabel(index)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => move(index, index + 1)}
              disabled={index === fields.length - 1}
              aria-label={moveDownLabel(index)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => requestRemove(index)}
              aria-label={removeLabel(index)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Exercise picker — Controller because the popover is a
            custom component, not a native input. */}
        <FormField
          control={form.control}
          name={`exercises.${index}.exerciseId` as const}
          render={({ field: pickerField }) => (
            <FormItem>
              <FormLabel>{t("exerciseLabel")}</FormLabel>
              <FormControl>
                <ExercisePickerPopover
                  value={pickerField.value ?? ""}
                  onChange={pickerField.onChange}
                  ariaLabel={t("pickExerciseAria", { index: index + 1 })}
                  initialFilters={pickerInitialFilters}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 26-03 — Per-template metric override chips. Two
            buttons that read/write `exercises.${index}.metric`:
              - "Por reps"   → metric: "reps"
              - "Por tiempo" → metric: "time"
            When neither is explicitly set the form value is
            undefined and the effective metric falls through to
            the source exercise's `metric` (PATTERNS.md §16
            Shared 1). The "Heredado" hint surfaces that the
            current state is inherited (no per-template override).
            i18n migrated in 26-07. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("metricLabel")}
          </span>
          <button
            type="button"
            tabIndex={-1}
            onClick={() =>
              form.setValue(
                `exercises.${index}.metric` as const,
                "reps",
                { shouldDirty: true },
              )
            }
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium",
              effectiveMetric === "reps"
                ? "border-foreground bg-foreground text-background"
                : "border-border/70 bg-background text-foreground hover:border-foreground/30",
            )}
          >
            {t("templateMetricToggleReps")}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() =>
              form.setValue(
                `exercises.${index}.metric` as const,
                "time",
                { shouldDirty: true },
              )
            }
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium",
              effectiveMetric === "time"
                ? "border-foreground bg-foreground text-background"
                : "border-border/70 bg-background text-foreground hover:border-foreground/30",
            )}
          >
            {t("templateMetricToggleTime")}
          </button>
          {metricInherited ? (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("templateMetricToggleInherited")}
            </span>
          ) : null}
          {/* 260610-j67 (issue #159) — "Sin peso" toggle. When
              ON, writes `weightBySetKg: []` (the reps-only
              sentinel) and hides the per-set kg column below.
              Orthogonal to reps/time metric. When OFF, restores
              the legacy kg column (weightBySetKg cleared to a
              length-0 slice = undefined on submit). */}
          <button
            type="button"
            tabIndex={-1}
            aria-pressed={isNoWeight}
            onClick={() => {
              const weightPath =
                `exercises.${index}.weightBySetKg` as const;
              if (isNoWeight) {
                // Turn OFF → clear the sentinel to `undefined`
                // (legacy "no override") so the kg column returns
                // and submit omits the field unless weights are
                // typed. setValue(undefined) drops the array.
                form.setValue(
                  weightPath,
                  undefined as unknown as number[],
                  { shouldDirty: true },
                );
              } else {
                // Turn ON → write the explicit empty-array
                // sentinel (`weightBySetKg: []`) + hide the kg
                // column. This is the reps-only prescription.
                form.setValue(weightPath, [], {
                  shouldDirty: true,
                });
              }
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium",
              isNoWeight
                ? "border-foreground bg-foreground text-background"
                : "border-border/70 bg-background text-foreground hover:border-foreground/30",
            )}
          >
            {t("noWeightToggle")}
          </button>
        </div>

        {/* Sets / Rest. Reps is defined per-set
            below to avoid double source of truth. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Controller
            control={form.control}
            name={`exercises.${index}.sets` as const}
            render={({
              field: numField,
              fieldState,
            }) => (
              <FormItem>
                <FormLabel>{t("sets")}</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    data-field-sets={index}
                    value={setsDraft[field.id] ?? (numField.value ?? "")}
                    onChange={(e) =>
                      {
                        // Buffer ONLY — do not commit to RHF or
                        // resize the per-set arrays per keystroke.
                        // Typing "12" would otherwise transiently
                        // resize the Set rows from 1 → 10 and
                        // thrash focus + scroll. Commit on blur.
                        if (e.target.value === "") {
                          setSetsDraft((prev) => ({ ...prev, [field.id]: "" }));
                          return;
                        }
                        const parsed = Number(e.target.value);
                        if (!Number.isFinite(parsed)) return;
                        setSetsDraft((prev) => ({ ...prev, [field.id]: e.target.value }));
                      }
                    }
                    onBlur={(e) => {
                      const raw = setsDraft[field.id];
                      if (raw === "") {
                        setSetsDraft((prev) => {
                          const next = { ...prev };
                          delete next[field.id];
                          return next;
                        });
                        numField.onBlur();
                        return;
                      }
                      if (raw !== undefined) {
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) {
                          numField.onChange(parsed);
                          if (isSupersetLeader && supersetGroup) {
                            syncSupersetGroupSets(supersetGroup, parsed);
                          } else {
                            syncSetArrays(index, parsed);
                          }
                        }
                      }
                      setSetsDraft((prev) => {
                        const next = { ...prev };
                        delete next[field.id];
                        return next;
                      });
                      numField.onBlur();
                      e.currentTarget.value = String(form.getValues(`exercises.${index}.sets` as const) ?? "");
                    }}
                    disabled={isSupersetFollower}
                    aria-describedby={
                      isSupersetFollower
                        ? `superset-sets-hint-${field.id}`
                        : undefined
                    }
                  />
                </FormControl>
                {fieldState.error && (
                  <FormMessage>
                    {fieldState.error.message}
                  </FormMessage>
                )}
                {isSupersetFollower && supersetGroup ? (
                  <FormDescription id={`superset-sets-hint-${field.id}`}>
                    {t("supersetSetsLockedHint", {
                      group: supersetGroup,
                    })}
                  </FormDescription>
                ) : null}
              </FormItem>
            )}
          />
          {/* D9 — superset members hide the per-exercise rest input;
              the single group rest lives on the leader below. */}
          {isSupersetMember ? null : (
          <Controller
            control={form.control}
            name={`exercises.${index}.rest_seconds` as const}
            render={({
              field: numField,
              fieldState,
            }) => (
              <FormItem>
                <FormLabel>{t("restSeconds")}</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={restSecondsDraft[field.id] ?? (numField.value ?? "")}
                    onChange={(e) => {
                      // Buffer only — RHF commit happens on blur,
                      // matching the Sets + per-set patterns and
                      // keeping form.watch (autosave) silent
                      // until the trainer commits the value.
                      if (e.target.value === "") {
                        setRestSecondsDraft((prev) => ({ ...prev, [field.id]: "" }));
                        return;
                      }
                      const parsed = Number(e.target.value);
                      if (!Number.isFinite(parsed)) return;
                      setRestSecondsDraft((prev) => ({ ...prev, [field.id]: e.target.value }));
                    }}
                    onBlur={() => {
                      const raw = restSecondsDraft[field.id];
                      if (raw === "") {
                        setRestSecondsDraft((prev) => {
                          const next = { ...prev };
                          delete next[field.id];
                          return next;
                        });
                        numField.onChange(undefined);
                        numField.onBlur();
                        return;
                      }
                      if (raw !== undefined) {
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) {
                          numField.onChange(parsed);
                        }
                      }
                      setRestSecondsDraft((prev) => {
                        const next = { ...prev };
                        delete next[field.id];
                        return next;
                      });
                      numField.onBlur();
                    }}
                  />
                </FormControl>
                {fieldState.error && (
                  <FormMessage>
                    {fieldState.error.message}
                  </FormMessage>
                )}
              </FormItem>
            )}
          />
          )}
        </div>

        {/* 26-03 — Exercise-level duration fallback. Visible only
            when the effective metric is "time"; serves as the
            baseline propagated to every set that doesn't have
            an explicit durationBySetSeconds[i] entry. Mirrors
            the structural role of the per-exercise `reps` field
            in reps-based mode (which we hide via this branch).
            Buffered on `durationSecondsDraft` and committed on
            blur, same pattern as Sets / Rest above. */}
        {effectiveMetric === "time" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Controller
              control={form.control}
              name={`exercises.${index}.durationSeconds` as const}
              render={({ field: numField, fieldState }) => (
                <FormItem>
                  <FormLabel>
                    {t("durationSecondsLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder={t("durationSecondsPlaceholder")}
                      value={durationSecondsDraft[field.id] ?? (numField.value ?? "")}
                      onChange={(e) => {
                        if (e.target.value === "") {
                          setDurationSecondsDraft((prev) => ({
                            ...prev,
                            [field.id]: "",
                          }));
                          return;
                        }
                        const parsed = Number(e.target.value);
                        if (!Number.isFinite(parsed)) return;
                        setDurationSecondsDraft((prev) => ({
                          ...prev,
                          [field.id]: e.target.value,
                        }));
                      }}
                      onBlur={() => {
                        const raw = durationSecondsDraft[field.id];
                        if (raw === "") {
                          setDurationSecondsDraft((prev) => {
                            const next = { ...prev };
                            delete next[field.id];
                            return next;
                          });
                          numField.onChange(undefined);
                          numField.onBlur();
                          return;
                        }
                        if (raw !== undefined) {
                          const parsed = Number(raw);
                          if (Number.isFinite(parsed)) {
                            const clamped = Math.max(
                              5,
                              Math.min(1800, Math.round(parsed)),
                            );
                            numField.onChange(clamped);
                          }
                        }
                        setDurationSecondsDraft((prev) => {
                          const next = { ...prev };
                          delete next[field.id];
                          return next;
                        });
                        numField.onBlur();
                      }}
                    />
                  </FormControl>
                  {fieldState.error && (
                    <FormMessage>{fieldState.error.message}</FormMessage>
                  )}
                </FormItem>
              )}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div>
            <FormLabel>{t("setRowsTitle")}</FormLabel>
            <div className="mt-2 flex flex-col gap-2">
              {/* 260610-j67 — when "Sin peso" is on, collapse the
                  weight column out of the header grid entirely so
                  the layout reads as two columns (set + reps). */}
              <div
                className={cn(
                  "grid items-center gap-2 px-1",
                  isNoWeight
                    ? "grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[84px_minmax(140px,1fr)]"
                    : "grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[84px_minmax(140px,1fr)_minmax(140px,1fr)]",
                )}
              >
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("setHeader")}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {effectiveMetric === "time" ? t("secondsHeader") : t("reps")}
                </span>
                {!isNoWeight ? (
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("weightKgShort")}
                  </span>
                ) : null}
              </div>
              {Array.from({
                length: Math.max(
                  1,
                  Math.min(10, Number(form.getValues(`exercises.${index}.sets` as const) ?? 1)),
                ),
              }).map((_, setIdx) => {
                const repsPath = `exercises.${index}.repsBySet` as const;
                const weightPath = `exercises.${index}.weightBySetKg` as const;
                // 26-03 — Parallel duration path for time-based sets.
                const durationPath = `exercises.${index}.durationBySetSeconds` as const;
                const repsArray = toFiniteNumberArray(form.getValues(repsPath));
                const weightArray = toFiniteNumberArray(form.getValues(weightPath));
                const durationArray = toFiniteNumberArray(form.getValues(durationPath));
                const repsFallback = Number(
                  form.getValues(`exercises.${index}.reps` as const) ?? 10,
                );
                // 26-03 — fallback for time-based sets: prefer
                // the exercise-level durationSeconds; if absent,
                // default to 60 (matches plank prescription
                // baseline used elsewhere in the engine).
                const durationFallback = Number(
                  form.getValues(`exercises.${index}.durationSeconds` as const) ?? 60,
                );
                const setKey = `${field.id}-${setIdx}`;
                const repsValue = setRepsDraft[setKey] ?? (repsArray[setIdx] ?? repsFallback);
                const weightValue = weightArray[setIdx];
                const durationValue =
                  setDurationDraft[setKey] ?? (durationArray[setIdx] ?? durationFallback);
                // quick-260714-m57 (#403) — Hevy-style per-set
                // type. Non-normal rows render the colored letter
                // (W/F/D); normal rows render a number counting
                // ONLY normal sets (preceding rows decide it, so
                // slicing to setIdx+1 is sufficient).
                const typesRaw = form.getValues(
                  `exercises.${index}.setTypesBySet` as const,
                );
                const rowType = plannedSetType(setIdx, typesRaw);
                const rowLabel = setDisplayLabels(
                  Array.from({ length: setIdx + 1 }, (_, i) =>
                    plannedSetType(i, typesRaw),
                  ),
                )[setIdx];

                return (
                  <div
                    key={`${field.id}-set-${setIdx + 1}`}
                    data-set-row={setKey}
                    data-set-idx={setIdx}
                    className={cn(
                      "grid items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2",
                      // 260610-j67 — drop the weight column from
                      // the set-row grid when "Sin peso" is on.
                      isNoWeight
                        ? "grid-cols-[52px_minmax(0,1fr)_28px] sm:grid-cols-[84px_minmax(140px,1fr)_28px]"
                        : "grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)_28px] sm:grid-cols-[84px_minmax(140px,1fr)_minmax(140px,1fr)_28px]",
                    )}
                  >
                    {/* quick-260714-m57 (#403) — the set-number
                        cell is the type picker trigger: Normal /
                        Calentamiento (W) / Al fallo (F) / Drop
                        set (D). */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={`Tipo de la serie ${setIdx + 1}: ${SET_TYPE_LABELS_ES[rowType]}`}
                          title="Cambiar tipo de serie"
                          className={cn(
                            "inline-flex h-8 items-center justify-start rounded-md px-1 text-xs hover:bg-muted",
                            rowType === "normal"
                              ? "text-muted-foreground"
                              : cn(
                                  "font-bold",
                                  SET_TYPE_TEXT_CLASS[rowType],
                                ),
                          )}
                        >
                          {rowType === "normal"
                            ? t("setNumber", {
                                count: Number(rowLabel),
                              })
                            : rowLabel}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {SET_TYPES.map((type) => (
                          <DropdownMenuItem
                            key={type}
                            onSelect={() =>
                              setSetType(index, setIdx, type)
                            }
                            className={cn(
                              "gap-2",
                              type === rowType && "bg-muted",
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
                    {/* 26-03 — Per-set primary input. When the
                        effective metric is "time", the field
                        binds to durationBySetSeconds with bounds
                        5..1800; otherwise it binds to repsBySet
                        with the existing 0..50 bounds. Tab order
                        stays row-local: duration/reps → weight
                        → next-row's duration/reps (the
                        `data-set-input` value swaps to "duration"
                        in the time branch; the same
                        `[data-set-input="weight"]` query below
                        advances regardless of metric). */}
                    {effectiveMetric === "time" ? (
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-10"
                        value={durationValue}
                        data-set-input="duration"
                        data-set-key={setKey}
                        placeholder="60"
                        onKeyDown={(e) => {
                          if (e.key === "Tab" && !e.shiftKey) {
                            const next = e.currentTarget
                              .closest("[data-set-row]")
                              ?.querySelector<HTMLInputElement>('[data-set-input="weight"]');
                            if (next) {
                              e.preventDefault();
                              next.focus();
                              next.select();
                            }
                          }
                        }}
                        onChange={(e) => {
                          if (e.target.value.trim() === "") {
                            setSetDurationDraft((prev) => ({ ...prev, [setKey]: "" }));
                            return;
                          }
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next)) return;
                          setSetDurationDraft((prev) => ({ ...prev, [setKey]: e.target.value }));
                        }}
                        onBlur={() => {
                          const raw = setDurationDraft[setKey];
                          if (raw === "") {
                            setSetDurationDraft((prev) => {
                              const next = { ...prev };
                              delete next[setKey];
                              return next;
                            });
                            return;
                          }
                          if (raw !== undefined) {
                            const parsed = Number(raw);
                            if (Number.isFinite(parsed)) {
                              // Clamp to schema bounds (5..1800).
                              const clamped = Math.max(
                                5,
                                Math.min(1800, Math.round(parsed)),
                              );
                              const current = toFiniteNumberArray(
                                form.getValues(durationPath),
                              );
                              const safeLen = Math.max(
                                setIdx + 1,
                                current.length,
                              );
                              const filled = Array.from(
                                { length: safeLen },
                                (_, i) => {
                                  const v = current[i];
                                  return Number.isFinite(v) ? v : durationFallback;
                                },
                              );
                              filled[setIdx] = clamped;
                              form.setValue(durationPath, filled, {
                                shouldDirty: true,
                              });
                              // Mirror the exercise-level
                              // durationSeconds fallback to the
                              // FIRST row (parallels the reps
                              // branch above writing
                              // `exercises.${index}.reps`).
                              if (setIdx === 0) {
                                form.setValue(
                                  `exercises.${index}.durationSeconds` as const,
                                  clamped,
                                  { shouldDirty: true },
                                );
                              }
                            }
                          }
                          setSetDurationDraft((prev) => {
                            const next = { ...prev };
                            delete next[setKey];
                            return next;
                          });
                        }}
                        aria-label={`Duración serie ${setIdx + 1} en segundos`}
                      />
                    ) : (
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-10"
                        value={repsValue}
                        data-set-input="reps"
                        data-set-key={setKey}
                        onKeyDown={(e) => {
                          if (e.key === "Tab" && !e.shiftKey) {
                            const next = e.currentTarget
                              .closest("[data-set-row]")
                              ?.querySelector<HTMLInputElement>('[data-set-input="weight"]');
                            if (next) {
                              e.preventDefault();
                              next.focus();
                              next.select();
                            }
                          }
                        }}
                        onChange={(e) => {
                          if (e.target.value.trim() === "") {
                            setSetRepsDraft((prev) => ({ ...prev, [setKey]: "" }));
                            return;
                          }
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next)) return;
                          setSetRepsDraft((prev) => ({ ...prev, [setKey]: e.target.value }));
                        }}
                        onBlur={() => {
                          const raw = setRepsDraft[setKey];
                          if (raw === "") {
                            setSetRepsDraft((prev) => {
                              const next = { ...prev };
                              delete next[setKey];
                              return next;
                            });
                            return;
                          }
                          if (raw !== undefined) {
                            const next = Number(raw);
                            if (Number.isFinite(next)) {
                              const current = toFiniteNumberArray(form.getValues(repsPath));
                              const safeLen = Math.max(setIdx + 1, current.length);
                              const filled = Array.from({ length: safeLen }, (_, i) => {
                                const v = current[i];
                                return Number.isFinite(v) ? v : repsFallback;
                              });
                              filled[setIdx] = next;
                              form.setValue(repsPath, filled, { shouldDirty: true });
                              if (setIdx === 0) {
                                form.setValue(
                                  `exercises.${index}.reps` as const,
                                  next,
                                  { shouldDirty: true },
                                );
                              }
                            }
                          }
                          setSetRepsDraft((prev) => {
                            const next = { ...prev };
                            delete next[setKey];
                            return next;
                          });
                        }}
                        aria-label={t("setRepsAria", { count: setIdx + 1 })}
                      />
                    )}
                    {/* 260610-j67 — hide the per-set kg Input
                        entirely when "Sin peso" is on. */}
                    {!isNoWeight ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-10"
                      placeholder={t("setWeightPlaceholder")}
                      data-set-input="weight"
                      data-set-key={setKey}
                      onKeyDown={(e) => {
                        if (e.key === "Tab" && !e.shiftKey) {
                          // Same-card next-row reps OR fall
                          // through to the card's Notes textarea
                          // when this is the last set row. We
                          // never let Tab land on the Copy
                          // button or on the row container
                          // itself.
                          const currentRow = e.currentTarget.closest("[data-set-row]");
                          if (!currentRow) return;
                          let sibling = currentRow.nextElementSibling;
                          while (sibling && !sibling.matches("[data-set-row]")) {
                            sibling = sibling.nextElementSibling;
                          }
                          if (sibling) {
                            // 26-03 — Land on whichever primary
                            // input the next row exposes: reps
                            // (reps-based exercises) OR duration
                            // (time-based). The two selectors
                            // are mutually exclusive per row.
                            const nextReps =
                              sibling.querySelector<HTMLInputElement>(
                                '[data-set-input="reps"], [data-set-input="duration"]',
                              );
                            if (nextReps) {
                              e.preventDefault();
                              nextReps.focus();
                              nextReps.select();
                              return;
                            }
                          }
                          // Last row → jump to this exercise's
                          // Notes textarea (data-field-notes is
                          // unique per card).
                          const card = currentRow.closest("li") ??
                            currentRow.closest("[data-exercise-card]")?.parentElement;
                          const notes = card?.querySelector<HTMLTextAreaElement>(
                            "[data-field-notes]",
                          );
                          if (notes) {
                            e.preventDefault();
                            notes.focus();
                          }
                        }
                      }}
                      value={setWeightDraft[setKey] ?? (weightValue?.toString() ?? "")}
                      onChange={(e) => {
                        const nextRaw = e.target.value.trim();
                        if (nextRaw === "") {
                          setSetWeightDraft((prev) => ({ ...prev, [setKey]: "" }));
                          return;
                        }
                        // #451 — "22,5" (es keyboard) and "22.5" both
                        // parse; a keystroke that makes the text
                        // unparseable is dropped, as before.
                        const next = parseDecimalInput(nextRaw);
                        if (!Number.isFinite(next)) return;
                        setSetWeightDraft((prev) => ({ ...prev, [setKey]: e.target.value }));
                      }}
                      onBlur={() => {
                        const raw = setWeightDraft[setKey];
                        const current = toFiniteNumberArray(form.getValues(weightPath));
                        if (raw === "") {
                          // Clearing a per-set weight = "0 kg for
                          // this set", NEVER the no-weight sentinel
                          // (`[]`, reserved for the explicit "Sin
                          // peso" toggle). See weightArrayAfterClear.
                          const zeroed = weightArrayAfterClear(current, setIdx);
                          form.setValue(weightPath, zeroed, { shouldDirty: true });
                          setSetWeightDraft((prev) => {
                            const next = { ...prev };
                            delete next[setKey];
                            return next;
                          });
                          return;
                        }
                        if (raw !== undefined) {
                          const next = parseDecimalInput(raw);
                          if (Number.isFinite(next)) {
                            const safeLen = Math.max(setIdx + 1, current.length);
                            const filled = Array.from({ length: safeLen }, (_, i) => {
                              const v = current[i];
                              return Number.isFinite(v) ? v : 0;
                            });
                            filled[setIdx] = next;
                            form.setValue(weightPath, filled, { shouldDirty: true });
                          }
                        }
                        setSetWeightDraft((prev) => {
                          const next = { ...prev };
                          delete next[setKey];
                          return next;
                        });
                      }}
                      aria-label={t("setWeightAria", { count: setIdx + 1 })}
                    />
                    ) : null}
                    {/* Copy-to-all affordance on Serie 1 — propagates
                        its current primary value (reps OR duration)
                        + kg drafts to every subsequent set, then
                        commits via setValue. 26-03 branches on
                        effectiveMetric so a plank prescription
                        propagates `durationSeconds` instead of
                        `reps`. */}
                    {setIdx === 0 ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={
                          effectiveMetric === "time"
                            ? t("setCopyToAllDurationAria")
                            : (t("setCopyToAllAria") ?? "Copiar a todas las series")
                        }
                        title={
                          effectiveMetric === "time"
                            ? t("setCopyToAllDurationTitle")
                            : (t("setCopyToAllTitle") ?? "Copiar reps y peso a todas las series")
                        }
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                        onClick={() => {
                          const totalSets = Math.max(
                            1,
                            Math.min(
                              10,
                              Number(
                                form.getValues(`exercises.${index}.sets` as const) ?? 1,
                              ),
                            ),
                          );
                          // Source kg = the just-typed draft if
                          // present, else the committed value.
                          const draftKg = setWeightDraft[setKey];
                          const kgFromForm = toFiniteNumberArray(
                            form.getValues(weightPath),
                          );
                          const kgSource =
                            draftKg !== undefined && draftKg !== ""
                              ? parseDecimalInput(draftKg)
                              : Number.isFinite(kgFromForm[0])
                                ? kgFromForm[0]
                                : NaN;

                          if (effectiveMetric === "time") {
                            // 26-03 — Time branch: propagate
                            // durationSeconds (5..1800 clamp) to
                            // every set; kg stays optional for
                            // loaded planks.
                            const draftDuration = setDurationDraft[setKey];
                            const durationsFromForm = toFiniteNumberArray(
                              form.getValues(durationPath),
                            );
                            const durationSourceRaw =
                              draftDuration !== undefined && draftDuration !== ""
                                ? Number(draftDuration)
                                : Number.isFinite(durationsFromForm[0])
                                  ? durationsFromForm[0]
                                  : Number(
                                      form.getValues(
                                        `exercises.${index}.durationSeconds` as const,
                                      ) ?? 60,
                                    );
                            const durationSource = Number.isFinite(durationSourceRaw)
                              ? Math.max(
                                  5,
                                  Math.min(1800, Math.round(durationSourceRaw)),
                                )
                              : 60;
                            const nextDurations = Array.from(
                              { length: totalSets },
                              () => durationSource,
                            );
                            form.setValue(durationPath, nextDurations, {
                              shouldDirty: true,
                            });
                            form.setValue(
                              `exercises.${index}.durationSeconds` as const,
                              durationSource,
                              { shouldDirty: true },
                            );
                          } else {
                            // Reps branch — unchanged behavior.
                            const draftReps = setRepsDraft[setKey];
                            const repsFromForm = toFiniteNumberArray(
                              form.getValues(repsPath),
                            );
                            const repsSource =
                              draftReps !== undefined && draftReps !== ""
                                ? Number(draftReps)
                                : Number.isFinite(repsFromForm[0])
                                  ? repsFromForm[0]
                                  : Number(
                                      form.getValues(
                                        `exercises.${index}.reps` as const,
                                      ) ?? 0,
                                    );
                            const nextReps = Array.from(
                              { length: totalSets },
                              () => (Number.isFinite(repsSource) ? repsSource : 0),
                            );
                            form.setValue(repsPath, nextReps, { shouldDirty: true });
                          }

                          if (Number.isFinite(kgSource)) {
                            const nextKg = Array.from(
                              { length: totalSets },
                              () => kgSource,
                            );
                            form.setValue(weightPath, nextKg, { shouldDirty: true });
                          }
                          // Clear any per-row drafts so the
                          // controlled inputs re-read from form
                          // state immediately.
                          setSetRepsDraft({});
                          setSetWeightDraft({});
                          setSetDurationDraft({});
                        }}
                      >
                        ⇊
                      </button>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
            <FormDescription>{t("setRowsHint")}</FormDescription>
          </div>
          {/* Notes — 260528 reordered before Superset so the Tab
              flow ends "last Kg → Notas → Grupo superserie →
              siguiente ejercicio". */}
          <FormField
            control={form.control}
            name={`exercises.${index}.notes` as const}
            render={({ field: noteField }) => (
              <FormItem>
                <FormLabel>{t("coachingNotes")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    maxLength={500}
                    placeholder={t("coachingNotesPlaceholder")}
                    data-field-notes
                    {...noteField}
                    value={noteField.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* D9 — superset LEADER shows the single group rest editor:
            one "round rest" + one "after-superset rest" field, both
            written through to every member (D1/D2). Members hide
            their per-exercise rest fields entirely. */}
        {isSupersetMember && isSupersetLeader && supersetAccent ? (
          <div
            className={cn(
              "rounded-lg border p-3",
              supersetAccent.card,
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                  supersetAccent.badge,
                )}
              >
                {t("supersetBlockLabel", { group: supersetGroup })}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormItem>
                <FormLabel>{t("supersetRoundRest")}</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={
                      supersetRoundRestDraft[supersetGroup] ??
                      (groupRest?.roundRestSeconds ?? "")
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v !== "" && !Number.isFinite(Number(v))) return;
                      setSupersetRoundRestDraft((prev) => ({
                        ...prev,
                        [supersetGroup]: v,
                      }));
                    }}
                    onBlur={() => {
                      const raw = supersetRoundRestDraft[supersetGroup];
                      if (raw !== undefined) {
                        const parsed = raw === "" ? undefined : Number(raw);
                        if (parsed === undefined || Number.isFinite(parsed)) {
                          writeSupersetGroupRoundRest(supersetGroup, parsed);
                        }
                        setSupersetRoundRestDraft((prev) => {
                          const next = { ...prev };
                          delete next[supersetGroup];
                          return next;
                        });
                      }
                    }}
                  />
                </FormControl>
                <FormDescription>
                  {t("supersetRoundRestHint")}
                </FormDescription>
              </FormItem>
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormLabel>{t("supersetAfterRest")}</FormLabel>
                  <InfoTooltip
                    text={t("transitionRestTooltip")}
                    label={t("transitionRestTooltipLabel")}
                  />
                </div>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={
                      supersetAfterRestDraft[supersetGroup] ??
                      (groupRest?.afterRestSeconds ?? "")
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v !== "" && !Number.isFinite(Number(v))) return;
                      setSupersetAfterRestDraft((prev) => ({
                        ...prev,
                        [supersetGroup]: v,
                      }));
                    }}
                    onBlur={() => {
                      const raw = supersetAfterRestDraft[supersetGroup];
                      if (raw !== undefined) {
                        const parsed = raw === "" ? 60 : Number(raw);
                        if (Number.isFinite(parsed)) {
                          writeSupersetGroupAfterRest(supersetGroup, parsed);
                        }
                        setSupersetAfterRestDraft((prev) => {
                          const next = { ...prev };
                          delete next[supersetGroup];
                          return next;
                        });
                      }
                    }}
                  />
                </FormControl>
                <FormDescription>
                  {t("supersetAfterRestHint")}
                </FormDescription>
              </FormItem>
            </div>
          </div>
        ) : null}

        {/* Transition rest sits below the coach notes — the client
            sees it after finishing this exercise. Standalone (and
            lone-labelled) exercises only; superset members edit rest
            at the group level above. */}
        {isSupersetMember ? null : (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <div className="flex items-center gap-2">
            <FormLabel className="text-warning">
              {t("transitionRestSeconds")}
            </FormLabel>
            <InfoTooltip
              text={t("transitionRestTooltip")}
              label={t("transitionRestTooltipLabel")}
            />
          </div>
          <Controller
            control={form.control}
            name={`exercises.${index}.transition_rest_seconds` as const}
            render={({
              field: numField,
              fieldState,
            }) => (
              <FormItem className="mt-2">
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={transitionRestSecondsDraft[field.id] ?? (numField.value ?? "")}
                    onChange={(e) => {
                      if (e.target.value === "") {
                        setTransitionRestSecondsDraft((prev) => ({ ...prev, [field.id]: "" }));
                        return;
                      }
                      const parsed = Number(e.target.value);
                      if (!Number.isFinite(parsed)) return;
                      setTransitionRestSecondsDraft((prev) => ({ ...prev, [field.id]: e.target.value }));
                    }}
                    onBlur={() => {
                      const raw = transitionRestSecondsDraft[field.id];
                      if (raw === "") {
                        setTransitionRestSecondsDraft((prev) => {
                          const next = { ...prev };
                          delete next[field.id];
                          return next;
                        });
                        numField.onChange(60);
                        numField.onBlur();
                        return;
                      }
                      if (raw !== undefined) {
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) {
                          numField.onChange(parsed);
                        }
                      }
                      setTransitionRestSecondsDraft((prev) => {
                        const next = { ...prev };
                        delete next[field.id];
                        return next;
                      });
                      numField.onBlur();
                    }}
                  />
                </FormControl>
                {fieldState.error && (
                  <FormMessage>
                    {fieldState.error.message}
                  </FormMessage>
                )}
              </FormItem>
            )}
          />
        </div>
        )}

        {/* D9/454 — A/B/C group pills plus the next available
            letter once the visible sequence is in use. Tap a pill
            to assign the exercise to that superset; tap the active
            pill to remove it. Writes through applySupersetGroup
            (set-count locking preserved). */}
        <FormField
          control={form.control}
          name={`exercises.${index}.supersetGroup` as const}
          render={({ field: supersetField }) => {
            const activeGroup = normalizeSupersetGroup(
              supersetField.value,
            );
            return (
              <FormItem>
                <FormLabel>{t("supersetGroup")}</FormLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  {supersetPillLabels.map((group) => {
                    const active = activeGroup === group;
                    const accent = supersetAccentFor(group);
                    return (
                      <button
                        key={group}
                        type="button"
                        data-field-superset
                        data-exercise-card={index}
                        aria-pressed={active}
                        onClick={() => toggleSupersetGroup(index, group)}
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                          active
                            ? accent.pillActive
                            : "border-border/70 bg-background text-foreground hover:border-foreground/40",
                        )}
                      >
                        {group}
                      </button>
                    );
                  })}
                </div>
                <FormDescription>{t("supersetGroupHint")}</FormDescription>
              </FormItem>
            );
          }}
        />
      </CardContent>
    </Card>
  );
}
