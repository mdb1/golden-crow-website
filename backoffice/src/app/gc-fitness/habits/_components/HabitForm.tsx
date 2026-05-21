"use client";

// _components/HabitForm.tsx
//
// RHF + Zod + (conditional) useFieldArray form for the two habit routes:
//   - mode="create": empty form → `createHabit` → redirect to /gc-fitness/habits
//   - mode="edit":   defaults from Firestore → `updateHabit` patch
//
// Type-conditional rendering (lives in `useWatch("type")` per P04-04 template-
// form pattern):
//   - options[] field — RENDERED ONLY when type === "multi-choice"
//   - targetValue field — RENDERED ONLY when type === "numeric"
//   - unit field — RENDERED when type is numeric or weight
//   - reminderTime — RENDERED ONLY when reminderEnabled is true
//
// The mode is locked at mount; the resolver swaps between
// `habitCreateSchema` and `habitUpdateSchemaForType(initialValues.type)`
// based on `mode`. In edit mode, both `clientId` and `type` are rendered
// as DISABLED inputs (immutable post-create per the schema doc + rule
// layer enforcement); the values still appear in the form so the trainer
// sees what they're editing.

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

import {
  habitCreateSchema,
  habitUpdateSchemaForType,
  HABIT_TYPES,
  type HabitType,
  type HabitCreateInput,
} from "@/lib/gc-fitness/habit-schema";

export type HabitFormMode = "create" | "edit";

export interface HabitFormClientOption {
  uid: string;
  displayName: string;
}

export interface HabitFormProps {
  mode: HabitFormMode;
  clientOptions: HabitFormClientOption[];
  /**
   * For mode="edit": prefilled values from the existing habit doc. For
   * mode="create": optional pre-seeded values (e.g. when arriving from
   * a per-client roster page).
   */
  defaultValues?: Partial<HabitCreateInput>;
  /**
   * Server-side handler. Resolves with `{ id }` on create (form redirects
   * to the list), or `{ ok: true }` on edit (form toasts + stays).
   */
  onSubmit: (
    input: HabitCreateInput,
  ) => Promise<{ id?: string; ok?: true }>;
}

const HABIT_TYPE_LABELS: Record<HabitType, string> = {
  binary: "Yes / no",
  "multi-choice": "Multiple choice",
  numeric: "Numeric",
  weight: "Weight",
};

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Sun" },
  { value: 2, label: "Mon" },
  { value: 3, label: "Tue" },
  { value: 4, label: "Wed" },
  { value: 5, label: "Thu" },
  { value: 6, label: "Fri" },
  { value: 7, label: "Sat" },
] as const;

function buildDefaults(
  passed?: Partial<HabitCreateInput>,
): HabitCreateInput {
  return {
    clientId: passed?.clientId ?? "",
    type: passed?.type ?? "binary",
    name: {
      en: passed?.name?.en ?? "",
      es: passed?.name?.es ?? "",
    },
    description: passed?.description,
    options: passed?.options,
    targetValue: passed?.targetValue,
    unit: passed?.unit,
    reminderTime: passed?.reminderTime,
    reminderEnabled: passed?.reminderEnabled ?? false,
    reminderCadence: passed?.reminderCadence ?? "daily",
    reminderWeekdays: passed?.reminderWeekdays,
    reminderDayOfMonth: passed?.reminderDayOfMonth,
  };
}

export function HabitForm({
  mode,
  clientOptions,
  defaultValues,
  onSubmit,
}: HabitFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Resolver swap based on mode. In edit mode the type is closure-captured
  // from the initial defaults; in create mode the type is read from the
  // submitted input via habitCreateSchema's discriminator field.
  const resolver =
    mode === "edit" && defaultValues?.type
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (zodResolver(habitUpdateSchemaForType(defaultValues.type) as any) as unknown as any)
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (zodResolver(habitCreateSchema as any) as unknown as any);

  const form = useForm<HabitCreateInput>({
    resolver,
    defaultValues: buildDefaults(defaultValues),
    mode: "onSubmit",
  });

  // Watch `type` + `reminderEnabled` so the conditional field UI re-renders.
  const watchedType = useWatch({
    control: form.control,
    name: "type",
  });
  const watchedReminderEnabled = useWatch({
    control: form.control,
    name: "reminderEnabled",
  });
  const watchedReminderCadence = useWatch({
    control: form.control,
    name: "reminderCadence",
  });
  const watchedReminderWeekdays =
    useWatch({ control: form.control, name: "reminderWeekdays" }) ?? [];

  // Options is a string[] (not array-of-objects), so RHF's useFieldArray —
  // which is purpose-built for object arrays — is awkward here. Track the
  // array via useWatch + form.setValue, with append/remove as memoized
  // helpers. The Zod superRefine still enforces the ≥ 2 constraint on
  // submit; this is purely UI plumbing for the in-form list.
  const watchedOptions =
    useWatch({ control: form.control, name: "options" }) ?? [];
  const appendOption = useCallback(() => {
    const current =
      (form.getValues("options") as string[] | undefined) ?? [];
    form.setValue("options", [...current, ""], { shouldDirty: true });
  }, [form]);
  const removeOption = useCallback(
    (index: number) => {
      const current =
        (form.getValues("options") as string[] | undefined) ?? [];
      const next = current.filter((_, i) => i !== index);
      form.setValue("options", next.length > 0 ? next : undefined, {
        shouldDirty: true,
      });
    },
    [form],
  );

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      try {
        // Strip undefined optional fields so Firestore doesn't store
        // `undefined` values that would re-emit as `null` on read.
        const cleaned: HabitCreateInput = {
          clientId: values.clientId,
          type: values.type,
          name: values.name,
          reminderEnabled: values.reminderEnabled,
        };
        if (values.description?.en && values.description?.es) {
          cleaned.description = values.description;
        }
        if (values.type === "multi-choice" && values.options) {
          // Drop empty string entries that the trainer left blank.
          const trimmed = values.options
            .map((o) => o.trim())
            .filter((o) => o.length > 0);
          if (trimmed.length > 0) {
            cleaned.options = trimmed;
          }
        }
        if (values.type === "numeric" && values.targetValue !== undefined) {
          cleaned.targetValue = values.targetValue;
        }
        if (
          (values.type === "numeric" || values.type === "weight") &&
          values.unit
        ) {
          cleaned.unit = values.unit;
        }
        if (values.reminderEnabled && values.reminderTime) {
          cleaned.reminderTime = values.reminderTime;
        }
        if (values.reminderEnabled && values.reminderCadence) {
          cleaned.reminderCadence = values.reminderCadence;
        }
        if (values.reminderEnabled && values.reminderCadence === "weekly") {
          const weekdays = (values.reminderWeekdays ?? []).filter(
            (weekday): weekday is number => typeof weekday === "number",
          );
          if (weekdays.length > 0) {
            cleaned.reminderWeekdays = weekdays;
          }
        }
        if (values.reminderEnabled && values.reminderCadence === "monthly" && values.reminderDayOfMonth) {
          cleaned.reminderDayOfMonth = values.reminderDayOfMonth;
        }
        if (!values.reminderEnabled) {
          cleaned.reminderCadence = undefined;
          cleaned.reminderWeekdays = undefined;
          cleaned.reminderDayOfMonth = undefined;
        }

        const result = await onSubmit(cleaned);
        if (mode === "create" && result?.id) {
          toast.success("Habit created.");
          router.push("/gc-fitness/habits");
          return;
        }
        toast.success("Habit saved.");
        router.refresh();
      } catch (err) {
        console.error("[habit-form] save failed", err);
        const message =
          err instanceof Error ? err.message : "Couldn't save.";
        toast.error(message);
      }
    });
  });

  const isMultiChoice = watchedType === "multi-choice";
  const isNumeric = watchedType === "numeric";
  const isWeight = watchedType === "weight";
  const showUnit = isNumeric || isWeight;

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        {/* Client picker — disabled in edit mode (FK immutable post-create) */}
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem className="max-w-md">
              <FormLabel>Client</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={mode === "edit"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a client…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.uid} value={c.uid}>
                      {c.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === "edit" && (
                <FormDescription>
                  Client assignment is immutable. Create a new habit to
                  assign this content to a different client.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Habit type — disabled in edit mode (immutable per schema doc) */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem className="max-w-xs">
              <FormLabel>Habit type</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={mode === "edit"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a habit type…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {HABIT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {HABIT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === "edit" && (
                <FormDescription>
                  Habit type is immutable — changing it would invalidate
                  every existing log.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Name EN + ES */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name.en"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name (English)</FormLabel>
                <FormControl>
                  <Input placeholder="Drink water" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name.es"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name (Spanish)</FormLabel>
                <FormControl>
                  <Input placeholder="Beber agua" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Description (optional) — EN + ES */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="description.en"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (English)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Optional — what does this habit look like in practice?"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Optional. Leave both blank to skip.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description.es"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Spanish)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Opcional"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Multi-choice options — type-conditional */}
        {isMultiChoice && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold">Options</h2>
              <span className="text-xs text-muted-foreground">
                {watchedOptions.length}/8
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Multi-choice habits need at least 2 options. The client picks
              one when they log the habit.
            </p>
            <ul className="flex flex-col gap-2">
              {watchedOptions.map((_, index) => (
                // Index-based React key is acceptable here because options
                // are primitive strings (not RHF object fields with stable
                // IDs); a remove always reflows lower entries by one slot.
                // eslint-disable-next-line react/no-array-index-key
                <li key={`opt-${index}`}>
                  <Card>
                    <CardContent className="flex items-center gap-2 p-3">
                      <Controller
                        control={form.control}
                        name={`options.${index}` as const}
                        render={({ field: optField, fieldState }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                placeholder={`Option ${index + 1}`}
                                value={optField.value ?? ""}
                                onChange={optField.onChange}
                                onBlur={optField.onBlur}
                                maxLength={40}
                              />
                            </FormControl>
                            {fieldState.error && (
                              <FormMessage>
                                {fieldState.error.message}
                              </FormMessage>
                            )}
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOption(index)}
                        aria-label="Remove option"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              onClick={appendOption}
              disabled={watchedOptions.length >= 8}
              className="gap-2 self-start"
            >
              <Plus className="h-4 w-4" />
              Add option
            </Button>
            {form.formState.errors.options &&
              !Array.isArray(form.formState.errors.options) && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.options.message}
                </p>
              )}
          </div>
        )}

        {/* Numeric — target value */}
        {isNumeric && (
          <Controller
            control={form.control}
            name="targetValue"
            render={({ field, fieldState }) => (
              <FormItem className="max-w-xs">
                <FormLabel>Daily target</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    placeholder="e.g. 8"
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      )
                    }
                    onBlur={field.onBlur}
                  />
                </FormControl>
                <FormDescription>
                  Optional. When set, the habit counts as &ldquo;done&rdquo;
                  for the day once the client reaches this value.
                </FormDescription>
                {fieldState.error && (
                  <FormMessage>{fieldState.error.message}</FormMessage>
                )}
              </FormItem>
            )}
          />
        )}

        {/* Unit — numeric + weight */}
        {showUnit && (
          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel>Unit</FormLabel>
                <FormControl>
                  <Input
                    placeholder={isWeight ? "kg" : "glasses"}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Short label shown next to the logged value (e.g.
                  &ldquo;glasses&rdquo;, &ldquo;minutes&rdquo;, &ldquo;kg&rdquo;).
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Reminder block */}
        <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
          <Controller
            control={form.control}
            name="reminderEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value === true}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                </FormControl>
                <div className="flex flex-col">
                  <FormLabel className="cursor-pointer">
                    Daily reminder
                  </FormLabel>
                  <FormDescription>
                    Sends a local notification on the client&apos;s phone at
                    the chosen time.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {watchedReminderEnabled === true && (
            <div className="grid gap-3 md:grid-cols-3">
              <FormField
                control={form.control}
                name="reminderTime"
                render={({ field }) => (
                  <FormItem className="max-w-[10rem]">
                <FormLabel>Reminder time</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    step={60}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reminderCadence"
                render={({ field }) => (
                  <FormItem>
                <FormLabel>Repeat</FormLabel>
                    <Select
                      value={field.value ?? "daily"}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== "weekly") {
                          form.setValue("reminderWeekdays", undefined, { shouldDirty: true });
                        }
                        if (value !== "monthly") {
                          form.setValue("reminderDayOfMonth", undefined, { shouldDirty: true });
                        } else if (!form.getValues("reminderDayOfMonth")) {
                          form.setValue("reminderDayOfMonth", 1, { shouldDirty: true });
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {watchedReminderCadence === "monthly" ? (
                <FormField
                  control={form.control}
                  name="reminderDayOfMonth"
                  render={({ field }) => (
                    <FormItem className="max-w-[10rem]">
                      <FormLabel>Day of month</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(event) =>
                            field.onChange(
                              event.target.value ? Number(event.target.value) : undefined,
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : watchedReminderCadence === "weekly" ? (
                <FormItem className="md:col-span-2">
                  <FormLabel>Weekdays</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_OPTIONS.map((weekday) => {
                      const active = watchedReminderWeekdays.includes(weekday.value);
                      return (
                        <Button
                          key={weekday.value}
                          type="button"
                          variant={active ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const current = new Set(watchedReminderWeekdays);
                            if (current.has(weekday.value)) current.delete(weekday.value);
                            else current.add(weekday.value);
                            form.setValue(
                              "reminderWeekdays",
                              Array.from(current).sort(),
                              { shouldDirty: true },
                            );
                          }}
                        >
                          {weekday.label}
                        </Button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              ) : null}
            </div>
          )}
        </div>

        {/* Action row */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : mode === "create"
              ? "Create habit"
              : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
