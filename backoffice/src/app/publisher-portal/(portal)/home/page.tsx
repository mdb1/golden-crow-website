import { BadgeCheck, Newspaper } from "lucide-react";
import { ADMIN_ROLE_LABELS, type MyAccountRecord } from "@/lib/admin-areas";
import { sdkFetchServer } from "@/lib/sdk-server";

export default async function PublisherPortalHomePage() {
  const { account } = await sdkFetchServer<{ account: MyAccountRecord }>(
    "/auth/my-account",
  );
  const displayName =
    account.role?.displayName ||
    account.auth.displayName ||
    account.context.email;
  const roleLabel = account.role
    ? ADMIN_ROLE_LABELS[account.role.role]
    : ADMIN_ROLE_LABELS[account.context.role];

  return (
    <div className="min-h-[calc(100vh-var(--app-header-height)-3rem)] bg-background px-1 py-3 text-foreground">
      <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Newspaper className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {displayName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {account.context.email}
              </span>
            </span>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
            <BadgeCheck className="size-3.5" />
            {roleLabel}
          </span>
        </div>
      </section>

      <section className="mt-6 flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 text-center">
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          No hay contenido para mostrar todavía.
        </p>
      </section>
    </div>
  );
}
