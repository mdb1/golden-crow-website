"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ColorPaletteField,
  MultiValuePickerField,
  OptionSelectField,
} from "@/components/constrained-fields";
import { UserVerificationCard } from "@/components/user-verification-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COMMUNITY_COLOR_OPTIONS,
  COMMUNITY_ICON_OPTIONS,
  CONDITION_OPTIONS,
  GENDER_OPTIONS,
} from "@/lib/admin-option-catalog";
import { sdkFetch } from "@/lib/sdk-client";
import type { AdminUserRecord } from "@/lib/moderation-types";
import { toVerificationSummary } from "@/lib/user-verification";

function toEditableState(user: AdminUserRecord) {
  return {
    displayName: user.displayName ?? "",
    photoURL: user.photoURL ?? "",
    profileImage: user.profileImage ?? "",
    patientID: user.patientID ?? "",
    country: user.country ?? "",
    age: user.age?.toString() ?? "",
    sex: user.sex ?? "",
    conditions: user.conditions,
    iconName: user.iconName ?? "",
    iconColorHex: user.iconColorHex ?? "",
    onboardingCompleted: user.onboardingCompleted,
    lastReportDate: user.lastReportDate ?? "",
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    visibilityAge: user.visibilitySettings?.showAge ?? true,
    visibilitySex: user.visibilitySettings?.showSex ?? true,
    visibilityCountry: user.visibilitySettings?.showCountry ?? true,
    visibilityConditions: user.visibilitySettings?.showConditions ?? true,
  };
}

type EditableState = ReturnType<typeof toEditableState>;

function buildPayload(state: EditableState) {
  return {
    displayName: state.displayName.trim(),
    photoURL: state.photoURL.trim(),
    profileImage: state.profileImage.trim(),
    patientID: state.patientID.trim(),
    country: state.country.trim(),
    age: state.age.trim(),
    sex: state.sex.trim(),
    conditions: state.conditions.map((entry) => entry.trim()).filter(Boolean),
    iconName: state.iconName.trim(),
    iconColorHex: state.iconColorHex.trim(),
    onboardingCompleted: state.onboardingCompleted,
    lastReportDate: state.lastReportDate.trim(),
    emailVerified: state.emailVerified,
    disabled: state.disabled,
    visibilitySettings: {
      showAge: state.visibilityAge,
      showSex: state.visibilitySex,
      showCountry: state.visibilityCountry,
      showConditions: state.visibilityConditions,
    },
  };
}

export function UserWorkbench({
  user,
  relatedLinks,
}: {
  user: AdminUserRecord;
  relatedLinks: Array<{ label: string; href: string; description: string }>;
}) {
  const router = useRouter();
  const [state, setState] = useState<EditableState>(() => toEditableState(user));
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(
    null
  );
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const sourceState = useMemo(() => toEditableState(user), [user]);
  const payload = useMemo(() => buildPayload(state), [state]);
  const sourcePayload = useMemo(() => buildPayload(sourceState), [sourceState]);
  const changedFields = useMemo(() => {
    return Object.keys(payload).filter(
      (key) =>
        JSON.stringify(payload[key as keyof typeof payload]) !==
        JSON.stringify(sourcePayload[key as keyof typeof sourcePayload])
    );
  }, [payload, sourcePayload]);

  async function handleSave() {
    setPendingAction("save");
    setStatusMessage(null);

    try {
      await sdkFetch(`/users/${encodeURIComponent(user.uid)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setStatusMessage({
        tone: "success",
        message:
          "Account updates saved. Review related records if the public/community state should also change.",
      });
      setSaveOpen(false);
      router.refresh();
    } catch {
      setStatusMessage({
        tone: "error",
        message: "Save failed. The account record was not updated.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    setPendingAction("delete");
    setStatusMessage(null);

    try {
      await sdkFetch(`/users/${encodeURIComponent(user.uid)}`, {
        method: "DELETE",
      });
      router.push("/users");
      router.refresh();
    } catch {
      setStatusMessage({
        tone: "error",
        message: "Delete failed. The user still exists.",
      });
      setDeleteOpen(false);
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/users">Back to accounts</Link>
        </Button>
        <span className="font-mono text-xs text-muted-foreground">{user.uid}</span>
      </div>

      <UserVerificationCard
        uid={user.uid}
        title={user.displayName || user.email || user.uid}
        fallbackEmail={user.email}
        initialSummary={toVerificationSummary(user)}
      />

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Accounts</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              User workbench
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              This form edits Firebase Auth state and the linked private
              profile together. Use the related record links for public,
              community, reports, and learning data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState(toEditableState(user))}
              disabled={changedFields.length === 0}
            >
              Reset
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveOpen(true)}
              disabled={changedFields.length === 0}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete user
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user.email} disabled />
            </div>
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input
                value={state.displayName}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Photo URL</Label>
              <Input
                value={state.photoURL}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    photoURL: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Profile image URL</Label>
              <Input
                value={state.profileImage}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    profileImage: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Patient ID</Label>
              <Input
                value={state.patientID}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    patientID: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input
                value={state.country}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    country: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Age</Label>
              <Input
                value={state.age}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    age: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Sex</Label>
              <OptionSelectField
                options={GENDER_OPTIONS}
                value={state.sex}
                onChange={(sex) =>
                  setState((current) => ({
                    ...current,
                    sex,
                  }))
                }
                placeholder="Select sex"
                emptyLabel="Not set"
              />
            </div>
            <div className="space-y-2">
              <Label>Icon name</Label>
              <OptionSelectField
                options={COMMUNITY_ICON_OPTIONS}
                value={state.iconName}
                onChange={(iconName) =>
                  setState((current) => ({
                    ...current,
                    iconName,
                  }))
                }
                placeholder="Select icon"
                emptyLabel="No icon"
              />
            </div>
            <div className="space-y-2">
              <Label>Icon color</Label>
              <ColorPaletteField
                colors={COMMUNITY_COLOR_OPTIONS}
                value={state.iconColorHex}
                onChange={(iconColorHex) =>
                  setState((current) => ({
                    ...current,
                    iconColorHex,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Last report date</Label>
              <Input
                value={state.lastReportDate}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    lastReportDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Conditions</Label>
              <MultiValuePickerField
                title="Profile conditions"
                description="Pick the profile conditions defined in the iOS onboarding flow."
                value={state.conditions}
                onChange={(conditions) =>
                  setState((current) => ({
                    ...current,
                    conditions,
                  }))
                }
                options={CONDITION_OPTIONS.map((option) => option.value)}
                triggerLabel="Edit conditions"
                searchPlaceholder="Search conditions..."
              />
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 md:col-span-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Safety toggles
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    key: "emailVerified" as const,
                    label: "Email verified",
                  },
                  {
                    key: "disabled" as const,
                    label: "Disabled",
                  },
                  {
                    key: "onboardingCompleted" as const,
                    label: "Onboarding completed",
                  },
                  {
                    key: "visibilityAge" as const,
                    label: "Show age",
                  },
                  {
                    key: "visibilitySex" as const,
                    label: "Show sex",
                  },
                  {
                    key: "visibilityCountry" as const,
                    label: "Show country",
                  },
                  {
                    key: "visibilityConditions" as const,
                    label: "Show conditions",
                  },
                ].map((toggle) => (
                  <label
                    key={toggle.key}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-card/50 px-3 py-2"
                  >
                    <span className="text-sm text-foreground">{toggle.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(state[toggle.key])}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          [toggle.key]: event.target.checked,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
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
                <p className="mt-3 text-sm text-muted-foreground">
                  No pending changes.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Related records
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {relatedLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-xl border border-border/70 bg-card/50 px-3 py-3 transition-colors hover:border-primary/35"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {link.label}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {link.description}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            {statusMessage ? (
              <div
                className={
                  statusMessage.tone === "success"
                    ? "rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"
                    : "rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                }
              >
                {statusMessage.message}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <AlertDialog open={saveOpen} onOpenChange={setSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Save className="h-5 w-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Confirm account update</AlertDialogTitle>
            <AlertDialogDescription>
              This updates Firebase Auth and the linked private profile record.
              Changed fields: {changedFields.join(", ") || "none"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSave}
              disabled={pendingAction === "save"}
            >
              {pendingAction === "save" ? "Saving..." : "Save account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/12 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Confirm destructive delete</AlertDialogTitle>
            <AlertDialogDescription>
              This cascades through the account, profile, public/community, and
              learning records tied to {user.uid}. Use only when the full scope
              is intended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={pendingAction === "delete"}
            >
              {pendingAction === "delete" ? "Deleting..." : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
