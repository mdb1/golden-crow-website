"use client";

// _components/HabitForm.tsx
//
// RHF + Zod + (conditional) useFieldArray form for the two habit routes:
//   - mode="create": empty form → `createHabit` → redirect to /gc-fitness/habits
//   - mode="edit":   defaults from Firestore → `updateHabit` patch
//
// Habits are binary-only (yes/no) — there is no type picker. The only
// conditional field is `reminderTime`, rendered when `reminderEnabled` is true.
//
// The mode is locked at mount; the resolver swaps between
// `habitCreateSchema` and `habitUpdateSchemaForType(initialValues.type)`
// based on `mode`. In edit mode `clientId` is rendered as a DISABLED input
// (immutable post-create per the schema doc + rule layer enforcement); the
// value still appears in the form so the trainer sees what they're editing.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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

import {
  habitCreateSchema,
  habitUpdateSchemaForType,
  type HabitCreateInput,
} from "@/lib/gc-fitness/habit-schema";
import {
  addCivilMonths,
  END_DATE_PRESET_MONTHS,
  inferEndDatePresetMonths,
  localDateToCivil,
} from "@/lib/gc-fitness/end-date-presets";
import { HabitPhotoDropzone } from "./HabitPhotoDropzone";

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
   * For mode="edit": the existing habit's doc id (`hab-${uid}-${uuid}`), so the
   * photo dropzone can mint an upload URL. Absent in create mode — the dropzone
   * stays disabled until the habit is saved and has an id.
   */
  habitId?: string;
  /**
   * Server-side handler. Resolves with `{ id }` on create (form redirects
   * to the list), or `{ ok: true }` on edit (form toasts + stays).
   */
  onSubmit: (
    input: HabitCreateInput,
  ) => Promise<{ id?: string; ok?: true }>;
  /**
   * Optional hook fired after a successful submit. When omitted the form
   * navigates back via `router.back()` (default standalone-page UX).
   * When provided (typical for a modal embed) the form delegates the
   * follow-up — usually "close the dialog and invalidate parent data".
   */
  onAfterSubmit?: (result: { id?: string; ok?: true }) => void;
  /**
   * Hides the Cancel button when the host already owns dismissal
   * (e.g. a dialog with its own close affordance).
   */
  hideCancelButton?: boolean;
}

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
  mode: HabitFormMode = "create",
): HabitCreateInput {
  const safeStartsOn =
    typeof passed?.startsOn === "string" && passed.startsOn.length > 0
      ? passed.startsOn
      : localDateToCivil(new Date());
  const safeEndsOn =
    typeof passed?.endsOn === "string" && passed.endsOn.length > 0
      ? passed.endsOn
      : mode === "create"
        ? addCivilMonths(safeStartsOn, 3)
        : undefined;

  return {
    clientId: passed?.clientId ?? "",
    type: "binary",
    name: {
      en: passed?.name?.en ?? "",
      es: passed?.name?.es ?? "",
    },
    description: passed?.description,
    photoUrl: passed?.photoUrl,
    youtubeUrl: passed?.youtubeUrl,
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
  habitId,
  onSubmit,
  onAfterSubmit,
  hideCancelButton,
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
  const initialDefaults = buildDefaults(defaultValues, mode);

  const form = useForm<HabitCreateInput>({
    resolver,
    defaultValues: initialDefaults,
    mode: "onSubmit",
  });

  // Watch `reminderEnabled` so the conditional reminder UI re-renders.
  const watchedReminderEnabled = useWatch({
    control: form.control,
    name: "reminderEnabled",
  });
  const watchedScheduleType = useWatch({
    control: form.control,
    name: "scheduleType",
  });
  const watchedScheduleCadence = useWatch({
    control: form.control,
    name: "scheduleCadence",
  });
  const watchedStartsOn =
    (useWatch({ control: form.control, name: "startsOn" }) ?? "") as string;
  const watchedEndsOn =
    (useWatch({ control: form.control, name: "endsOn" }) ?? "") as string;
  const watchedScheduleWeekdays =
    useWatch({ control: form.control, name: "scheduleWeekdays" }) ?? [];
  const watchedScheduleMonthDays =
    useWatch({ control: form.control, name: "scheduleMonthDays" }) ?? [];
  const initialStartsOn =
    typeof initialDefaults.startsOn === "string" ? initialDefaults.startsOn : "";
  const initialEndsOn =
    typeof initialDefaults.endsOn === "string" ? initialDefaults.endsOn : undefined;
  const [selectedEndPresetMonths, setSelectedEndPresetMonths] = useState<
    number | null
  >(() =>
    inferEndDatePresetMonths(initialStartsOn, initialEndsOn),
  );

  useEffect(() => {
    if (selectedEndPresetMonths == null) return;
    if (watchedStartsOn.length === 0) return;
    const nextEndsOn = addCivilMonths(watchedStartsOn, selectedEndPresetMonths);
    if (watchedEndsOn === nextEndsOn) return;
    form.setValue("endsOn", nextEndsOn, { shouldDirty: true });
  }, [form, selectedEndPresetMonths, watchedEndsOn, watchedStartsOn]);

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      setSubmitError(null);
      try {
        // Strip undefined optional fields so Firestore doesn't store
        // `undefined` values that would re-emit as `null` on read.
        const cleaned: HabitCreateInput = {
          clientId: values.clientId,
          type: "binary",
          name: values.name,
          reminderEnabled: values.reminderEnabled,
          scheduleType: values.scheduleType,
          startsOn: values.startsOn,
        };
        const descriptionEn = values.description?.en?.trim() ?? "";
        const descriptionEs = values.description?.es?.trim() ?? "";
        if (descriptionEn.length > 0 || descriptionEs.length > 0) {
          // Keep wire shape complete even when trainer fills only one locale.
          cleaned.description = {
            en: descriptionEn || descriptionEs,
            es: descriptionEs || descriptionEn,
          };
        }
        const photoUrl = values.photoUrl?.trim() ?? "";
        if (photoUrl.length > 0) {
          cleaned.photoUrl = photoUrl;
        }
        const youtubeUrl = values.youtubeUrl?.trim() ?? "";
        if (youtubeUrl.length > 0) {
          cleaned.youtubeUrl = youtubeUrl;
        }
        if (values.reminderEnabled && values.reminderTime) {
          cleaned.reminderTime = values.reminderTime;
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
        if (values.reminderEnabled) {
          const reminderCadence =
            cleaned.scheduleType === "recurring"
              ? (cleaned.scheduleCadence ?? "daily")
              : "daily";
          cleaned.reminderCadence = reminderCadence;
          if (reminderCadence === "weekly") {
            cleaned.reminderWeekdays = cleaned.scheduleWeekdays;
          } else if (reminderCadence === "monthly") {
            cleaned.reminderMonthDays = cleaned.scheduleMonthDays;
            cleaned.reminderDayOfMonth = cleaned.scheduleDayOfMonth;
          }
        } else {
          cleaned.reminderCadence = undefined;
          cleaned.reminderWeekdays = undefined;
          cleaned.reminderDayOfMonth = undefined;
          cleaned.reminderMonthDays = undefined;
        }

        const result = await onSubmit(cleaned);
        if (mode === "create" && result?.id) {
          toast.success(t("createdToast"));
          if (onAfterSubmit) {
            onAfterSubmit(result);
          } else {
            // 260524 — go back in nav after create (was push to /habits).
            // Same UX request as the exercise + template flows.
            router.back();
          }
          return;
        }
        toast.success(t("savedToast"));
        if (onAfterSubmit) {
          onAfterSubmit(result);
        } else {
          router.back();
        }
      } catch (err) {
        console.error("[habit-form] save failed", err);
        const message =
          err instanceof Error ? err.message : t("saveFailed");
        setSubmitError(message);
        toast.error(message);
      }
    });
  });

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

        {/* Reference photo + YouTube demo (both optional) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="youtubeUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("youtubeUrlLabel")}</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://youtu.be/…"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>{t("youtubeUrlHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="photoUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("photoLabel")}</FormLabel>
                <FormControl>
                  <HabitPhotoDropzone
                    habitId={habitId}
                    value={field.value}
                    onUploaded={(gsPath) =>
                      field.onChange(gsPath)
                    }
                    onRemoved={() => field.onChange(undefined)}
                    disabled={mode === "create" && !habitId}
                    disabledHint={
                      mode === "create" && !habitId
                        ? t("photoCreateHint")
                        : undefined
                    }
                  />
                </FormControl>
                <FormDescription>{t("photoHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Reminder block */}
        <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            {t("scheduleHeading")}
          </h2>
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
                      onChange={(event) => {
                        const next = event.target.value;
                        field.onChange(next);
                        if (selectedEndPresetMonths != null && next.length > 0) {
                          form.setValue("endsOn", addCivilMonths(next, selectedEndPresetMonths), {
                            shouldDirty: true,
                          });
                        }
                      }}
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
                  <div className="flex flex-wrap gap-2">
                    {END_DATE_PRESET_MONTHS.map((months) => {
                      const active =
                        selectedEndPresetMonths === months &&
                        typeof watchedStartsOn === "string" &&
                        watchedEndsOn === addCivilMonths(watchedStartsOn, months);
                      return (
                        <Button
                          key={months}
                          type="button"
                          variant={active ? "default" : "outline"}
                          size="sm"
                          className="rounded-full"
                          aria-pressed={active}
                          onClick={() => {
                            setSelectedEndPresetMonths(months);
                            const next = addCivilMonths(watchedStartsOn, months);
                            field.onChange(next);
                          }}
                        >
                          {t("scheduleEndPreset", { months })}
                        </Button>
                      );
                    })}
                  </div>
                  <FormControl>
                    <Input
                      type="date"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={typeof field.value === "string" ? field.value : ""}
                      min={watchedStartsOn}
                      onChange={(event) => {
                        const next = event.target.value;
                        field.onChange(next);
                        setSelectedEndPresetMonths(
                          next.length > 0
                            ? inferEndDatePresetMonths(watchedStartsOn, next)
                            : null,
                        );
                      }}
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
              <FormItem className="md:col-span-2">
                <FormLabel>{t("reminderRepeatLabel")}</FormLabel>
                <div className="flex min-h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  {t("reminderFollowsSchedule")}
                </div>
              </FormItem>
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
            {hideCancelButton ? null : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.back()}
                disabled={pending}
              >
                {t("cancel")}
              </Button>
            )}
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
