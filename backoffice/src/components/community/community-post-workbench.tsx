"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Save } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { CommunityTagPill } from "@/components/community-tag-pill";
import {
  ColorPaletteField,
  MultiValuePickerField,
  OptionSelectField,
} from "@/components/constrained-fields";
import { DeveloperRawEditor } from "@/components/developer-raw-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMUNITY_CATEGORY_OPTIONS,
  COMMUNITY_COLOR_OPTIONS,
  COMMUNITY_ICON_OPTIONS,
  getCommunityTagOptions,
} from "@/lib/admin-option-catalog";
import {
  cloneDocumentData,
  parseCommunityPostRecord,
  setFieldLikeSource,
} from "@/lib/community-admin";
import { sdkFetch } from "@/lib/sdk-client";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { formatDateTime } from "@/lib/moderation-utils";

type EditableCommunityPostState = {
  title: string;
  body: string;
  community: string;
  tags: string[];
  authorId: string;
  authorEmail: string;
  authorIconName: string;
  authorIconColorHex: string;
  commentCount: string;
  upvotes: string;
  downvotes: string;
  score: string;
};

type CommunityPostFieldKey =
  | "title"
  | "body"
  | "authorEmail"
  | "authorIconColorHex"
  | "counts";

const COMMUNITY_POST_COUNTER_FIELDS: Array<{
  label: string;
  key: "commentCount" | "upvotes" | "downvotes" | "score";
}> = [
  { label: "Comment count", key: "commentCount" },
  { label: "Upvotes", key: "upvotes" },
  { label: "Downvotes", key: "downvotes" },
  { label: "Score", key: "score" },
];

function toEditableState(document: ModerationDocumentRecord): EditableCommunityPostState {
  const post = parseCommunityPostRecord(document);

  return {
    title: post.title,
    body: post.body,
    community: post.community,
    tags: post.tags,
    authorId: post.authorId,
    authorEmail: post.authorEmail,
    authorIconName: post.authorIconName,
    authorIconColorHex: post.authorIconColorHex,
    commentCount: String(post.commentCount),
    upvotes: String(post.upvotes),
    downvotes: String(post.downvotes),
    score: String(post.score),
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseInteger(value: string, allowNegative = false) {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  if (!allowNegative && parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeTagList(value: string[]) {
  const seen = new Set<string>();
  return value.filter((entry) => {
    const normalized = entry.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function CommunityPostWorkbench({
  document,
}: {
  document: ModerationDocumentRecord;
}) {
  const router = useRouter();
  const [sourceDocument, setSourceDocument] = useState(document);
  const [state, setState] = useState<EditableCommunityPostState>(() =>
    toEditableState(document)
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<CommunityPostFieldKey, string>>
  >({});
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const post = useMemo(() => parseCommunityPostRecord(sourceDocument), [sourceDocument]);
  const sourceState = useMemo(() => toEditableState(sourceDocument), [sourceDocument]);

  const numericDraft = useMemo(
    () => ({
      commentCount: parseInteger(state.commentCount),
      upvotes: parseInteger(state.upvotes),
      downvotes: parseInteger(state.downvotes),
      score: parseInteger(state.score, true),
    }),
    [state.commentCount, state.downvotes, state.score, state.upvotes]
  );

  const changedFields = useMemo(() => {
    const changes: string[] = [];
    if (state.title.trim() !== sourceState.title.trim()) changes.push("title");
    if (state.body.trim() !== sourceState.body.trim()) changes.push("body");
    if (state.community.trim() !== sourceState.community.trim()) changes.push("community");
    if (normalizeTagList(state.tags).join("|") !== normalizeTagList(sourceState.tags).join("|")) {
      changes.push("tags");
    }
    if (state.authorId.trim() !== sourceState.authorId.trim()) changes.push("authorId");
    if (state.authorEmail.trim() !== sourceState.authorEmail.trim()) changes.push("authorEmail");
    if (state.authorIconName.trim() !== sourceState.authorIconName.trim()) {
      changes.push("authorIconName");
    }
    if (state.authorIconColorHex.trim() !== sourceState.authorIconColorHex.trim()) {
      changes.push("authorIconColorHex");
    }
    if (state.commentCount.trim() !== sourceState.commentCount.trim()) changes.push("commentCount");
    if (state.upvotes.trim() !== sourceState.upvotes.trim()) changes.push("upvotes");
    if (state.downvotes.trim() !== sourceState.downvotes.trim()) changes.push("downvotes");
    if (state.score.trim() !== sourceState.score.trim()) changes.push("score");
    return changes;
  }, [sourceState, state]);

  const validationMessage = useMemo(() => {
    if (!state.title.trim()) {
      return "Post title is required.";
    }

    if (!state.body.trim()) {
      return "Post body is required.";
    }

    if (state.authorEmail.trim() && !isValidEmail(state.authorEmail.trim())) {
      return "Enter a valid author email.";
    }

    if (Object.values(numericDraft).some((value) => value === null)) {
      return "Comment and vote counters must be whole numbers. Score may be negative, the rest may not.";
    }

    return null;
  }, [numericDraft, state.authorEmail, state.body, state.title]);

  async function handleSave() {
    if (validationMessage) {
      setFieldErrors({
        title: !state.title.trim() ? "Enter a title." : undefined,
        body: !state.body.trim() ? "Enter post body text." : undefined,
        authorEmail:
          state.authorEmail.trim() && !isValidEmail(state.authorEmail.trim())
            ? "Enter a valid email."
            : undefined,
        counts: Object.values(numericDraft).some((value) => value === null)
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
      const payload = cloneDocumentData(post.sourceData);
      setFieldLikeSource(payload, post.sourceData, "title", state.title.trim());
      setFieldLikeSource(payload, post.sourceData, "body", state.body.trim());
      setFieldLikeSource(payload, post.sourceData, "community", toNullableString(state.community));
      setFieldLikeSource(payload, post.sourceData, "tags", normalizeTagList(state.tags));
      setFieldLikeSource(payload, post.sourceData, "authorId", toNullableString(state.authorId));
      setFieldLikeSource(
        payload,
        post.sourceData,
        "authorEmail",
        toNullableString(state.authorEmail)
      );
      setFieldLikeSource(
        payload,
        post.sourceData,
        "authorIconName",
        toNullableString(state.authorIconName)
      );
      setFieldLikeSource(
        payload,
        post.sourceData,
        "authorIconColorHex",
        toNullableString(state.authorIconColorHex)
      );
      setFieldLikeSource(
        payload,
        post.sourceData,
        "commentCount",
        numericDraft.commentCount ?? 0
      );
      setFieldLikeSource(payload, post.sourceData, "upvotes", numericDraft.upvotes ?? 0);
      setFieldLikeSource(payload, post.sourceData, "downvotes", numericDraft.downvotes ?? 0);
      setFieldLikeSource(payload, post.sourceData, "score", numericDraft.score ?? 0);
      setFieldLikeSource(payload, post.sourceData, "updatedAt", new Date().toISOString());

      const response = await sdkFetch<{ document: ModerationDocumentRecord }>(
        `/moderation/community_posts/${post.id}`,
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
        message: "Community post changes saved.",
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Unable to save the community post.",
      });
    } finally {
      setPending(false);
    }
  }

  const tags = normalizeTagList(state.tags);
  const availableTagOptions = useMemo(
    () => getCommunityTagOptions(state.community || post.community),
    [post.community, state.community]
  );

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/community">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to community
          </Link>
        </Button>
        {state.authorId.trim() ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/users/${state.authorId.trim()}`}>Open author account</Link>
          </Button>
        ) : null}
        <span className="font-mono text-xs text-muted-foreground">{post.id}</span>
      </div>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Community</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              Community post workbench
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Edit the full post record, including author metadata, tags, and
              moderation counters, without falling back to raw JSON.
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
              {pending ? "Saving..." : "Save post"}
            </Button>
          </div>
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <CommunityTagPill key={tag} label={tag} />
            ))}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                value={state.title}
                aria-invalid={Boolean(fieldErrors.title)}
                onChange={(event) =>
                  setState((current) => ({ ...current, title: event.target.value }))
                }
              />
              {fieldErrors.title ? (
                <p className="text-xs text-destructive">{fieldErrors.title}</p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="post-body">Body</Label>
              <Textarea
                id="post-body"
                rows={8}
                value={state.body}
                aria-invalid={Boolean(fieldErrors.body)}
                onChange={(event) =>
                  setState((current) => ({ ...current, body: event.target.value }))
                }
              />
              {fieldErrors.body ? (
                <p className="text-xs text-destructive">{fieldErrors.body}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-community">Community</Label>
              <OptionSelectField
                options={COMMUNITY_CATEGORY_OPTIONS}
                value={state.community}
                onChange={(community) =>
                  setState((current) => ({
                    ...current,
                    community,
                    tags:
                      current.community === community ? current.tags : [],
                  }))
                }
                placeholder="Select community"
                emptyLabel="No community"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-tags">Tags</Label>
              <MultiValuePickerField
                title="Post tags"
                description="Pick iOS community tags, or add a custom tag when moderation needs one-off context."
                value={state.tags}
                onChange={(tags) => setState((current) => ({ ...current, tags }))}
                options={availableTagOptions}
                triggerLabel="Edit tags"
                searchPlaceholder="Search tags..."
                customStorageKey="community_custom_tags"
                customPlaceholder="Custom tag"
                allowCustom
                pillTone="community"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-author-id">Author id</Label>
              <Input
                id="post-author-id"
                value={state.authorId}
                onChange={(event) =>
                  setState((current) => ({ ...current, authorId: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-author-email">Author email</Label>
              <Input
                id="post-author-email"
                type="email"
                value={state.authorEmail}
                aria-invalid={Boolean(fieldErrors.authorEmail)}
                onChange={(event) =>
                  setState((current) => ({ ...current, authorEmail: event.target.value }))
                }
              />
              {fieldErrors.authorEmail ? (
                <p className="text-xs text-destructive">{fieldErrors.authorEmail}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-author-icon-name">Author icon name</Label>
              <OptionSelectField
                options={COMMUNITY_ICON_OPTIONS}
                value={state.authorIconName}
                onChange={(authorIconName) =>
                  setState((current) => ({
                    ...current,
                    authorIconName,
                  }))
                }
                placeholder="Select icon"
                emptyLabel="No icon"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-author-icon-color">Author icon color</Label>
              <ColorPaletteField
                colors={COMMUNITY_COLOR_OPTIONS}
                value={state.authorIconColorHex}
                onChange={(authorIconColorHex) =>
                  setState((current) => ({
                    ...current,
                    authorIconColorHex,
                  }))
                }
              />
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 md:col-span-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Counters
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {COMMUNITY_POST_COUNTER_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <Input
                      id={field.key}
                      inputMode="numeric"
                      aria-invalid={Boolean(fieldErrors.counts)}
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
              {fieldErrors.counts ? (
                <p className="mt-3 text-xs text-destructive">{fieldErrors.counts}</p>
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
                {state.authorId.trim() ? (
                  <>
                    <Link
                      href={`/users/${state.authorId.trim()}`}
                      className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                    >
                      <p className="text-sm font-medium text-foreground">Open author account</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Edit the linked auth account and private profile.
                      </p>
                    </Link>
                    <Link
                      href={`/collections/public_profiles/${state.authorId.trim()}`}
                      className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                    >
                      <p className="text-sm font-medium text-foreground">Open author public profile</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Review the profile users see in community surfaces.
                      </p>
                    </Link>
                    <Link
                      href={`/collections/community_users/${state.authorId.trim()}`}
                      className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                    >
                      <p className="text-sm font-medium text-foreground">Open author community user</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Review the author’s community identity and activity state.
                      </p>
                    </Link>
                  </>
                ) : null}
                <Link
                  href={`/collections/community_posts/${post.id}?raw=1`}
                  className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                >
                  <p className="text-sm font-medium text-foreground">Open full raw post page</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use this if you need nested comment moderation in the raw page.
                  </p>
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Record metadata
              </p>
              <dl className="mt-3 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Post id</dt>
                  <dd className="font-mono text-xs text-foreground">{post.id}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="text-foreground">
                    {formatDateTime(post.createdAt) ?? "No timestamp"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="text-foreground">
                    {formatDateTime(post.updatedAt) ?? "No timestamp"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <DeveloperRawEditor
        collectionKey="community_posts"
        document={sourceDocument}
        relatedLinks={[
          ...(state.authorId.trim()
            ? [
                {
                  label: "Author account",
                  href: `/users/${state.authorId.trim()}`,
                  description: "Open the linked auth account and private profile workbench.",
                },
              ]
            : []),
        ]}
        backHref="/collections/community_posts"
        backLabel="Back to community posts"
        deleteHref={`/moderation/community_posts/${post.id}`}
        updateHref={`/moderation/community_posts/${post.id}`}
        title="Developer raw post editor"
        description="Use this only when the typed post form is insufficient or when you need to inspect the untouched document shape."
      />
    </div>
  );
}
