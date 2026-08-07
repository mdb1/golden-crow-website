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
import {
  formatAppDevice,
  type ClientAppDevice,
} from "@/lib/gc-fitness/client-app-devices";
import { ArrowLeft, Calendar, LineChart, MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";

export interface ClientHeaderProps {
  clientId: string;
  displayName: string;
  appDisplayName: string;
  email: string;
  photoURL: string | null;
  coachNickname: string | null;
  birthDate: string | null;
  heightCm?: number | null;
  bodyWeightKg?: number | null;
  /**
   * #785 — which app build(s) the client is on, one badge per device. Read from
   * the push-token subcollection every signed-in device writes; empty for a
   * client who has never opened the app.
   */
  appDevices?: ClientAppDevice[];
}

export function ClientHeader({
  clientId,
  displayName,
  appDisplayName,
  email,
  photoURL,
  coachNickname,
  birthDate,
  heightCm,
  bodyWeightKg,
  appDevices = [],
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
  const cleanDisplayName = displayName.trim();
  const cleanAppDisplayName = appDisplayName.trim();
  const headerDisplayName =
    cleanAppDisplayName && cleanAppDisplayName !== cleanDisplayName
      ? `${cleanDisplayName} (${cleanAppDisplayName})`
      : cleanDisplayName;
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
          {/* Issue #193 — iOS-uploaded photos are BARE Storage paths
              ("profile_photos/{uid}/avatar.jpg"); a raw <AvatarImage> can't
              load them. ClientAvatar routes non-https values through
              /api/gc-fitness/storage-image (same as the roster + calendar,
              which is why those surfaces worked and this one didn't). */}
          <ClientAvatar name={displayName} photoURL={photoURL} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="gc-page-title text-[1.7rem] leading-tight sm:text-3xl">
              {headerDisplayName}
            </h1>
            {email && email !== displayName ? (
              <p className="text-sm text-muted-foreground">{email}</p>
            ) : null}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {coachNickname ? (
                <Badge variant="secondary">
                  {t("coachNicknameLabel", { value: coachNickname })}
                </Badge>
              ) : null}
              {birthDate ? (
                <Badge variant="outline">
                  {t("birthDateLabel", { value: birthDate })}
                </Badge>
              ) : null}
              <Badge variant="outline">
                {t("heightLabel", { value: heightValue })}
              </Badge>
              <Badge variant="outline">
                {t("weightLabel", { value: weightValue })}
              </Badge>
              {appDevices.map((device, index) => (
                <Badge
                  key={`${device.platform}-${device.appVersion ?? "?"}-${index}`}
                  variant="outline"
                >
                  {formatAppDevice(device)}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild className="rounded-full">
            <Link href={`/gc-fitness/clients/${clientId}/progress`}>
              <LineChart className="size-4" />
              {t("openExerciseProgress")}
            </Link>
          </Button>
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
