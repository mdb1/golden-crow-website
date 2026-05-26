"use client";

// quick-replies-form.tsx
//
// RHF + Zod + useFieldArray editor for the trainer's chatQuickReplies
// templates (CHAT-11 surface, P08-12).
//
// Submits via the `updateChatQuickReplies` Server Action shipped in
// P08-05 (`@/lib/gc-fitness/user-actions`) — that Action owns the
// authoritative Zod validation (20 × 240 caps + trim + drop-empty +
// FieldValue.delete() on empty). This form re-uses the SAME schema for
// client-side validation so error messages surface before the round-trip,
// but the server is still the source of truth.
//
// ── Form shape (useFieldArray friction) ───────────────────────────────
// The Zod schema's `replies` field is `string[]`. `useFieldArray` wants
// an object-array shape (it stamps an internal `id` on each entry for
// stable React keys across reorders). Two options:
//
//   1. Track the list with useWatch + setValue (HabitForm pattern for
//      its options[] string array, P06-05).
//   2. Wrap each string in `{ value: string }` for the field array, then
//      transform back to string[] on submit (template-form pattern, P04-04).
//
// We pick (2) — the template-form pattern — because it keeps `move()`,
// `append()`, `remove()` ergonomic (the whole point of useFieldArray)
// and matches what the plan calls for ("mirroring the template-form
// useFieldArray + move() pattern from P04-04"). The transform to/from
// string[] happens at the form boundary (`defaultValues` from props,
// `onSubmit` to the Action).
//
// Pitfall 3 inoculation (template-form §): React key is `field.id`
// (RHF-internal CUID), NEVER `index` (breaks across reorders).
//
// ── Save state UX ─────────────────────────────────────────────────────
// On submit success: sonner toast + `router.refresh()` so the chat
// MessageInput's QuickReplyDropdown — which calls the same Server Action
// via React Query — gets a fresh stale window. We do NOT invalidate
// React Query directly because this form is not inside the chat
// providers tree; the dropdown's `staleTime: 60s` is acceptable for v1
// (manual refresh after save is a documented V2 carry-forward, see
// must_haves.truths in PLAN 08-12).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslations } from "next-intl";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { updateChatQuickReplies } from "@/lib/gc-fitness/user-actions";

// Per-row cap mirrors the server schema (240 chars) — see user-actions.ts.
const MAX_TEMPLATE_CHARS = 240;
const MAX_TEMPLATES = 20;

/**
 * Form-shape schema: each row is `{ value: string }` so RHF's
 * useFieldArray can stamp its internal `id` for stable React keys.
 * Transform to the server's `string[]` shape on submit.
 *
 * We do NOT import the server's `updateChatQuickRepliesSchema` directly
 * here — that schema is `{ replies: string[] }` and the field-array
 * needs the object-wrap shape. The server still authoritatively
 * validates on submit; this client schema only mirrors the per-row cap
 * for early error surfacing.
 */
// Validation messages stay in English at the schema layer per the plan
// ("leave Zod messages in English and only translate at the form's
// error-display layer"). The error messages here are rarely surfaced
// because the textarea's `maxLength` attribute caps input before submit.
const formSchema = z.object({
  replies: z
    .array(
      z.object({
        value: z
          .string()
          .max(MAX_TEMPLATE_CHARS, `Max ${MAX_TEMPLATE_CHARS} characters.`),
      }),
    )
    .max(MAX_TEMPLATES, `Max ${MAX_TEMPLATES} quick replies.`),
});
type FormShape = z.infer<typeof formSchema>;

export interface QuickRepliesFormProps {
  /** Server-prefetched initial values from `/users/{trainer.uid}.chatQuickReplies`. */
  initialReplies: string[];
}

export function QuickRepliesForm({ initialReplies }: QuickRepliesFormProps) {
  const router = useRouter();
  const t = useTranslations("settings.quickRepliesForm");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const form = useForm<FormShape>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema as any) as unknown as any,
    defaultValues: {
      replies: initialReplies.map((s) => ({ value: s })),
    },
    mode: "onSubmit",
  });

  // Pitfall 3 — RHF stamps `field.id` (internal CUID) for stable React
  // keys across reorders; our domain `value` is a separate field name
  // so no collision possible.
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "replies",
  });

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      try {
        // Transform `{ value }[]` → `string[]` for the server. Empty
        // strings post-trim are dropped by the server schema (defense
        // in depth — we don't pre-filter here so the trainer's edit
        // state survives a validation failure round-trip).
        const replies = values.replies.map((r) => r.value);
        await updateChatQuickReplies({ replies });
        toast.success(t("savedToast"));
        setSavedAt(Date.now());
        form.reset({ replies: values.replies });
        // Refresh so the server-rendered Settings page re-fetches via
        // `getCurrentTrainerProfile()`, and so any other server-rendered
        // surface that reads the trainer profile sees the new value.
        router.refresh();
      } catch (err) {
        console.error("[quick-replies-form] save failed", err);
        const message =
          err instanceof Error ? err.message : t("saveFailedToast");
        toast.error(message);
      }
    });
  });

  function appendRow() {
    append({ value: "" });
  }

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t("countLabel", { count: fields.length, max: MAX_TEMPLATES })}
          </span>
        </div>

        {fields.length === 0 && (
          <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {t.rich("emptyHint", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {fields.map((field, index) => (
            // Pitfall 3: React key is `field.id` (RHF-internal CUID).
            <li key={field.id}>
              <div className="flex items-start gap-2 rounded-md border bg-card p-3">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    #{index + 1}
                  </span>
                </div>
                <FormField
                  control={form.control}
                  name={`replies.${index}.value` as const}
                  render={({ field: rowField }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="sr-only">
                        {t("rowLabel", { index: index + 1 })}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...rowField}
                          placeholder={t("rowPlaceholder")}
                          rows={2}
                          maxLength={MAX_TEMPLATE_CHARS}
                          aria-label={t("rowAria", { index: index + 1 })}
                          className="resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    aria-label={t("moveUpAria")}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => move(index, index + 1)}
                    disabled={index === fields.length - 1}
                    aria-label={t("moveDownAria")}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    aria-label={t("removeAria")}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={appendRow}
            disabled={fields.length >= MAX_TEMPLATES}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addCta")}
          </Button>
          <div className="flex items-center gap-2">
            {savedAt && !pending && !form.formState.isDirty ? (
              <span className="text-xs text-emerald-700">{t("savedInline")}</span>
            ) : null}
            <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
