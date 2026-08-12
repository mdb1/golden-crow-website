"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  sendEmailVerification,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  AtSign,
  BadgeCheck,
  Braces,
  CheckCircle2,
  FileCheck2,
  Fingerprint,
  KeyRound,
  MailCheck,
  RotateCcw,
  Save,
  ShieldCheck,
  UserRoundCog,
  XCircle,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
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
import { getRoleBadgeVariant, ROLE_CAPABILITY_LINES } from "@/lib/areas-ui";
import { auth } from "@/lib/firebase";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

type RoleProfileState = {
  displayName: string;
  contactPhone: string;
  notes: string;
};

type RoleProfileErrors = Partial<Record<keyof RoleProfileState, string>>;
type InlineMessage = {
  tone: "success" | "error" | "info";
  message: string;
} | null;

const DISPLAY_NAME_MAX_LENGTH = 100;
const CONTACT_PHONE_MAX_LENGTH = 30;
const NOTES_MAX_LENGTH = 600;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-\s.]{1,30}$/;

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

function rolePayload(state: RoleProfileState): RoleProfileState {
  return {
    displayName: state.displayName.trim(),
    contactPhone: state.contactPhone.trim(),
    notes: state.notes.trim(),
  };
}

function validateRoleProfile(state: RoleProfileState): RoleProfileErrors {
  const nextPayload = rolePayload(state);
  const errors: RoleProfileErrors = {};

  if (nextPayload.displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = `Use ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (nextPayload.contactPhone.length > CONTACT_PHONE_MAX_LENGTH) {
    errors.contactPhone = `Use ${CONTACT_PHONE_MAX_LENGTH} characters or fewer.`;
  } else if (
    nextPayload.contactPhone.length > 0 &&
    !PHONE_PATTERN.test(nextPayload.contactPhone)
  ) {
    errors.contactPhone =
      "Use digits, spaces, +, parentheses, hyphens, or dots.";
  }

  if (nextPayload.notes.length > NOTES_MAX_LENGTH) {
    errors.notes = `Use ${NOTES_MAX_LENGTH} characters or fewer.`;
  }

  return errors;
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
      },
    );
  });
}

function scopeText(account: MyAccountRecord) {
  const role = account.role;
  if (!role) {
    return "No role assignment record is linked to this session.";
  }

  return (
    [
      role.organizationName ?? role.organizationId,
      role.institutionName ?? role.institutionId,
      role.doctorName ?? role.doctorId,
      role.patientName ?? role.patientId,
    ]
      .filter(Boolean)
      .join(" / ") || "Global scope"
  );
}

function primaryAccountName(account: MyAccountRecord) {
  return (
    account.role?.displayName ||
    account.profile?.fullName ||
    account.auth.displayName ||
    account.auth.email
  );
}

function statusBadgeVariant(ok: boolean) {
  return ok ? "success" : "warning";
}

function SectionShell({
  icon,
  title,
  actions,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass-panel flex flex-col gap-4 px-5 py-4", className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <h2 className="font-heading text-xl font-semibold text-foreground">
            {title}
          </h2>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function ReadOnlyField({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border/80 bg-muted/35 px-3 py-2.5",
        wide && "md:col-span-2 xl:col-span-4",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 break-words text-sm font-medium text-foreground",
          mono && "font-mono text-xs",
        )}
      >
        {formatValue(value)}
      </p>
    </div>
  );
}

function EditableField({
  id,
  label,
  helper,
  error,
  count,
  children,
}: {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  count?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {count ? (
          <span
            className={cn(
              "text-xs text-muted-foreground",
              error && "text-destructive",
            )}
          >
            {count}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : helper ? (
        <p className="text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

function StatusItem({
  ok,
  label,
  value,
}: {
  ok: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/35 px-3 py-2.5">
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          ok
            ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-200"
            : "bg-destructive/10 text-destructive",
        )}
      >
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm font-medium",
            ok ? "text-emerald-700 dark:text-emerald-200" : "text-destructive",
          )}
        >
          {label}
        </p>
        <p className="mt-0.5 break-words text-sm text-muted-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

function InlineStatus({ message }: { message: InlineMessage }) {
  if (!message) {
    return null;
  }

  return (
    <p
      className={cn(
        "text-xs font-medium",
        message.tone === "success" && "text-emerald-700 dark:text-emerald-200",
        message.tone === "error" && "text-destructive",
        message.tone === "info" && "text-muted-foreground",
      )}
    >
      {message.message}
    </p>
  );
}

function ProviderDetail({
  provider,
}: {
  provider: MyAccountRecord["auth"]["providerData"][number];
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/35 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{providerLabel(provider.providerId)}</Badge>
        <span className="break-all font-mono text-xs text-muted-foreground">
          {provider.providerId}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Provider uid</dt>
          <dd className="break-all font-mono text-xs text-foreground">
            {provider.uid}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Provider email</dt>
          <dd className="break-words text-foreground">
            {formatValue(provider.email)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Provider name</dt>
          <dd className="break-words text-foreground">
            {formatValue(provider.displayName)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Provider phone</dt>
          <dd className="break-words text-foreground">
            {formatValue(provider.phoneNumber)}
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-xs text-muted-foreground">Provider photo</dt>
          <dd className="break-all font-mono text-xs text-foreground">
            {formatValue(provider.photoURL)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function MyAccountWorkbench({
  initialAccount,
}: {
  initialAccount: MyAccountRecord;
}) {
  const [account, setAccount] = useState(initialAccount);
  const [roleState, setRoleState] = useState<RoleProfileState>(() =>
    toRoleProfileState(initialAccount),
  );
  const [newEmail, setNewEmail] = useState(initialAccount.auth.email);
  const [emailMessage, setEmailMessage] = useState<InlineMessage>(null);
  const [pendingRoleSave, setPendingRoleSave] = useState(false);
  const [pendingEmailSave, setPendingEmailSave] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const sourceRoleState = useMemo(() => toRoleProfileState(account), [account]);
  const roleErrors = useMemo(() => validateRoleProfile(roleState), [roleState]);
  const roleHasErrors = Object.values(roleErrors).some(Boolean);
  const roleChanged =
    JSON.stringify(rolePayload(roleState)) !==
    JSON.stringify(rolePayload(sourceRoleState));
  const canEditRoleProfile = Boolean(account.role && !account.role.bootstrap);
  const canChangeEmail = Boolean(account.role && !account.role.bootstrap);
  const normalizedAuthEmail = normalizeEmail(account.auth.email);
  const normalizedNewEmail = normalizeEmail(newEmail);
  const emailChanged = normalizedNewEmail !== normalizedAuthEmail;
  const customClaims = JSON.stringify(account.auth.customClaims, null, 2);
  const displayName = primaryAccountName(account);
  const currentScope = scopeText(account);
  const providerNames =
    account.auth.providerData.map((provider) => providerLabel(provider.providerId)).join(", ") ||
    undefined;
  const roleCapabilityLines = ROLE_CAPABILITY_LINES[account.context.role] ?? [];

  function validateEmailCandidate(showSuccess = true) {
    if (!canChangeEmail) {
      setEmailMessage({
        tone: "error",
        message: "This account email is managed outside My account.",
      });
      return false;
    }

    if (!normalizedNewEmail) {
      setEmailMessage({
        tone: "error",
        message: "Enter the email address before changing it.",
      });
      return false;
    }

    if (!EMAIL_PATTERN.test(normalizedNewEmail)) {
      setEmailMessage({
        tone: "error",
        message: "Use a valid email address.",
      });
      return false;
    }

    setEmailMessage(
      showSuccess
        ? {
            tone: emailChanged ? "success" : "info",
            message: emailChanged
              ? "Email format is valid. You can change the account email."
              : "Email format is valid and matches the current account email.",
          }
        : null,
    );
    return true;
  }

  async function handleRoleSave() {
    if (!canEditRoleProfile) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "This role assignment is not editable from My account.",
      });
      return;
    }

    if (roleHasErrors) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Fix the highlighted fields before saving.",
      });
      return;
    }

    const payload = rolePayload(roleState);
    setPendingRoleSave(true);
    try {
      const result = await sdkFetch<{ account: MyAccountRecord }>(
        "/auth/my-account/role",
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      setAccount(result.account);
      setRoleState(toRoleProfileState(result.account));
      setToast({
        id: Date.now(),
        tone: "success",
        message: "Profile details saved.",
      });
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to save your profile details.",
      });
    } finally {
      setPendingRoleSave(false);
    }
  }

  async function handleEmailSave() {
    if (!validateEmailCandidate(false)) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: "Validate the email field before changing it.",
      });
      return;
    }

    if (!emailChanged) {
      setEmailMessage({
        tone: "info",
        message: "This is already the current account email.",
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
        },
      );
      setAccount(result.account);
      setRoleState(toRoleProfileState(result.account));
      setNewEmail(result.account.auth.email);
      setEmailMessage({
        tone: "success",
        message: "Email change saved.",
      });
      setToast({
        id: Date.now(),
        tone: "success",
        message: result.requiresSignIn
          ? "Email changed. Sign out and sign back in with the new email to refresh this session."
          : "The requested email is already active on this account.",
        durationMs: 9000,
      });
    } catch (error) {
      setEmailMessage({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to change your email.",
      });
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
          "The browser Firebase session email does not match this account. Sign out and sign in again before sending verification.",
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

  const hasActiveSurfaceAccess =
    account.context.canAccessBackoffice ||
    account.context.canAccessPatientPortal;

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <section className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserRoundCog className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="truncate font-heading text-2xl font-semibold text-foreground">
                    {displayName}
                  </h1>
                  <HeaderUnclutterButton />
                </div>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {account.auth.email}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Badge variant={getRoleBadgeVariant(account.context.role)}>
              {ADMIN_ROLE_LABELS[account.context.role]}
            </Badge>
            <Badge variant={statusBadgeVariant(hasActiveSurfaceAccess)}>
              {hasActiveSurfaceAccess ? "Active access" : "Inactive access"}
            </Badge>
            <Badge variant={statusBadgeVariant(account.auth.emailVerified)}>
              {account.auth.emailVerified ? "Verified email" : "Unverified email"}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReadOnlyField label="Scope" value={currentScope} />
          <ReadOnlyField label="Current project" value={account.context.project} />
          <ReadOnlyField label="Username" value={account.profile?.username} />
          <ReadOnlyField
            label="Last sign-in"
            value={formatDate(account.auth.metadata.lastSignInTime)}
          />
        </div>
      </section>

      <div className="flex flex-col gap-5">
        <SectionShell
          icon={<BadgeCheck className="h-4 w-4" />}
          title="Profile Details"
          actions={
            <>
              <Badge variant={canEditRoleProfile ? "brand" : "secondary"}>
                {canEditRoleProfile ? "Editable" : "Read only"}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRoleState(sourceRoleState)}
                disabled={!roleChanged || pendingRoleSave || !canEditRoleProfile}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleRoleSave()}
                disabled={
                  !roleChanged ||
                  roleHasErrors ||
                  pendingRoleSave ||
                  !canEditRoleProfile
                }
              >
                <Save className="h-3.5 w-3.5" />
                {pendingRoleSave ? "Saving..." : "Save Profile"}
              </Button>
            </>
          }
        >
          {!canEditRoleProfile ? (
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-100">
              Bootstrap allowlist assignments are managed by environment configuration.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <EditableField
              id="my-role-display-name"
              label="Display name"
              helper="Optional name shown on this role assignment."
              error={roleErrors.displayName}
              count={`${rolePayload(roleState).displayName.length}/${DISPLAY_NAME_MAX_LENGTH}`}
            >
              <Input
                id="my-role-display-name"
                value={roleState.displayName}
                onChange={(event) =>
                  setRoleState((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                placeholder="Full name"
                aria-invalid={Boolean(roleErrors.displayName)}
                disabled={!canEditRoleProfile || pendingRoleSave}
              />
            </EditableField>
            <EditableField
              id="my-role-phone"
              label="Contact phone"
              helper="Optional phone number for operational contact."
              error={roleErrors.contactPhone}
              count={`${rolePayload(roleState).contactPhone.length}/${CONTACT_PHONE_MAX_LENGTH}`}
            >
              <Input
                id="my-role-phone"
                value={roleState.contactPhone}
                onChange={(event) =>
                  setRoleState((current) => ({
                    ...current,
                    contactPhone: event.target.value,
                  }))
                }
                placeholder="+54 11 5555 5555"
                aria-invalid={Boolean(roleErrors.contactPhone)}
                disabled={!canEditRoleProfile || pendingRoleSave}
              />
            </EditableField>
            <div className="md:col-span-2">
              <EditableField
                id="my-role-notes"
                label="Notes"
                helper="Optional internal note on your role assignment."
                error={roleErrors.notes}
                count={`${rolePayload(roleState).notes.length}/${NOTES_MAX_LENGTH}`}
              >
                <Textarea
                  id="my-role-notes"
                  value={roleState.notes}
                  onChange={(event) =>
                    setRoleState((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={5}
                  placeholder="No notes"
                  aria-invalid={Boolean(roleErrors.notes)}
                  disabled={!canEditRoleProfile || pendingRoleSave}
                />
              </EditableField>
            </div>
          </div>
        </SectionShell>

        <SectionShell
          icon={<AtSign className="h-4 w-4" />}
          title="Email & Verification"
        >
          <div className="grid gap-3">
            <StatusItem
              ok={account.auth.emailVerified}
              label={account.auth.emailVerified ? "Email verified" : "Email not verified"}
              value={account.auth.email}
            />
            <StatusItem
              ok={!account.auth.disabled}
              label={account.auth.disabled ? "Firebase account disabled" : "Firebase account enabled"}
              value={account.auth.uid}
            />
          </div>

          <EditableField
            id="my-auth-email"
            label="Account email"
            helper={
              canChangeEmail
                ? "Changing email also moves your role assignment record."
                : "Bootstrap account emails are read only here."
            }
          >
            <Input
              id="my-auth-email"
              type="email"
              value={newEmail}
              onChange={(event) => {
                setNewEmail(event.target.value);
                setEmailMessage(null);
              }}
              placeholder="name@example.com"
              aria-invalid={emailMessage?.tone === "error"}
              disabled={!canChangeEmail || pendingEmailSave}
            />
          </EditableField>
          <InlineStatus message={emailMessage} />

          <div className="grid gap-3 border-t border-border/80 pt-4 md:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-full"
              onClick={() => void handleSendVerification()}
              disabled={pendingVerification || account.auth.emailVerified}
            >
              <MailCheck className="h-4 w-4" />
              {account.auth.emailVerified
                ? "Email Verified"
                : pendingVerification
                  ? "Sending..."
                  : "Send Verification"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-full"
              onClick={() => validateEmailCandidate(true)}
              disabled={!canChangeEmail || pendingEmailSave}
            >
              <CheckCircle2 className="h-4 w-4" />
              Validate Email
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-11 w-full"
              onClick={() => void handleEmailSave()}
              disabled={!emailChanged || !canChangeEmail || pendingEmailSave}
            >
              <Save className="h-4 w-4" />
              {pendingEmailSave ? "Changing..." : "Change Email"}
            </Button>
          </div>
        </SectionShell>
      </div>

      <SectionShell
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Access & Permissions"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReadOnlyField
            label="Role email"
            value={account.role?.email ?? account.context.email}
            mono
          />
          <ReadOnlyField
            label="Role"
            value={
              account.role
                ? ADMIN_ROLE_LABELS[account.role.role]
                : ADMIN_ROLE_LABELS[account.context.role]
            }
          />
          <ReadOnlyField
            label="Role status"
            value={account.role?.isActive ?? hasActiveSurfaceAccess}
          />
          <ReadOnlyField label="Scope" value={currentScope} />
          <ReadOnlyField label="Organization id" value={account.role?.organizationId} mono />
          <ReadOnlyField label="Institution id" value={account.role?.institutionId} mono />
          <ReadOnlyField label="Doctor id" value={account.role?.doctorId} mono />
          <ReadOnlyField label="Patient id" value={account.role?.patientId} mono />
          <ReadOnlyField label="Created by" value={account.role?.createdByEmail} mono />
          <ReadOnlyField label="Role created" value={formatDate(account.role?.createdAt)} />
          <ReadOnlyField label="Role updated" value={formatDate(account.role?.updatedAt)} />
          <ReadOnlyField
            label="Bootstrap"
            value={account.role?.bootstrap ?? account.context.isBootstrap}
          />
          <ReadOnlyField
            label="Patient portal access"
            value={account.context.canAccessPatientPortal}
          />
          <ReadOnlyField
            label="Project access"
            value={
              account.context.projectAccess.length
                ? account.context.projectAccess.join(", ")
                : undefined
            }
            wide
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="rounded-lg border border-border/80 bg-muted/35 px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getRoleBadgeVariant(account.context.role)}>
                {ADMIN_ROLE_LABELS[account.context.role]}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {ADMIN_ROLE_DESCRIPTIONS[account.context.role]}
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {roleCapabilityLines.map((line) => (
                <div
                  key={line}
                  className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/35 px-3 py-3">
            <p className="text-sm font-medium text-foreground">Capability keys</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {account.capabilities.length > 0 ? (
                account.capabilities.map((capability) => (
                  <div
                    key={capability}
                    className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 font-mono text-xs text-muted-foreground"
                  >
                    {capability}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No capability keys returned.
                </p>
              )}
            </div>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        icon={<Fingerprint className="h-4 w-4" />}
        title="Firebase Identity"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReadOnlyField label="Firebase uid" value={account.auth.uid} mono />
          <ReadOnlyField label="Firebase email" value={account.auth.email} mono />
          <ReadOnlyField label="Auth display name" value={account.auth.displayName} />
          <ReadOnlyField label="Auth phone" value={account.auth.phoneNumber} />
          <ReadOnlyField label="Photo URL" value={account.auth.photoURL} mono wide />
          <ReadOnlyField label="Tenant id" value={account.auth.tenantId} mono />
          <ReadOnlyField
            label="Created"
            value={formatDate(account.auth.metadata.creationTime)}
          />
          <ReadOnlyField
            label="Last sign-in"
            value={formatDate(account.auth.metadata.lastSignInTime)}
          />
          <ReadOnlyField
            label="Last refresh"
            value={formatDate(account.auth.metadata.lastRefreshTime)}
          />
          <ReadOnlyField
            label="Tokens valid after"
            value={formatDate(account.auth.tokensValidAfterTime)}
          />
          <ReadOnlyField label="Profile full name" value={account.profile?.fullName} />
          <ReadOnlyField
            label="Onboarding complete"
            value={account.profile?.onboardingCompleted}
          />
          <ReadOnlyField
            label="Onboarding needs completion"
            value={account.profile?.needsCompletion}
          />
          <ReadOnlyField label="Sign-in providers" value={providerNames} />
        </div>
      </SectionShell>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionShell icon={<KeyRound className="h-4 w-4" />} title="Sign-In Providers">
          <div className="grid gap-3">
            {account.auth.providerData.length > 0 ? (
              account.auth.providerData.map((provider) => (
                <ProviderDetail
                  key={`${provider.providerId}:${provider.uid}`}
                  provider={provider}
                />
              ))
            ) : (
              <div className="rounded-lg border border-border/80 bg-muted/35 px-3 py-2.5 text-sm text-muted-foreground">
                No provider records.
              </div>
            )}
          </div>
        </SectionShell>

        <SectionShell icon={<FileCheck2 className="h-4 w-4" />} title="Profile Documents">
          <div className="grid gap-3">
            <StatusItem
              ok={Boolean(account.profile?.docs.profile)}
              label="profiles/{uid}"
              value={account.profile?.docs.profile ? "Document exists" : "Document not found"}
            />
            <StatusItem
              ok={Boolean(account.profile?.docs.publicProfile)}
              label="public_profiles/{uid}"
              value={
                account.profile?.docs.publicProfile
                  ? "Document exists"
                  : "Document not found"
              }
            />
            <StatusItem
              ok={Boolean(account.profile?.docs.communityUser)}
              label="community_users/{uid}"
              value={
                account.profile?.docs.communityUser
                  ? "Document exists"
                  : "Document not found"
              }
            />
            <StatusItem
              ok={Boolean(account.profile?.docs.reportOwner)}
              label="report_owners/{uid}"
              value={
                account.profile?.docs.reportOwner
                  ? "Document exists"
                  : "Document not found"
              }
            />
          </div>
        </SectionShell>
      </div>

      <SectionShell icon={<Braces className="h-4 w-4" />} title="Custom Claims">
        <pre className="max-h-72 overflow-auto rounded-lg border border-border/80 bg-muted/50 px-4 py-3 font-mono text-xs text-muted-foreground">
          {customClaims}
        </pre>
      </SectionShell>
    </div>
  );
}
