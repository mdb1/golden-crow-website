"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { CommunityIconAvatar } from "@/components/community-icon-avatar";
import {
  ColorPaletteField,
  OptionSelectField,
} from "@/components/constrained-fields";
import { DeveloperRawEditor } from "@/components/developer-raw-editor";
import { UserVerificationCard } from "@/components/user-verification-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMUNITY_COLOR_OPTIONS,
  COMMUNITY_ICON_OPTIONS,
} from "@/lib/admin-option-catalog";
import {
  cloneDocumentData,
  parseCommunityUserRecord,
  setFieldLikeSource,
} from "@/lib/community-admin";
import { sdkFetch } from "@/lib/sdk-client";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { formatDateTime } from "@/lib/moderation-utils";

type EditableCommunityUserState = {
  username: string;
  email: string;
  isActivityPublic: boolean;
  isClinician: boolean;
  iconName: string;
  iconColorHex: string;
  ownedReports: string;
  totalLikes: string;
  postsCreated: string;
  totalReplies: string;
  aminoacidsCollected: string;
  lessonsLearned: string;
};

type CommunityUserFieldKey = "email" | "stats";

const COMMUNITY_USER_STAT_FIELDS: Array<{
  label: string;
  key:
    | "totalLikes"
    | "postsCreated"
    | "totalReplies"
    | "aminoacidsCollected"
    | "lessonsLearned";
}> = [
  { label: "Total likes", key: "totalLikes" },
  { label: "Posts created", key: "postsCreated" },
  { label: "Total replies", key: "totalReplies" },
  { label: "Amino acids collected", key: "aminoacidsCollected" },
  { label: "Lessons learned", key: "lessonsLearned" },
];

function toEditableState(document: ModerationDocumentRecord): EditableCommunityUserState {
  const communityUser = parseCommunityUserRecord(document);

  return {
    username: communityUser.username,
    email: communityUser.email,
    isActivityPublic: communityUser.isActivityPublic,
    isClinician: communityUser.isClinician,
    iconName: communityUser.iconName,
    iconColorHex: communityUser.iconColorHex,
    ownedReports: communityUser.ownedReports.join("\n"),
    totalLikes: String(communityUser.stats.totalLikes),
    postsCreated: String(communityUser.stats.postsCreated),
    totalReplies: String(communityUser.stats.totalReplies),
    aminoacidsCollected: String(communityUser.stats.aminoacidsCollected),
    lessonsLearned: String(communityUser.stats.lessonsLearned),
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseIntegerInput(value: string) {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseListInput(value: string) {
  return [...new Set(value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean))];
}

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function CommunityUserWorkbench({
  document,
}: {
  document: ModerationDocumentRecord;
}) {
  const router = useRouter();
  const [sourceDocument, setSourceDocument] = useState(document);
  const [state, setState] = useState<EditableCommunityUserState>(() =>
    toEditableState(document)
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<CommunityUserFieldKey, string>>
  >({});
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const communityUser = useMemo(
    () => parseCommunityUserRecord(sourceDocument),
    [sourceDocument]
  );
  const sourceState = useMemo(() => toEditableState(sourceDocument), [sourceDocument]);

  const statsDraft = useMemo(
    () => ({
      totalLikes: parseIntegerInput(state.totalLikes),
      postsCreated: parseIntegerInput(state.postsCreated),
      totalReplies: parseIntegerInput(state.totalReplies),
      aminoacidsCollected: parseIntegerInput(state.aminoacidsCollected),
      lessonsLearned: parseIntegerInput(state.lessonsLearned),
    }),
    [
      state.aminoacidsCollected,
      state.lessonsLearned,
      state.postsCreated,
      state.totalLikes,
      state.totalReplies,
    ]
  );

  const changedFields = useMemo(() => {
    const changes: string[] = [];
    if (state.username.trim() !== sourceState.username.trim()) changes.push("username");
    if (state.email.trim() !== sourceState.email.trim()) changes.push("email");
    if (state.isActivityPublic !== sourceState.isActivityPublic) {
      changes.push("is_activity_public");
    }
    if (state.isClinician !== sourceState.isClinician) changes.push("is_clinician");
    if (state.iconName.trim() !== sourceState.iconName.trim()) changes.push("iconName");
    if (state.iconColorHex.trim() !== sourceState.iconColorHex.trim()) {
      changes.push("iconColorHex");
    }
    if (parseListInput(state.ownedReports).join("|") !== parseListInput(sourceState.ownedReports).join("|")) {
      changes.push("owned_reports");
    }
    if (state.totalLikes.trim() !== sourceState.totalLikes.trim()) changes.push("stats.total_likes");
    if (state.postsCreated.trim() !== sourceState.postsCreated.trim()) changes.push("stats.posts_created");
    if (state.totalReplies.trim() !== sourceState.totalReplies.trim()) changes.push("stats.total_replies");
    if (state.aminoacidsCollected.trim() !== sourceState.aminoacidsCollected.trim()) {
      changes.push("stats.aminoacids_collected");
    }
    if (state.lessonsLearned.trim() !== sourceState.lessonsLearned.trim()) {
      changes.push("stats.lessons_learned");
    }
    return changes;
  }, [sourceState, state]);

  const validationMessage = useMemo(() => {
    if (state.email.trim() && !isValidEmail(state.email.trim())) {
      return "Enter a valid community-user email.";
    }

    if (Object.values(statsDraft).some((value) => value === null)) {
      return "Stats fields must be whole numbers greater than or equal to zero.";
    }

    return null;
  }, [state.email, statsDraft]);

  async function handleSave() {
    if (validationMessage) {
      setFieldErrors({
        email:
          state.email.trim() && !isValidEmail(state.email.trim())
            ? "Enter a valid email."
            : undefined,
        stats: Object.values(statsDraft).some((value) => value === null)
          ? "Use whole numbers only."
          : undefined,
      });
      setToast({
        id: Date.now(),
        tone: "error",
        message: validationMessage,
      });
      return;
    }

    setPending(true);
    setFieldErrors({});

    try {
      const payload = cloneDocumentData(communityUser.sourceData);
      setFieldLikeSource(payload, communityUser.sourceData, "username", toNullableString(state.username));
      setFieldLikeSource(payload, communityUser.sourceData, "email", toNullableString(state.email));
      setFieldLikeSource(
        payload,
        communityUser.sourceData,
        "is_activity_public",
        state.isActivityPublic
      );
      setFieldLikeSource(payload, communityUser.sourceData, "is_clinician", state.isClinician);
      setFieldLikeSource(payload, communityUser.sourceData, "iconName", toNullableString(state.iconName), [
        "icon_name",
      ]);
      setFieldLikeSource(
        payload,
        communityUser.sourceData,
        "iconColorHex",
        toNullableString(state.iconColorHex),
        ["icon_color_hex"]
      );
      setFieldLikeSource(
        payload,
        communityUser.sourceData,
        "owned_reports",
        parseListInput(state.ownedReports)
      );
      setFieldLikeSource(
        payload,
        communityUser.sourceData,
        "stats.total_likes",
        statsDraft.totalLikes ?? 0
      );
      setFieldLikeSource(
        payload,
        communityUser.sourceData,
        "stats.posts_created",
        statsDraft.postsCreated ?? 0
      );
      setFieldLikeSource(
        payload,
        communityUser.sourceData,
        "stats.total_replies",
        statsDraft.totalReplies ?? 0
      );
      setFieldLikeSource(
        payload,
        communityUser.sourceData,
        "stats.aminoacids_collected",
        statsDraft.aminoacidsCollected ?? 0
      );
      setFieldLikeSource(
        payload,
        communityUser.sourceData,
        "stats.lessons_learned",
        statsDraft.lessonsLearned ?? 0
      );
      setFieldLikeSource(payload, communityUser.sourceData, "updatedAt", new Date().toISOString());

      const response = await sdkFetch<{ document: ModerationDocumentRecord }>(
        `/moderation/community_users/${communityUser.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ data: payload }),
        }
      );

      setSourceDocument(response.document);
      setState(toEditableState(response.document));
      setToast({
        id: Date.now(),
        tone: "success",
        message: "Community user changes saved.",
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Unable to save the community user record.",
      });
    } finally {
      setPending(false);
    }
  }

  const ownedReportIds = parseListInput(state.ownedReports);

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/collections/community_users">Back to community users</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/users/${communityUser.id}`}>Open account</Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{communityUser.id}</span>
      </div>

      <UserVerificationCard
        uid={communityUser.id}
        title={
          state.username.trim() ||
          state.email.trim() ||
          communityUser.username ||
          communityUser.email ||
          communityUser.id
        }
        fallbackEmail={state.email.trim() || communityUser.email}
        leading={
          <CommunityIconAvatar
            iconName={state.iconName}
            iconColorHex={state.iconColorHex}
            size="md"
          />
        }
      />

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Community</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              Community user workbench
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Edit community identity, visibility flags, clinician state, owned
              report links, and lightweight engagement stats from one screen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setState(sourceState);
                setFieldErrors({});
              }}
              disabled={changedFields.length === 0}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={pending || changedFields.length === 0}
            >
              <Save className="h-3.5 w-3.5" />
              {pending ? "Saving..." : "Save community user"}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="community-username">Username</Label>
              <Input
                id="community-username"
                value={state.username}
                onChange={(event) =>
                  setState((current) => ({ ...current, username: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="community-email">Email</Label>
              <Input
                id="community-email"
                type="email"
                value={state.email}
                aria-invalid={Boolean(fieldErrors.email)}
                onChange={(event) =>
                  setState((current) => ({ ...current, email: event.target.value }))
                }
              />
              {fieldErrors.email ? (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="community-icon-name">Icon name</Label>
              <OptionSelectField
                options={COMMUNITY_ICON_OPTIONS}
                value={state.iconName}
                onChange={(iconName) =>
                  setState((current) => ({ ...current, iconName }))
                }
                placeholder="Select icon"
                emptyLabel="No icon"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="community-icon-color">Icon color</Label>
              <ColorPaletteField
                colors={COMMUNITY_COLOR_OPTIONS}
                value={state.iconColorHex}
                onChange={(iconColorHex) =>
                  setState((current) => ({ ...current, iconColorHex }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="community-owned-reports">Owned uploaded report ids</Label>
              <Textarea
                id="community-owned-reports"
                value={state.ownedReports}
                rows={4}
                onChange={(event) =>
                  setState((current) => ({ ...current, ownedReports: event.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                One uploaded report id per line or separated by commas.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 md:col-span-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Flags
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "Activity public",
                    checked: state.isActivityPublic,
                    onChange: (checked: boolean) =>
                      setState((current) => ({ ...current, isActivityPublic: checked })),
                  },
                  {
                    label: "Clinician",
                    checked: state.isClinician,
                    onChange: (checked: boolean) =>
                      setState((current) => ({ ...current, isClinician: checked })),
                  },
                ].map((toggle) => (
                  <label
                    key={toggle.label}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-card/50 px-3 py-2"
                  >
                    <span className="text-sm text-foreground">{toggle.label}</span>
                    <input
                      type="checkbox"
                      checked={toggle.checked}
                      onChange={(event) => toggle.onChange(event.target.checked)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 md:col-span-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Stats
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {COMMUNITY_USER_STAT_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <Input
                      id={field.key}
                      inputMode="numeric"
                      aria-invalid={Boolean(fieldErrors.stats)}
                      value={state[field.key]}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              {fieldErrors.stats ? (
                <p className="mt-3 text-xs text-destructive">{fieldErrors.stats}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Changed fields
              </p>
              {changedFields.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
                  {changedFields.map((field) => (
                    <li key={field} className="font-mono text-xs">
                      {field}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No pending changes.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Related actions
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {[
                  {
                    href: `/users/${communityUser.id}`,
                    label: "Open account workbench",
                    description: "Edit the linked auth account and private profile.",
                  },
                  {
                    href: `/collections/public_profiles/${communityUser.id}`,
                    label: "Open public profile",
                    description: "Moderate the linked community-facing profile.",
                  },
                  {
                    href: `/collections/report_owners/${communityUser.id}`,
                    label: "Open report owner",
                    description: "Review the clinician/report-owner profile for this user.",
                  },
                  {
                    href: `/learning/users/${communityUser.id}`,
                    label: "Open learning progress",
                    description: "Inspect the linked learning progress state.",
                  },
                  {
                    href: `/collections/community_users/${communityUser.id}?raw=1`,
                    label: "Open full raw page",
                    description: "Use this when you need nested activity events in the raw page.",
                  },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">{link.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Owned uploaded reports
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {ownedReportIds.length > 0 ? (
                  ownedReportIds.map((reportId) => (
                    <Link
                      key={reportId}
                      href={`/reports/uploads/${reportId}`}
                      className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 font-mono text-xs transition-colors hover:border-primary/35"
                    >
                      {reportId}
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No owned uploaded reports listed.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Record metadata
              </p>
              <dl className="mt-3 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Community user id</dt>
                  <dd className="font-mono text-xs text-foreground">{communityUser.id}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="text-foreground">
                    {formatDateTime(communityUser.updatedAt) ?? "No timestamp"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <DeveloperRawEditor
        collectionKey="community_users"
        document={sourceDocument}
        relatedLinks={[
          {
            label: "Auth user",
            href: `/users/${communityUser.id}`,
            description: "Open the linked auth account and private profile workbench.",
          },
          {
            label: "Public profile",
            href: `/collections/public_profiles/${communityUser.id}`,
            description: "Open the linked public profile.",
          },
        ]}
        backHref="/collections/community_users"
        backLabel="Back to community users"
        deleteHref={`/moderation/community_users/${communityUser.id}`}
        updateHref={`/moderation/community_users/${communityUser.id}`}
        title="Developer raw community-user editor"
        description="Use this only when you need direct JSON control or access to nested event moderation on the full raw page."
      />
    </div>
  );
}
