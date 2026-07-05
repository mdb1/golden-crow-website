import Link from "next/link";
import { ArrowRight, UserRoundCog } from "lucide-react";
import { AreaAccessEntry } from "@/components/area-access-entry";
import { HelperBanner } from "@/components/helper-banner";
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
  const language = await getServerAppLanguage();
  const t = (text: string) => appText(language, text);
  const { roles } = await sdkFetchServer<{ roles: RoleManagementRecord[] }>(
    "/roles",
  );
  const roleCreationNeedsInstitutionAdmin =
    shouldAskInstitutionAdminForRoleCreation(adminContext);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow={t("Access")}
        title={t("Roles & permissions")}
        description={t(
          "Email-based role assignments with a clear hierarchy: full admin, institution admin, institution operator, institution laboratory staff, institution doctor, and patient.",
        )}
      />
      <HelperBanner
        title={t("The permission tree must stay explicit.")}
        tone="blue"
      >
        {t(
          "Full admins can create anything. Institution admins stay inside one institution. Institution doctors can only create patient-facing records and patient roles tied to their own doctor scope.",
        )}
      </HelperBanner>
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
        description="Open the role-by-role capabilities guide or jump directly into the role creation flow."
      />
      <section className="glass-panel flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UserRoundCog className="h-4 w-4" />
          </div>
          <div>
            <p className="section-eyebrow">{t("Self-service")}</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {t("My account")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t(
                "Review your own role, permissions, and Firebase Auth details without opening another user's role assignment.",
              )}
            </p>
          </div>
        </div>
        <Button size="lg" className="justify-between md:min-w-[12rem]" asChild>
          <Link href="/my-account">
            {t("Access account")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>
      <RolesBrowser initialRoles={roles} />
    </div>
  );
}
