"use client";

import Link from "next/link";
import { ArrowRight, PlusCircle, ShieldUser } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { appText } from "@/lib/language";

export function AreaAccessEntry({
  accessHref,
  createHref,
  canCreate = true,
  accessLabel = "Visualize access permissions",
  createLabel = "Add new record",
  createDisabledTitle = "The current role cannot create records on this screen.",
  title = "Primary actions",
  description,
}: {
  accessHref: string;
  createHref?: string;
  canCreate?: boolean;
  accessLabel?: string;
  createLabel?: string;
  createDisabledTitle?: string;
  title?: string;
  description: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <section className="glass-panel flex flex-col gap-4 px-5 py-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-primary">
          <ShieldUser className="h-4 w-4" />
          <p className="section-eyebrow">{t("Access")}</p>
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold text-foreground">{t(title)}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t(description)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <Button
          variant="outline"
          size="lg"
          className="h-auto flex-1 justify-between rounded-2xl px-5 py-5 text-left text-base"
          asChild
        >
          <Link href={accessHref}>
            <span className="flex items-center gap-2">
              <ShieldUser className="h-4 w-4" />
              {t(accessLabel)}
            </span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

        {canCreate && createHref ? (
          <Button
            size="lg"
            className="h-auto flex-1 justify-between rounded-2xl px-5 py-5 text-left text-base"
            asChild
          >
            <Link href={createHref}>
              <span className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                {t(createLabel)}
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button
            size="lg"
            variant="outline"
            className="h-auto flex-1 justify-between rounded-2xl px-5 py-5 text-left text-base"
            disabled
            title={t(createDisabledTitle)}
          >
            <span className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              {t(createLabel)}
            </span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </section>
  );
}
