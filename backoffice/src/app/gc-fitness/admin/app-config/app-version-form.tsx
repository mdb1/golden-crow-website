"use client";

// app-version-form.tsx
//
// Admin-only editor for the mobile force-update gate (`/app_config/mobile`).
// Submits via the `updateAppVersionConfig` Server Action, which owns the
// authoritative Zod validation + Admin gate. This form mirrors the same schema
// for early client-side error surfacing (same pattern as quick-replies-form).
//
// `minBuild` is THE gate: the apps compare it against their native build
// (iOS CFBundleVersion / Android versionCode). Bumping it above a shipped
// build's number blocks that build at launch with a non-dismissable update
// screen. `0` disables the gate for the platform. `latestVersion` + `storeUrl`
// are display / deep-link only.
//
// English literals (no next-intl): the whole Admin Console is English-only,
// unlike the trainer Settings surface.

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  updateAppVersionConfig,
  type AppVersionConfig,
} from "@/lib/gc-fitness/admin-actions";

type Translate = (key: "wholeNumber" | "notNegative" | "tooLarge" | "dottedVersion" | "httpUrl") => string;

// Built per render so the validation copy follows the admin's locale (#497).
function makeFormSchema(tv: Translate) {
  const platformSchema = z.object({
    minBuild: z.coerce
      .number()
      .int(tv("wholeNumber"))
      .min(0, tv("notNegative"))
      .max(2_147_483_647, tv("tooLarge")),
    latestVersion: z
      .string()
      .trim()
      .max(20)
      .refine((v) => v === "" || /^\d+(\.\d+){0,3}$/.test(v), {
        message: tv("dottedVersion"),
      }),
    storeUrl: z
      .string()
      .trim()
      .max(300)
      .refine((v) => v === "" || /^https?:\/\//i.test(v), {
        message: tv("httpUrl"),
      }),
  });
  return z.object({
    ios: platformSchema,
    android: platformSchema,
  });
}

export interface AppVersionFormProps {
  initialConfig: AppVersionConfig;
  /** The admin's IANA zone, resolved server-side (#747). */
  timezone: string;
}

const PLATFORMS = [
  {
    key: "ios" as const,
    label: "iOS",
    storePlaceholder: "https://apps.apple.com/app/id000000000",
  },
  {
    key: "android" as const,
    label: "Android",
    storePlaceholder: "https://play.google.com/store/apps/details?id=com.goldencrow.fitness",
  },
];

export function AppVersionForm({ initialConfig, timezone }: AppVersionFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = useTranslations("admin.appConfig.form");
  const tv = useTranslations("admin.appConfig.validation");
  const locale = useLocale();
  const formSchema = useMemo(
    () =>
      makeFormSchema((key) => {
        switch (key) {
          case "wholeNumber":
            return tv("wholeNumber");
          case "notNegative":
            return tv("notNegative");
          case "tooLarge":
            return tv("tooLarge");
          case "dottedVersion":
            return tv("dottedVersion");
          case "httpUrl":
            return tv("httpUrl");
        }
      }),
    [tv],
  );

  const form = useForm({
    // Input (number field gives a string) vs output (coerced number) types
    // differ — same `as any` escape hatch quick-replies-form uses.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema as any) as unknown as any,
    defaultValues: {
      ios: {
        minBuild: initialConfig.ios.minBuild,
        latestVersion: initialConfig.ios.latestVersion,
        storeUrl: initialConfig.ios.storeUrl,
      },
      android: {
        minBuild: initialConfig.android.minBuild,
        latestVersion: initialConfig.android.latestVersion,
        storeUrl: initialConfig.android.storeUrl,
      },
    },
    mode: "onSubmit",
  });

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      try {
        await updateAppVersionConfig(values);
        toast.success(t("saved"));
        router.refresh();
      } catch (err) {
        console.error("[app-version-form] save failed", err);
        const message =
          err instanceof Error ? err.message : t("saveFailed");
        toast.error(message);
      }
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-6">
        {PLATFORMS.map((platform) => (
          <Card key={platform.key}>
            <CardHeader>
              <CardTitle className="text-lg">{platform.label}</CardTitle>
              <CardDescription>{t("platformDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name={`${platform.key}.minBuild` as const}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("minBuild")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {platform.key === "ios" ? t("buildHintIos") : t("buildHintAndroid")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${platform.key}.latestVersion` as const}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("latestVersion")}</FormLabel>
                    <FormControl>
                      <Input placeholder="1.2.0" {...field} />
                    </FormControl>
                    <FormDescription>{t("latestVersionHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${platform.key}.storeUrl` as const}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("storeUrl")}</FormLabel>
                    <FormControl>
                      <Input placeholder={platform.storePlaceholder} {...field} />
                    </FormControl>
                    <FormDescription>{t("storeUrlHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        ))}

        <div className="flex items-center justify-end gap-3">
          {initialConfig.updatedAtISO ? (
            <span className="text-xs text-muted-foreground">
              {t("lastUpdated", {
                date: new Date(initialConfig.updatedAtISO).toLocaleString(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: timezone,
                }),
              })}
              {initialConfig.updatedBy ? ` ${t("updatedBy", { email: initialConfig.updatedBy })}` : ""}
            </span>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
