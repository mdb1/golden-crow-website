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

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

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

// Translation keys for the four habit-type strings — resolved at render via
// `t(`typeOptions.${HABIT_TYPE_LABEL_KEYS[type]}`)`. Keeping a static map
// here means the keys stay grep-able and the runtime lookup is O(1).
const HABIT_TYPE_LABEL_KEYS: Record<HabitType, string> = {
  binary: "binary",
  "multi-choice": "multiChoice",
  numeric: "numeric",
  weight: "weight",
};

const WEEKDAY_KEYS = [
  { value: 1, key: "mon" },
  { value: 2, key: "tue" },
  { value: 3, key: "wed" },
  { value: 4, key: "thu" },
  { value: 5, key: "fri" },
  { value: 6, key: "sat" },
  { value: 7, key: "sun" },
] as const;
const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const SCHEDULE_TYPE_VALUES = ["recurring", "one-time"] as const;

function buildDefaults(
  passed?: Partial<HabitCreateInput>,
): HabitCreateInput {
  const safeStartsOn =
    typeof passed?.startsOn === "string" && passed.startsOn.length > 0
      ? passed.startsOn
      : new Date().toISOString().slice(0, 10);
  const safeEndsOn =
    typeof passed?.endsOn === "string" && passed.endsOn.length > 0
      ? passed.endsOn
      : undefined;

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
    reminderMonthDays:
      passed?.reminderMonthDays ??
      (typeof passed?.reminderDayOfMonth === "number"
        ? [passed.reminderDayOfMonth]
        : undefined),
    scheduleType: passed?.scheduleType ?? "recurring",
    startsOn: safeStartsOn,
    endsOn: safeEndsOn,
    scheduleCadence: passed?.scheduleCadence ?? "daily",
    scheduleWeekdays: passed?.scheduleWeekdays,
    scheduleDayOfMonth: passed?.scheduleDayOfMonth,
    scheduleMonthDays:
      passed?.scheduleMonthDays ??
      (typeof passed?.scheduleDayOfMonth === "number"
        ? [passed.scheduleDayOfMonth]
        : undefined),
  };
}

export function HabitForm({
  mode,
  clientOptions,
  defaultValues,
  onSubmit,
}: HabitFormProps) {
  const router = useRouter();
  const t = useTranslations("habits.form");
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

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
  const watchedScheduleType = useWatch({
    control: form.control,
    name: "scheduleType",
  });
  const watchedScheduleCadence = useWatch({
    control: form.control,
    name: "scheduleCadence",
  });
  const watchedScheduleWeekdays =
    useWatch({ control: form.control, name: "scheduleWeekdays" }) ?? [];
  const watchedReminderWeekdays =
    useWatch({ control: form.control, name: "reminderWeekdays" }) ?? [];
  const watchedScheduleMonthDays =
    useWatch({ control: form.control, name: "scheduleMonthDays" }) ?? [];
  const watchedReminderMonthDays =
    useWatch({ control: form.control, name: "reminderMonthDays" }) ?? [];

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
      setSubmitError(null);
      try {
        // Strip undefined optional fields so Firestore doesn't store
        // `undefined` values that would re-emit as `null` on read.
        const cleaned: HabitCreateInput = {
          clientId: values.clientId,
          type: values.type,
          name: values.name,
          reminderEnabled: values.reminderEnabled,
          scheduleType: values.scheduleType,
          startsOn: values.startsOn,
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
        if (values.reminderEnabled && values.reminderCadence === "monthly") {
          const monthDays = (values.reminderMonthDays ?? []).filter(
            (day): day is number => Number.isInteger(day) && day >= 1 && day <= 31,
          );
          if (monthDays.length > 0) {
            cleaned.reminderMonthDays = monthDays;
            cleaned.reminderDayOfMonth = monthDays[0];
          }
        }
        if (!values.reminderEnabled) {
          cleaned.reminderCadence = undefined;
          cleaned.reminderWeekdays = undefined;
          cleaned.reminderDayOfMonth = undefined;
          cleaned.reminderMonthDays = undefined;
        }
        cleaned.endsOn =
          typeof values.endsOn === "string" && values.endsOn.trim().length > 0
            ? values.endsOn
            : undefined;
        if (values.scheduleType === "recurring") {
          cleaned.scheduleCadence = values.scheduleCadence ?? "daily";
          if (cleaned.scheduleCadence === "weekly") {
            const weekdays = (values.scheduleWeekdays ?? []).filter(
              (weekday): weekday is number => typeof weekday === "number",
            );
            cleaned.scheduleWeekdays = weekdays.length > 0 ? weekdays : undefined;
            cleaned.scheduleDayOfMonth = undefined;
          } else if (cleaned.scheduleCadence === "monthly") {
            const monthDays = (values.scheduleMonthDays ?? []).filter(
              (day): day is number => Number.isInteger(day) && day >= 1 && day <= 31,
            );
            cleaned.scheduleMonthDays = monthDays.length > 0 ? monthDays : undefined;
            cleaned.scheduleDayOfMonth =
              monthDays.length > 0
                ? monthDays[0]
                : values.scheduleDayOfMonth;
            cleaned.scheduleWeekdays = undefined;
          } else {
            cleaned.scheduleWeekdays = undefined;
            cleaned.scheduleDayOfMonth = undefined;
            cleaned.scheduleMonthDays = undefined;
          }
        } else {
          cleaned.scheduleCadence = undefined;
          cleaned.scheduleWeekdays = undefined;
          cleaned.scheduleDayOfMonth = undefined;
          cleaned.scheduleMonthDays = undefined;
          cleaned.endsOn = cleaned.endsOn ?? cleaned.startsOn;
        }

        const result = await onSubmit(cleaned);
        if (mode === "create" && result?.id) {
          toast.success(t("createdToast"));
          // 260524 — go back in nav after create (was push to /habits).
          // Same UX request as the exercise + template flows.
          router.back();
          return;
        }
        toast.success(t("savedToast"));
        router.back();
      } catch (err) {
        console.error("[habit-form] save failed", err);
        const message =
          err instanceof Error ? err.message : t("saveFailed");
        setSubmitError(message);
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
              <FormLabel>{t("clientLabel")}</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={mode === "edit"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t("clientPlaceholder")} />
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
                <FormDescription>{t("clientImmutableHint")}</FormDescription>
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
              <FormLabel>{t("typeLabel")}</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={mode === "edit"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t("typePlaceholder")} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {HABIT_TYPES.map((ht) => (
                    <SelectItem key={ht} value={ht}>
                      {t(`typeOptions.${HABIT_TYPE_LABEL_KEYS[ht]}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === "edit" && (
                <FormDescription>{t("typeImmutableHint")}</FormDescription>
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
                <FormLabel>{t("nameEn")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("namePlaceholderEn")} {...field} />
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
                <FormLabel>{t("nameEs")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("namePlaceholderEs")} {...field} />
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
                <FormLabel>{t("descriptionEn")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder={t("descriptionPlaceholderEn")}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>{t("descriptionOptionalHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description.es"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("descriptionEs")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder={t("descriptionPlaceholderEs")}
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
              <h2 className="font-heading text-lg font-semibold">
                {t("optionsHeading")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t("optionsCount", { count: watchedOptions.length })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{t("optionsHelp")}</p>
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
                                placeholder={t("optionPlaceholder", {
                                  index: index + 1,
                                })}
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
                        aria-label={t("removeOptionAria")}
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
              {t("addOption")}
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
                <FormLabel>{t("dailyTargetLabel")}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    placeholder={t("dailyTargetPlaceholder")}
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
                <FormDescription>{t("dailyTargetHint")}</FormDescription>
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
                <FormLabel>{t("unitLabel")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={
                      isWeight
                        ? t("unitPlaceholderWeight")
                        : t("unitPlaceholderGlasses")
                    }
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>{t("unitHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Reminder block */}
        <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
          <h2 className="font-medium">{t("scheduleHeading")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("scheduleSubtitle")}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <FormField
              control={form.control}
              name="scheduleType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("scheduleTypeLabel")}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value === "one-time") {
                        form.setValue("scheduleCadence", undefined, { shouldDirty: true });
                        form.setValue("scheduleWeekdays", undefined, { shouldDirty: true });
                        form.setValue("scheduleDayOfMonth", undefined, { shouldDirty: true });
                      } else if (!form.getValues("scheduleCadence")) {
                        form.setValue("scheduleCadence", "daily", { shouldDirty: true });
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SCHEDULE_TYPE_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value === "recurring"
                            ? t("scheduleTypeRecurring")
                            : t("scheduleTypeOneTime")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startsOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("scheduleStartLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={typeof field.value === "string" ? field.value : ""}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endsOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("scheduleEndLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={typeof field.value === "string" ? field.value : ""}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("scheduleEndHint")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {watchedScheduleType === "recurring" && (
            <div className="grid gap-3 md:grid-cols-3">
              <FormField
                control={form.control}
                name="scheduleCadence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("cadenceLabel")}</FormLabel>
                    <Select
                      value={field.value ?? "daily"}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== "weekly") {
                          form.setValue("scheduleWeekdays", undefined, { shouldDirty: true });
                        }
                        if (value !== "monthly") {
                          form.setValue("scheduleDayOfMonth", undefined, { shouldDirty: true });
                          form.setValue("scheduleMonthDays", undefined, { shouldDirty: true });
                        } else if (!(form.getValues("scheduleMonthDays")?.length ?? 0)) {
                          form.setValue("scheduleMonthDays", [1], { shouldDirty: true });
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="daily">{t("cadenceDaily")}</SelectItem>
                        <SelectItem value="weekly">{t("cadenceWeekly")}</SelectItem>
                        <SelectItem value="monthly">{t("cadenceMonthly")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {watchedScheduleCadence === "monthly" ? (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t("monthDaysLabel")}</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {MONTH_DAY_OPTIONS.map((monthDay) => {
                      const active = watchedScheduleMonthDays.includes(monthDay);
                      return (
                        <Button
                          key={monthDay}
                          type="button"
                          variant={active ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const current = new Set(watchedScheduleMonthDays);
                            if (current.has(monthDay)) current.delete(monthDay);
                            else current.add(monthDay);
                            const next = Array.from(current).sort((a, b) => a - b);
                            form.setValue("scheduleMonthDays", next, { shouldDirty: true });
                            form.setValue(
                              "scheduleDayOfMonth",
                              next.length > 0 ? next[0] : undefined,
                              { shouldDirty: true },
                            );
                          }}
                        >
                          {monthDay}
                        </Button>
                      );
                    })}
                  </div>
                  <FormDescription>
                    {t("monthDaysHint")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              ) : watchedScheduleCadence === "weekly" ? (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t("weekdaysLabel")}</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_KEYS.map((weekday) => {
                      const active = watchedScheduleWeekdays.includes(weekday.value);
                      return (
                        <Button
                          key={weekday.value}
                          type="button"
                          variant={active ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const current = new Set(watchedScheduleWeekdays);
                            if (current.has(weekday.value)) current.delete(weekday.value);
                            else current.add(weekday.value);
                            form.setValue(
                              "scheduleWeekdays",
                              Array.from(current).sort(),
                              { shouldDirty: true },
                            );
                          }}
                        >
                          {t(`weekdayShort.${weekday.key}`)}
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
                    {t("reminderToggleLabel")}
                  </FormLabel>
                  <FormDescription>
                    {t("reminderToggleHint")}
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
                <FormLabel>{t("reminderTimeLabel")}</FormLabel>
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
                <FormLabel>{t("reminderRepeatLabel")}</FormLabel>
                    <Select
                      value={field.value ?? "daily"}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== "weekly") {
                          form.setValue("reminderWeekdays", undefined, { shouldDirty: true });
                        }
                        if (value !== "monthly") {
                          form.setValue("reminderDayOfMonth", undefined, { shouldDirty: true });
                          form.setValue("reminderMonthDays", undefined, { shouldDirty: true });
                        } else if (!(form.getValues("reminderMonthDays")?.length ?? 0)) {
                          form.setValue("reminderMonthDays", [1], { shouldDirty: true });
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="daily">{t("cadenceDaily")}</SelectItem>
                        <SelectItem value="weekly">{t("cadenceWeekly")}</SelectItem>
                        <SelectItem value="monthly">{t("cadenceMonthly")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {watchedReminderCadence === "monthly" ? (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t("monthDaysLabel")}</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {MONTH_DAY_OPTIONS.map((monthDay) => {
                      const active = watchedReminderMonthDays.includes(monthDay);
                      return (
                        <Button
                          key={monthDay}
                          type="button"
                          variant={active ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const current = new Set(watchedReminderMonthDays);
                            if (current.has(monthDay)) current.delete(monthDay);
                            else current.add(monthDay);
                            const next = Array.from(current).sort((a, b) => a - b);
                            form.setValue("reminderMonthDays", next, { shouldDirty: true });
                            form.setValue(
                              "reminderDayOfMonth",
                              next.length > 0 ? next[0] : undefined,
                              { shouldDirty: true },
                            );
                          }}
                        >
                          {monthDay}
                        </Button>
                      );
                    })}
                  </div>
                  <FormDescription>
                    {t("monthDaysHint")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              ) : watchedReminderCadence === "weekly" ? (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t("weekdaysLabel")}</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_KEYS.map((weekday) => {
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
                          {t(`weekdayShort.${weekday.key}`)}
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
        <div className="border-t pt-4">
          {submitError ? (
            <div
              role="alert"
              className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? t("saving")
                : mode === "create"
                ? t("createCta")
                : t("saveCta")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
