"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AreaAccessMatrix } from "@/components/area-access-matrix";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
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
      <HeaderUnclutterScope
        header={
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
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {t(backLabel)}
            </Link>
          </Button>
        </div>
        <AreaAccessMatrix
          title={matrixTitle}
          description={matrixDescription}
          entries={entries}
          highlightRole={highlightRole}
          compact
          hideDescription
        />
      </HeaderUnclutterScope>
    </div>
  );
}
