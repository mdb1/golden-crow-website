"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Building2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PARTNERS_API_ROUTE,
  PARTNERS_QUERY_KEY,
  PARTNERS_ROUTE,
  PARTNER_SECTIONS,
  PARTNER_INDIVIDUAL_SECTIONS,
  partnerSection,
  type Partner,
  type PartnersPage,
} from "@/lib/connected-partners";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";
import {
  PartnerEditorDialog,
  partnerAppStatusLabel,
} from "@/components/god-mode/partner-editor-dialog";

function useText() {
  const { language } = useAppLanguage();
  return (text: string) => appText(language, text);
}

function RequestError({
  error,
  fallback,
}: {
  error: unknown;
  fallback: string;
}) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {error instanceof Error ? error.message : fallback}
    </p>
  );
}

function PartnerCard({
  partner,
  selected,
  disabled,
  onSelect,
  onEdit,
}: {
  partner: Partner;
  selected: boolean;
  disabled: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
}) {
  const t = useText();
  return (
    <article className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-sm transition hover:border-violet-300/70 hover:shadow-md dark:hover:border-violet-400/30">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-400 to-sky-400"
      />
      <div className="mb-5 flex items-start gap-3">
        <Checkbox
          checked={selected}
          disabled={disabled}
          onCheckedChange={(checked) => onSelect(checked === true)}
          aria-label={`${t("Select partner")}: ${partner.companyName} — ${partner.firstName} ${partner.lastName}`}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{t("Company name")}</p>
          <h3 className="break-words font-heading text-lg font-semibold">
            {partner.companyName}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${t("Edit partner")}: ${partner.companyName}`}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </Button>
      </div>
      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("First name")}</dt>
          <dd className="mt-1 break-words">{partner.firstName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Last name")}</dt>
          <dd className="mt-1 break-words">{partner.lastName}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Phone number")}</dt>
          <dd className="mt-1 break-words">{partner.phoneNumber || "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Email")}</dt>
          <dd className="mt-1 break-words">{partner.email}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Meeting date")}</dt>
          <dd className="mt-1">{partner.meetingDate ?? "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Notes")}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words">
            {partner.notes ?? "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Linked organization")}</dt>
          <dd className="mt-1 break-words">
            {partner.linkedOrganization?.name ??
              partner.linkedOrganizationSnapshot?.name ??
              partner.linkedOrganizationId ??
              "—"}
          </dd>
          {partner.linkedOrganizationId && !partner.linkedOrganization && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              {t("Linked organization is unavailable.")} (
              {partner.linkedOrganizationId})
            </p>
          )}
        </div>
        {partner.linkedIndividualPublisherId && (
          <div className="col-span-2">
            <dt className="text-muted-foreground">
              {t("Linked individual publisher")}
            </dt>
            <dd className="mt-1 break-words">
              {partner.linkedIndividualPublisher?.name ??
                partner.linkedIndividualPublisherSnapshot?.name ??
                partner.linkedIndividualPublisherId}
            </dd>
            {!partner.linkedIndividualPublisher && (
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                {t("Linked individual publisher is unavailable.")} (
                {partner.linkedIndividualPublisherId})
              </p>
            )}
          </div>
        )}
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Linked app")}</dt>
          <dd className="mt-1 break-words">
            {partner.linkedApp?.publisherName ??
              partner.linkedAppSnapshot?.publisherName ??
              partner.linkedAppId ??
              "—"}
            {partner.linkedApp && (
              <span className="ml-2 text-xs text-muted-foreground">
                {t(partnerAppStatusLabel(partner.linkedApp.status))}
              </span>
            )}
          </dd>
          {partner.linkedAppId && !partner.linkedApp && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              {t(
                "Linked app is unavailable or no longer belongs to a linked publisher.",
              )}{" "}
              ({partner.linkedAppId})
            </p>
          )}
        </div>
      </dl>
    </article>
  );
}

export function PartnersBrowser({
  initialEditor,
}: { initialEditor?: string } = {}) {
  const t = useText();
  const router = useRouter();
  const [editor, setEditor] = useState<string | null>(initialEditor ?? null);
  function closeEditor() {
    setEditor(null);
    if (initialEditor) router.replace(PARTNERS_ROUTE);
  }
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = useInfiniteQuery({
    queryKey: PARTNERS_QUERY_KEY,
    staleTime: 0,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      sdkFetch<PartnersPage>(
        `${PARTNERS_API_ROUTE}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const partners = Array.from(
    new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((partner) => [
        partner.id,
        partner,
      ]),
    ).values(),
  );
  const selectedIds = partners
    .filter((partner) => selected.has(partner.id))
    .map((partner) => partner.id);
  const deletion = useMutation({
    mutationFn: (ids: string[]) =>
      sdkFetch<{ deletedIds: string[] }>(`${PARTNERS_API_ROUTE}/delete`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: async () => {
      setSelected(new Set());
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: PARTNERS_QUERY_KEY });
    },
  });
  const allSelected =
    partners.length > 0 &&
    selectedIds.length === Math.min(partners.length, 500);

  return (
    <section className="glass-panel space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-xl font-semibold">
            {t("Partners")}
          </h2>
          <HeaderUnclutterButton />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              disabled={deletion.isPending}
              onClick={() => {
                deletion.reset();
                setConfirmDelete(true);
              }}
            >
              <Trash2 className="size-4" />
              {t("Delete selected")} ({selectedIds.length})
            </Button>
          )}
          <Button
            onClick={() => setEditor("new")}
            className="h-10 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-white shadow-lg shadow-violet-500/15"
          >
            <Plus className="size-4" />
            {t("New partner")}
          </Button>
        </div>
      </div>
      {query.isPending && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          {t("Loading partners...")}
        </p>
      )}
      {query.isError && (
        <div className="space-y-2">
          <RequestError
            error={query.error}
            fallback={t("Could not load partners.")}
          />
          <Button
            variant="outline"
            onClick={() =>
              query.isFetchNextPageError
                ? query.fetchNextPage()
                : query.refetch()
            }
          >
            {t("Retry")}
          </Button>
        </div>
      )}
      {!query.isPending && !query.isError && partners.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-5 py-12 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("No partners yet.")}</p>
          <Button
            variant="outline"
            onClick={() => setEditor("new")}
            className="rounded-xl"
          >
            <Plus className="size-4" />
            {t("New partner")}
          </Button>
        </div>
      )}
      {partners.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={
                  allSelected
                    ? true
                    : selectedIds.length > 0
                      ? "indeterminate"
                      : false
                }
                disabled={deletion.isPending}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked
                      ? new Set(
                          partners.slice(0, 500).map((partner) => partner.id),
                        )
                      : new Set(),
                  )
                }
              />
              {t("Select loaded partners")}
            </label>
            {partners.length >= 500 && (
              <span className="text-muted-foreground">
                {t("Select up to 500 partners at a time.")}
              </span>
            )}
          </div>
          {[
            ...PARTNER_SECTIONS,
            ...PARTNER_INDIVIDUAL_SECTIONS.filter((section) =>
              partners.some(
                (partner) => partnerSection(partner) === section.key,
              ),
            ),
            ...(partners.some((partner) => partnerSection(partner) === "other")
              ? [{ key: "other", label: "Other app statuses or missing links" }]
              : []),
          ].map((section) => {
            const sectionPartners = partners.filter(
              (partner) => partnerSection(partner) === section.key,
            );
            return (
              <section
                key={section.key}
                aria-label={t(section.label)}
                className="space-y-3"
              >
                <h3 className="font-heading text-lg font-semibold">
                  {t(section.label)}{" "}
                  <span className="text-sm text-muted-foreground">
                    ({sectionPartners.length})
                  </span>
                </h3>
                {sectionPartners.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("No loaded partners in this section.")}
                  </p>
                )}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sectionPartners.map((partner) => (
                    <PartnerCard
                      key={partner.id}
                      partner={partner}
                      onEdit={() => setEditor(partner.id)}
                      selected={selected.has(partner.id)}
                      disabled={
                        deletion.isPending ||
                        (!selected.has(partner.id) && selectedIds.length >= 500)
                      }
                      onSelect={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked) next.add(partner.id);
                          else next.delete(partner.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {t("Load more")}
          </Button>
        </div>
      )}
      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!deletion.isPending) setConfirmDelete(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Delete selected partners?")} ({selectedIds.length})
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "These contacts will be permanently deleted. This cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletion.isError && (
            <RequestError
              error={deletion.error}
              fallback={t("Could not delete partners.")}
            />
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={deletion.isPending}
              onClick={() => setConfirmDelete(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deletion.isPending || selectedIds.length === 0}
              onClick={() => deletion.mutate(selectedIds)}
            >
              {deletion.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t("Delete selected")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editor && (
        <PartnerEditorDialog
          key={editor}
          partnerId={editor === "new" ? undefined : editor}
          onClose={closeEditor}
        />
      )}
    </section>
  );
}

export function PartnerEditor({ partnerId }: { partnerId?: string }) {
  const router = useRouter();
  return (
    <PartnerEditorDialog
      partnerId={partnerId}
      onClose={() => router.push(PARTNERS_ROUTE)}
    />
  );
}
