import type { MacroTargets } from "@/lib/gc-fitness/nutrition-schema";

/**
 * The four macro tiles, shared by the nutrition screen's "Objetivo vigente" card and the
 * client profile's nutrition section (#949).
 *
 * ── AN ABSENT MACRO RENDERS AS "—", NEVER AS 0 ───────────────────────────────────────
 *
 * A coach who set only calories did not set a zero protein target, and showing one would
 * be the app putting words in their mouth — the whole reason every macro field is nullable
 * in the wire shape.
 */
export function MacroTiles({
  targets,
  labels,
}: {
  targets: MacroTargets;
  labels: {
    kcal: string;
    protein: string;
    carbs: string;
    fat: string;
    /** What an unset macro prints. */
    empty: string;
  };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MacroTile label={labels.kcal} value={targets.kcal} unit="kcal" empty={labels.empty} />
      <MacroTile label={labels.protein} value={targets.proteinG} unit="g" empty={labels.empty} />
      <MacroTile label={labels.carbs} value={targets.carbsG} unit="g" empty={labels.empty} />
      <MacroTile label={labels.fat} value={targets.fatG} unit="g" empty={labels.empty} />
    </div>
  );
}

function MacroTile({
  label,
  value,
  unit,
  empty,
}: {
  label: string;
  value: MacroTargets["kcal"];
  unit: string;
  empty: string;
}) {
  const hasValue = typeof value === "number" && Number.isFinite(value);
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold tabular-nums">
        {hasValue ? (
          <>
            {value}
            <span className="text-muted-foreground ml-1 text-xs font-medium">{unit}</span>
          </>
        ) : (
          empty
        )}
      </div>
    </div>
  );
}
