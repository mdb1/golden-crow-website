"use client";

import { useEffect, useRef, useState } from "react";
import { Download, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { GOLDENCROW_LOGO_DATA_URI } from "@/components/gc-fitness/goldencrow-logo-data";
import { civilDateFormat } from "@/lib/gc-fitness/civil-date";
import type { WorkoutLogDetail } from "@/lib/gc-fitness/recent-logs-actions";
import type { AssignmentDetail } from "@/lib/gc-fitness/schedule-month-actions";

// 260529-mrp / 260529-ltm — cross-surface "share workout image", v2.2.
//
// Mirrors the iOS `ShareCardView` (gc-fitness/.../WorkoutSummaryView.swift,
// now on main) as closely as HTML/CSS allows — SHARE-CARD-SPEC.md v2.2 is the
// canonical contract. On iOS, the assignment/DETAIL screen shares the
// PRESCRIBED card; a COMPLETED workout shares the LOGGED actuals card. The web
// now mirrors BOTH variants:
//   - `ShareWorkoutCard`   — SUCCESS variant (logged actuals, recent-logs).
//   - `ShareAssignmentCard` — PRESCRIBED variant (calendar assignment detail).
//
// Both build ONE normalized internal `ShareCardModel`, which the single
// `ShareCardRenderer` rasterizes. The renderer draws a HIDDEN, off-screen
// 1080px-wide card (DYNAMIC height — no exercise cap; the canvas grows to fit
// the COMPLETE routine), then rasterizes it to a PNG with `html-to-image` on
// click. The logo is an INLINE base64 data-URI constant
// (`GOLDENCROW_LOGO_DATA_URI`, a 256px downscale) so html-to-image never
// network-fetches during rasterization (the v1 download bug) — no runtime
// fetch, no loading gate, always present and decodable.
// `navigator.share(file)` on mobile, download fallback on desktop.
//
// PARITY GAP vs iOS (accepted, see SHARE-CARD-SPEC §7): no BPM pill (neither the
// web WorkoutLogDetail nor the AssignmentDetail carries HealthKit HR samples).
// Everything else — palette, spacing, eyebrow, completion check, stats strip,
// exercise cards, per-set chips, top-set highlight, PR trophy (success only),
// per-exercise 1RM, footer — mirrors the iOS card.

// SHARE-CARD-SPEC §2 palette — hardcoded hex, never inherit page theme.
const BG = "#000000";
const ACCENT = "#D9A441"; // BrandAmber — eyebrow, index badge, divider, footer
// #576 — mismo valor que el `overloadRed` de iOS y el `OVERLOAD_RED` de Android: el rojo del
// tema se apaga sobre el fondo fijo de la tarjeta, y esta imagen no puede cambiar con el tema
// de quien la comparte.
const OVERLOAD_RED = "#FF453A";
const OVERLOAD_RED_BG = "rgba(255, 69, 58, 0.16)";
const STAT_NUMBER = "#F0C04A"; // bright gold — the big stat number
const SURFACE = "#1C1C1E"; // exercise cards + stat pills
const CARD_BORDER = "rgba(255,255,255,0.10)";
const DIVIDER = "rgba(217,164,65,0.22)";
const CHIP_BG = "rgba(217,164,65,0.18)";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "rgba(255,255,255,0.60)";
const LABEL_GRAY = "rgba(255,255,255,0.50)";
const SUCCESS_GREEN = "#34C759"; // iOS system green — completion check

// SHARE-CARD-SPEC §3 — SF-Pro-first stack for tightest iOS parity.
const FONT_STACK =
  '-apple-system, "SF Pro Text", system-ui, "Public Sans", sans-serif';

const CANVAS_WIDTH = 1080;
const CANVAS_MIN_HEIGHT = 1350;

interface Chip {
  /** Pre-formatted chip text ("50 kg × 8" / "45s" / "20"). */
  value: string;
  /** Highest-volume working set → filled-amber capsule with dark text. */
  isTopSet: boolean;
  /** Set earned a PR → "🏆 " prefix (independent of the top-set highlight). */
  isPR: boolean;
}

interface ExerciseRow {
  name: string;
  chips: Chip[];
  /** Pre-formatted best estimated 1RM ("1RM 92 kg"); null = no weighted sets. */
  oneRMLabel: string | null;
  /** Normalized superset label (e.g. "A") when this exercise belongs to a
   *  superset, else null. Consecutive rows sharing a label render inside one
   *  accent-bordered "card-of-cards" container. */
  supersetGroup: string | null;
}

interface ShareStat {
  value: string;
  label: string;
  /** When true, the value must stay on ONE line — the font shrinks to fit so
   *  the stat tile keeps the same size as the others (used for "5810 kg"). */
  fit?: boolean;
}

/**
 * The single normalized model that drives `ShareCardRenderer`. Both public
 * components (`ShareWorkoutCard`, `ShareAssignmentCard`) build one of these so
 * there is exactly ONE renderer + capture path.
 */
export interface ShareCardModel {
  /** Eyebrow text above the title ("RUTINA COMPLETADA" / "RUTINA"). */
  eyebrow: string;
  /** Accessible label for the green completion check, when shown. */
  completionA11y: string;
  /** Show the green ✓ next to the eyebrow (success variant only). */
  showCompletionCheck: boolean;
  /**
   * #576 — texto de la cápsula roja "Sobrecarga" al lado del eyebrow, o null.
   *
   * Gemela de la que dibujan las apps en SU imagen compartida. Va acá y no sólo en la pantalla
   * porque la imagen es lo que el coach manda por WhatsApp: si el modo desaparece al compartir,
   * el log llega sin la única explicación de por qué las reps superan el plan.
   *
   * Siempre null en la variante de asignación PRESCRIPTA — todavía no hay log, así que no hay
   * modo del cual hablar.
   */
  progressiveOverloadLabel: string | null;
  title: string;
  /** Pre-built sub-line ("Coach: X · Y" / "Y"); null = no sub-line. */
  subLine: string | null;
  stats: ShareStat[];
  exercises: ExerciseRow[];
  /** Full-month date line ("29 de Mayo de 2026"); null = no footer date. */
  dateLine: string | null;
  /** Date slug for the downloaded filename in the user's timezone. */
  fileDate: string;
  /** Full filename stem used by the PNG download button. */
  downloadFileName: string;
  /** Title passed to navigator.share (the workout/template name). */
  shareTitle: string;
}

/** Up-to-1-decimal, trailing-zero-trimmed kg string ("50", "72.5"). */
function weightString(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

/**
 * v2.2 per-set chip text — mirrors iOS `ShareCardView.setChipText`:
 *   - time-based (durationSeconds present): "{n}s"
 *   - weighted (weight > 0): "{w} kg × {reps}"
 *   - bodyweight (weight 0, no duration): "{reps}"
 */
function setChipText(
  weight: number | null,
  reps: number | null,
  durationSeconds: number | null,
): string {
  if (durationSeconds !== null) {
    return `${durationSeconds}s`;
  }
  if (weight !== null && weight > 0) {
    return `${weightString(weight)} kg × ${reps ?? 0}`;
  }
  return `${reps ?? 0}`;
}

/**
 * v2.2 best estimated 1RM via Epley = weight × (1 + reps/30), MAX over the
 * non-warmup WEIGHTED sets, rounded to whole kg → "1RM {v} kg". Null when
 * there are no weighted sets (bodyweight / time-only). Mirrors iOS
 * `bestEstimatedOneRM`.
 */
function bestEstimatedOneRM(
  weightedSets: Array<{ weight: number; reps: number }>,
): string | null {
  let best = 0;
  for (const s of weightedSets) {
    const epley = s.weight * (1 + s.reps / 30);
    if (epley > best) best = epley;
  }
  if (best <= 0) return null;
  return `1RM ${Math.round(best)} kg`;
}

/** Compact integer-kg volume number, e.g. "5240 kg". */
function volumeLabel(kg: number): string {
  return `${Math.round(kg)} kg`;
}

/**
 * Font size for a "fit" stat value (e.g. Volumen "5810 kg") so it stays on a
 * single line inside the ~153px-wide stat tile while keeping the tile the same
 * size as its neighbors. Steps down by rendered length; 40px is the baseline
 * used by every non-fit stat.
 */
function fitStatFontSize(value: string): number {
  const len = value.length;
  if (len <= 5) return 40;
  if (len <= 7) return 34;
  if (len <= 9) return 28;
  return 24;
}

interface ShareRenderBlock {
  /** Non-null only for real (2+-member) supersets. */
  groupLabel: string | null;
  rows: Array<{ index: number; row: ExerciseRow }>;
}

/**
 * Group CONSECUTIVE exercises sharing the same superset label (adjacency-aware,
 * mirroring iOS `SupersetBlock.build`). Standalone exercises become single-row
 * blocks. Card index (1…N) is preserved across grouping so badge numbers stay
 * continuous inside superset containers.
 */
function groupShareExercises(exercises: ExerciseRow[]): ShareRenderBlock[] {
  const blocks: ShareRenderBlock[] = [];
  let current: Array<{ index: number; row: ExerciseRow }> = [];
  let currentLabel: string | null = null;
  exercises.forEach((row, i) => {
    const label = row.supersetGroup;
    const indexed = { index: i + 1, row };
    if (label && label === currentLabel && current.length > 0) {
      current.push(indexed);
    } else {
      if (current.length > 0) {
        blocks.push({ groupLabel: currentLabel, rows: current });
      }
      current = [indexed];
      currentLabel = label;
    }
  });
  if (current.length > 0) {
    blocks.push({ groupLabel: currentLabel, rows: current });
  }
  return blocks;
}

/** One exercise card. `showBorder` is false inside a superset container (the
 *  joint accent outline replaces the per-card hairline). */
function ShareExerciseCard({
  index,
  row,
  showBorder = true,
}: {
  index: number;
  row: ExerciseRow;
  showBorder?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        padding: 16,
        borderRadius: 20,
        backgroundColor: SURFACE,
        border: `1px solid ${showBorder ? CARD_BORDER : "transparent"}`,
        boxSizing: "border-box",
      }}
    >
      {/* Amber circular index badge */}
      <div
        style={{
          flexShrink: 0,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: ACCENT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#000000",
          fontSize: 22,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {index}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 0,
          flex: 1,
          // Reserve bottom space so the absolute 1RM never overlaps the last
          // chip row.
          paddingBottom: row.oneRMLabel ? 8 : 0,
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 600, color: TEXT_PRIMARY }}>
          {row.name}
        </div>
        {row.chips.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {row.chips.map((chip, ci) => (
              <span
                key={ci}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontSize: 24,
                  fontWeight: chip.isTopSet ? 600 : 500,
                  fontVariantNumeric: "tabular-nums",
                  backgroundColor: chip.isTopSet ? ACCENT : CHIP_BG,
                  color: chip.isTopSet ? "#000000" : TEXT_PRIMARY,
                }}
              >
                {chip.isPR ? `🏆 ${chip.value}` : chip.value}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {/* Per-exercise best estimated 1RM — gray, bottom-right. */}
      {row.oneRMLabel ? (
        <span
          style={{
            position: "absolute",
            right: 20,
            bottom: 14,
            fontSize: 24,
            fontWeight: 500,
            color: TEXT_SECONDARY,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.oneRMLabel}
        </span>
      ) : null}
    </div>
  );
}

/** Accent-bordered "card-of-cards" wrapping the exercises of one superset —
 *  mirrors the iOS share card + the in-app SupersetBlockView. */
function SupersetGroupBlock({
  label,
  rows,
}: {
  label: string;
  rows: Array<{ index: number; row: ExerciseRow }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        borderRadius: 24,
        backgroundColor: "rgba(217,164,65,0.06)",
        border: "2px solid rgba(217,164,65,0.45)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingLeft: 4,
        }}
      >
        <span style={{ fontSize: 24 }}>🔗</span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: ACCENT,
          }}
        >
          {`Superserie ${label}`}
        </span>
      </div>
      {rows.map(({ index, row }) => (
        <ShareExerciseCard
          key={index}
          index={index}
          row={row}
          showBorder={false}
        />
      ))}
    </div>
  );
}

/** "M:SS" or "H:MM:SS" — mirrors the iOS duration format. */
function formatDurationSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Client-side calorie estimate that MATCHES the iOS `estimatedCalories`
 * EXACTLY: kcal = 6.0 MET × 70 kg × hours, rounded. Returns 0 when no
 * duration (the pill is then omitted).
 */
function estimatedCalories(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  const hours = durationSeconds / 3600;
  const met = 6.0; // ACSM resistance-training MET value (same as iOS)
  const bodyKg = 70.0; // default assumption (same as iOS)
  return Math.round(met * bodyKg * hours);
}

/** completedAt − startedAt in seconds; 0 when either is missing/invalid. */
function workoutDurationSeconds(detail: WorkoutLogDetail): number {
  if (!detail.startedAt || !detail.completedAt) return 0;
  const start = new Date(detail.startedAt).getTime();
  const end = new Date(detail.completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.round((end - start) / 1000);
}

/**
 * Sub-line "Coach: {coach} · {client}" with the v2.2 dedup rule: when coach
 * and client are the same person (trimmed, case-insensitive) show only
 * "Coach: {coach}". Graceful degrade: client-only when no coach; never a UID.
 */
function buildSubLine(
  coachName: string | null | undefined,
  clientName: string | null | undefined,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const coach = coachName?.trim();
  const client = clientName?.trim();
  if (coach && client) {
    const prefix = t("shareCoachPrefix", { name: coach });
    return coach.toLocaleLowerCase() === client.toLocaleLowerCase()
      ? prefix
      : `${prefix} · ${client}`;
  }
  if (coach) return t("shareCoachPrefix", { name: coach });
  if (client) return client;
  return null;
}

function buildDownloadStem(
  clientName: string | null | undefined,
  dateValue: string | null | undefined,
  timezone: string,
): string {
  const clientSlug = slugifyFilePart(clientName ?? "", "alumno");
  const dateSlug = formatDownloadDateSlug(dateValue, timezone);
  return `workout-${clientSlug}-${dateSlug}`;
}

function formatDownloadDateSlug(
  dateValue: string | null | undefined,
  timezone: string,
): string {
  if (!dateValue) return "workout";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "workout";
  return civilDateFormat(date, timezone);
}

function slugifyFilePart(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

// ---------------------------------------------------------------------------
// SUCCESS model builder — logged actuals (recent-logs surface)
// ---------------------------------------------------------------------------

/**
 * Build the SUCCESS card model from the logged sets — mirrors the iOS
 * `shareCard` computed property. Warmups are excluded from Volumen / Series /
 * top-set / 1RM (the v2.2 parity fix); the distinct-exercise count drives
 * "Ejercicios".
 */
function buildSuccessModel(
  detail: WorkoutLogDetail,
  t: ReturnType<typeof useTranslations>,
): ShareCardModel {
  const order: string[] = [];
  const byExercise = new Map<
    string,
    { name: string; sets: WorkoutLogDetail["sets"] }
  >();
  for (const set of detail.sets) {
    const key = set.exerciseId || set.exerciseName;
    let bucket = byExercise.get(key);
    if (!bucket) {
      bucket = { name: set.exerciseName, sets: [] };
      byExercise.set(key, bucket);
      order.push(key);
    }
    bucket.sets.push(set);
  }

  const exercises: ExerciseRow[] = order.map((key) => {
    const bucket = byExercise.get(key)!;
    // #565 — every set type is listed on the card (the W/F/D marker still
    // distinguishes them visually) and counts in the totals.
    const working = bucket.sets.slice().sort((a, b) => a.index - b.index);

    // Highest-volume set = max(weight × reps); only weighted sets.
    let topVolume = 0;
    let topIdx = -1;
    working.forEach((s, i) => {
      if (s.metric !== "time" && s.weight !== null && s.weight > 0) {
        const vol = s.weight * (s.reps ?? 0);
        if (vol > topVolume) {
          topVolume = vol;
          topIdx = i;
        }
      }
    });

    const chips: Chip[] = working.map((s, i) => ({
      value: setChipText(s.weight, s.reps, s.durationSeconds),
      isTopSet: i === topIdx,
      isPR: s.isPR,
    }));

    const oneRMLabel = bestEstimatedOneRM(
      working
        .filter((s) => s.metric !== "time" && s.weight !== null && s.weight > 0)
        .map((s) => ({ weight: s.weight as number, reps: s.reps ?? 0 })),
    );

    const supersetGroup = bucket.sets[0]?.supersetGroup ?? null;
    return { name: bucket.name, chips, oneRMLabel, supersetGroup };
  });

  // Volumen total = Σ(weight × reps) over EVERY set (#565).
  const totalVolume = detail.sets
    .filter((s) => s.metric !== "time")
    .reduce((acc, s) => acc + (s.weight ?? 0) * (s.reps ?? 0), 0);
  const seriesCount = detail.sets.length;
  const exerciseCount = detail.exerciseCount || order.length;

  const stats: ShareStat[] = [
    { value: volumeLabel(totalVolume), label: t("shareStatVolume"), fit: true },
    { value: `${seriesCount}`, label: t("shareStatSeries") },
    { value: `${exerciseCount}`, label: t("shareStatExercises") },
  ];

  // Duración — prefer the STORED duration_seconds (authoritative, iOS parity),
  // falling back to completedAt − startedAt only when the stored value is
  // null/0. The completedAt − startedAt math is unreliable (clock skew, paused
  // sessions), so it is the last resort, not the primary source.
  const durationSeconds =
    detail.durationSeconds && detail.durationSeconds > 0
      ? detail.durationSeconds
      : workoutDurationSeconds(detail);
  if (durationSeconds > 0) {
    stats.push({
      value: formatDurationSeconds(durationSeconds),
      label: t("shareStatDuration"),
    });
  }

  // Calorías — same METs estimate as iOS; omit when 0.
  const kcal = estimatedCalories(durationSeconds);
  if (kcal > 0) {
    stats.push({ value: `${kcal}`, label: t("shareStatCalories") });
  }

  // NO BPM pill on web — accepted parity gap (no HealthKit HR samples).

  const dateLine = formatFullMonthDate(
    detail.completedAt ?? detail.startedAt,
    detail.clientTimezone,
  );
  const fileDate = formatDownloadDateSlug(
    detail.completedAt ?? detail.startedAt,
    detail.clientTimezone,
  );
  const downloadFileName = buildDownloadStem(
    detail.clientName,
    detail.completedAt ?? detail.startedAt,
    detail.clientTimezone,
  );

  return {
    eyebrow: t("shareEyebrow"),
    completionA11y: t("shareCompletedA11y"),
    showCompletionCheck: true,
    progressiveOverloadLabel: detail.progressiveOverload
      ? t("shareProgressiveOverload")
      : null,
    title: detail.workoutName,
    subLine: buildSubLine(detail.coachName, detail.clientName, t),
    stats,
    exercises,
    dateLine,
    fileDate,
    downloadFileName,
    shareTitle: detail.workoutName,
  };
}

// ---------------------------------------------------------------------------
// PRESCRIBED model builder — assignment detail (calendar surface)
// ---------------------------------------------------------------------------

/**
 * Build the PRESCRIBED card model from an `AssignmentDetail`. Mirrors the iOS
 * assignment-detail share: eyebrow "RUTINA" (no completion check), per-set
 * chips from the PRESCRIPTION (not logged actuals), heaviest-prescribed-set
 * highlight only when weights differ, per-exercise Epley 1RM from prescribed
 * weighted sets, and stats = Ejercicios · Series (Σ prescribed sets) ·
 * Volumen objetivo (Σ weight×reps, omitted when no weights). NO PRs, NO
 * Calorías/Duración/BPM. Date = scheduledFor.
 */
function buildAssignmentModel(
  assignment: AssignmentDetail,
  t: ReturnType<typeof useTranslations>,
): ShareCardModel {
  let totalPrescribedSets = 0;
  let totalTargetVolume = 0;
  let anyWeightPresent = false;

  const exercises: ExerciseRow[] = assignment.exercises.map((ex) => {
    const setCount =
      Number.isFinite(ex.sets) && ex.sets > 0 ? Math.floor(ex.sets) : 0;
    totalPrescribedSets += setCount;

    // Per-set normalized rows from the prescription. reps_i = repsBySet[i] ?? reps.
    const perSet = Array.from({ length: setCount }, (_, i) => {
      const isTimeExercise = ex.metric === "time";
      const weight =
        !isTimeExercise && i < ex.weightBySetKg.length && ex.weightBySetKg[i] > 0
          ? ex.weightBySetKg[i]
          : null;
      const reps =
        isTimeExercise ? null : i < ex.repsBySet.length ? ex.repsBySet[i] : ex.reps;
      const durationSeconds =
        isTimeExercise
          ? i < ex.durationBySetSeconds.length
            ? ex.durationBySetSeconds[i]
            : ex.durationSeconds
          : null;
      return { weight, reps, durationSeconds };
    });

    // Heaviest prescribed weighted set — highlight ONLY when weights differ.
    const weightsPresent = perSet
      .map((s) => s.weight)
      .filter((w): w is number => w !== null && w > 0);
    if (weightsPresent.length > 0) anyWeightPresent = true;
    const distinctWeights = new Set(weightsPresent);
    const shouldHighlight = distinctWeights.size > 1;
    let topIdx = -1;
    if (shouldHighlight) {
      let topWeight = -Infinity;
      perSet.forEach((s, i) => {
        if (s.weight !== null && s.weight > topWeight) {
          topWeight = s.weight;
          topIdx = i;
        }
      });
    }

    const chips: Chip[] = perSet.map((s, i) => ({
      value: setChipText(s.weight, s.reps ?? null, s.durationSeconds),
      isTopSet: i === topIdx,
      isPR: false, // PRESCRIBED card never shows PRs.
    }));

    // Target volume contribution (only weighted sets count).
    for (const s of perSet) {
      if (s.weight !== null && s.weight > 0) {
        totalTargetVolume += s.weight * (s.reps ?? 0);
      }
    }

    const oneRMLabel = bestEstimatedOneRM(
      perSet
        .filter((s) => s.weight !== null && s.weight > 0)
        .map((s) => ({ weight: s.weight as number, reps: s.reps ?? 0 })),
    );

    const supersetGroup =
      typeof ex.supersetGroup === "string" && ex.supersetGroup.trim().length > 0
        ? ex.supersetGroup.trim()
        : null;
    return { name: ex.exerciseName, chips, oneRMLabel, supersetGroup };
  });

  const stats: ShareStat[] = [
    { value: `${assignment.exercises.length}`, label: t("shareStatExercises") },
    { value: `${totalPrescribedSets}`, label: t("shareStatSeries") },
  ];
  // Volumen objetivo — only when ANY exercise prescribes a weight.
  if (anyWeightPresent) {
    stats.push({
      value: volumeLabel(totalTargetVolume),
      label: t("shareStatTargetVolume"),
      fit: true,
    });
  }

  // scheduledFor is a "YYYY-MM-DD" civil date — render UTC-anchored so the
  // labelled day is stable across server/client zones (mirrors the calendar).
  const dateLine = formatCivilFullMonthDate(assignment.scheduledFor);
  const fileDate = formatDownloadDateSlug(assignment.scheduledFor, "UTC");
  const downloadFileName = buildDownloadStem(
    assignment.clientName,
    assignment.scheduledFor,
    "UTC",
  );

  return {
    eyebrow: t("shareEyebrowPrescribed"),
    // Prescripción, no log: no hay modo del cual hablar todavía.
    progressiveOverloadLabel: null,
    completionA11y: t("shareCompletedA11y"),
    showCompletionCheck: false,
    title: assignment.templateName,
    subLine: buildSubLine(assignment.coachName, assignment.clientName, t),
    stats,
    exercises,
    dateLine,
    fileDate,
    downloadFileName,
    shareTitle: assignment.templateName,
  };
}

// ---------------------------------------------------------------------------
// Public components
// ---------------------------------------------------------------------------

/** SUCCESS variant — logged actuals (recent-logs surface). */
export function ShareWorkoutCard({ detail }: { detail: WorkoutLogDetail }) {
  const t = useTranslations("recentLogs.workoutDetail");
  return <ShareCardRenderer model={buildSuccessModel(detail, t)} t={t} />;
}

/** PRESCRIBED variant — assignment detail (calendar surface). */
export function ShareAssignmentCard({
  assignment,
}: {
  assignment: AssignmentDetail;
}) {
  const t = useTranslations("recentLogs.workoutDetail");
  return <ShareCardRenderer model={buildAssignmentModel(assignment, t)} t={t} />;
}

// ---------------------------------------------------------------------------
// Renderer — ONE hidden 1080-wide node + capture path for both variants
// ---------------------------------------------------------------------------

function ShareCardRenderer({
  model,
  t,
}: {
  model: ShareCardModel;
  t: ReturnType<typeof useTranslations>;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // One-time off-screen warm-up render improves font reliability on the first
  // real capture (fonts/glyphs get measured + cached before the user clicks).
  const warmedUp = useRef(false);

  // One-time silent warm-up render once the node is mounted.
  useEffect(() => {
    if (warmedUp.current) return;
    const node = cardRef.current;
    if (!node) return;
    warmedUp.current = true;
    (async () => {
      try {
        const { toPng } = await import("html-to-image");
        // Ensure the inline data-URI logo is fully decoded before capture —
        // html-to-image otherwise snapshots a not-yet-decoded <img> (the v2.2
        // broken-logo regression; v1 awaited decode() before toPng).
        const logoImg = node.querySelector("img");
        if (logoImg) {
          try {
            await logoImg.decode();
          } catch {
            /* decode unsupported / already decoded — proceed */
          }
        }
        await toPng(node, { pixelRatio: 1, width: CANVAS_WIDTH });
      } catch {
        // Warm-up is best-effort; ignore failures (the real click retries).
      }
    })();
  }, []);

  async function handleShare() {
    const node = cardRef.current;
    if (!node || busy) return;
    setBusy(true);
    setError(false);
    try {
      const { toPng } = await import("html-to-image");
      // Ensure the inline data-URI logo is fully decoded before capture —
      // html-to-image otherwise snapshots a not-yet-decoded <img> (the v2.2
      // broken-logo regression; v1 awaited decode() before toPng).
      const logoImg = node.querySelector("img");
      if (logoImg) {
        try {
          await logoImg.decode();
        } catch {
          /* decode unsupported / already decoded — proceed */
        }
      }
      // Measure the laid-out node so tall routines aren't clipped — height is
      // the node's scrollHeight (dynamic), width fixed at 1080.
      const height = Math.max(CANVAS_MIN_HEIGHT, Math.ceil(node.scrollHeight));
      const dataUrl = await toPng(node, {
        pixelRatio: 1,
        width: CANVAS_WIDTH,
        height,
      });

      // Always DOWNLOAD the PNG to disk. The backoffice is a desktop surface and
      // macOS browsers report navigator.canShare({files}) === true, which would
      // open a share sheet instead of saving the file — so the share-sheet
      // branch is intentionally removed.
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${model.downloadFileName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={handleShare}
        disabled={busy}
        variant="outline"
        size="sm"
        className="gap-1 whitespace-nowrap"
      >
        {busy ? (
          <Download className="h-4 w-4 animate-pulse" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {busy ? t("shareLoading") : t("shareDownloadButton")}
      </Button>
      {error ? (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {t("shareError")}
        </p>
      ) : null}

      {/* Hidden off-screen card — laid out (NOT display:none) so html-to-image
          can rasterize it. SHARE-CARD-SPEC.md v2.2. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          pointerEvents: "none",
        }}
      >
        <div
          ref={cardRef}
          style={{
            width: CANVAS_WIDTH,
            minHeight: CANVAS_MIN_HEIGHT,
            // Layer (bottom→top): black base, vertical gradient lift, amber
            // radial glow behind the header. All fill the dynamic height.
            backgroundColor: BG,
            backgroundImage: [
              `radial-gradient(640px 640px at 50% 22%, rgba(217,164,65,0.18), transparent 70%)`,
              `linear-gradient(to bottom, rgba(255,255,255,0.04), ${BG})`,
            ].join(", "),
            color: TEXT_PRIMARY,
            fontFamily: FONT_STACK,
            padding: "56px 64px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {/* Header band */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 28 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={GOLDENCROW_LOGO_DATA_URI}
              alt=""
              width={150}
              height={150}
              style={{
                width: 150,
                height: 150,
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minWidth: 0,
              }}
            >
              {/* Eyebrow + green completion check (success only) */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: 4,
                    textTransform: "uppercase",
                    color: ACCENT,
                  }}
                >
                  {model.eyebrow}
                </span>
                {/* Green check (success) — drawn inline so it rasterizes. */}
                {model.showCompletionCheck ? (
                  <span
                    role="img"
                    aria-label={model.completionA11y}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: SUCCESS_GREEN,
                      color: "#FFFFFF",
                      fontSize: 20,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                ) : null}
                {/*
                  #576 — la cápsula del modo, gemela de la de iOS/Android en su share card.

                  ⚠️ Rojo HEX literal y estilos inline, como el resto de esta tarjeta: la imagen
                  se rasteriza con `html-to-image` y no puede depender del tema de quien la
                  comparte ni de clases de Tailwind. Y la escalera lleva `width`/`height` como
                  ATRIBUTOS: un `<svg>` dimensionado sólo por CSS puede rasterizar a tamaño cero
                  dentro del `foreignObject` que arma html-to-image, y saldría una cápsula con la
                  palabra y sin glifo.
                */}
                {model.progressiveOverloadLabel ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 14px",
                      borderRadius: 999,
                      backgroundColor: OVERLOAD_RED_BG,
                      color: OVERLOAD_RED,
                      fontSize: 20,
                      fontWeight: 700,
                      letterSpacing: 1,
                      lineHeight: 1.4,
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width={18}
                      height={18}
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M3 21 L3 15 L9 15 L9 9 L15 9 L15 3 L21 3 L21 21 Z" />
                    </svg>
                    {model.progressiveOverloadLabel}
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 600,
                  lineHeight: 1.1,
                  color: TEXT_PRIMARY,
                }}
              >
                {model.title}
              </div>
              {model.subLine ? (
                <div style={{ fontSize: 26, color: TEXT_SECONDARY }}>
                  {model.subLine}
                </div>
              ) : null}
            </div>
          </div>

          {/* Stats strip — wraps to 2 rows if needed */}
          {model.stats.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                marginTop: 36,
              }}
            >
              {model.stats.map((stat, i) => (
                <div
                  key={i}
                  style={{
                    flex: "1 1 160px",
                    minWidth: 160,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "20px 12px",
                    borderRadius: 20,
                    backgroundColor: SURFACE,
                    border: `1px solid ${CARD_BORDER}`,
                    boxSizing: "border-box",
                  }}
                >
                  <span
                    style={{
                      // `fit` stats (Volumen "5810 kg") MUST stay on one line so
                      // every tile keeps the same height — shrink the font to
                      // fit instead of wrapping. Non-fit stats keep 40px.
                      fontSize: stat.fit ? fitStatFontSize(stat.value) : 40,
                      fontWeight: 600,
                      color: STAT_NUMBER,
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.1,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {stat.value}
                  </span>
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 500,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: LABEL_GRAY,
                      textAlign: "center",
                    }}
                  >
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Amber hairline divider */}
          <div
            style={{ height: 1, backgroundColor: DIVIDER, margin: "36px 0" }}
          />

          {/* Body — exercise cards (complete routine, no cap) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              flex: 1,
            }}
          >
            {groupShareExercises(model.exercises).map((block, bi) =>
              block.groupLabel && block.rows.length > 1 ? (
                <SupersetGroupBlock
                  key={`ss-${bi}`}
                  label={block.groupLabel}
                  rows={block.rows}
                />
              ) : (
                block.rows.map(({ index, row }) => (
                  <ShareExerciseCard key={index} index={index} row={row} />
                ))
              ),
            )}
          </div>

          {/* Footer band */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 36,
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 2,
                color: ACCENT,
              }}
            >
              GC FITNESS
            </div>
            {model.dateLine ? (
              <div style={{ fontSize: 22, color: TEXT_SECONDARY }}>
                {model.dateLine}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * es-locale "{d} de {Month} de {yyyy}" with the month's first letter
 * capitalized — mirrors the iOS `fullMonthDateLine` (e.g. "29 de Mayo de
 * 2026"). Rendered in the client timezone.
 */
function formatFullMonthDate(
  iso: string | null,
  timeZone: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("es", { day: "numeric", timeZone });
  const year = date.toLocaleDateString("es", { year: "numeric", timeZone });
  let month = date.toLocaleDateString("es", { month: "long", timeZone });
  month = month.charAt(0).toLocaleUpperCase("es") + month.slice(1);
  return `${day} de ${month} de ${year}`;
}

/**
 * Full-month es-locale date for a "YYYY-MM-DD" civil date — UTC-anchored so
 * the labelled day matches the calendar's day regardless of server/client tz
 * (the assignment scheduledFor is a civil date, not an instant).
 */
function formatCivilFullMonthDate(civilDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(civilDate)) return null;
  const [y, m, d] = civilDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("es", { day: "numeric", timeZone: "UTC" });
  const year = date.toLocaleDateString("es", {
    year: "numeric",
    timeZone: "UTC",
  });
  let month = date.toLocaleDateString("es", {
    month: "long",
    timeZone: "UTC",
  });
  month = month.charAt(0).toLocaleUpperCase("es") + month.slice(1);
  return `${day} de ${month} de ${year}`;
}
