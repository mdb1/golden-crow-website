import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  getAppVersionConfig,
  type AppVersionConfig,
} from "@/lib/gc-fitness/admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { AppVersionForm } from "./app-version-form";

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

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title="App Version"
        subtitle="Set the minimum supported app build per platform. Clients on an older build are forced to update before they can use the app."
      />

      <Link
        href="/gc-fitness/admin"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Admin Console
      </Link>

      <AppVersionForm initialConfig={config} />
    </div>
  );
}
