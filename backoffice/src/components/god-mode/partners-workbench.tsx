"use client";

import { useState, type FormEvent } from "react";
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
  Building2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  type Partner,
  type PartnerInput,
  type PartnersPage,
} from "@/lib/connected-partners";
import { appText } from "@/lib/language";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

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
}: {
  partner: Partner;
  selected: boolean;
  disabled: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const t = useText();
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm">
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
          asChild
          variant="ghost"
          size="icon-sm"
          aria-label={`${t("Edit partner")}: ${partner.companyName}`}
        >
          <Link
            href={`${PARTNERS_ROUTE}/${encodeURIComponent(partner.id)}/edit`}
          >
            <Pencil className="size-4" />
          </Link>
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
          <dd className="mt-1 break-words">{partner.phoneNumber}</dd>
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
      </dl>
    </article>
  );
}

export function PartnersBrowser() {
  const t = useText();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = useInfiniteQuery({
    queryKey: PARTNERS_QUERY_KEY,
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
          <Button asChild>
            <Link href={`${PARTNERS_ROUTE}/new`}>
              <Plus className="size-4" />
              {t("New partner")}
            </Link>
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
          <Button asChild variant="outline">
            <Link href={`${PARTNERS_ROUTE}/new`}>
              <Plus className="size-4" />
              {t("New partner")}
            </Link>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {partners.map((partner) => (
              <PartnerCard
                key={partner.id}
                partner={partner}
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
    </section>
  );
}

export function PartnerEditor({ partnerId }: { partnerId?: string }) {
  const t = useText();
  const query = useQuery({
    queryKey: [...PARTNERS_QUERY_KEY, partnerId],
    enabled: Boolean(partnerId),
    queryFn: () =>
      sdkFetch<{ partner: Partner }>(
        `${PARTNERS_API_ROUTE}/${encodeURIComponent(partnerId!)}`,
      ),
    retry: (count, error) =>
      !(error instanceof SdkRequestError && error.status === 404) && count < 2,
  });
  if (partnerId && query.isPending)
    return <p role="status">{t("Loading partners...")}</p>;
  if (partnerId && query.isError)
    return (
      <section className="glass-panel space-y-3 p-5">
        <Button asChild variant="outline">
          <Link href={PARTNERS_ROUTE}>
            <ArrowLeft className="size-4" />
            {t("Back to Partners")}
          </Link>
        </Button>
        <RequestError
          error={query.error}
          fallback={t("Could not load partners.")}
        />
        <Button variant="outline" onClick={() => query.refetch()}>
          {t("Retry")}
        </Button>
      </section>
    );
  return (
    <PartnerForm
      key={partnerId ?? "new"}
      partner={partnerId ? query.data?.partner : undefined}
    />
  );
}

function PartnerForm({ partner }: { partner?: Partner }) {
  const t = useText();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    companyName: partner?.companyName ?? "",
    firstName: partner?.firstName ?? "",
    lastName: partner?.lastName ?? "",
    phoneNumber: partner?.phoneNumber ?? "",
    email: partner?.email ?? "",
    meetingDate: partner?.meetingDate ?? "",
    notes: partner?.notes ?? "",
  });
  const save = useMutation({
    mutationFn: (input: PartnerInput) =>
      sdkFetch<{ partner: Partner }>(
        partner
          ? `${PARTNERS_API_ROUTE}/${encodeURIComponent(partner.id)}`
          : PARTNERS_API_ROUTE,
        { method: partner ? "PUT" : "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PARTNERS_QUERY_KEY });
      router.push(PARTNERS_ROUTE);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    save.mutate({
      companyName: values.companyName.trim(),
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      phoneNumber: values.phoneNumber.trim(),
      email: values.email.trim().toLowerCase(),
      meetingDate: values.meetingDate || null,
      notes: values.notes.trim() || null,
    });
  }
  const fields = [
    {
      key: "companyName",
      label: "Company name",
      type: "text",
      max: 180,
      autoComplete: "organization",
    },
    {
      key: "firstName",
      label: "First name",
      type: "text",
      max: 140,
      autoComplete: "given-name",
    },
    {
      key: "lastName",
      label: "Last name",
      type: "text",
      max: 140,
      autoComplete: "family-name",
    },
    {
      key: "phoneNumber",
      label: "Phone number",
      type: "tel",
      max: 50,
      autoComplete: "tel",
    },
    {
      key: "email",
      label: "Email",
      type: "email",
      max: 254,
      autoComplete: "email",
    },
  ] as const;

  return (
    <section className="glass-panel space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-xl font-semibold">
            {t(partner ? "Edit partner" : "New partner")}
          </h2>
          <HeaderUnclutterButton />
        </div>
        <Button asChild variant="outline">
          <Link href={PARTNERS_ROUTE}>
            <ArrowLeft className="size-4" />
            {t("Back to Partners")}
          </Link>
        </Button>
      </div>
      <form onSubmit={submit} className="max-w-3xl space-y-5">
        <fieldset
          disabled={save.isPending}
          className="grid gap-5 sm:grid-cols-2"
        >
          {fields.map((field) => (
            <div
              key={field.key}
              className={`space-y-2 ${field.key === "companyName" ? "sm:col-span-2" : ""}`}
            >
              <Label htmlFor={`partner-${field.key}`}>{t(field.label)}</Label>
              <Input
                id={`partner-${field.key}`}
                name={field.key}
                type={field.type}
                maxLength={field.max}
                autoComplete={field.autoComplete}
                required
                value={values[field.key]}
                onChange={(event) =>
                  setValues({ ...values, [field.key]: event.target.value })
                }
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="partner-meetingDate">
              {t("Meeting date")}{" "}
              <span className="text-muted-foreground">({t("Optional")})</span>
            </Label>
            <Input
              id="partner-meetingDate"
              name="meetingDate"
              type="date"
              value={values.meetingDate}
              onChange={(event) =>
                setValues({ ...values, meetingDate: event.target.value })
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="partner-notes">
              {t("Notes")}{" "}
              <span className="text-muted-foreground">({t("Optional")})</span>
            </Label>
            <Textarea
              id="partner-notes"
              name="notes"
              maxLength={10000}
              rows={5}
              value={values.notes}
              onChange={(event) =>
                setValues({ ...values, notes: event.target.value })
              }
            />
          </div>
        </fieldset>
        {save.isError && (
          <RequestError
            error={save.error}
            fallback={t("Could not save partner.")}
          />
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {t("Save")}
        </Button>
      </form>
    </section>
  );
}
