import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminSubmitButton } from "../_components/admin-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/gc-fitness/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  searchUsersByEmailForAdmin,
  type UserSearchResultRow,
} from "@/lib/gc-fitness/admin-actions";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * Resolve the right profile destination for a user by role precedence:
 *   client  → ADMIN client view under their coach. The trainer-facing
 *             /gc-fitness/clients/{uid} page is ownership-gated (404s for
 *             clients of other coaches), so admin search must never link it.
 *   trainer → existing coach detail page
 *   else (admin-only, or a client with no coach) → no dedicated page;
 *             render an inline read-only summary.
 */
function profileHrefForRow(row: UserSearchResultRow): string | null {
  if (row.roles.includes("client")) {
    return row.coachId
      ? `/gc-fitness/admin/coaches/${row.coachId}/clients/${row.uid}`
      : null;
  }
  if (row.roles.includes("trainer")) {
    return `/gc-fitness/admin/coaches/${row.uid}`;
  }
  return null;
}

export default async function AdminUserSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const rows = q.length > 0 ? await searchUsersByEmailForAdmin(q) : [];

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title="User search"
        subtitle="Find any user (client, coach, or admin) by email or email fragment, then open their profile."
      />

      <Button asChild variant="outline" size="sm" className="self-start rounded-full">
        <Link href="/gc-fitness/admin">Back to admin</Link>
      </Button>

      <form
        method="get"
        action="/gc-fitness/admin/users"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <Input
          name="q"
          defaultValue={q}
          placeholder="email or fragment"
          className="sm:max-w-md"
        />
        <AdminSubmitButton
          idleLabel="Search"
          pendingLabel="Searching…"
          className="h-10 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
        />
      </form>

      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>UID</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-right">Profile</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  Type an email or email fragment above to search.
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  No matches.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const href = profileHrefForRow(row);
                return (
                  <TableRow key={row.uid}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {row.photoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.photoURL}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-muted" aria-hidden />
                        )}
                        <div>
                          <div className="font-medium">
                            {row.displayName || "—"}
                            {row.deleted ? (
                              <span className="ml-2 text-xs text-destructive">
                                (deleted)
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.uid}</TableCell>
                    <TableCell>{row.roles.join(", ") || "—"}</TableCell>
                    <TableCell className="text-right">
                      {href ? (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                        >
                          <Link href={href}>View</Link>
                        </Button>
                      ) : (
                        <details className="text-left">
                          <summary className="cursor-pointer text-sm underline underline-offset-2">
                            Admin profile (read-only)
                          </summary>
                          <div className="mt-2 space-y-1 rounded-xl border bg-muted/40 p-3 text-xs">
                            <div>
                              <span className="text-muted-foreground">Email:</span>{" "}
                              {row.email || "—"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Name:</span>{" "}
                              {row.displayName || "—"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">UID:</span>{" "}
                              <span className="font-mono">{row.uid}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Roles:</span>{" "}
                              {row.roles.join(", ") || "—"}
                            </div>
                          </div>
                        </details>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
