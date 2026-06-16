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

import { useFormState, type UseFormReturn } from "react-hook-form";

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
  /** Label WITHOUT a language suffix — shown while the translation is hidden
   *  (the single-language case). The language is implied by the coach's UI
   *  locale, so we don't clutter it with "(Spanish)". Falls back to
   *  `primaryLabel` when omitted. */
  plainLabel?: string;
  /** Language-qualified label (e.g. "Name (Spanish)") — shown for the primary
   *  field ONLY once the translation pane is revealed. */
  primaryLabel: string;
  otherLabel: string;
  placeholder?: string;
  hint?: string;
  /** When set, a validation error on EITHER language surfaces this localized
   *  message inline under the field (instead of the raw English Zod text).
   *  Critically, while collapsed, the schema-required language is the HIDDEN
   *  mirror; this makes that error visible on the one field the coach sees. */
  requiredMessage?: string;
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
  plainLabel,
  primaryLabel,
  otherLabel,
  placeholder,
  hint,
  requiredMessage,
  multiline = false,
  rows = 3,
  disabled = false,
}: LocalizedTextFieldProps) {
  // Subscribe to the form's error map so this field re-renders when either
  // language's validation state changes (the hidden mirror included).
  const { errors } = useFormState({ control: form.control });
  // base is a single path segment here ("name" | "description" | "tips").
  const groupErrors = (errors as Record<string, unknown>)?.[base] as
    | Record<string, { message?: string } | undefined>
    | undefined;
  const primaryError = groupErrors?.[primaryLang];
  const otherError = groupErrors?.[otherLang];

  // Collapsed: the visible primary field must also report the hidden
  // (other-language) error, since the schema-required language is mirrored
  // and may be the only one that fails.
  const primaryVisibleError =
    primaryError ?? (!showTranslation ? otherError : undefined);

  const collapsedLabel = plainLabel ?? primaryLabel;

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
              <FormLabel>
                {showTranslation ? primaryLabel : collapsedLabel}
              </FormLabel>
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
              {requiredMessage ? (
                primaryVisibleError ? (
                  <p className="text-sm font-medium text-destructive">
                    {requiredMessage}
                  </p>
                ) : null
              ) : (
                <FormMessage />
              )}
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
              {requiredMessage ? (
                otherError ? (
                  <p className="text-sm font-medium text-destructive">
                    {requiredMessage}
                  </p>
                ) : null
              ) : (
                <FormMessage />
              )}
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
