"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Link2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  Unlink,
  UserRoundX,
  XCircle,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
  DeferredServiceTransactionIndexRecord,
  DeferredServiceTransactionLinksPage,
  DeferredServiceTransactionNotificationPreview,
  DeferredServiceTransactionNotificationResendResult,
  DeferredServiceTransactionsPage,
} from "@/lib/support-services";

const ROUTE = "/god-mode/defered-service-transactions";
const API_ROUTE = "/admin/support-services/deferred-transactions";
const PANEL_CLASS =
  "overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm";

function deferredNotificationApiRoute(
  deferredId: string,
  transactionId: string,
) {
  return `${API_ROUTE}/${encodeURIComponent(deferredId)}/transactions/${encodeURIComponent(transactionId)}/notification`;
}

function createNotificationResendRequestId() {
  return globalThis.crypto.randomUUID();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The request failed.";
}

function requestStatus(error: unknown) {
  return error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : undefined;
}

function requestErrorLog(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "details" in error &&
    typeof error.details === "string"
  ) {
    return error.details;
  }
  if (error instanceof Error) {
    return [
      `Error: ${error.message}`,
      error.stack ? `Stack:\n${error.stack}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  try {
    return `Error:\n${JSON.stringify(error, null, 2)}`;
  } catch {
    return `Error: ${String(error)}`;
  }
}

type DeferredIndexDeletionResult = {
  deferredId: string;
  status: "deleted" | "failed";
  error?: string;
  log?: string;
};

export function DeferredServiceTransactionsBrowser() {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedDeferredIds, setSelectedDeferredIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleteTargets, setDeleteTargets] = useState<
    DeferredServiceTransactionIndexRecord[]
  >([]);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteFinished, setDeleteFinished] = useState(false);
  const [currentDeletingId, setCurrentDeletingId] = useState("");
  const [deleteResults, setDeleteResults] = useState<
    DeferredIndexDeletionResult[]
  >([]);
  const [toast, setToast] = useState<ActionToastState | null>(null);

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
    () =>
      listQuery.data?.pages.flatMap((page) => page.deferredTransactions) ?? [],
    [listQuery.data],
  );
  const visibleDeferredIds = rows.map((record) => record.id);
  const selectedVisibleCount = visibleDeferredIds.filter((id) =>
    selectedDeferredIds.has(id),
  ).length;
  const allVisibleSelected =
    visibleDeferredIds.length > 0 &&
    selectedVisibleCount === visibleDeferredIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && !allVisibleSelected;
  const deleteProgress = deleteTargets.length
    ? (deleteResults.length / deleteTargets.length) * 100
    : 0;
  const deletionFailed = deleteResults.some(
    (result) => result.status === "failed",
  );

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setActiveQuery(query.trim());
  }

  function resetDeletion() {
    setDeleteTargets([]);
    setDeleteRunning(false);
    setDeleteFinished(false);
    setCurrentDeletingId("");
    setDeleteResults([]);
  }

  function openDeletion(targets: DeferredServiceTransactionIndexRecord[]) {
    if (targets.length === 0) return;
    resetDeletion();
    setDeleteTargets(targets);
  }

  function closeDeletion() {
    if (deleteRunning) return;
    const deletedIds = new Set(
      deleteResults
        .filter((result) => result.status === "deleted")
        .map((result) => result.deferredId),
    );
    if (deleteFinished) {
      if (deletedIds.size > 0) {
        setSelectedDeferredIds((current) => {
          const next = new Set(current);
          for (const id of deletedIds) next.delete(id);
          return next;
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["deferred-service-transactions"],
      });
      const failedResult = deleteResults.find(
        (result) => result.status === "failed",
      );
      setToast({
        id: Date.now(),
        tone: deletionFailed ? "error" : "success",
        message: deletionFailed
          ? t("Some deferred indexes could not be deleted.")
          : `${deletedIds.size} ${t(
              deletedIds.size === 1
                ? "deferred index deleted."
                : "deferred indexes deleted.",
            )}`,
        details: failedResult?.log,
      });
    }
    resetDeletion();
  }

  function toggleSelection(deferredId: string) {
    setSelectedDeferredIds((current) => {
      const next = new Set(current);
      if (next.has(deferredId)) next.delete(deferredId);
      else next.add(deferredId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedDeferredIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const id of visibleDeferredIds) next.delete(id);
      } else {
        for (const id of visibleDeferredIds) next.add(id);
      }
      return next;
    });
  }

  async function runDeletion() {
    setDeleteRunning(true);
    setDeleteFinished(false);
    setDeleteResults([]);

    for (const record of deleteTargets) {
      setCurrentDeletingId(record.id);
      try {
        await sdkFetch<{ deleted: boolean; deferredId: string }>(
          `${API_ROUTE}/${encodeURIComponent(record.id)}`,
          { method: "DELETE" },
        );
        setDeleteResults((current) => [
          ...current,
          { deferredId: record.id, status: "deleted" },
        ]);
      } catch (error) {
        setDeleteResults((current) => [
          ...current,
          {
            deferredId: record.id,
            status: "failed",
            error: errorMessage(error),
            log: requestErrorLog(error),
          },
        ]);
        break;
      }
    }

    setCurrentDeletingId("");
    setDeleteRunning(false);
    setDeleteFinished(true);
  }

  return (
    <>
      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
      <Dialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) closeDeletion();
        }}
      >
        <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {deleteRunning
                ? t("Deleting deferred indexes")
                : deleteFinished
                  ? deletionFailed
                    ? t("Deletion stopped")
                    : t("Deletion complete")
                  : deleteTargets.length === 1
                    ? t("Delete deferred index")
                    : t("Delete selected deferred indexes")}
            </DialogTitle>
            <DialogDescription>
              {deleteRunning
                ? t(
                    "Deferred indexes are deleted one at a time. Keep this window open until the process finishes.",
                  )
                : deleteFinished
                  ? deletionFailed
                    ? t(
                        "A deferred index could not be deleted. Completed deletions were preserved and later indexes were not processed.",
                      )
                    : t(
                        "The selected deferred indexes were deleted. Root service transactions were preserved.",
                      )
                  : t(
                      "Review the selected deferred indexes before deleting them.",
                    )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {!deleteRunning && !deleteFinished ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/25 p-4">
                  <p className="text-sm font-medium text-foreground">
                    {deleteTargets.length} {t("selected")}
                  </p>
                  <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {deleteTargets.map((record) => (
                      <Badge key={record.id} variant="outline">
                        {record.email || record.id} · {record.transactionCount}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-6 text-foreground">
                  {t(
                    "Deletion removes only each selected email index. Root service transactions are preserved, but their pending IDs will no longer link automatically when those emails sign in.",
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">
                      {currentDeletingId
                        ? `${t("Deleting")}: ${
                            deleteTargets.find(
                              (record) => record.id === currentDeletingId,
                            )?.email || currentDeletingId
                          }`
                        : deletionFailed
                          ? t("Deletion stopped")
                          : t("Deletion complete")}
                    </span>
                    <span>{Math.round(deleteProgress)}%</span>
                  </div>
                  <Progress value={deleteProgress} />
                </div>

                <div className="space-y-2">
                  {deleteTargets.map((record) => {
                    const result = deleteResults.find(
                      (candidate) => candidate.deferredId === record.id,
                    );
                    const isCurrent = currentDeletingId === record.id;
                    return (
                      <div
                        key={record.id}
                        className={`rounded-lg border p-3 ${
                          result?.status === "failed"
                            ? "border-destructive/40 bg-destructive/5"
                            : result?.status === "deleted"
                              ? "border-emerald-400/35 bg-emerald-500/5"
                              : isCurrent
                                ? "border-primary/40 bg-primary/5"
                                : "border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {record.email || record.id}
                            </p>
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                              {record.id}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {result?.status === "deleted"
                                ? t("Deleted")
                                : result?.status === "failed"
                                  ? result.error
                                  : isCurrent
                                    ? t("Processing")
                                    : t("Pending")}
                            </p>
                            {result?.status === "failed" && result.log ? (
                              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-background p-2 font-mono text-[11px] leading-4 text-muted-foreground">
                                {result.log}
                              </pre>
                            ) : null}
                          </div>
                          {isCurrent ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          ) : result?.status === "deleted" ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : result?.status === "failed" ? (
                            <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {!deleteRunning && !deleteFinished ? (
              <>
                <Button type="button" variant="outline" onClick={closeDeletion}>
                  {t("Cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void runDeletion()}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteTargets.length === 1
                    ? t("Delete index")
                    : t("Delete selected")}
                </Button>
              </>
            ) : deleteFinished ? (
              <Button type="button" onClick={closeDeletion}>
                {t("Finish")}
              </Button>
            ) : (
              <Button type="button" disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("Deleting")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <section className={PANEL_CLASS}>
        <div className="flex flex-col gap-4 border-b border-border/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {t("Deferred Transactions")}
              </h2>
              <HeaderUnclutterButton />
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedVisibleCount > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    openDeletion(
                      rows.filter((record) =>
                        selectedDeferredIds.has(record.id),
                      ),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  {t("Delete selected")} ({selectedVisibleCount})
                </Button>
              ) : null}
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
                <TableHead className="w-12 px-3">
                  <Checkbox
                    checked={
                      allVisibleSelected
                        ? true
                        : someVisibleSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleAllVisible}
                    disabled={rows.length === 0}
                    aria-label={t(
                      "Select all visible deferred transaction indexes",
                    )}
                  />
                </TableHead>
                <TableHead>{t("Email")}</TableHead>
                <TableHead>{t("Deferred transactions")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : listQuery.isError ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-destructive"
                  >
                    <CircleAlert className="mx-auto mb-2 h-7 w-7" />
                    {errorMessage(listQuery.error)}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {t("No deferred transaction documents found.")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="w-12 px-3">
                      <Checkbox
                        checked={selectedDeferredIds.has(record.id)}
                        onCheckedChange={() => toggleSelection(record.id)}
                        aria-label={`${t(
                          "Select deferred transaction index",
                        )} ${record.email || record.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {record.email || t("Not available")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {record.transactionCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`${ROUTE}/${encodeURIComponent(record.id)}`}
                          >
                            {t("Open")}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openDeletion([record])}
                          title={t("Delete deferred index")}
                          aria-label={`${t("Delete deferred index")} ${
                            record.email || record.id
                          }`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
    </>
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
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [transactionIds, setTransactionIds] = useState<string[]>([]);
  const [newTransactionId, setNewTransactionId] = useState("");
  const [loadedRecordId, setLoadedRecordId] = useState("");
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [notificationTransactionId, setNotificationTransactionId] =
    useState("");
  const [notificationPreview, setNotificationPreview] =
    useState<DeferredServiceTransactionNotificationPreview | null>(null);
  const [notificationPreviewPending, setNotificationPreviewPending] =
    useState(false);
  const [notificationPreviewError, setNotificationPreviewError] =
    useState<unknown>(null);
  const [notificationResendRequestId, setNotificationResendRequestId] =
    useState("");
  const notificationPreviewRequestRef = useRef(0);

  const detailQuery = useQuery({
    queryKey: ["deferred-service-transaction", deferredId],
    queryFn: () =>
      sdkFetch<{ deferredTransaction: DeferredServiceTransactionIndexDetail }>(
        `${API_ROUTE}/${encodeURIComponent(deferredId)}`,
      ),
  });
  const record = detailQuery.data?.deferredTransaction;

  const linkedTransactionsQuery = useInfiniteQuery({
    queryKey: ["deferred-service-transaction-links", deferredId],
    initialPageParam: "",
    enabled: Boolean(record),
    queryFn: ({ pageParam }) => {
      const parameters = new URLSearchParams({ limit: "20" });
      if (pageParam) parameters.set("cursor", pageParam);
      return sdkFetch<DeferredServiceTransactionLinksPage>(
        `${API_ROUTE}/${encodeURIComponent(deferredId)}/transactions?${parameters.toString()}`,
      );
    },
    getNextPageParam: (page) => page.nextCursor,
  });

  const linkedTransactions = useMemo(
    () =>
      linkedTransactionsQuery.data?.pages.flatMap(
        (page) => page.transactions ?? [],
      ) ?? [],
    [linkedTransactionsQuery.data],
  );

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
        void queryClient.resetQueries({
          queryKey: ["deferred-service-transaction-links", deferredId],
          exact: true,
        });
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

  const notificationPreviewMutation = useMutation({
    mutationFn: ({
      transactionId,
    }: {
      transactionId: string;
      requestToken: number;
    }) =>
      sdkFetch<{ preview: DeferredServiceTransactionNotificationPreview }>(
        deferredNotificationApiRoute(deferredId, transactionId),
      ),
    onSuccess: ({ preview }, { requestToken }) => {
      if (notificationPreviewRequestRef.current === requestToken) {
        setNotificationPreview(preview);
        setNotificationPreviewPending(false);
        setNotificationPreviewError(null);
      }
    },
    onError: (error, { requestToken }) => {
      if (notificationPreviewRequestRef.current === requestToken) {
        setNotificationPreviewPending(false);
        setNotificationPreviewError(error);
      }
    },
  });

  const notificationResendMutation = useMutation({
    mutationFn: ({
      transactionId,
      resendRequestId,
      previewFingerprint,
    }: {
      transactionId: string;
      resendRequestId: string;
      previewFingerprint: string;
    }) =>
      sdkFetch<{
        notification: DeferredServiceTransactionNotificationResendResult;
      }>(deferredNotificationApiRoute(deferredId, transactionId), {
        method: "POST",
        body: JSON.stringify({ resendRequestId, previewFingerprint }),
      }),
    onSuccess: ({ notification }) => {
      setNotificationTransactionId("");
      setNotificationPreview(null);
      setNotificationResendRequestId("");
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          notification.status === "sent"
            ? t("Notification email sent.")
            : notification.status === "already_sent"
              ? t("This resend request was already delivered.")
              : t("Notification email is already being sent."),
      });
    },
    onError: (error) => {
      if (requestStatus(error) === 409) {
        notificationPreviewRequestRef.current += 1;
        setNotificationPreview(null);
        setNotificationPreviewPending(false);
        setNotificationPreviewError(error);
        setNotificationResendRequestId("");
      }
      setToast({
        id: Date.now(),
        tone: "error",
        message: errorMessage(error),
        details: requestErrorLog(error),
      });
    },
  });

  const hasUnsavedChanges = Boolean(
    record &&
      (email.trim().toLowerCase() !== record.email ||
        transactionIds.length !== record.deferredTransactionIds.length ||
        transactionIds.some(
          (transactionId, index) =>
            transactionId !== record.deferredTransactionIds[index],
        )),
  );

  const savedTransactionIds = new Set(record?.deferredTransactionIds ?? []);
  const loadedLinkedTransactionIds = new Set(
    linkedTransactions.map((transaction) => transaction.transactionId),
  );
  const locallyAddedTransactionIds = transactionIds.filter(
    (transactionId) =>
      !savedTransactionIds.has(transactionId) &&
      !loadedLinkedTransactionIds.has(transactionId),
  );
  const visibleLinkedTransactions = linkedTransactions.filter((transaction) =>
    transactionIds.includes(transaction.transactionId),
  );

  function openNotificationPreview(transactionId: string) {
    const requestToken = notificationPreviewRequestRef.current + 1;
    notificationPreviewRequestRef.current = requestToken;
    setNotificationTransactionId(transactionId);
    setNotificationPreview(null);
    setNotificationPreviewPending(true);
    setNotificationPreviewError(null);
    setNotificationResendRequestId("");
    notificationPreviewMutation.reset();
    notificationResendMutation.reset();
    notificationPreviewMutation.mutate({ transactionId, requestToken });
  }

  function closeNotificationPreview() {
    if (notificationResendMutation.isPending) return;
    notificationPreviewRequestRef.current += 1;
    setNotificationTransactionId("");
    setNotificationPreview(null);
    setNotificationPreviewPending(false);
    setNotificationPreviewError(null);
    setNotificationResendRequestId("");
    notificationPreviewMutation.reset();
    notificationResendMutation.reset();
  }

  function retryNotificationPreview() {
    const requestToken = notificationPreviewRequestRef.current + 1;
    notificationPreviewRequestRef.current = requestToken;
    setNotificationPreview(null);
    setNotificationPreviewPending(true);
    setNotificationPreviewError(null);
    notificationResendMutation.reset();
    notificationPreviewMutation.mutate({
      transactionId: notificationTransactionId,
      requestToken,
    });
  }

  function resendNotification() {
    if (!notificationPreview || notificationResendMutation.isPending) return;
    const resendRequestId =
      notificationResendRequestId || createNotificationResendRequestId();
    if (!notificationResendRequestId) {
      setNotificationResendRequestId(resendRequestId);
    }
    notificationResendMutation.mutate({
      transactionId: notificationPreview.transactionId,
      resendRequestId,
      previewFingerprint: notificationPreview.previewFingerprint,
    });
  }

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
                  {t("Linked service offers")}
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
              {hasUnsavedChanges ? (
                <p
                  id="deferred-notification-save-first"
                  role="status"
                  className="text-xs font-medium text-amber-700 dark:text-amber-300"
                >
                  {t(
                    "Save the deferred transaction changes before previewing an email.",
                  )}
                </p>
              ) : null}
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
                  {linkedTransactionsQuery.isLoading ? (
                    <div
                      role="status"
                      className="flex items-center gap-2 rounded-xl border border-border/70 p-4 text-sm text-muted-foreground"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("Loading linked service offers...")}
                    </div>
                  ) : null}

                  {linkedTransactionsQuery.isError ? (
                    <div
                      role="alert"
                      className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <p>{t("Could not load the linked service offers.")}</p>
                          <p className="mt-1 break-words text-xs">
                            {errorMessage(linkedTransactionsQuery.error)}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => linkedTransactionsQuery.refetch()}
                      >
                        <RefreshCw className="h-4 w-4" />
                        {t("Retry")}
                      </Button>
                    </div>
                  ) : null}

                  {[
                    ...visibleLinkedTransactions.map((transaction) => ({
                      transactionId: transaction.transactionId,
                      primaryLabel: transaction.exists
                        ? transaction.serviceOfferName?.trim() ||
                          t("Service offer name unavailable")
                        : t("Service transaction not found"),
                    })),
                    ...locallyAddedTransactionIds.map((transactionId) => ({
                      transactionId,
                      primaryLabel: t("Save to load the service offer name"),
                    })),
                  ].map(({ transactionId, primaryLabel }, index) => {
                    return (
                      <div
                        key={`${transactionId}-${index}`}
                        className="flex flex-col gap-3 rounded-xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex items-start gap-2">
                            <Link2 className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium text-foreground">
                                {primaryLabel}
                              </p>
                              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                                {transactionId}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={
                              hasUnsavedChanges ||
                              saveMutation.isPending ||
                              !record?.deferredTransactionIds.includes(
                                transactionId,
                              )
                            }
                            title={
                              hasUnsavedChanges
                                ? t(
                                    "Save the deferred transaction changes before previewing an email.",
                                  )
                                : undefined
                            }
                            aria-label={`${t("Send email again")}: ${transactionId}`}
                            aria-describedby={
                              hasUnsavedChanges
                                ? "deferred-notification-save-first"
                                : undefined
                            }
                            onClick={() =>
                              openNotificationPreview(transactionId)
                            }
                          >
                            <Mail className="h-4 w-4" />
                            {t("Send email again")}
                          </Button>
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

                  {linkedTransactionsQuery.hasNextPage ? (
                    <div className="flex justify-center pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => linkedTransactionsQuery.fetchNextPage()}
                        disabled={linkedTransactionsQuery.isFetchingNextPage}
                      >
                        {linkedTransactionsQuery.isFetchingNextPage ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        {t("Load more")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </form>

      <Dialog
        open={Boolean(notificationTransactionId)}
        onOpenChange={(open) => {
          if (!open) closeNotificationPreview();
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
          showCloseButton={!notificationResendMutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>{t("Review notification email")}</DialogTitle>
            <DialogDescription>
              {t(
                "Review the canonical recipient and raw email details before sending this notification again.",
              )}
            </DialogDescription>
          </DialogHeader>

          {notificationPreviewPending ? (
            <div
              role="status"
              className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground"
            >
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("Loading email details...")}
            </div>
          ) : notificationPreviewError ? (
            <div
              role="alert"
              className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive"
            >
              <p>{errorMessage(notificationPreviewError)}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={retryNotificationPreview}
              >
                <RefreshCw className="h-4 w-4" />
                {t("Retry")}
              </Button>
            </div>
          ) : notificationPreview ? (
            <div className="space-y-5">
              <section className="rounded-xl border border-violet-300/70 bg-violet-50/80 p-4 text-violet-950 dark:border-violet-300/25 dark:bg-violet-400/10 dark:text-violet-50">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                  {t("Actual recipient")}
                </p>
                <p className="mt-2 break-all text-lg font-semibold">
                  {notificationPreview.email.recipientEmail}
                </p>
                <p className="mt-2 text-sm opacity-80">
                  {t(
                    notificationPreview.email.recipientMode === "provider"
                      ? "Provider routing is active. The provider email above receives this send."
                      : "Temporary routing is active. Only the address above receives this send.",
                  )}
                </p>
                {notificationPreview.email.recipientMode ===
                "temporary_operations" ? (
                  <div
                    role="note"
                    className="mt-4 rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-amber-950 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-50"
                  >
                    <div className="flex items-start gap-3">
                      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-75">
                            {t(
                              "Provider recipient if temporary routing is removed",
                            )}
                          </p>
                          <Badge
                            variant="outline"
                            className="border-amber-500/50 bg-amber-100/70 text-amber-950 dark:border-amber-300/40 dark:bg-amber-300/10 dark:text-amber-50"
                          >
                            {t("Not receiving this email")}
                          </Badge>
                        </div>
                        <p className="mt-2 break-all text-base font-semibold">
                          {notificationPreview.provider.email ??
                            t("Not available")}
                        </p>
                        <p className="mt-2 text-xs leading-5 opacity-80">
                          {t(
                            notificationPreview.provider.email
                              ? "This is the provider's real delivery email. It would become the recipient if temporary routing were removed."
                              : "No provider delivery email is currently available. Temporary routing cannot be removed until one is configured.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="grid gap-4 sm:grid-cols-2">
                <section className="rounded-xl border border-border/80 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading font-semibold text-foreground">
                      {t("Provider publisher")}
                    </h3>
                    <Badge variant="secondary">
                      {t(
                        notificationPreview.provider.accountType ===
                          "organization"
                          ? "Organization publisher"
                          : "Individual publisher",
                      )}
                    </Badge>
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("Name")}
                      </dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {notificationPreview.provider.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("Provider email")}
                      </dt>
                      <dd className="mt-1 break-all font-medium text-foreground">
                        {notificationPreview.provider.email ??
                          t("Not available")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("Provider status")}
                      </dt>
                      <dd className="mt-1">
                        <Badge variant="outline">
                          {t(notificationPreview.provider.status)}
                        </Badge>
                      </dd>
                    </div>
                  </dl>
                  {notificationPreview.provider.status !== "active" ? (
                    <p
                      role="alert"
                      className="mt-4 rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 text-xs leading-5 text-amber-900 dark:text-amber-100"
                    >
                      {t(
                        "This provider publisher is missing or inactive. Its displayed contact details may be historical, and sending is disabled until the publisher is active.",
                      )}
                    </p>
                  ) : null}
                </section>

                <section className="rounded-xl border border-border/80 bg-muted/20 p-4">
                  <h3 className="font-heading font-semibold text-foreground">
                    {t("Selected transaction")}
                  </h3>
                  <p className="mt-3 font-medium text-foreground">
                    {notificationPreview.transaction.name}
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    {notificationPreview.transaction.id}
                  </p>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("Requested by")}
                      </dt>
                      <dd className="mt-1 break-all text-foreground">
                        {notificationPreview.transaction.requestedByUserEmail}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("Deferred index email")}
                      </dt>
                      <dd className="mt-1 break-all text-foreground">
                        {notificationPreview.deferredEmail}
                      </dd>
                    </div>
                  </dl>
                  {notificationPreview.requesterEmailMismatch ? (
                    <p
                      role="alert"
                      className="mt-4 rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 text-xs leading-5 text-amber-900 dark:text-amber-100"
                    >
                      {t(
                        "The deferred index email differs from the transaction requester. The email content uses the transaction requester shown above.",
                      )}
                    </p>
                  ) : null}
                </section>
              </div>

              <section className="rounded-xl border border-border/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-heading font-semibold text-foreground">
                    {t("Transactions linked to this deferred email")}
                  </h3>
                  <Badge variant="secondary">
                    {notificationPreview.linkedTransactionIds.length}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {notificationPreview.linkedTransactionIds.map(
                    (linkedTransactionId) => (
                      <Badge
                        key={linkedTransactionId}
                        variant={
                          linkedTransactionId ===
                          notificationPreview.transactionId
                            ? "default"
                            : "outline"
                        }
                        className="max-w-full break-all font-mono font-normal"
                      >
                        {linkedTransactionId}
                      </Badge>
                    ),
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <h3
                  id="deferred-notification-raw-email-heading"
                  className="font-heading font-semibold text-foreground"
                >
                  {t("Raw email details")}
                </h3>
                <pre
                  aria-labelledby="deferred-notification-raw-email-heading"
                  tabIndex={0}
                  className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/80 bg-muted/30 p-4 font-mono text-xs leading-5 text-foreground"
                >
                  {JSON.stringify(
                    {
                      recipientMode:
                        notificationPreview.email.recipientMode,
                      to: notificationPreview.email.recipientEmail,
                      subject: notificationPreview.email.subject,
                      text: notificationPreview.email.text,
                      input: notificationPreview.email.input,
                    },
                    null,
                    2,
                  )}
                </pre>
              </section>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeNotificationPreview}
              disabled={notificationResendMutation.isPending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              onClick={resendNotification}
              disabled={
                !notificationPreview ||
                notificationPreviewPending ||
                notificationResendMutation.isPending ||
                notificationPreview?.provider.status !== "active"
              }
            >
              {notificationResendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {notificationResendMutation.isPending
                ? t("Sending...")
                : t("Send email again")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
