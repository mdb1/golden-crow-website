import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, UserRoundCog } from "lucide-react";
import { AreaAccessEntry } from "@/components/area-access-entry";
import { HeaderUnclutterScope } from "@/components/header-unclutter";
import { RolesBrowser } from "@/components/areas/roles-browser";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { getAdminContextServer } from "@/lib/admin-context-server";
import type { RoleManagementRecord } from "@/lib/admin-areas";
import {
  canCreateRoleUi,
  shouldAskInstitutionAdminForRoleCreation,
} from "@/lib/areas-ui";
import { appText } from "@/lib/language";
import { getServerAppLanguage } from "@/lib/server-language";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function RolesPage() {
  const adminContext = await getAdminContextServer();
  if (adminContext.role === "organization_publisher") {
    redirect("/my-account");
  }
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { roles } = await sdkFetchServer<{ roles: RoleManagementRecord[] }>(
    "/roles",
  );
  const roleCreationNeedsInstitutionAdmin =
    shouldAskInstitutionAdminForRoleCreation(adminContext);

  return (
    <div className="flex flex-col gap-6">
      <HeaderUnclutterScope
        header={
          <PageHero
            eyebrow={t("Access")}
            title={t("Roles & permissions")}
            description={t(
              "Email-based role assignments with a clear hierarchy: full admin, institution admin, institution operator, institution laboratory staff, institution doctor, and patient.",
            )}
          />
        }
      >
        <AreaAccessEntry
          accessHref="/roles/access"
          accessLabel="Role assignment capabilities"
          createHref="/roles/new"
          canCreate={canCreateRoleUi(adminContext)}
          createLabel="Create role"
          createBlockedAlert={
            roleCreationNeedsInstitutionAdmin
              ? "Ask the institution administrator to add a new role."
              : undefined
          }
          createDisabledTitle="The current role cannot create role assignments on this screen."
        />
        <section className="glass-panel flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserRoundCog className="h-4 w-4" />
            </div>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {t("My account")}
            </h2>
          </div>
          <Button size="lg" className="justify-between md:min-w-[12rem]" asChild>
            <Link href="/my-account">
              {t("Access account")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>
        <RolesBrowser initialRoles={roles} />
      </HeaderUnclutterScope>
      <section className="border-t border-border/70 pt-3 text-xs leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">
            {t("Access requirement")}
          </span>{" "}
          {t(
            "System access depends on role assignment. A user can enter only after an active role has been assigned to their email. Without an assigned role, or after that role is removed, the user can no longer access the system.",
          )}
        </p>
      </section>
    </div>
  );
}
