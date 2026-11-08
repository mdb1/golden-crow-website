"use client";

import { useState } from "react";
import { Check, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublisherAppSingleColorDialog } from "@/components/publisher-app-color-picker";
import { normalizePublisherAppColor, publisherAppCounterpointColors, type PublisherAppColors } from "@/lib/publisher-app-config";
import { cn } from "@/lib/utils";

type BaseKey = "primary" | "secondary" | "tertiary";
type CounterpointKey = Exclude<keyof PublisherAppColors, BaseKey>;
export type VisualIdentityColorField =
  | { key: BaseKey; label: string; description: string; editable: true }
  | { key: CounterpointKey; label: string; description: string; editable: false; hueShift: string };

const COUNTERPOINT_KEYS: CounterpointKey[] = [
  "counterpointClockwise", "counterpointAnticlockwise", "counterpointFarClockwise", "counterpointFarAnticlockwise",
];
const STAGES = ["Identidad general", "Colores principales", "Contrapuntos"] as const;

export function PublisherAppVisualIdentityEditor({
  id, colors, fields, suggestedPalettes, disabled, onApply, onApplied, stage, onStageChange, initialColor,
}: {
  id: string;
  colors: PublisherAppColors;
  fields: VisualIdentityColorField[];
  suggestedPalettes: Array<{ name: string; description: string; colors: PublisherAppColors }>;
  disabled: boolean;
  onApply: (colors: PublisherAppColors, paletteName: string) => Promise<boolean>;
  onApplied: () => void;
  stage: 0 | 1 | 2;
  onStageChange: (stage: 0 | 1 | 2) => void;
  initialColor?: keyof PublisherAppColors | null;
}) {
  const [draft, setDraft] = useState<PublisherAppColors>(() => ({ ...colors }));
  const [paletteName, setPaletteName] = useState("Paleta personalizada");
  const [editingColor, setEditingColor] = useState<keyof PublisherAppColors | null>(initialColor ?? null);
  const [customKeys, setCustomKeys] = useState(() => {
    const automatic = publisherAppCounterpointColors(colors.primary);
    return new Set(COUNTERPOINT_KEYS.filter((key) => normalizePublisherAppColor(colors[key]) !== automatic[key]));
  });
  const automatic = publisherAppCounterpointColors(draft.primary);
  const activeField = fields.find((field) => field.key === editingColor);

  function changeColor(field: VisualIdentityColorField, value: string) {
    setPaletteName("Paleta personalizada");
    if (!field.editable) setCustomKeys((current) => new Set(current).add(field.key));
    setDraft((current) => {
      const next = { ...current, [field.key]: value };
      if (field.key === "primary") {
        const defaults = publisherAppCounterpointColors(value);
        for (const key of COUNTERPOINT_KEYS) if (!customKeys.has(key)) next[key] = defaults[key];
      }
      return next;
    });
    setEditingColor(null);
  }

  function colorCell(field: VisualIdentityColorField) {
    const main = field.editable;
    const custom = !main && customKeys.has(field.key);
    const label = main ? field.label.replace("Color ", "") : field.label.replace("Color de contrapunto ", "");
    return (
      <div key={field.key} className="flex min-w-0 flex-col items-center">
        <button type="button" disabled={disabled} aria-label={`Editar ${field.label.toLowerCase()}`} onClick={() => setEditingColor(field.key)} className="group flex w-full flex-col items-center rounded-2xl px-1 py-3 outline-none transition hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transform-none">
          <span className={cn("relative flex aspect-square items-center justify-center rounded-full border border-dashed border-violet-200 transition duration-300 group-hover:rotate-6 group-hover:border-violet-400 group-focus-visible:border-violet-500 dark:border-violet-400/30 motion-reduce:transform-none", main ? "w-24 max-w-full sm:w-36" : "w-12 max-w-full sm:w-[68px]")}>
            <span aria-hidden="true" className={cn("rounded-full border-4 border-background shadow-[0_12px_24px_-12px_rgba(15,23,42,0.5)] ring-1 ring-black/8 transition duration-300 group-hover:scale-105", main ? "size-[82%]" : "size-[80%]")} style={{ backgroundColor: draft[field.key] }} />
          </span>
          <span className={cn("mt-3 block w-full text-center font-semibold capitalize", main ? "text-xs sm:text-sm" : "text-[10px] leading-4 sm:text-xs")}>{label}</span>
          <span className="mt-1 flex items-center justify-center gap-1 text-muted-foreground">
            <code className={main ? "text-[10px] sm:text-xs" : "text-[9px] sm:text-[10px]"}>{draft[field.key]}</code>
            <Pencil className={main ? "size-3.5" : "size-3"} />
          </span>
        </button>
        {!main ? <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
          <span className={cn("rounded-full px-1.5 py-1 text-[8px] font-semibold sm:text-[10px]", custom ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100" : "bg-muted text-muted-foreground")}>{custom ? "Personalizado" : "Automático"}</span>
          {custom ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`Restaurar automático: ${field.label.toLowerCase()}`} title="Restaurar automático" disabled={disabled} onClick={() => {
            setCustomKeys((current) => { const next = new Set(current); next.delete(field.key); return next; });
            setDraft((current) => ({ ...current, [field.key]: automatic[field.key] }));
            setPaletteName("Paleta personalizada");
          }}><RotateCcw className="size-3" /></Button> : null}
        </div> : null}
      </div>
    );
  }

  return (
    <form id={id} aria-label="Editor de identidad visual" onSubmit={async (event) => {
      event.preventDefault();
      if (stage !== 2 || disabled) return;
      if (await onApply(draft, paletteName)) onApplied();
    }}>
      <nav aria-label="Etapas de identidad visual" className="mb-6 flex gap-2">
        {STAGES.map((label, index) => <button key={label} type="button" disabled={disabled} aria-label={`Paso ${index + 1} ${label}`} aria-current={stage === index ? "step" : undefined} onClick={() => onStageChange(index as 0 | 1 | 2)} className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-3 text-center text-[10px] font-semibold transition sm:flex-row sm:gap-2 sm:px-3 sm:text-left sm:text-xs", stage === index ? "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100" : "bg-muted/40 text-muted-foreground hover:bg-muted")}>
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px]", stage === index ? "border-violet-600 bg-violet-600 text-white" : "border-border")}>{index < stage ? <Check className="size-3" /> : index + 1}</span>
          <span>{label}</span>
        </button>)}
      </nav>
      <fieldset disabled={disabled} key={stage} className="min-w-0 animate-in fade-in slide-in-from-right-2 duration-200 disabled:opacity-60 motion-reduce:animate-none">
        {stage === 0 ? <section aria-label="Identidad general">
          <h3 className="font-heading text-lg font-semibold">Elegí tu identidad</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {suggestedPalettes.map((palette) => {
              const selected = (["primary", "secondary", "tertiary"] as const).every((key) => normalizePublisherAppColor(draft[key]) === palette.colors[key]);
              return <button key={palette.name} type="button" aria-pressed={selected} onClick={() => {
                setDraft({ ...palette.colors }); setCustomKeys(new Set()); setPaletteName(palette.name); onStageChange(1);
              }} className={cn("group rounded-2xl border p-4 text-left transition hover:-translate-y-1 hover:border-violet-400 motion-reduce:transform-none", selected ? "border-violet-400 bg-violet-50 dark:bg-violet-500/10" : "border-border bg-background")}>
                <span aria-hidden="true" className="mb-4 flex justify-center -space-x-3 py-2">
                  {(["primary", "secondary", "tertiary"] as const).map((key, index) => <span key={key} className={cn("size-12 rounded-full border-4 border-background shadow-sm transition duration-300 group-hover:-translate-y-1", index === 0 ? "z-20" : index === 1 ? "z-10 translate-y-2" : "translate-y-1")} style={{ backgroundColor: palette.colors[key] }} />)}
                </span>
                <span className="flex items-center justify-between gap-2 font-semibold">{palette.name}{selected ? <Check className="size-4 shrink-0 text-violet-600" /> : null}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{palette.description}</span>
              </button>;
            })}
          </div>
        </section> : stage === 1 ? <section aria-label="Paleta principal">
          <h3 className="font-heading text-lg font-semibold">Tus tres colores principales</h3>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-4">{fields.filter((field) => field.editable).map(colorCell)}</div>
        </section> : <section aria-label="Contrapuntos de contraste">
          <h3 className="font-heading text-lg font-semibold">Un toque de contraste</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Estos tonos alternativos acompañan a los principales. Podés conservar su cálculo automático o personalizarlos uno por uno.</p>
          <div className="mt-5 grid grid-cols-4 gap-1 sm:gap-3">{fields.filter((field) => !field.editable).map(colorCell)}</div>
        </section>}
      </fieldset>
      {activeField ? <PublisherAppSingleColorDialog key={activeField.key} label={activeField.label} description={activeField.description} value={draft[activeField.key]} onClose={() => setEditingColor(null)} onChange={(color) => changeColor(activeField, color)} /> : null}
    </form>
  );
}
