"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations, useLocale } from "next-intl";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  LocalizedTextField,
  mirrorLocalizedBlank,
  hasDistinctTranslation,
} from "@/components/gc-fitness/localized-field";
import { HabitPhotoDropzone } from "./HabitPhotoDropzone";
import {
  habitTemplateCreateSchema,
  type HabitTemplateCreateInput,
} from "@/lib/gc-fitness/habit-schema";

export interface HabitTemplateFormProps {
  templateId: string;
  defaultValues?: Partial<HabitTemplateCreateInput>;
  onSubmit: (
    input: HabitTemplateCreateInput & { id: string },
  ) => Promise<{ id?: string }>;
  onAfterSubmit?: (result: { id?: string }) => void;
  hideCancelButton?: boolean;
}

function buildDefaults(
  passed?: Partial<HabitTemplateCreateInput>,
): HabitTemplateCreateInput {
  return {
    type: "binary",
    // Mirror a single-language record into both languages on LOAD so the coach
    // always sees existing content in their own language. Save-time
    // mirrorLocalizedBlank does the same on write. Both-blank stays both-blank.
    name: mirrorLocalizedBlank({
      en: passed?.name?.en ?? "",
      es: passed?.name?.es ?? "",
    }),
    description: mirrorLocalizedBlank(passed?.description),
    photoUrl: passed?.photoUrl,
    youtubeUrl: passed?.youtubeUrl,
    reminderTime: passed?.reminderTime,
    reminderEnabled: passed?.reminderEnabled ?? false,
    reminderCadence: passed?.reminderCadence ?? "daily",
    reminderWeekdays: passed?.reminderWeekdays,
    reminderDayOfMonth: passed?.reminderDayOfMonth,
    reminderMonthDays: passed?.reminderMonthDays,
    scheduleType: passed?.scheduleType ?? "recurring",
    startsOn: passed?.startsOn,
    endsOn: passed?.endsOn,
    scheduleCadence: passed?.scheduleCadence,
    scheduleWeekdays: passed?.scheduleWeekdays,
    scheduleDayOfMonth: passed?.scheduleDayOfMonth,
    scheduleMonthDays: passed?.scheduleMonthDays,
  };
}

export function HabitTemplateForm({
  templateId,
  defaultValues,
  onSubmit,
  onAfterSubmit,
  hideCancelButton,
}: HabitTemplateFormProps) {
  const t = useTranslations("habits.form");
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const locale = useLocale();
  const esPrimary = locale.startsWith("es");
  const primaryLang = esPrimary ? "es" : "en";
  const otherLang = esPrimary ? "en" : "es";
  // Coach-language-first: open translations only for an already-bilingual edit.
  const [showTranslations, setShowTranslations] = useState(
    hasDistinctTranslation(defaultValues?.name) ||
      hasDistinctTranslation(defaultValues?.description),
  );

  const form = useForm<HabitTemplateCreateInput>({
    resolver: zodResolver(habitTemplateCreateSchema as any) as unknown as any,
    defaultValues: buildDefaults(defaultValues),
    mode: "onSubmit",
  });

  const reminderEnabled = form.watch("reminderEnabled");

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      setSubmitError(null);
      try {
        const cleaned: HabitTemplateCreateInput = {
          type: "binary",
          // "No translation" ⇒ store the coach's text in every language.
          name: mirrorLocalizedBlank(values.name),
          reminderEnabled: values.reminderEnabled,
          photoUrl: values.photoUrl,
          youtubeUrl: values.youtubeUrl,
        };
        const descriptionEn = values.description?.en?.trim() ?? "";
        const descriptionEs = values.description?.es?.trim() ?? "";
        if (descriptionEn.length > 0 || descriptionEs.length > 0) {
          cleaned.description = {
            en: descriptionEn || descriptionEs,
            es: descriptionEs || descriptionEn,
          };
        }
        if (values.reminderEnabled && values.reminderTime) {
          cleaned.reminderTime = values.reminderTime;
        }
        const result = await onSubmit({ ...cleaned, id: templateId });
        toast.success(t("createdToast"));
        if (onAfterSubmit) {
          onAfterSubmit(result);
        }
      } catch (err) {
        console.error("[habit-template-form] save failed", err);
        const message = err instanceof Error ? err.message : t("saveFailed");
        setSubmitError(message);
        toast.error(message);
      }
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        {/* Single top-right translation toggle for the whole form. While
            hidden, localized fields show just the coach-language input. */}
        {!showTranslations ? (
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setShowTranslations(true)}
            >
              {t("addTranslation")}
            </Button>
          </div>
        ) : null}

        {/* Name — coach language first; optional translation. */}
        <LocalizedTextField
          form={form}
          base="name"
          primaryLang={primaryLang}
          otherLang={otherLang}
          showTranslation={showTranslations}
          plainLabel={t("nameLabel")}
          primaryLabel={esPrimary ? t("nameEs") : t("nameEn")}
          otherLabel={esPrimary ? t("nameEn") : t("nameEs")}
          placeholder={esPrimary ? t("namePlaceholderEs") : t("namePlaceholderEn")}
          requiredMessage={t("nameRequired")}
        />

        {/* Description (optional) — coach language first; optional translation. */}
        <LocalizedTextField
          form={form}
          base="description"
          primaryLang={primaryLang}
          otherLang={otherLang}
          showTranslation={showTranslations}
          plainLabel={t("descriptionLabel")}
          primaryLabel={esPrimary ? t("descriptionEs") : t("descriptionEn")}
          otherLabel={esPrimary ? t("descriptionEn") : t("descriptionEs")}
          placeholder={
            esPrimary
              ? t("descriptionPlaceholderEs")
              : t("descriptionPlaceholderEn")
          }
          hint={t("descriptionOptionalHint")}
          multiline
          rows={3}
        />

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
                    habitId={templateId}
                    value={field.value}
                    onUploaded={(gsPath) => field.onChange(gsPath)}
                    onRemoved={() => field.onChange(undefined)}
                  />
                </FormControl>
                <FormDescription>{t("photoHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            {t("scheduleHeading")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("scheduleSubtitle")}
          </p>
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <FormField
              control={form.control}
              name="reminderEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  </FormControl>
                  <div className="leading-none">
                    <FormLabel className="cursor-pointer">
                      {t("reminderToggleLabel")}
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />
            {reminderEnabled ? (
              <FormField
                control={form.control}
                name="reminderTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("reminderTimeLabel")}</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </div>
        </div>

        {submitError ? (
          <p className="text-sm text-destructive">{submitError}</p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
          {!hideCancelButton ? (
            <Button type="button" variant="outline" onClick={() => form.reset()}>
              {t("cancel")}
            </Button>
          ) : null}
        </div>
      </form>
    </Form>
  );
}
