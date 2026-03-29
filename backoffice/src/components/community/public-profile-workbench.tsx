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
import {
  COMMUNITY_COLOR_OPTIONS,
  COMMUNITY_ICON_OPTIONS,
  CONDITION_OPTIONS,
  GENDER_OPTIONS,
} from "@/lib/admin-option-catalog";
import { cloneDocumentData, parsePublicProfileRecord, setFieldLikeSource } from "@/lib/community-admin";
import { sdkFetch } from "@/lib/sdk-client";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { formatDateTime } from "@/lib/moderation-utils";

type EditablePublicProfileState = {
  fullName: string;
  email: string;
  username: string;
  gender: string;
  condition: string;
  hasProfileImage: boolean;
  iconName: string;
  iconColorHex: string;
};

type PublicProfileFieldKey = "email";

function toEditableState(document: ModerationDocumentRecord): EditablePublicProfileState {
  const profile = parsePublicProfileRecord(document);

  return {
    fullName: profile.fullName,
    email: profile.email,
    username: profile.username,
    gender: profile.gender,
    condition: profile.condition,
    hasProfileImage: profile.hasProfileImage,
    iconName: profile.iconName,
    iconColorHex: profile.iconColorHex,
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function PublicProfileWorkbench({
  document,
}: {
  document: ModerationDocumentRecord;
}) {
  const router = useRouter();
  const [sourceDocument, setSourceDocument] = useState(document);
  const [state, setState] = useState<EditablePublicProfileState>(() =>
    toEditableState(document)
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<PublicProfileFieldKey, string>>
  >({});
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const profile = useMemo(() => parsePublicProfileRecord(sourceDocument), [sourceDocument]);
  const sourceState = useMemo(() => toEditableState(sourceDocument), [sourceDocument]);

  const changedFields = useMemo(() => {
    const changes: string[] = [];
    if (state.fullName.trim() !== sourceState.fullName.trim()) changes.push("fullName");
    if (state.email.trim() !== sourceState.email.trim()) changes.push("email");
    if (state.username.trim() !== sourceState.username.trim()) changes.push("username");
    if (state.gender.trim() !== sourceState.gender.trim()) changes.push("gender");
    if (state.condition.trim() !== sourceState.condition.trim()) changes.push("condition");
    if (state.hasProfileImage !== sourceState.hasProfileImage) changes.push("has_profile_image");
    if (state.iconName.trim() !== sourceState.iconName.trim()) changes.push("iconName");
    if (state.iconColorHex.trim() !== sourceState.iconColorHex.trim()) {
      changes.push("iconColorHex");
    }
    return changes;
  }, [sourceState, state]);

  const validationMessage = useMemo(() => {
    if (state.email.trim() && !isValidEmail(state.email.trim())) {
      return "Enter a valid public-profile email.";
    }

    return null;
  }, [state.email]);

  async function handleSave() {
    if (validationMessage) {
      setFieldErrors({
        email:
          state.email.trim() && !isValidEmail(state.email.trim())
            ? "Enter a valid email."
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
      const payload = cloneDocumentData(profile.sourceData);
      setFieldLikeSource(payload, profile.sourceData, "fullName", toNullableString(state.fullName), [
        "full_name",
      ]);
      setFieldLikeSource(payload, profile.sourceData, "email", toNullableString(state.email));
      setFieldLikeSource(payload, profile.sourceData, "username", toNullableString(state.username));
      setFieldLikeSource(payload, profile.sourceData, "gender", toNullableString(state.gender));
      setFieldLikeSource(
        payload,
        profile.sourceData,
        "condition",
        toNullableString(state.condition)
      );
      setFieldLikeSource(
        payload,
        profile.sourceData,
        "has_profile_image",
        state.hasProfileImage
      );
      setFieldLikeSource(payload, profile.sourceData, "iconName", toNullableString(state.iconName), [
        "icon_name",
      ]);
      setFieldLikeSource(
        payload,
        profile.sourceData,
        "iconColorHex",
        toNullableString(state.iconColorHex),
        ["icon_color_hex"]
      );
      setFieldLikeSource(payload, profile.sourceData, "updatedAt", new Date().toISOString());

      const response = await sdkFetch<{ document: ModerationDocumentRecord }>(
        `/moderation/public_profiles/${profile.id}`,
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
        message: "Public profile changes saved.",
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Unable to save the public profile.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/collections/public_profiles">Back to public profiles</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/users/${profile.id}`}>Open account</Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{profile.id}</span>
      </div>

      <UserVerificationCard
        uid={profile.id}
        title={
          state.fullName.trim() ||
          state.username.trim() ||
          state.email.trim() ||
          profile.id
        }
        fallbackEmail={state.email.trim() || profile.email}
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
              Public profile workbench
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Edit the patient-facing identity fields that appear in the
              community profile and other public surfaces.
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
              {pending ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="public-full-name">Full name</Label>
              <Input
                id="public-full-name"
                value={state.fullName}
                onChange={(event) =>
                  setState((current) => ({ ...current, fullName: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="public-username">Username</Label>
              <Input
                id="public-username"
                value={state.username}
                onChange={(event) =>
                  setState((current) => ({ ...current, username: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="public-email">Email</Label>
              <Input
                id="public-email"
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
              <Label htmlFor="public-gender">Gender</Label>
              <OptionSelectField
                options={GENDER_OPTIONS}
                value={state.gender}
                onChange={(gender) => setState((current) => ({ ...current, gender }))}
                placeholder="Select gender"
                emptyLabel="No gender"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="public-condition">Condition</Label>
              <OptionSelectField
                options={CONDITION_OPTIONS}
                value={state.condition}
                onChange={(condition) =>
                  setState((current) => ({ ...current, condition }))
                }
                placeholder="Select condition"
                emptyLabel="No condition"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="public-icon-name">Icon name</Label>
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
              <Label htmlFor="public-icon-color">Icon color</Label>
              <ColorPaletteField
                colors={COMMUNITY_COLOR_OPTIONS}
                value={state.iconColorHex}
                onChange={(iconColorHex) =>
                  setState((current) => ({ ...current, iconColorHex }))
                }
              />
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 md:col-span-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Visibility state
              </p>
              <label className="mt-3 flex items-center justify-between rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                <span className="text-sm text-foreground">Has profile image</span>
                <input
                  type="checkbox"
                  checked={state.hasProfileImage}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      hasProfileImage: event.target.checked,
                    }))
                  }
                />
              </label>
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
                    href: `/users/${profile.id}`,
                    label: "Open account workbench",
                    description: "Edit the linked auth account and private profile.",
                  },
                  {
                    href: `/collections/community_users/${profile.id}`,
                    label: "Open community user",
                    description: "Moderate the linked community identity and stats record.",
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
                Record metadata
              </p>
              <dl className="mt-3 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Public profile id</dt>
                  <dd className="font-mono text-xs text-foreground">{profile.id}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="text-foreground">
                    {formatDateTime(profile.updatedAt) ?? "No timestamp"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <DeveloperRawEditor
        collectionKey="public_profiles"
        document={sourceDocument}
        relatedLinks={[
          {
            label: "Auth user",
            href: `/users/${profile.id}`,
            description: "Open the linked auth account and private profile workbench.",
          },
          {
            label: "Community user",
            href: `/collections/community_users/${profile.id}`,
            description: "Open the linked community identity record.",
          },
        ]}
        backHref="/collections/public_profiles"
        backLabel="Back to public profiles"
        deleteHref={`/moderation/public_profiles/${profile.id}`}
        updateHref={`/moderation/public_profiles/${profile.id}`}
        title="Developer raw public-profile editor"
        description="Use this only when the typed public profile form does not cover the field you need to repair."
      />
    </div>
  );
}
