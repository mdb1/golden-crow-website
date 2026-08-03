"use client";

import { useMemo, useState } from "react";
import {
  onAuthStateChanged,
  sendEmailVerification,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  CheckCircle2,
  MailCheck,
  RotateCcw,
  Save,
  ShieldCheck,
  UserRoundCog,
  XCircle,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  type ChangeMyAccountEmailResponse,
  type MyAccountRecord,
} from "@/lib/admin-areas";
import {
  getRoleBadgeVariant,
  ROLE_CAPABILITY_LINES,
} from "@/lib/areas-ui";
import { auth } from "@/lib/firebase";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

type RoleProfileState = {
  displayName: string;
  contactPhone: string;
  notes: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function toRoleProfileState(account: MyAccountRecord): RoleProfileState {
  return {
    displayName: account.role?.displayName ?? "",
    contactPhone: account.role?.contactPhone ?? "",
    notes: account.role?.notes ?? "",
  };
}

function formatValue(value: string | number | boolean | null | undefined) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null || value === undefined || value === "") {
    return "None";
  }

  return String(value);
}

function formatDate(value?: string) {
  if (!value) {
    return "None";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function providerLabel(providerId: string) {
  if (providerId === "password") {
    return "Email/password";
  }

  if (providerId === "google.com") {
    return "Google";
  }

  if (providerId === "phone") {
    return "Phone";
  }

  return providerId;
}

function waitForFirebaseUser(): Promise<FirebaseUser | null> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    let unsubscribe: (() => void) | undefined;
    const timeout = window.setTimeout(() => {
      unsubscribe?.();
      resolve(null);
    }, 1800);

    unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        window.clearTimeout(timeout);
        unsubscribe?.();
        resolve(firebaseUser);
      },
      () => {
        window.clearTimeout(timeout);
        unsubscribe?.();
        resolve(null);
      }
    );
  });
}

function FieldRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
      <p className="section-eyebrow">{label}</p>
      <p
        className={cn(
          "mt-1 break-words text-sm font-medium text-foreground",
          mono && "font-mono text-xs"
        )}
      >
        {formatValue(value)}
      </p>
    </div>
  );
}

function StatusLine({
  ok,
  label,
  value,
}: {
  ok: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          ok
            ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-200"
            : "bg-destructive/10 text-destructive"
        )}
      >
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      </div>
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", ok ? "text-emerald-700" : "text-destructive")}>
          {label}
        </p>
        <p className="mt-0.5 break-words text-sm text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="section-eyebrow">{eyebrow}</p>
      <h2 className="font-heading text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function scopeText(account: MyAccountRecord) {
  const role = account.role;
  if (!role) {
    return "No role assignment record is linked to this session.";
  }

  return [
    role.organizationName ?? role.organizationId,
    role.institutionName ?? role.institutionId,
    role.doctorName ?? role.doctorId,
    role.patientName ?? role.patientId,
  ]
    .filter(Boolean)
    .join(" / ") || "Global scope";
}

export function MyAccountWorkbench({
  initialAccount,
}: {
  initialAccount: MyAccountRecord;
}) {
  const [account, setAccount] = useState(initialAccount);
  const [roleState, setRoleState] = useState<RoleProfileState>(() =>
    toRoleProfileState(initialAccount)
  );
  const [newEmail, setNewEmail] = useState(initialAccount.auth.email);
  const [pendingRoleSave, setPendingRoleSave] = useState(false);
  const [pendingEmailSave, setPendingEmailSave] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const sourceRoleState = useMemo(() => toRoleProfileState(account), [account]);
  const roleChanged = JSON.stringify(roleState) !== JSON.stringify(sourceRoleState);
  const canEditRoleProfile = Boolean(account.role && !account.role.bootstrap);
  const canChangeEmail = Boolean(account.role && !account.role.bootstrap);
  const normalizedAuthEmail = normalizeEmail(account.auth.email);
  const normalizedNewEmail = normalizeEmail(newEmail);
  const emailChanged = normalizedNewEmail !== normalizedAuthEmail;
  const customClaims = JSON.stringify(account.auth.customClaims, null, 2);

  async function handleRoleSave() {
    if (!canEditRoleProfile) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "This role assignment is not editable from My account.",
      });
      return;
    }

    setPendingRoleSave(true);
    try {
      const result = await sdkFetch<{ account: MyAccountRecord }>(
        "/auth/my-account/role",
        {
          method: "PUT",
          body: JSON.stringify({
            displayName: roleState.displayName,
            contactPhone: roleState.contactPhone,
            notes: roleState.notes,
          }),
        }
      );
      setAccount(result.account);
      setRoleState(toRoleProfileState(result.account));
      setToast({
        id: Date.now(),
        tone: "success",
        message: "Your role assignment details were saved.",
      });
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to save your role assignment details.",
      });
    } finally {
      setPendingRoleSave(false);
    }
  }

  async function handleEmailSave() {
    if (!canChangeEmail) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "This account email is managed outside My account.",
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedNewEmail)) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Use a valid email address.",
      });
      return;
    }

    setPendingEmailSave(true);
    try {
      const result = await sdkFetch<ChangeMyAccountEmailResponse>(
        "/auth/my-account/email",
        {
          method: "PUT",
          body: JSON.stringify({ email: normalizedNewEmail }),
        }
      );
      setAccount(result.account);
      setRoleState(toRoleProfileState(result.account));
      setNewEmail(result.account.auth.email);
      setToast({
        id: Date.now(),
        tone: "success",
        message: result.requiresSignIn
          ? "Email changed. Sign out and sign back in with the new email to refresh this session."
          : "The requested email is already active on this account.",
        durationMs: 9000,
      });
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to change your email.",
      });
    } finally {
      setPendingEmailSave(false);
    }
  }

  async function handleSendVerification() {
    setPendingVerification(true);
    try {
      const firebaseUser = await waitForFirebaseUser();
      if (!firebaseUser) {
        throw new Error("No Firebase browser session is available. Sign out and sign in again.");
      }

      await firebaseUser.reload();
      if (normalizeEmail(firebaseUser.email ?? "") !== normalizedAuthEmail) {
        throw new Error(
          "The browser Firebase session email does not match this account. Sign out and sign in again before sending verification."
        );
      }

      await sendEmailVerification(firebaseUser);
      setToast({
        id: Date.now(),
        tone: "success",
        message: `Firebase sent a verification email to ${account.auth.email}.`,
        durationMs: 6500,
      });
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to send the verification email.",
      });
    } finally {
      setPendingVerification(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <section className="glass-panel flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserRoundCog className="h-4 w-4" />
            </div>
            <SectionHeading
              eyebrow="Role assignment"
              title="My role details"
              description="Personal assignment metadata can be edited here; role, activation, scope, and capabilities remain locked."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRoleState(sourceRoleState)}
              disabled={!roleChanged || pendingRoleSave || !canEditRoleProfile}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => void handleRoleSave()}
              disabled={!roleChanged || pendingRoleSave || !canEditRoleProfile}
            >
              <Save className="h-3.5 w-3.5" />
              {pendingRoleSave ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        {!canEditRoleProfile ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
            Bootstrap allowlist assignments are managed by environment configuration, so this screen can only display their role data.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="my-role-display-name">Name</Label>
            <Input
              id="my-role-display-name"
              value={roleState.displayName}
              onChange={(event) =>
                setRoleState((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              disabled={!canEditRoleProfile || pendingRoleSave}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="my-role-phone">Phone</Label>
            <Input
              id="my-role-phone"
              value={roleState.contactPhone}
              onChange={(event) =>
                setRoleState((current) => ({
                  ...current,
                  contactPhone: event.target.value,
                }))
              }
              disabled={!canEditRoleProfile || pendingRoleSave}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="my-role-notes">Notes</Label>
            <Textarea
              id="my-role-notes"
              value={roleState.notes}
              onChange={(event) =>
                setRoleState((current) => ({ ...current, notes: event.target.value }))
              }
              disabled={!canEditRoleProfile || pendingRoleSave}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FieldRow label="Role email" value={account.role?.email ?? account.context.email} mono />
          <FieldRow
            label="Role"
            value={
              account.role
                ? ADMIN_ROLE_LABELS[account.role.role]
                : ADMIN_ROLE_LABELS[account.context.role]
            }
          />
          <FieldRow label="Active" value={account.role?.isActive ?? account.context.canAccessBackoffice} />
          <FieldRow label="Scope" value={scopeText(account)} />
          <FieldRow label="Organization id" value={account.role?.organizationId} mono />
          <FieldRow label="Institution id" value={account.role?.institutionId} mono />
          <FieldRow label="Doctor id" value={account.role?.doctorId} mono />
          <FieldRow label="Patient id" value={account.role?.patientId} mono />
          <FieldRow label="Created by" value={account.role?.createdByEmail} mono />
          <FieldRow label="Created" value={formatDate(account.role?.createdAt)} />
          <FieldRow label="Updated" value={formatDate(account.role?.updatedAt)} />
          <FieldRow label="Bootstrap" value={account.role?.bootstrap ?? account.context.isBootstrap} />
          <FieldRow label="Project access" value={account.context.projectAccess.join(", ")} />
        </div>
      </section>

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="section-eyebrow">Permissions</p>
          <Badge variant={getRoleBadgeVariant(account.context.role)}>
            {ADMIN_ROLE_LABELS[account.context.role]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {ADMIN_ROLE_DESCRIPTIONS[account.context.role]}
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {ROLE_CAPABILITY_LINES[account.context.role].map((line) => (
            <div
              key={line}
              className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3 text-sm text-foreground"
            >
              {line}
            </div>
          ))}
          {account.capabilities.map((capability) => (
            <div
              key={capability}
              className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3 font-mono text-xs text-muted-foreground"
            >
              {capability}
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MailCheck className="h-4 w-4" />
            </div>
            <SectionHeading
              eyebrow="Authentication"
              title="Firebase Auth"
              description="Firebase identity, sign-in providers, profile username, and verification state for the current session user."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSendVerification()}
              disabled={pendingVerification || account.auth.emailVerified}
            >
              <MailCheck className="h-3.5 w-3.5" />
              {account.auth.emailVerified
                ? "Verified"
                : pendingVerification
                  ? "Sending..."
                  : "Verify account"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatusLine
            ok={account.auth.emailVerified}
            label={account.auth.emailVerified ? "Email verified" : "Email not verified"}
            value={account.auth.email}
          />
          <StatusLine
            ok={!account.auth.disabled}
            label={account.auth.disabled ? "Firebase account disabled" : "Firebase account enabled"}
            value={account.auth.uid}
          />
          <StatusLine
            ok={Boolean(account.profile?.username)}
            label="Username"
            value={account.profile?.username ?? "No username found in profile documents."}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="my-auth-email">Email</Label>
            <Input
              id="my-auth-email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              disabled={!canChangeEmail || pendingEmailSave}
            />
          </div>
          <Button
            onClick={() => void handleEmailSave()}
            disabled={!emailChanged || !canChangeEmail || pendingEmailSave}
          >
            <Save className="h-3.5 w-3.5" />
            {pendingEmailSave ? "Changing..." : "Change email"}
          </Button>
        </div>

        {!canChangeEmail ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
            This email belongs to a bootstrap role assignment. Update the allowlist source of truth before changing the login email.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FieldRow label="Firebase uid" value={account.auth.uid} mono />
          <FieldRow label="Firebase email" value={account.auth.email} mono />
          <FieldRow label="Auth display name" value={account.auth.displayName} />
          <FieldRow label="Auth phone" value={account.auth.phoneNumber} />
          <FieldRow label="Photo URL" value={account.auth.photoURL} mono />
          <FieldRow label="Tenant id" value={account.auth.tenantId} mono />
          <FieldRow label="Created" value={formatDate(account.auth.metadata.creationTime)} />
          <FieldRow label="Last sign-in" value={formatDate(account.auth.metadata.lastSignInTime)} />
          <FieldRow label="Last refresh" value={formatDate(account.auth.metadata.lastRefreshTime)} />
          <FieldRow label="Tokens valid after" value={formatDate(account.auth.tokensValidAfterTime)} />
          <FieldRow label="Profile full name" value={account.profile?.fullName} />
          <FieldRow label="Onboarding complete" value={account.profile?.onboardingCompleted} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
            <p className="section-eyebrow">Sign-in providers</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {account.auth.providerData.length > 0 ? (
                account.auth.providerData.map((provider) => (
                  <Badge key={`${provider.providerId}:${provider.uid}`} variant="secondary">
                    {providerLabel(provider.providerId)}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No provider records.</p>
              )}
            </div>
            <div className="mt-4 grid gap-3">
              {account.auth.providerData.map((provider) => (
                <div
                  key={`${provider.providerId}:${provider.uid}:detail`}
                  className="rounded-2xl border border-border/80 bg-background/70 px-3 py-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {providerLabel(provider.providerId)}
                  </p>
                  <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                    {provider.uid}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {provider.email ?? provider.displayName ?? provider.phoneNumber ?? "No provider profile detail"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
            <p className="section-eyebrow">Profile documents</p>
            <div className="mt-3 grid gap-2">
              <StatusLine
                ok={Boolean(account.profile?.docs.profile)}
                label="profiles/{uid}"
                value={account.profile?.docs.profile ? "Document exists" : "Document not found"}
              />
              <StatusLine
                ok={Boolean(account.profile?.docs.publicProfile)}
                label="public_profiles/{uid}"
                value={
                  account.profile?.docs.publicProfile
                    ? "Document exists"
                    : "Document not found"
                }
              />
              <StatusLine
                ok={Boolean(account.profile?.docs.communityUser)}
                label="community_users/{uid}"
                value={
                  account.profile?.docs.communityUser
                    ? "Document exists"
                    : "Document not found"
                }
              />
              <StatusLine
                ok={Boolean(account.profile?.docs.reportOwner)}
                label="report_owners/{uid}"
                value={
                  account.profile?.docs.reportOwner
                    ? "Document exists"
                    : "Document not found"
                }
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-3">
          <p className="section-eyebrow">Custom claims</p>
          <pre className="mt-2 max-h-64 overflow-auto rounded-2xl bg-muted/70 px-4 py-3 font-mono text-xs text-muted-foreground">
            {customClaims}
          </pre>
        </div>
      </section>
    </div>
  );
}
