// ScanCoverage — #541: what the hygiene scan actually looked at. The scan reads at most
// `scanLimit` docs per collection; when it hits that cap the rest of the collection was
// NOT checked, and a clean result there means «not checked», not «no problems».

import { useTranslations } from "next-intl";

import type { DataHygieneCoverage } from "@/lib/gc-fitness/data-hygiene-actions";

export function ScanCoverage({ coverage, scanLimit }: { coverage: DataHygieneCoverage[]; scanLimit: number }) {
  const t = useTranslations("admin.hygiene.coverage");
  if (coverage.length === 0) return null;
  const capped = coverage.filter((c) => c.capped);
  return (
    <div
      className={
        capped.length > 0
          ? "rounded-2xl border border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] px-4 py-3 text-sm"
          : "rounded-2xl border px-4 py-3 text-sm text-muted-foreground"
      }
      data-testid="hygiene-coverage"
    >
      <p className="font-medium" data-testid="hygiene-coverage-headline">
        {capped.length > 0 ? t("capped", { count: capped.length, limit: scanLimit }) : t("complete")}
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {coverage.map((c) => (
          <li key={c.collection} data-testid={`hygiene-coverage-${c.collection}`}>
            <span className="font-mono">{c.collection}</span>: {c.scanned}
            {c.capped ? ` · ${t("cut")}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
