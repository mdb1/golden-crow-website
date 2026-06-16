"use client";

// localized-field.tsx
//
// Coach-language-first localized text input for the create/edit forms
// (exercise / workout template / habit). The coach sees ONE field in their
// own language; an optional "add translation" toggle reveals the other
// language. While the translation is hidden, typing mirrors the value into
// the other language so the schema-required field (e.g. name.en) is always
// populated. On submit, `mirrorLocalizedBlank` fills any still-blank language
// from the other — so "no translation" means every language carries the
// coach's text (per product decision).

import type { UseFormReturn } from "react-hook-form";

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

type Lang = "en" | "es";

export interface LocalizedTextFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  /** Dotted base path, e.g. "name", "description", "tips". */
  base: string;
  primaryLang: Lang;
  otherLang: Lang;
  /** When false, the secondary (other-language) field is hidden and the
   *  primary value mirrors into it on every keystroke. */
  showTranslation: boolean;
  primaryLabel: string;
  otherLabel: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
}

export function LocalizedTextField({
  form,
  base,
  primaryLang,
  otherLang,
  showTranslation,
  primaryLabel,
  otherLabel,
  placeholder,
  hint,
  multiline = false,
  rows = 3,
  disabled = false,
}: LocalizedTextFieldProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name={`${base}.${primaryLang}`}
        render={({ field }) => {
          const onPrimaryChange = (
            e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) => {
            field.onChange(e);
            if (!showTranslation) {
              form.setValue(`${base}.${otherLang}`, e.target.value, {
                shouldDirty: true,
              });
            }
          };
          return (
            <FormItem>
              <FormLabel>{primaryLabel}</FormLabel>
              <FormControl>
                {multiline ? (
                  <Textarea
                    rows={rows}
                    placeholder={placeholder}
                    disabled={disabled}
                    {...field}
                    value={field.value ?? ""}
                    onChange={onPrimaryChange}
                  />
                ) : (
                  <Input
                    placeholder={placeholder}
                    disabled={disabled}
                    {...field}
                    value={field.value ?? ""}
                    onChange={onPrimaryChange}
                  />
                )}
              </FormControl>
              {hint ? <FormDescription>{hint}</FormDescription> : null}
              <FormMessage />
            </FormItem>
          );
        }}
      />
      {showTranslation ? (
        <FormField
          control={form.control}
          name={`${base}.${otherLang}`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{otherLabel}</FormLabel>
              <FormControl>
                {multiline ? (
                  <Textarea
                    rows={rows}
                    placeholder={placeholder}
                    disabled={disabled}
                    {...field}
                    value={field.value ?? ""}
                  />
                ) : (
                  <Input
                    placeholder={placeholder}
                    disabled={disabled}
                    {...field}
                    value={field.value ?? ""}
                  />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </div>
  );
}

/**
 * Fill any blank language from the other so a value entered in one language
 * is stored in both. Both-blank stays both-blank (for optional fields).
 * Returns a fresh object; pass the form's localized value (e.g. `name`).
 */
export function mirrorLocalizedBlank<
  T extends { en?: string | null; es?: string | null } | null | undefined,
>(pair: T): T {
  if (!pair) return pair;
  const en = pair.en ?? "";
  const es = pair.es ?? "";
  const enHas = en.trim().length > 0;
  const esHas = es.trim().length > 0;
  if (!enHas && !esHas) return pair;
  return { ...pair, en: enHas ? en : es, es: esHas ? es : en };
}

/**
 * Whether to OPEN the translation fields by default — true only when both
 * languages already carry distinct text (an existing translated record).
 */
export function hasDistinctTranslation(
  pair: { en?: string | null; es?: string | null } | null | undefined,
): boolean {
  if (!pair) return false;
  const en = (pair.en ?? "").trim();
  const es = (pair.es ?? "").trim();
  return en.length > 0 && es.length > 0 && en !== es;
}
