"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Unlink,
  UserRoundX,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  DeferredServiceTransactionIndexDetail,
  DeferredServiceTransactionsPage,
} from "@/lib/support-services";

const ROUTE = "/god-mode/defered-service-transactions";
const API_ROUTE = "/admin/support-services/deferred-transactions";
const PANEL_CLASS =
  "overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The request failed.";
}

export function DeferredServiceTransactionsBrowser() {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const listQuery = useInfiniteQuery({
    queryKey: ["deferred-service-transactions", activeQuery],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const parameters = new URLSearchParams({ limit: "20" });
      if (pageParam) parameters.set("cursor", pageParam);
      if (activeQuery) parameters.set("query", activeQuery);
      return sdkFetch<DeferredServiceTransactionsPage>(
        `${API_ROUTE}?${parameters.toString()}`,
      );
    },
    getNextPageParam: (page) => page.nextCursor,
  });

  const rows = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.deferredTransactions) ?? [],
    [listQuery.data],
  );

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setActiveQuery(query.trim());
  }

  return (
    <section className={PANEL_CLASS}>
      <div className="flex flex-col gap-4 border-b border-border/70 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {t("Deferred Transactions")}
            </h2>
            <HeaderUnclutterButton />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => listQuery.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            {t("Refresh")}
          </Button>
        </div>
        <form className="flex gap-2" onSubmit={submitSearch}>
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search by email")}
              className="pl-9"
            />
          </label>
          <Button type="submit" variant="secondary">
            {t("Search")}
          </Button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Email")}</TableHead>
              <TableHead>{t("Deferred transactions")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : listQuery.isError ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-destructive">
                  <CircleAlert className="mx-auto mb-2 h-7 w-7" />
                  {errorMessage(listQuery.error)}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  {t("No deferred transaction documents found.")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium text-foreground">
                    {record.email || t("Not available")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{record.transactionCount}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${ROUTE}/${encodeURIComponent(record.id)}`}>
                        {t("Open")}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {listQuery.hasNextPage ? (
        <div className="flex justify-center border-t border-border/70 p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => listQuery.fetchNextPage()}
            disabled={listQuery.isFetchingNextPage}
          >
            {listQuery.isFetchingNextPage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {t("Load more")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function DeferredServiceTransactionWorkbench({
  deferredId,
}: {
  deferredId: string;
}) {
  const router = useRouter();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [email, setEmail] = useState("");
  const [transactionIds, setTransactionIds] = useState<string[]>([]);
  const [newTransactionId, setNewTransactionId] = useState("");
  const [loadedRecordId, setLoadedRecordId] = useState("");
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const detailQuery = useQuery({
    queryKey: ["deferred-service-transaction", deferredId],
    queryFn: () =>
      sdkFetch<{ deferredTransaction: DeferredServiceTransactionIndexDetail }>(
        `${API_ROUTE}/${encodeURIComponent(deferredId)}`,
      ),
  });
  const record = detailQuery.data?.deferredTransaction;

  useEffect(() => {
    if (!record || loadedRecordId === record.id) return;
    setEmail(record.email);
    setTransactionIds(record.deferredTransactionIds);
    setLoadedRecordId(record.id);
  }, [loadedRecordId, record]);

  const saveMutation = useMutation({
    mutationFn: () =>
      sdkFetch<{ deferredTransaction: DeferredServiceTransactionIndexDetail }>(
        `${API_ROUTE}/${encodeURIComponent(deferredId)}`,
        {
          method: "PUT",
          body: JSON.stringify({ email, deferredTransactionIds: transactionIds }),
        },
      ),
    onSuccess: ({ deferredTransaction }) => {
      setEmail(deferredTransaction.email);
      setTransactionIds(deferredTransaction.deferredTransactionIds);
      setLoadedRecordId(deferredTransaction.id);
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Deferred transaction links saved."),
      });
      if (deferredTransaction.id !== deferredId) {
        router.replace(`${ROUTE}/${encodeURIComponent(deferredTransaction.id)}`);
      } else {
        void detailQuery.refetch();
      }
    },
    onError: (error) =>
      setToast({
        id: Date.now(),
        tone: "error",
        message: errorMessage(error),
        details: error instanceof Error ? error.stack : undefined,
      }),
  });

  function addTransaction() {
    const id = newTransactionId.trim();
    if (!/^pgr_[a-z0-9_]+$/.test(id)) {
      setFormError(t("Use a canonical pgr_* transaction ID."));
      return;
    }
    if (transactionIds.includes(id)) {
      setFormError(t("That transaction is already linked."));
      return;
    }
    setTransactionIds((current) => [...current, id]);
    setNewTransactionId("");
    setFormError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      setFormError(t("Email is required."));
      return;
    }
    setFormError("");
    saveMutation.mutate();
  }

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <form className={PANEL_CLASS} onSubmit={submit}>
        <div className="flex flex-col gap-3 border-b border-border/70 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {t("Deferred Transaction")}
            </h2>
            <HeaderUnclutterButton />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={ROUTE}>
                <ArrowLeft className="h-4 w-4" />
                {t("Back to deferred transactions")}
              </Link>
            </Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("Save")}
            </Button>
          </div>
        </div>

        {detailQuery.isLoading ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detailQuery.isError ? (
          <div className="p-8 text-center text-destructive">
            <CircleAlert className="mx-auto mb-2 h-7 w-7" />
            {errorMessage(detailQuery.error)}
          </div>
        ) : (
          <div className="space-y-6 p-5">
            <div className="grid gap-2">
              <Label htmlFor="deferred-email">{t("Email")}</Label>
              <Input
                id="deferred-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            {record?.communityUser ? (
              <div className="flex flex-col gap-3 rounded-xl border border-amber-400/45 bg-amber-500/8 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                      {t("A community user already exists for this email.")}
                    </p>
                    <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/75">
                      {t(
                        "This user may already have redeemed a deferred transaction ID.",
                      )}
                    </p>
                    <p className="mt-2 break-all font-mono text-xs text-amber-900 dark:text-amber-200">
                      {record.communityUser.username
                        ? `@${record.communityUser.username} · `
                        : ""}
                      {record.communityUser.email} · {record.communityUser.id}
                    </p>
                  </div>
                </div>
                <Button asChild type="button" variant="outline" size="sm">
                  <Link
                    href={`/collections/community_users/${encodeURIComponent(record.communityUser.id)}`}
                  >
                    {t("Open user")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/25 p-4">
                <UserRoundX className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("No community user has this exact email.")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(
                      "The linked service transactions remain deferred by email until that community account exists.",
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading text-lg font-semibold">
                  {t("Stored deferred transaction IDs")}
                </h3>
                <Badge variant="secondary">{transactionIds.length}</Badge>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newTransactionId}
                  onChange={(event) => setNewTransactionId(event.target.value)}
                  placeholder="pgr_*"
                  className="font-mono"
                />
                <Button type="button" variant="outline" onClick={addTransaction}>
                  <Plus className="h-4 w-4" />
                  {t("Link transaction")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Unlinking removes the transaction from this deferred email index; it does not delete the service transaction.",
                )}
              </p>
              {formError ? (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              ) : null}

              {transactionIds.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {t("No transactions are linked to this email.")}
                </div>
              ) : (
                <div className="space-y-2">
                  {transactionIds.map((transactionId, index) => {
                    return (
                      <div
                        key={`${transactionId}-${index}`}
                        className="flex flex-col gap-3 rounded-xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link2 className="h-4 w-4 text-muted-foreground" />
                            <span className="break-all font-mono text-sm font-medium text-foreground">
                              {transactionId}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button asChild type="button" variant="outline" size="sm">
                            <Link
                              href={`/god-mode/service-transactions/${encodeURIComponent(transactionId)}`}
                            >
                              {t("Open")}
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setTransactionIds((current) =>
                                current.filter((id) => id !== transactionId),
                              )
                            }
                          >
                            <Unlink className="h-4 w-4" />
                            {t("Unlink")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </form>
    </>
  );
}
