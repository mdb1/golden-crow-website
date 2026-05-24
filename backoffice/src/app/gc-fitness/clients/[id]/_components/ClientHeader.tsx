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
import { Calendar, MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
    <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {photoURL ? <AvatarImage src={photoURL} alt={displayName} /> : null}
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-0.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {displayName}
          </h1>
          {email ? (
            <p className="text-sm text-muted-foreground">{email}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{t("heightLabel", { value: heightValue })}</span>
            <span>{t("weightLabel", { value: weightValue })}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/gc-fitness/chat?clientId=${clientId}`}>
            <MessagesSquare className="size-4" />
            {t("openChat")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/gc-fitness/schedule?clientId=${clientId}`}>
            <Calendar className="size-4" />
            {t("assignWorkout")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
