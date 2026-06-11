"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AreaAccessMatrix } from "@/components/area-access-matrix";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { useAppLanguage } from "@/components/app-language-provider";
import { appText } from "@/lib/language";
import type { AdminRole } from "@/lib/admin-areas";
import type { RoleAccessSpec } from "@/lib/two-pq-dashboard";

export function AreaAccessScreen({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  matrixTitle,
  matrixDescription,
  entries,
  highlightRole,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  matrixTitle: string;
  matrixDescription: string;
  entries: RoleAccessSpec[];
  highlightRole: AdminRole;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={t(eyebrow)}
        title={t(title)}
        description={t(description)}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {t(backLabel)}
            </Link>
          </Button>
        }
      />
      <HelperBanner title={t("This screen isolates access from the live browser.")} tone="blue">
        {t("Review the current CRUD boundary here first, then return to the main area when you want to open or edit a specific record.")}
      </HelperBanner>
      <AreaAccessMatrix
        title={matrixTitle}
        description={matrixDescription}
        entries={entries}
        highlightRole={highlightRole}
        compact
      />
    </div>
  );
}
