"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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
          name: values.name,
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
