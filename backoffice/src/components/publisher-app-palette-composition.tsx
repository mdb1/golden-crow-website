import type { PublisherAppColors } from "@/lib/publisher-app-config";
import { cn } from "@/lib/utils";

const MAIN_SWATCHES = [
  { key: "primary", label: "Color principal", position: "z-30 flex-[1.15] -rotate-2" },
  { key: "secondary", label: "Color secundario", position: "z-20 mt-4 flex-1 rotate-2 sm:mt-6" },
  { key: "tertiary", label: "Color terciario", position: "z-10 mt-8 flex-1 -rotate-1 sm:mt-12" },
] as const;

const COUNTERPOINT_SWATCHES = [
  { key: "counterpointClockwise", label: "Horario" },
  { key: "counterpointAnticlockwise", label: "Antihorario" },
  { key: "counterpointFarClockwise", label: "Lejano horario" },
  { key: "counterpointFarAnticlockwise", label: "Lejano antihorario" },
] as const;

export function PublisherAppPaletteComposition({ colors }: { colors: PublisherAppColors }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-border/70 bg-background">
      <section aria-label="Paleta principal" className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.07),transparent_60%)] px-4 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-7">
        <h4 className="relative text-sm font-semibold text-foreground">Paleta principal</h4>
        <div aria-hidden="true" className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full border border-violet-200/30 dark:border-violet-300/8" />
        <div aria-hidden="true" className="pointer-events-none absolute top-5 -right-10 size-48 rounded-full border border-violet-200/30 dark:border-violet-300/8" />
        <dl className="relative mt-6 flex items-start gap-2 pb-2 sm:mt-7 sm:gap-4">
          {MAIN_SWATCHES.map((swatch, index) => (
            <div
              key={swatch.key}
              className={cn(
                "min-w-0 rounded-[14px] border border-black/5 bg-white p-1.5 shadow-[0_16px_30px_-18px_rgba(15,23,42,0.45)] sm:rounded-[18px] sm:p-2 dark:border-white/10 dark:bg-slate-900 dark:shadow-[0_18px_32px_-16px_rgba(0,0,0,0.65)]",
                swatch.position,
              )}
            >
              <dt>
              <div
                aria-hidden="true"
                className="relative h-28 overflow-hidden rounded-[9px] ring-1 ring-black/5 sm:h-44 sm:rounded-xl"
                style={{ backgroundColor: colors[swatch.key] }}
              >
                <span className="absolute top-2 left-2 font-mono text-[9px] font-medium text-black/65 sm:top-3 sm:left-3 sm:text-[10px]">
                  <span className="rounded-full bg-white/85 px-2 py-1">0{index + 1}</span>
                </span>
                <span className="absolute right-3 bottom-3 left-3 border-t border-white/35" />
              </div>
              <span className="block min-h-8 px-1 pt-3 text-[10px] leading-4 font-semibold text-slate-900 sm:min-h-0 sm:px-2 sm:text-xs dark:text-slate-100">{swatch.label}</span>
              </dt>
              <dd className="mt-1 px-1 pb-2 font-mono text-[10px] text-slate-500 sm:mt-2 sm:px-2 sm:pb-3 sm:text-xs dark:text-slate-400">{colors[swatch.key]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Contrapuntos de contraste" className="border-t border-border/70 bg-muted/20 px-4 py-4 sm:px-6 sm:py-5">
        <h4 className="text-xs font-semibold text-muted-foreground">Contrapuntos de contraste</h4>
        <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-4 sm:gap-x-3">
          {COUNTERPOINT_SWATCHES.map((swatch) => (
            <div key={swatch.key} className="flex min-w-0 basis-[calc(50%-0.5rem)] items-center gap-2.5 sm:basis-0 sm:flex-1">
              <span
                aria-hidden="true"
                className="size-9 shrink-0 rounded-full border-[3px] border-background shadow-sm ring-1 ring-black/8 sm:size-10"
                style={{ backgroundColor: colors[swatch.key] }}
              />
              <div className="min-w-0">
                <dt className="text-[10px] leading-4 font-medium text-foreground">{swatch.label}</dt>
                <dd className="mt-0.5 font-mono text-[10px] text-muted-foreground">{colors[swatch.key]}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
