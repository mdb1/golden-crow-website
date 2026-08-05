"use client";

// CoachlessUsersTable.tsx — the coach-less users list with search + sortable
// columns (issue #606) and real avatars (issue #636).
//
// The page stays a Server Component that scans Firestore and defines the
// god-mode Server Actions; this component owns only the client-side view state
// (query + sort) over the already-loaded rows, so typing never re-queries and
// the "N coach-less users" header keeps counting the full set.
//
// Avatars go through `ClientAvatar`, which falls back to initials when there is
// no photoURL (Apple private-relay signups) or when the image 404s — the raw
// `<img>` this replaced rendered an empty grey circle in both cases (#636).

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";

import { AdminSubmitButton } from "../../_components/admin-submit-button";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CoachlessUserRow } from "@/lib/gc-fitness/admin-coachless-actions";
import { resolveDisplayTier } from "@/lib/gc-fitness/coachless-user-model";
import {
  DEFAULT_COACHLESS_SORT,
  nextCoachlessSort,
  selectCoachlessRows,
  type CoachlessSort,
  type CoachlessSortKey,
} from "@/lib/gc-fitness/coachless-user-table";
import { cn } from "@/lib/utils";
import { civilDateFormat } from "@/lib/gc-fitness/civil-date";

const ROUTE = "/gc-fitness/admin/coach-less-users";

export interface CoachOption {
  uid: string;
  displayName: string;
  email: string;
}

export interface CoachlessUsersTableProps {
  rows: CoachlessUserRow[];
  coaches: CoachOption[];
  assignCoachAction: (formData: FormData) => Promise<void>;
  setTierAction: (formData: FormData) => Promise<void>;
  deleteUserAction: (formData: FormData) => Promise<void>;
  /** The admin's IANA zone, resolved server-side (#747). */
  timezone: string;
}

// Stable YYYY-MM-DD — locale-independent by construction, so it never picks up
// the server-locale flake that date tests hit. #747: the `iso.slice(0, 10)`
// this replaced was stable AND wrong, since the first 10 chars of an ISO
// instant are its UTC day, not the admin's.
function formatDate(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return civilDateFormat(date, timezone);
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  numeric,
}: {
  label: string;
  sortKey: CoachlessSortKey;
  sort: CoachlessSort;
  onSort: (key: CoachlessSortKey) => void;
  numeric?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={numeric ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground",
          numeric && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </TableHead>
  );
}

export function CoachlessUsersTable({
  rows,
  coaches,
  assignCoachAction,
  setTierAction,
  deleteUserAction,
  timezone,
}: CoachlessUsersTableProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CoachlessSort>(DEFAULT_COACHLESS_SORT);

  const visible = useMemo(
    () => selectCoachlessRows(rows, { query, sort }),
    [rows, query, sort],
  );

  const onSort = (key: CoachlessSortKey) => setSort((s) => nextCoachlessSort(s, key));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or uid…"
            aria-label="Search coach-less users"
            className="h-9 pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {visible.length === rows.length
            ? `${rows.length} coach-less user${rows.length === 1 ? "" : "s"}.`
            : `${visible.length} of ${rows.length} coach-less users.`}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="User" sortKey="user" sort={sort} onSort={onSort} />
              <SortableHead
                label="Subscription"
                sortKey="subscription"
                sort={sort}
                onSort={onSort}
              />
              <SortableHead label="Routines" sortKey="routines" sort={sort} onSort={onSort} numeric />
              <SortableHead label="Habits" sortKey="habits" sort={sort} onSort={onSort} numeric />
              <SortableHead label="Photos" sortKey="photos" sort={sort} onSort={onSort} numeric />
              <SortableHead label="Logs" sortKey="logs" sort={sort} onSort={onSort} numeric />
              <SortableHead label="Created" sortKey="created" sort={sort} onSort={onSort} />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "No coach-less users."
                    : "No coach-less users match that search."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => {
                const tier = resolveDisplayTier(row.entitlement);
                const isPremium = tier === "premium";
                const label = row.displayName || row.email || row.uid;
                return (
                  <TableRow key={row.uid}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ClientAvatar
                          name={label}
                          photoURL={row.photoURL}
                          size="sm"
                          className="h-8 w-8 text-xs"
                        />
                        <div>
                          {/* Row → god-mode profile (activity, routines, habits,
                              logs, photos). The detail page is the only place
                              a coach-less user's content is inspectable. */}
                          <Link
                            href={`${ROUTE}/${row.uid}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {row.displayName || row.email || "—"}
                          </Link>
                          <div className="text-xs text-muted-foreground">{row.email || "—"}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {row.uid}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          isPremium
                            ? "inline-flex rounded-full border border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--badge-success-fg)]"
                            : "inline-flex rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {isPremium ? "Premium" : "Free"}
                      </span>
                      {row.entitlement ? (
                        <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                          <div>source: {row.entitlement.source || "—"}</div>
                          {row.entitlement.expiresAtISO ? (
                            <div>expires: {formatDate(row.entitlement.expiresAtISO, timezone)}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.stats.routines}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.stats.habits}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.stats.progressPhotos}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.stats.workoutLogs}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(row.createdAtISO, timezone)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-2">
                        {coaches.length > 0 ? (
                          <form action={assignCoachAction} className="flex items-center gap-1">
                            <input type="hidden" name="uid" value={row.uid} />
                            <select
                              name="newCoachUid"
                              required
                              defaultValue=""
                              aria-label={`Assign ${label} to a coach`}
                              className="h-8 max-w-[11rem] rounded-md border bg-background px-2 text-xs"
                            >
                              <option value="" disabled>
                                Assign coach…
                              </option>
                              {coaches.map((coach) => (
                                <option key={coach.uid} value={coach.uid}>
                                  {coach.displayName || coach.email}
                                </option>
                              ))}
                            </select>
                            <AdminSubmitButton
                              idleLabel="Assign"
                              pendingLabel="Assigning…"
                              title="Links this user to the coach — they stop being coach-less and gain coached premium"
                              className="h-8 rounded-full border px-3 text-xs hover:bg-muted"
                            />
                          </form>
                        ) : null}

                        <form action={setTierAction}>
                          <input type="hidden" name="uid" value={row.uid} />
                          <input type="hidden" name="tier" value={isPremium ? "free" : "premium"} />
                          <AdminSubmitButton
                            idleLabel={isPremium ? "Revoke premium" : "Grant premium"}
                            pendingLabel="Saving…"
                            className="h-8 rounded-full border px-3 text-xs hover:bg-muted"
                          />
                        </form>

                        <details className="text-right">
                          <summary className="cursor-pointer text-xs text-destructive underline underline-offset-2">
                            Delete user
                          </summary>
                          <form
                            action={deleteUserAction}
                            className="mt-2 flex flex-col items-end gap-2"
                          >
                            <input type="hidden" name="uid" value={row.uid} />
                            <p className="max-w-[16rem] text-left text-[10px] text-muted-foreground">
                              Irreversible: deletes Auth, all Firestore data, and Storage
                              photos. Type <span className="font-mono">{row.email}</span> to
                              confirm.
                            </p>
                            <Input
                              name="emailConfirmation"
                              placeholder="type email to confirm"
                              className="h-8 w-64 text-xs"
                              autoComplete="off"
                            />
                            <AdminSubmitButton
                              idleLabel="Delete forever"
                              pendingLabel="Deleting…"
                              className="h-8 rounded-full bg-destructive px-3 text-xs text-destructive-foreground hover:bg-destructive/90"
                            />
                          </form>
                        </details>
                      </div>
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
