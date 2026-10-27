"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { CommunityIconAvatar } from "@/components/community-icon-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  parseCommunityUserRecord,
  parsePublicProfileRecord,
} from "@/lib/community-admin";
import { appText } from "@/lib/language";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

type ModerationDocumentResponse = {
  document: ModerationDocumentRecord;
};

async function loadModerationDocument(
  collection: "community_users" | "public_profiles",
  documentId: string,
) {
  const path = `/moderation/${collection}/${encodeURIComponent(documentId)}`;

  try {
    const response = await sdkFetch<ModerationDocumentResponse>(path);
    return response.document;
  } catch (error) {
    if (error instanceof SdkRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

function ReadOnlyValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? "break-all font-mono text-sm text-foreground"
            : "break-words text-sm font-medium text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function formatUpdatedAt(
  value: string | undefined,
  language: "en" | "es",
  fallback: string,
) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function RequesterCommunityUserDialog({ userId }: { userId: string }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [open, setOpen] = useState(false);
  const normalizedUserId = userId.trim();

  const communityUserQuery = useQuery({
    queryKey: ["support-service-requester", "community_users", normalizedUserId],
    queryFn: () =>
      loadModerationDocument("community_users", normalizedUserId),
    enabled: Boolean(normalizedUserId),
    retry: false,
  });
  const communityUser = useMemo(
    () =>
      communityUserQuery.data
        ? parseCommunityUserRecord(communityUserQuery.data)
        : null,
    [communityUserQuery.data],
  );

  const publicProfileQuery = useQuery({
    queryKey: ["support-service-requester", "public_profiles", normalizedUserId],
    queryFn: () => loadModerationDocument("public_profiles", normalizedUserId),
    enabled: open && Boolean(communityUser),
    retry: false,
  });
  const publicProfile = useMemo(
    () =>
      publicProfileQuery.data
        ? parsePublicProfileRecord(publicProfileQuery.data)
        : null,
    [publicProfileQuery.data],
  );

  if (!communityUser) {
    return null;
  }

  const unavailable = t("Not available");
  const valueOrFallback = (value: string) => value || unavailable;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="shrink-0"
      >
        <UserRound className="h-4 w-4" />
        {t("Open")}
      </Button>

      <DialogContent
        className="w-[min(calc(100vw-2rem),64rem)] max-w-none sm:max-w-none"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
            <CommunityIconAvatar
              iconName={communityUser.iconName}
              iconColorHex={communityUser.iconColorHex}
              size="lg"
            />
            <div className="min-w-0">
              <DialogTitle>{t("Community user details")}</DialogTitle>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {normalizedUserId}
              </p>
            </div>
          </div>
          <DialogDescription>
            {t(
              "Read-only information from the community user and public profile records.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border/80 bg-muted/25 p-4">
            <h3 className="text-base font-semibold text-foreground">
              {t("Community user")}
            </h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <ReadOnlyValue
                label={t("User ID")}
                value={normalizedUserId}
                mono
              />
              <ReadOnlyValue
                label={t("Username")}
                value={valueOrFallback(communityUser.username)}
              />
              <ReadOnlyValue
                label={t("Email")}
                value={valueOrFallback(communityUser.email)}
              />
              <ReadOnlyValue
                label={t("Public activity")}
                value={communityUser.isActivityPublic ? t("Yes") : t("No")}
              />
              <ReadOnlyValue
                label={t("Clinician")}
                value={communityUser.isClinician ? t("Yes") : t("No")}
              />
              <ReadOnlyValue
                label={t("Owned reports")}
                value={communityUser.ownedReports.length}
              />
              <ReadOnlyValue
                label={t("Updated")}
                value={formatUpdatedAt(
                  communityUser.updatedAt,
                  language,
                  unavailable,
                )}
              />
            </dl>

            <h4 className="mt-5 text-sm font-semibold text-foreground">
              {t("Community statistics")}
            </h4>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <ReadOnlyValue
                label={t("Total likes")}
                value={communityUser.stats.totalLikes}
              />
              <ReadOnlyValue
                label={t("Posts created")}
                value={communityUser.stats.postsCreated}
              />
              <ReadOnlyValue
                label={t("Total replies")}
                value={communityUser.stats.totalReplies}
              />
              <ReadOnlyValue
                label={t("Amino acids collected")}
                value={communityUser.stats.aminoacidsCollected}
              />
              <ReadOnlyValue
                label={t("Lessons learned")}
                value={communityUser.stats.lessonsLearned}
              />
            </dl>
          </section>

          <section className="rounded-2xl border border-border/80 bg-muted/25 p-4">
            <h3 className="text-base font-semibold text-foreground">
              {t("Public profile")}
            </h3>
            {publicProfileQuery.isLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("Loading public profile...")}
              </p>
            ) : publicProfileQuery.isError ? (
              <p className="mt-3 text-sm text-destructive">
                {t("The public profile could not be loaded.")}
              </p>
            ) : publicProfile ? (
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <ReadOnlyValue
                  label={t("Full name")}
                  value={valueOrFallback(publicProfile.fullName)}
                />
                <ReadOnlyValue
                  label={t("Username")}
                  value={valueOrFallback(publicProfile.username)}
                />
                <ReadOnlyValue
                  label={t("Email")}
                  value={valueOrFallback(publicProfile.email)}
                />
                <ReadOnlyValue
                  label={t("Gender")}
                  value={valueOrFallback(publicProfile.gender)}
                />
                <ReadOnlyValue
                  label={t("Condition")}
                  value={valueOrFallback(publicProfile.condition)}
                />
                <ReadOnlyValue
                  label={t("Profile image")}
                  value={publicProfile.hasProfileImage ? t("Yes") : t("No")}
                />
                <ReadOnlyValue
                  label={t("Updated")}
                  value={formatUpdatedAt(
                    publicProfile.updatedAt,
                    language,
                    unavailable,
                  )}
                />
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {t(
                  "No public profile is available for this community user.",
                )}
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("Close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
