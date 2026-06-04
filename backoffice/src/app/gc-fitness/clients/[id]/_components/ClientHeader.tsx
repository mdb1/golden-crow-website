// ClientHeader.tsx — Per-client deep view header. P11-07.
//
// Composition: avatar + displayName + email on the left; NudgeButton +
// two quick-action buttons on the right. Wraps to the next row on
// narrow viewports via `flex-wrap`.
//
// Re-uses NudgeButton from P10-08 verbatim (Pitfall 7 — same-source-of-
// truth). NudgeButton itself is `"use client"` because it renders a
// Dialog + form; that boundary cascades into THIS component, so the
// file must also be a Client Component to satisfy the React Server
// Component → Client Component import rule.
//
// Route placement note: NudgeButton lives at the flat path
// `/gc-fitness/chat/_components/NudgeButton.tsx` (Rule 4 inheritance —
// see page.tsx header note). The plan frontmatter referenced the
// `(dashboard)/` path that 11-03 deferred; we use the actual existing
// path via the `@/` alias to avoid coupling to relative-path depth.

"use client";

import Link from "next/link";
import { ArrowLeft, Calendar, MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ClientHeaderProps {
  clientId: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  heightCm?: number | null;
  bodyWeightKg?: number | null;
}

export function ClientHeader({
  clientId,
  displayName,
  email,
  photoURL,
  heightCm,
  bodyWeightKg,
}: ClientHeaderProps) {
  const t = useTranslations("clients.detail");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const heightValue =
    typeof heightCm === "number" ? `${heightCm.toFixed(1)} cm` : tCommon("emDash");
  const weightValue =
    typeof bodyWeightKg === "number"
      ? `${bodyWeightKg.toFixed(1)} kg`
      : tCommon("emDash");
  const initials = displayName
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/gc-fitness/clients"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {tNav("clients")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {photoURL ? <AvatarImage src={photoURL} alt={displayName} /> : null}
            <AvatarFallback>{initials || "?"}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="gc-page-title text-[1.7rem] leading-tight sm:text-3xl">
              {displayName}
            </h1>
            {email ? (
              <p className="text-sm text-muted-foreground">{email}</p>
            ) : null}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {t("heightLabel", { value: heightValue })}
              </Badge>
              <Badge variant="outline">
                {t("weightLabel", { value: weightValue })}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild className="rounded-full">
            <Link href={`/gc-fitness/chat?clientId=${clientId}`}>
              <MessagesSquare className="size-4" />
              {t("openChat")}
            </Link>
          </Button>
          <Button variant="outline" asChild className="rounded-full">
            <Link href={`/gc-fitness/schedule?clientIds=${clientId}`}>
              <Calendar className="size-4" />
              {t("openInCalendar")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
