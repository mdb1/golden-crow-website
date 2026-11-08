"use client";

import { useState } from "react";
import { Check, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  normalizePublisherAppColor,
  publisherAppCounterpointColors,
  type PublisherAppColors,
} from "@/lib/publisher-app-config";
import { cn } from "@/lib/utils";

type BaseKey = "primary" | "secondary" | "tertiary";
type CounterpointKey = Exclude<keyof PublisherAppColors, BaseKey>;
export type VisualIdentityColorField =
  | { key: BaseKey; label: string; description: string; editable: true }
  | { key: CounterpointKey; label: string; description: string; editable: false; hueShift: string };

const COUNTERPOINT_KEYS: CounterpointKey[] = [
  "counterpointClockwise", "counterpointAnticlockwise",
  "counterpointFarClockwise", "counterpointFarAnticlockwise",
];

function ColorInput({
  field, value, onChange,
}: {
  field: VisualIdentityColorField;
  value: string;
  onChange: (value: string) => void;
}) {
  const normalized = normalizePublisherAppColor(value);
  return (
    <div className="mt-4 space-y-2">
      <input
        type="color"
        aria-label={`Elegir ${field.label.toLowerCase()}`}
        value={normalized ?? "#000000"}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        className="h-20 w-full cursor-pointer overflow-hidden rounded-xl border border-black/10 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-xl [&::-webkit-color-swatch]:border-0"
      />
      <Input
        aria-label={`Hexadecimal del ${field.label.toLowerCase()}`}
        aria-invalid={!normalized}
        required
        pattern="#[0-9A-Fa-f]{6}"
        maxLength={7}
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        className="h-9 bg-background font-mono text-xs uppercase"
      />
      {!normalized ? <p role="alert" className="text-xs text-destructive">Usá un color hexadecimal de seis dígitos, como #6D28D9.</p> : null}
    </div>
  );
}

function StepTitle({ number, title, id }: { number: string; title: string; id: string }) {
  return (
    <h3 id={id} className="flex items-center gap-3 font-heading text-base font-semibold text-foreground">
      <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800 dark:bg-violet-500/20 dark:text-violet-100">{number}</span>
      {title}
    </h3>
  );
}

export function PublisherAppVisualIdentityEditor({
  id, colors, fields, suggestedPalettes, disabled, onApply, onApplied,
}: {
  id: string;
  colors: PublisherAppColors;
  fields: VisualIdentityColorField[];
  suggestedPalettes: Array<{ name: string; description: string; colors: PublisherAppColors }>;
  disabled: boolean;
  onApply: (colors: PublisherAppColors, paletteName: string) => Promise<boolean>;
  onApplied: () => void;
}) {
  const [draft, setDraft] = useState<PublisherAppColors>(() => ({ ...colors }));
  const [paletteName, setPaletteName] = useState("Paleta personalizada");
  const [customKeys, setCustomKeys] = useState(() => {
    const automatic = publisherAppCounterpointColors(colors.primary);
    return new Set(COUNTERPOINT_KEYS.filter((key) => normalizePublisherAppColor(colors[key]) !== automatic[key]));
  });
  const automatic = publisherAppCounterpointColors(draft.primary);

  function updateBase(key: BaseKey, value: string) {
    setPaletteName("Paleta personalizada");
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "primary" && normalizePublisherAppColor(value)) {
        const defaults = publisherAppCounterpointColors(value);
        for (const counterpoint of COUNTERPOINT_KEYS) {
          if (!customKeys.has(counterpoint)) next[counterpoint] = defaults[counterpoint];
        }
      }
      return next;
    });
  }

  return (
    <form
      id={id}
      aria-label="Editor de identidad visual"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || Object.values(draft).some((color) => !normalizePublisherAppColor(color))) return;
        if (await onApply(draft, paletteName)) onApplied();
      }}
    >
      <fieldset disabled={disabled} className="min-w-0 space-y-6 disabled:opacity-65">
        <section aria-labelledby={`${id}-identity`}>
          <StepTitle id={`${id}-identity`} number="1" title="Identidad general" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {suggestedPalettes.map((palette) => {
              const selected = (["primary", "secondary", "tertiary"] as const).every((key) => normalizePublisherAppColor(draft[key]) === palette.colors[key]);
              return (
                <button
                  key={palette.name}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setDraft({ ...palette.colors });
                    setCustomKeys(new Set());
                    setPaletteName(palette.name);
                  }}
                  className={cn("rounded-2xl border p-4 text-left transition hover:border-violet-400 disabled:cursor-wait", selected ? "border-violet-400 bg-violet-50 ring-1 ring-violet-400 dark:bg-violet-500/12" : "border-border bg-background")}
                >
                  <span className="mb-3 flex gap-1.5" aria-hidden="true">
                    {(["primary", "secondary", "tertiary"] as const).map((key) => <span key={key} className="h-8 flex-1 rounded-md" style={{ backgroundColor: palette.colors[key] }} />)}
                  </span>
                  <span className="flex items-center justify-between gap-2 font-semibold">{palette.name}{selected ? <Check className="size-4 shrink-0 text-violet-600" /> : null}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{palette.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby={`${id}-base`} className="border-t border-border pt-6">
          <StepTitle id={`${id}-base`} number="2" title="Paleta principal" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {fields.filter((field) => field.editable).map((field) => (
              <div key={field.key} className="rounded-2xl border border-border bg-background p-4">
                <h4 className="text-sm font-semibold">{field.label}</h4>
                <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{field.description}</p>
                <ColorInput field={field} value={draft[field.key]} onChange={(value) => updateBase(field.key, value)} />
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby={`${id}-counterpoints`} className="border-t border-border pt-6">
          <StepTitle id={`${id}-counterpoints`} number="3" title="Contrapuntos de contraste" />
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Estos tonos alternativos aportan contraste a los tres colores principales. Se calculan desde el color principal; podés personalizar cada uno.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {fields.filter((field) => !field.editable).map((field) => {
              const custom = customKeys.has(field.key);
              return (
                <div key={field.key} className={cn("rounded-2xl border p-4", custom ? "border-amber-300 bg-amber-50/30 dark:border-amber-500/35 dark:bg-amber-500/5" : "border-dashed border-violet-200 bg-violet-50/40 dark:border-violet-400/25 dark:bg-violet-500/5")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">{field.label}</h4>
                    <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", custom ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100" : "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-100")}>{custom ? "Personalizado" : `Automático · ${field.hueShift}`}</span>
                  </div>
                  {custom ? (
                    <ColorInput field={field} value={draft[field.key]} onChange={(value) => {
                      setPaletteName("Paleta personalizada");
                      setDraft((current) => ({ ...current, [field.key]: value }));
                    }} />
                  ) : (
                    <div className="mt-4 space-y-2">
                      <div className="h-20 rounded-xl border border-black/10" style={{ backgroundColor: draft[field.key] }} />
                      <p className="flex h-9 items-center font-mono text-xs text-muted-foreground">{draft[field.key]}</p>
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    {custom ? (
                      <Button type="button" size="sm" variant="ghost" aria-label={`Restaurar automático: ${field.label.toLowerCase()}`} onClick={() => {
                        setCustomKeys((current) => { const next = new Set(current); next.delete(field.key); return next; });
                        setDraft((current) => ({ ...current, [field.key]: automatic[field.key] }));
                        setPaletteName("Paleta personalizada");
                      }}><RotateCcw className="size-3.5" />Restaurar automático</Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" aria-label={`Personalizar ${field.label.toLowerCase()}`} onClick={() => setCustomKeys((current) => new Set(current).add(field.key))}><Pencil className="size-3.5" />Personalizar</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </fieldset>
    </form>
  );
}
