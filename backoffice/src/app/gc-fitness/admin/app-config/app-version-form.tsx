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

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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

const platformSchema = z.object({
  minBuild: z.coerce
    .number()
    .int("Enter a whole number.")
    .min(0, "Cannot be negative.")
    .max(2_147_483_647, "Too large."),
  latestVersion: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || /^\d+(\.\d+){0,3}$/.test(v), {
      message: "Use a dotted version like 1.2.0 (or leave blank).",
    }),
  storeUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), {
      message: "Must be an http(s) URL (or leave blank).",
    }),
});

const formSchema = z.object({
  ios: platformSchema,
  android: platformSchema,
});

export interface AppVersionFormProps {
  initialConfig: AppVersionConfig;
  /** The admin's IANA zone, resolved server-side (#747). */
  timezone: string;
}

const PLATFORMS = [
  {
    key: "ios" as const,
    label: "iOS",
    buildHint: "Minimum CFBundleVersion (build number). Builds below this are blocked.",
    storePlaceholder: "https://apps.apple.com/app/id000000000",
  },
  {
    key: "android" as const,
    label: "Android",
    buildHint: "Minimum versionCode. Builds below this are blocked. Leave 0 until Android ships.",
    storePlaceholder: "https://play.google.com/store/apps/details?id=com.goldencrow.fitness",
  },
];

export function AppVersionForm({ initialConfig, timezone }: AppVersionFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
        toast.success("App version requirements saved.");
        router.refresh();
      } catch (err) {
        console.error("[app-version-form] save failed", err);
        const message =
          err instanceof Error ? err.message : "Could not save. Try again.";
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
              <CardDescription>
                Clients on a build below the minimum see a non-dismissable
                update screen at launch.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name={`${platform.key}.minBuild` as const}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum build</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{platform.buildHint}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${platform.key}.latestVersion` as const}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latest version</FormLabel>
                    <FormControl>
                      <Input placeholder="1.2.0" {...field} />
                    </FormControl>
                    <FormDescription>
                      Shown in the update message (display-only).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${platform.key}.storeUrl` as const}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store URL</FormLabel>
                    <FormControl>
                      <Input placeholder={platform.storePlaceholder} {...field} />
                    </FormControl>
                    <FormDescription>
                      Opened by the update button.
                    </FormDescription>
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
              Last updated{" "}
              {new Date(initialConfig.updatedAtISO).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: timezone,
              })}
              {initialConfig.updatedBy ? ` by ${initialConfig.updatedBy}` : ""}
            </span>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
