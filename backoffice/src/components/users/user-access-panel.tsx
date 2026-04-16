import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AdminContextRecord,
  RoleManagementRecord,
} from "@/lib/admin-areas";
import {
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
} from "@/lib/admin-areas";
import {
  canCreateRoleUi,
  canEditRoleUi,
  getRoleBadgeVariant,
  getRoleCreateRestrictionMessage,
  getRoleEditRestrictionMessage,
} from "@/lib/areas-ui";
import { compactList } from "@/lib/moderation-utils";
import type { AdminUserRecord } from "@/lib/moderation-types";

export function UserAccessPanel({
  adminContext,
  roleRecord,
  user,
}: {
  adminContext: AdminContextRecord;
  roleRecord: RoleManagementRecord | null;
  user: Pick<AdminUserRecord, "uid" | "email" | "displayName">;
}) {
  const normalizedEmail = user.email.trim();
  const hasEmail = normalizedEmail.length > 0;
  const canCreateRole = hasEmail && canCreateRoleUi(adminContext);
  const canEditRole = roleRecord ? canEditRoleUi(adminContext, roleRecord) : false;
  const roleHref = roleRecord
    ? `/roles/${encodeURIComponent(roleRecord.email)}`
    : `/roles/new?email=${encodeURIComponent(normalizedEmail)}`;
  const scopeSummary = roleRecord
    ? compactList([
        roleRecord.institutionName ?? roleRecord.institutionId,
        roleRecord.doctorName ?? roleRecord.doctorId,
        roleRecord.patientName ?? roleRecord.patientId,
      ]) || "Global scope"
    : null;
  const restrictionMessage = roleRecord
    ? canEditRole
      ? null
      : getRoleEditRestrictionMessage(adminContext, roleRecord)
    : hasEmail
      ? canCreateRole
        ? null
        : getRoleCreateRestrictionMessage(adminContext)
      : "Role assignments are email-based, and this account does not have an email to bind.";

  return (
    <section className="glass-panel flex flex-col gap-4 px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="section-eyebrow">Access</p>
          <h2 className="font-heading text-xl font-semibold text-foreground">
            Roles & permissions
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Account fields and permission boundaries are separate. Review the
            email-based role record here before changing what this user can
            reach in the backoffice.
          </p>
        </div>

        {roleRecord || canCreateRole ? (
          <Button size="sm" asChild>
            <Link href={roleHref}>
              {roleRecord
                ? canEditRole
                  ? "Edit permission"
                  : "View permission"
                : "Create permission"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>

      {roleRecord ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">{roleRecord.email}</p>
              <Badge variant={getRoleBadgeVariant(roleRecord.role)}>
                {ADMIN_ROLE_LABELS[roleRecord.role]}
              </Badge>
              {roleRecord.bootstrap ? <Badge variant="outline">Bootstrap</Badge> : null}
              {roleRecord.isActive ? null : <Badge variant="warning">Inactive</Badge>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {ADMIN_ROLE_DESCRIPTIONS[roleRecord.role]}
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Resolved scope
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">{scopeSummary}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {compactList([
                roleRecord.displayName,
                roleRecord.createdByEmail,
              ]) || "Email-based role assignment"}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/80 bg-background/60 px-4 py-4">
          <p className="font-medium text-foreground">
            No role assignment for {user.displayName || normalizedEmail || user.uid}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The account exists, but it does not currently have an email-scoped
            backoffice role record.
          </p>
        </div>
      )}

      {restrictionMessage ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {restrictionMessage}
        </div>
      ) : null}
    </section>
  );
}
