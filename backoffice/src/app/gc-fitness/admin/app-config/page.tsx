import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  getAppVersionConfig,
  type AppVersionConfig,
} from "@/lib/gc-fitness/admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { AppVersionForm } from "./app-version-form";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

// Tab title: "Corvo - <adminPanel>" (issue #170).
export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

const EMPTY_CONFIG: AppVersionConfig = {
  ios: { minBuild: 0, latestVersion: "", storeUrl: "" },
  android: { minBuild: 0, latestVersion: "", storeUrl: "" },
  updatedAtISO: null,
  updatedBy: null,
};

export default async function AppConfigPage() {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  // The Admin gate above already ran; if the read itself fails (e.g. the doc
  // has never been written) fall back to zeroed defaults so the form still
  // renders — the gate is simply "off" (minBuild 0) until first save.
  let config: AppVersionConfig;
  try {
    config = await getAppVersionConfig();
  } catch {
    config = EMPTY_CONFIG;
  }

  const t = await getTranslations("admin.appConfig");

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <Link
        href="/gc-fitness/admin"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("back")}
      </Link>

      <AppVersionForm initialConfig={config} timezone={await getTrainerTimezone()} />
    </div>
  );
}
