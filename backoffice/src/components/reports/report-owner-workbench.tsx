"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RotateCcw, Save } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { DeveloperRawEditor } from "@/components/developer-raw-editor";
import { UserVerificationCard } from "@/components/user-verification-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sdkFetch } from "@/lib/sdk-client";
import {
  parseCommunityUserRecord,
  type CommunityUserRecord,
} from "@/lib/community-admin";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { formatDateTime } from "@/lib/moderation-utils";
import { parseReportOwnerRecord } from "@/lib/report-admin";

type EditableOwnerState = {
  acceptedTerms: boolean;
  acceptedTermsAt: string;
  ownerCompany: string;
  ownerProfession: string;
  ownerBio: string;
  ownerContactNumber: string;
  ownerName: string;
  ownerContactEmail: string;
};

type OwnerFieldKey =
  | "acceptedTermsAt"
  | "ownerContactNumber"
  | "ownerContactEmail";

function toEditableState(document: ModerationDocumentRecord): EditableOwnerState {
  const owner = parseReportOwnerRecord(document);

  return {
    acceptedTerms: owner.acceptedTerms,
    acceptedTermsAt: toDateTimeLocalValue(owner.acceptedTermsAt),
    ownerCompany: owner.ownerCompany,
    ownerProfession: owner.ownerProfession,
    ownerBio: owner.ownerBio,
    ownerContactNumber: owner.ownerContactNumber,
    ownerName: owner.ownerName,
    ownerContactEmail: owner.ownerContactEmail,
  };
}

function toDateTimeLocalValue(value?: string) {
  if (!value) {
    return "";
  }

  const candidate = new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    return "";
  }

  const year = candidate.getFullYear();
  const month = `${candidate.getMonth() + 1}`.padStart(2, "0");
  const day = `${candidate.getDate()}`.padStart(2, "0");
  const hours = `${candidate.getHours()}`.padStart(2, "0");
  const minutes = `${candidate.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toResolvedAcceptedTermsAt(
  state: EditableOwnerState,
  fallbackValue?: string
) {
  if (!state.acceptedTerms) {
    return null;
  }

  if (!state.acceptedTermsAt.trim()) {
    return fallbackValue ?? null;
  }

  const candidate = new Date(state.acceptedTermsAt);
  return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string) {
  return /^[0-9+()\-\s]{7,20}$/.test(value);
}

export function ReportOwnerWorkbench({
  document,
}: {
  document: ModerationDocumentRecord;
}) {
  const router = useRouter();
  const [sourceDocument, setSourceDocument] = useState(document);
  const [state, setState] = useState<EditableOwnerState>(() => toEditableState(document));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<OwnerFieldKey, string>>>({});
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const owner = useMemo(() => parseReportOwnerRecord(sourceDocument), [sourceDocument]);
  const sourceState = useMemo(() => toEditableState(sourceDocument), [sourceDocument]);
  const { data: communityUserDocument, isLoading: isCommunityUserLoading } = useQuery({
    queryKey: ["moderation", "community_users", owner.id],
    queryFn: async () => {
      try {
        return await sdkFetch<{ document: ModerationDocumentRecord }>(
          `/moderation/community_users/${owner.id}`
        );
      } catch {
        return null;
      }
    },
  });
  const communityUser = useMemo<CommunityUserRecord | null>(() => {
    if (!communityUserDocument?.document) {
      return null;
    }

    return parseCommunityUserRecord(communityUserDocument.document);
  }, [communityUserDocument]);
  const resolvedAcceptedTermsAt = useMemo(
    () => toResolvedAcceptedTermsAt(state, owner.acceptedTermsAt),
    [owner.acceptedTermsAt, state]
  );

  const changedFields = useMemo(() => {
    const changes: string[] = [];

    if (state.acceptedTerms !== sourceState.acceptedTerms) {
      changes.push("accepted_terms");
    }

    if ((resolvedAcceptedTermsAt ?? "") !== (owner.acceptedTermsAt ?? "")) {
      changes.push("accepted_terms_at");
    }

    if (state.ownerCompany.trim() !== sourceState.ownerCompany.trim()) {
      changes.push("owner_company");
    }

    if (state.ownerProfession.trim() !== sourceState.ownerProfession.trim()) {
      changes.push("owner_profession");
    }

    if (state.ownerBio.trim() !== sourceState.ownerBio.trim()) {
      changes.push("owner_bio");
    }

    if (state.ownerContactNumber.trim() !== sourceState.ownerContactNumber.trim()) {
      changes.push("owner_contact_number");
    }

    if (state.ownerName.trim() !== sourceState.ownerName.trim()) {
      changes.push("owner_name");
    }

    if (state.ownerContactEmail.trim() !== sourceState.ownerContactEmail.trim()) {
      changes.push("owner_contact_email");
    }

    return changes;
  }, [owner.acceptedTermsAt, resolvedAcceptedTermsAt, sourceState, state]);

  const validationMessage = useMemo(() => {
    if (!state.acceptedTerms && state.acceptedTermsAt.trim()) {
      return "Accepted terms timestamp only applies when the owner has accepted terms.";
    }

    if (state.ownerContactEmail.trim() && !isValidEmail(state.ownerContactEmail.trim())) {
      return "Enter a valid owner contact email before saving.";
    }

    if (state.ownerContactNumber.trim() && !isValidPhone(state.ownerContactNumber.trim())) {
      return "Use digits, spaces, or phone punctuation for the contact number.";
    }

    if (state.acceptedTerms && state.acceptedTermsAt.trim() && !resolvedAcceptedTermsAt) {
      return "Enter a valid accepted terms timestamp.";
    }

    return null;
  }, [resolvedAcceptedTermsAt, state]);

  async function handleSave() {
    if (validationMessage) {
      setFieldErrors({
        acceptedTermsAt:
          !state.acceptedTerms && state.acceptedTermsAt.trim()
            ? "Clear the timestamp or enable accepted terms."
            : state.acceptedTerms && state.acceptedTermsAt.trim() && !resolvedAcceptedTermsAt
              ? "Enter a valid timestamp."
              : undefined,
        ownerContactEmail:
          state.ownerContactEmail.trim() && !isValidEmail(state.ownerContactEmail.trim())
            ? "Enter a valid email."
            : undefined,
        ownerContactNumber:
          state.ownerContactNumber.trim() && !isValidPhone(state.ownerContactNumber.trim())
            ? "Use digits and standard phone punctuation only."
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
      const acceptedTermsAtForSave = state.acceptedTerms
        ? resolvedAcceptedTermsAt ?? new Date().toISOString()
        : null;

      const response = await sdkFetch<{ document: ModerationDocumentRecord }>(
        `/moderation/report_owners/${owner.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            data: {
              ...owner.sourceData,
              accepted_terms: state.acceptedTerms,
              accepted_terms_at: acceptedTermsAtForSave,
              owner_company: toNullableString(state.ownerCompany),
              owner_profession: toNullableString(state.ownerProfession),
              owner_bio: toNullableString(state.ownerBio),
              owner_contact_number: toNullableString(state.ownerContactNumber),
              owner_name: toNullableString(state.ownerName),
              owner_contact_email: toNullableString(state.ownerContactEmail),
              updatedAt: new Date().toISOString(),
            },
          }),
        }
      );

      setSourceDocument(response.document);
      setState(toEditableState(response.document));
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          "Report owner details saved. Review linked reports if the person’s clinician state changed.",
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Unable to save the report owner record.",
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
          <Link href="/collections/report_owners">Back to report owners</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/reports/users/${owner.id}`}>Open report user</Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{owner.id}</span>
      </div>

      <UserVerificationCard
        uid={owner.id}
        title={
          state.ownerName.trim() ||
          communityUser?.username ||
          state.ownerContactEmail.trim() ||
          communityUser?.email ||
          owner.id
        }
        fallbackEmail={
          communityUser?.email || state.ownerContactEmail.trim() || owner.ownerContactEmail
        }
      />

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Reports</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              Report owner workbench
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Edit the clinician-facing owner profile with validated fields, then
              jump directly to the linked user, report, and learning surfaces.
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
              {pending ? "Saving..." : "Save owner"}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="owner-name">Owner name</Label>
              <Input
                id="owner-name"
                value={state.ownerName}
                onChange={(event) =>
                  setState((current) => ({ ...current, ownerName: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-company">Owner company</Label>
              <Input
                id="owner-company"
                value={state.ownerCompany}
                onChange={(event) =>
                  setState((current) => ({ ...current, ownerCompany: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-profession">Owner profession</Label>
              <Input
                id="owner-profession"
                value={state.ownerProfession}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    ownerProfession: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-contact-number">Owner contact number</Label>
              <Input
                id="owner-contact-number"
                value={state.ownerContactNumber}
                aria-invalid={Boolean(fieldErrors.ownerContactNumber)}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    ownerContactNumber: event.target.value,
                  }))
                }
              />
              {fieldErrors.ownerContactNumber ? (
                <p className="text-xs text-destructive">{fieldErrors.ownerContactNumber}</p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="owner-contact-email">Owner contact email</Label>
              <Input
                id="owner-contact-email"
                type="email"
                value={state.ownerContactEmail}
                aria-invalid={Boolean(fieldErrors.ownerContactEmail)}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    ownerContactEmail: event.target.value,
                  }))
                }
              />
              {fieldErrors.ownerContactEmail ? (
                <p className="text-xs text-destructive">{fieldErrors.ownerContactEmail}</p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="owner-bio">Owner bio</Label>
              <Textarea
                id="owner-bio"
                value={state.ownerBio}
                rows={5}
                onChange={(event) =>
                  setState((current) => ({ ...current, ownerBio: event.target.value }))
                }
              />
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 md:col-span-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Terms state
              </p>
              <label className="mt-3 flex items-center justify-between rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                <span className="text-sm text-foreground">Accepted terms</span>
                <input
                  type="checkbox"
                  checked={state.acceptedTerms}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      acceptedTerms: event.target.checked,
                      acceptedTermsAt:
                        event.target.checked || !current.acceptedTermsAt.trim()
                          ? current.acceptedTermsAt
                          : "",
                    }))
                  }
                />
              </label>
              <div className="mt-3 space-y-2">
                <Label htmlFor="accepted-terms-at">Accepted terms timestamp</Label>
                <Input
                  id="accepted-terms-at"
                  type="datetime-local"
                  value={state.acceptedTermsAt}
                  aria-invalid={Boolean(fieldErrors.acceptedTermsAt)}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      acceptedTermsAt: event.target.value,
                    }))
                  }
                />
                {fieldErrors.acceptedTermsAt ? (
                  <p className="text-xs text-destructive">{fieldErrors.acceptedTermsAt}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Leave blank to stamp the current time when terms are marked as accepted.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 md:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Linked Community User
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Read-only context from `community_users/{owner.id}` so the report
                    owner record can be verified against the actual community identity.
                  </p>
                </div>
                {communityUser ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto justify-start px-0 text-primary"
                    asChild
                  >
                    <Link href={`/collections/community_users/${owner.id}`}>
                      Show more details
                    </Link>
                  </Button>
                ) : null}
              </div>

              {isCommunityUserLoading ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Loading community user details...
                </p>
              ) : communityUser ? (
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                    <dt className="text-muted-foreground">Username</dt>
                    <dd className="text-right text-foreground">
                      {communityUser.username || "No username"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="text-right text-foreground">
                      {communityUser.email || "No email"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                    <dt className="text-muted-foreground">Activity</dt>
                    <dd className="text-right text-foreground">
                      {communityUser.isActivityPublic ? "Public" : "Private"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                    <dt className="text-muted-foreground">Role</dt>
                    <dd className="text-right text-foreground">
                      {communityUser.isClinician ? "Clinician" : "Community member"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                    <dt className="text-muted-foreground">Owned reports</dt>
                    <dd className="text-right text-foreground">
                      {communityUser.ownedReports.length}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                    <dt className="text-muted-foreground">Posts created</dt>
                    <dd className="text-right text-foreground">
                      {communityUser.stats.postsCreated}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                    <dt className="text-muted-foreground">Replies</dt>
                    <dd className="text-right text-foreground">
                      {communityUser.stats.totalReplies}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-2">
                    <dt className="text-muted-foreground">Likes</dt>
                    <dd className="text-right text-foreground">
                      {communityUser.stats.totalLikes}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No linked `community_users/{owner.id}` record is available for this report owner.
                </p>
              )}
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
                    href: `/reports/users/${owner.id}`,
                    label: "Open report user view",
                    description: "Inspect this owner’s report codes and linked uploaded reports.",
                  },
                  {
                    href: `/users/${owner.id}`,
                    label: "Open account workbench",
                    description: "Edit the Firebase Auth account and linked private profile.",
                  },
                  {
                    href: `/learning/users/${owner.id}`,
                    label: "Open learning progress",
                    description: "Review learning state for the same account.",
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
                  <dt className="text-muted-foreground">Owner record id</dt>
                  <dd className="font-mono text-xs text-foreground">{owner.id}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="text-foreground">
                    {formatDateTime(owner.updatedAt) ?? "No timestamp"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Accepted terms at</dt>
                  <dd className="text-right text-foreground">
                    {formatDateTime(owner.acceptedTermsAt) ?? "Not recorded"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <DeveloperRawEditor
        collectionKey="report_owners"
        document={sourceDocument}
        relatedLinks={[
          {
            label: "User account",
            href: `/users/${owner.id}`,
            description: "Open the linked Firebase Auth and private profile workbench.",
          },
          {
            label: "Report user view",
            href: `/reports/users/${owner.id}`,
            description: "Open this owner’s report list and linked uploaded reports.",
          },
        ]}
        backHref="/collections/report_owners"
        backLabel="Back to report owners"
        deleteHref={`/moderation/report_owners/${owner.id}`}
        updateHref={`/moderation/report_owners/${owner.id}`}
        title="Developer raw owner editor"
        description="Use this only when the typed owner form is missing a field you need to recover or clean up."
      />
    </div>
  );
}
