"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizePublisherAppColor } from "@/lib/publisher-app-config";
import { cn } from "@/lib/utils";

export function PublisherAppSingleColorDialog({
  label, value, description, onChange, onClose,
}: {
  label: string;
  value: string;
  description?: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(normalizePublisherAppColor(value) ?? "#6D28D9");
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm" onOpenAutoFocus={(event) => {
        event.preventDefault();
        input.current?.focus();
        try { input.current?.showPicker?.(); } catch { /* The circular picker remains available on browsers without automatic opening. */ }
      }}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description ?? "Elegí el color en el selector."}</DialogDescription>
        </DialogHeader>
        <label className="group relative mx-auto my-5 flex size-44 cursor-pointer items-center justify-center rounded-full border border-dashed border-violet-300 transition hover:rotate-3 hover:scale-105 focus-within:ring-2 focus-within:ring-violet-500 motion-reduce:transform-none">
          <span aria-hidden="true" className="size-36 rounded-full border-8 border-background shadow-xl ring-1 ring-black/10 transition-colors" style={{ backgroundColor: draft }} />
          <span aria-hidden="true" className="absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full border bg-background shadow-sm"><Pencil className="size-4" /></span>
          <input
            ref={input}
            type="color"
            aria-label={`Elegir ${label.toLowerCase()}`}
            value={draft}
            onChange={(event) => {
              const color = normalizePublisherAppColor(event.target.value);
              if (color) setDraft(color);
            }}
            className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
          />
        </label>
        <code className="mb-3 text-center text-sm text-muted-foreground">{draft}</code>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={() => onChange(draft)}><Check className="size-4" />Usar este color</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PublisherAppColorPicker({
  label, value, onChange, disabled, className, children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={disabled} aria-label={`Editar ${label.toLowerCase()}`} onClick={() => setOpen(true)} className={cn("group flex items-center gap-2 rounded-full px-3 py-2 text-sm transition hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:opacity-50 dark:hover:bg-violet-500/10", className)}>
        {children ?? <><span aria-hidden="true" className="size-5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: value }} />
        <code className="text-xs text-muted-foreground">{value}</code>
        <Pencil className="size-3.5 shrink-0 transition-transform group-hover:-rotate-12" /></>}
      </button>
      {open ? <PublisherAppSingleColorDialog label={label} value={value} onClose={() => setOpen(false)} onChange={(color) => { onChange(color); setOpen(false); }} /> : null}
    </>
  );
}
