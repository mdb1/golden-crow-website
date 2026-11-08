import { Pencil } from "lucide-react";
import { normalizePublisherAppColor, publisherAppCounterpointPlan, type PublisherAppColors } from "@/lib/publisher-app-config";
import { cn } from "@/lib/utils";

const MAIN_SWATCHES = [
  { key: "primary", label: "Color principal" },
  { key: "secondary", label: "Color secundario" },
  { key: "tertiary", label: "Color terciario" },
] as const;

const COUNTERPOINT_SWATCHES = [
  { key: "counterpointClockwise", label: "Horario", fullLabel: "Color de contrapunto horario" },
  { key: "counterpointAnticlockwise", label: "Antihorario", fullLabel: "Color de contrapunto antihorario" },
  { key: "counterpointFarClockwise", label: "Lejano horario", fullLabel: "Color de contrapunto lejano horario" },
  { key: "counterpointFarAnticlockwise", label: "Lejano antihorario", fullLabel: "Color de contrapunto lejano antihorario" },
] as const;

function PaletteBall({
  label,
  fullLabel = label,
  value,
  main = false,
  hueShift,
  onEdit,
}: {
  label: string;
  fullLabel?: string;
  value: string;
  main?: boolean;
  hueShift?: number;
  onEdit?: () => void;
}) {
  const content = (
    <>
      <span className={cn(
        "relative mx-auto block aspect-square w-full shrink-0",
        main ? "max-w-[88px] sm:max-w-[136px]" : "max-w-9 sm:max-w-[52px]",
      )}>
        {main ? (
          <span aria-hidden="true" className="pointer-events-none absolute -inset-2 rounded-full border border-dashed border-violet-300/65 transition-transform duration-500 group-hover:rotate-45 group-focus-visible:rotate-45 motion-reduce:transform-none dark:border-violet-400/30" />
        ) : null}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full border-background shadow-[0_12px_24px_-14px_rgba(15,23,42,0.65)] ring-1 ring-black/8 transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105 group-focus-visible:-translate-y-1 group-active:scale-95 motion-reduce:transform-none dark:ring-white/10",
            main ? "border-[5px] sm:border-[7px]" : "border-[3px]",
          )}
          style={{ backgroundColor: value }}
        />
      </span>
      <span className={cn("mt-4 flex min-w-0 items-center justify-center gap-1.5", main ? "text-[11px] font-semibold sm:text-sm" : "text-[9px] font-medium sm:text-[11px]")}>
        <span>{label}</span>
        {onEdit ? <Pencil aria-hidden="true" className={cn("shrink-0 text-violet-600 transition-transform duration-300 group-hover:-rotate-12 motion-reduce:transform-none dark:text-violet-300", main ? "size-3.5" : "size-3")} /> : null}
      </span>
      <span className={cn("mt-1 block font-mono text-muted-foreground", main ? "text-[10px] sm:text-xs" : "text-[9px] sm:text-[10px]")}>{value}</span>
      {hueShift === undefined ? null : <span className="mt-1 block text-[9px] font-medium text-muted-foreground sm:text-[10px]">{hueShift < 0 ? "−" : "+"}{Math.abs(hueShift)}°</span>}
    </>
  );
  const className = cn(
    "group flex min-w-0 w-full flex-col items-center rounded-2xl px-1 text-center",
    main ? "py-4 sm:py-5" : "py-2",
    onEdit && "cursor-pointer outline-none transition-colors hover:bg-violet-50/60 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:hover:bg-violet-500/8",
  );

  return onEdit ? (
    <button type="button" className={className} aria-label={`Editar ${fullLabel.toLowerCase()}`} aria-description={`Color actual: ${value}`} onClick={onEdit}>
      {content}
    </button>
  ) : <div className={className}>{content}</div>;
}

export function PublisherAppPaletteComposition({
  colors,
  onEditColor,
}: {
  colors: PublisherAppColors;
  onEditColor?: (key: keyof PublisherAppColors) => void;
}) {
  const automatic = publisherAppCounterpointPlan(colors.primary);
  return (
    <div className="overflow-hidden rounded-[24px] border border-border/70 bg-background">
      <section aria-label="Paleta principal" className="bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.06),transparent_70%)] px-3 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-5">
        <h4 className="px-1 text-sm font-semibold text-foreground">Paleta principal</h4>
        <ul className="mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-4">
          {MAIN_SWATCHES.map((swatch) => (
            <li key={swatch.key} className="min-w-0">
              <PaletteBall main label={swatch.label} value={colors[swatch.key]} onEdit={onEditColor ? () => onEditColor(swatch.key) : undefined} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Contrapuntos de contraste" className="border-t border-border/70 bg-muted/20 px-3 py-4 sm:px-6 sm:py-5">
        <h4 className="px-1 text-xs font-semibold text-muted-foreground">Contrapuntos de contraste</h4>
        <ul className="mt-3 grid grid-cols-4 gap-1 sm:mt-4 sm:gap-3">
          {COUNTERPOINT_SWATCHES.map((swatch) => (
            <li key={swatch.key} className="min-w-0">
              <PaletteBall label={swatch.label} fullLabel={swatch.fullLabel} value={colors[swatch.key]} hueShift={normalizePublisherAppColor(colors[swatch.key]) === automatic.colors[swatch.key] ? automatic.offsets[swatch.key] : undefined} onEdit={onEditColor ? () => onEditColor(swatch.key) : undefined} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
