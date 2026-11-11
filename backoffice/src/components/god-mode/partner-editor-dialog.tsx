"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCheck,
  CircleUserRound,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  type Partner,
  type PartnerInput,
  type PartnerLinkOption,
  type PartnerLinkOptionsPage,
} from "@/lib/connected-partners";
import { appText } from "@/lib/language";
import type { PublisherAppStatus } from "@/lib/publisher-app-config";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

function useText() {
  const { language } = useAppLanguage();
  return (text: string) => appText(language, text);
}

export function partnerAppStatusLabel(status: PublisherAppStatus) {
  const labels: Record<PublisherAppStatus, string> = {
    pending_revision: "App under review",
    active_for_testing: "Testing · Free app",
    active_waiting_for_payment: "Contract · Awaiting payment",
    active_waiting_for_upload: "Contract · Awaiting upload",
    active: "Active app",
    approved: "App approved",
    changes_requested: "App changes requested",
    rejected: "App not approved",
  };
  return labels[status];
}

type ConnectionKind = "organization" | "individual" | "app";
type Step = "contact" | "connections" | "review";

const CONNECTIONS = {
  organization: {
    title: "Organization",
    tab: "Organizations",
    choose: "Choose organization",
    remove: "Remove organization link",
    Icon: Building2,
    color:
      "border-violet-200 bg-violet-50/70 dark:border-violet-400/25 dark:bg-violet-500/10",
    iconColor:
      "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  },
  individual: {
    title: "Individual publisher",
    tab: "Individual publishers",
    choose: "Choose individual publisher",
    remove: "Remove individual publisher link",
    Icon: CircleUserRound,
    color:
      "border-sky-200 bg-sky-50/70 dark:border-sky-400/25 dark:bg-sky-500/10",
    iconColor: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  },
  app: {
    title: "App",
    tab: "Apps",
    choose: "Choose app",
    remove: "Remove app link",
    Icon: Smartphone,
    color:
      "border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/25 dark:bg-emerald-500/10",
    iconColor:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  },
} as const;

function ErrorMessage({
  error,
  fallback,
}: {
  error: unknown;
  fallback: string;
}) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : fallback}
    </p>
  );
}

export function PartnerEditorDialog({
  partnerId,
  onClose,
}: {
  partnerId?: string;
  onClose: () => void;
}) {
  const t = useText();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const query = useQuery({
    queryKey: [...PARTNERS_QUERY_KEY, partnerId],
    staleTime: 0,
    enabled: Boolean(partnerId),
    queryFn: () =>
      sdkFetch<{ partner: Partner }>(
        `${PARTNERS_API_ROUTE}/${encodeURIComponent(partnerId!)}`,
      ),
    retry: (count, error) =>
      !(error instanceof SdkRequestError && error.status === 404) && count < 2,
  });
  function requestClose() {
    if (saving) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          className="gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-3xl"
          showCloseButton={!saving}
        >
          <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-violet-50 via-fuchsia-50/50 to-sky-50 p-5 pr-12 dark:from-violet-950/40 dark:via-fuchsia-950/20 dark:to-sky-950/30 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20">
                <Sparkles className="size-5" />
              </span>
              <DialogTitle className="font-heading text-xl font-semibold">
                {t(partnerId ? "Edit partner" : "New partner")}
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              {t(
                "Add contact details and connect a partner to publishers and an app.",
              )}
            </DialogDescription>
          </DialogHeader>
          {partnerId && query.isPending ? (
            <p
              role="status"
              className="flex items-center gap-2 p-8 text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              {t("Loading partners...")}
            </p>
          ) : partnerId && query.isError ? (
            <div className="space-y-4 p-6">
              <ErrorMessage
                error={query.error}
                fallback={t("Could not load partners.")}
              />
              <Button variant="outline" onClick={() => query.refetch()}>
                {t("Retry")}
              </Button>
            </div>
          ) : (
            <PartnerWizard
              key={partnerId ?? "new"}
              partner={partnerId ? query.data?.partner : undefined}
              onSaved={onClose}
              onCancel={requestClose}
              onDirty={setDirty}
              onSaving={setSaving}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Discard changes?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Your unsaved partner details will be lost.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDiscard(false)}>
              {t("Keep editing")}
            </Button>
            <Button variant="destructive" onClick={onClose}>
              {t("Discard changes")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ConnectionBrowser({
  initialKind,
  organizationId,
  individualPublisherId,
  selectedIds,
  onClose,
  onSelect,
}: {
  initialKind: ConnectionKind;
  organizationId: string | null;
  individualPublisherId: string | null;
  selectedIds: Record<ConnectionKind, string | null>;
  onClose: () => void;
  onSelect: (kind: ConnectionKind, option: PartnerLinkOption) => void;
}) {
  const t = useText();
  const [kind, setKind] = useState(initialKind);
  const [search, setSearch] = useState("");
  const [exactId, setExactId] = useState("");
  const [scoped, setScoped] = useState(false);
  const [activeLookupKey, setActiveLookupKey] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: [
      ...PARTNERS_QUERY_KEY,
      "link-options",
      kind,
      scoped,
      organizationId,
      individualPublisherId,
    ],
    staleTime: 0,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ kind });
      if (scoped && kind === "app") {
        if (organizationId) params.set("organizationId", organizationId);
        if (individualPublisherId)
          params.set("individualPublisherId", individualPublisherId);
      }
      if (pageParam) params.set("cursor", pageParam);
      return sdkFetch<PartnerLinkOptionsPage>(
        `${PARTNERS_API_ROUTE}/link-options?${params}`,
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const lookup = useMutation({
    mutationFn: async ({
      id,
      kind: requestedKind,
      key,
    }: {
      id: string;
      kind: ConnectionKind;
      key: string;
    }) => ({
      kind: requestedKind,
      key,
      ...(await sdkFetch<PartnerLinkOptionsPage>(
        `${PARTNERS_API_ROUTE}/link-options?${new URLSearchParams({ kind: requestedKind, id })}`,
      )),
    }),
  });
  const lookupData =
    lookup.data?.kind === kind && lookup.data.key === activeLookupKey
      ? lookup.data
      : undefined;
  const lookupPending =
    lookup.isPending && lookup.variables?.key === activeLookupKey;
  const lookupError =
    lookup.isError && lookup.variables?.key === activeLookupKey
      ? lookup.error
      : null;
  function findApp() {
    const id = exactId.trim();
    if (!id) return;
    const key = `${kind}:${id}`;
    setActiveLookupKey(key);
    lookup.mutate({ id, kind, key });
  }
  const loaded = Array.from(
    new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  );
  const options = lookupData
    ? lookupData.items
    : loaded.filter((item) =>
        [item.name, item.id, item.appProviderIdentifier ?? ""].some((text) =>
          text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
        ),
      );
  const { Icon, iconColor } = CONNECTIONS[kind];
  function changeKind(next: string) {
    setKind(next as ConnectionKind);
    setSearch("");
    setExactId("");
    setActiveLookupKey(null);
    lookup.reset();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="gap-4 rounded-3xl sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2 font-heading text-xl">
            <Link2 className="size-5 text-violet-500" />
            {t("Add connections")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("Choose an organization, an individual publisher, or an app.")}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={kind} onValueChange={changeKind}>
          <TabsList className="grid h-auto grid-cols-3 gap-1 rounded-2xl p-1.5">
            {(Object.keys(CONNECTIONS) as ConnectionKind[]).map((value) => {
              const item = CONNECTIONS[value];
              return (
                <TabsTrigger
                  key={value}
                  value={value}
                  id={`partner-connection-${value}-tab`}
                  aria-controls={`partner-connection-${value}-panel`}
                  className="min-w-0 flex-col gap-1 whitespace-normal rounded-xl px-2 py-2 text-center sm:flex-row sm:text-left"
                >
                  <item.Icon className="size-4 shrink-0" />
                  {t(item.tab)}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            aria-label={t("Search loaded items")}
            placeholder={t("Search loaded items")}
            className="h-10 rounded-xl pl-9"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveLookupKey(null);
              lookup.reset();
            }}
          />
        </div>
        {kind === "app" && (
          <div className="space-y-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-3 dark:border-emerald-400/20 dark:bg-emerald-500/5">
            <Label htmlFor="partner-app-id">{t("App ID")}</Label>
            <div className="flex gap-2">
              <Input
                id="partner-app-id"
                value={exactId}
                placeholder={t("Paste an app ID or identifier")}
                className="min-w-0 rounded-xl"
                onChange={(event) => {
                  setExactId(event.target.value);
                  setActiveLookupKey(null);
                  lookup.reset();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    if (exactId.trim()) findApp();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!exactId.trim() || lookupPending}
                onClick={() => findApp()}
              >
                {lookupPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                {t("Find app")}
              </Button>
            </div>
            {(organizationId || individualPublisherId) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={scoped}
                className={cn(
                  "rounded-lg",
                  scoped &&
                    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
                )}
                onClick={() => {
                  setScoped(!scoped);
                  setActiveLookupKey(null);
                  lookup.reset();
                }}
              >
                {scoped && <Check className="size-3" />}
                {t("Apps from linked publishers")}
              </Button>
            )}
          </div>
        )}
        <div
          role="tabpanel"
          id={`partner-connection-${kind}-panel`}
          aria-labelledby={`partner-connection-${kind}-tab`}
          aria-label={t(CONNECTIONS[kind].tab)}
          className="min-h-24 max-h-[38vh] space-y-2 overflow-y-auto overscroll-contain pr-1"
        >
          {query.isPending && !lookupData && (
            <p
              role="status"
              className="flex items-center gap-2 p-4 text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              {t("Loading...")}
            </p>
          )}
          {(query.isError || Boolean(lookupError)) && (
            <div className="space-y-2">
              <ErrorMessage
                error={lookupError ?? query.error}
                fallback={t("Could not load linked items.")}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  lookupError
                    ? findApp()
                    : query.isFetchNextPageError
                      ? query.fetchNextPage()
                      : query.refetch()
                }
              >
                {t("Retry")}
              </Button>
            </div>
          )}
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-label={`${t("Select")} ${option.name} (${option.id})`}
              aria-pressed={selectedIds[kind] === option.id}
              className="flex w-full items-center gap-3 rounded-2xl border bg-background p-3 text-left transition hover:border-violet-300 hover:bg-violet-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:bg-violet-500/10"
              onClick={() => {
                onSelect(kind, option);
                onClose();
              }}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  iconColor,
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">
                  {option.name}
                </span>
                <span className="block break-all font-mono text-[11px] text-muted-foreground">
                  {option.id}
                </span>
                {option.appProviderIdentifier && (
                  <span className="block break-all text-xs text-muted-foreground">
                    {option.appProviderIdentifier}
                  </span>
                )}
                {option.status && (
                  <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
                    {t(partnerAppStatusLabel(option.status))}
                  </span>
                )}
              </span>
              {selectedIds[kind] === option.id ? (
                <Check className="size-5 text-violet-500" />
              ) : (
                <Plus className="size-4 text-muted-foreground" />
              )}
            </button>
          ))}
          {!query.isPending &&
            !query.isError &&
            !lookupPending &&
            !lookupError &&
            options.length === 0 && (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("No matching items.")}
              </p>
            )}
          {!lookupData && query.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl"
              disabled={query.isFetching}
              onClick={() => query.fetchNextPage()}
            >
              {query.isFetchingNextPage && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t("Load more")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PartnerWizard({
  partner,
  onSaved,
  onCancel,
  onDirty,
  onSaving,
}: {
  partner?: Partner;
  onSaved: () => void;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  onSaving: (saving: boolean) => void;
}) {
  const t = useText();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("contact");
  const [picker, setPicker] = useState<ConnectionKind | null>(null);
  const [confirmedLinks, setConfirmedLinks] = useState<Set<ConnectionKind>>(
    new Set(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState({
    companyName: partner?.companyName ?? "",
    firstName: partner?.firstName ?? "",
    lastName: partner?.lastName ?? "",
    phoneNumber: partner?.phoneNumber ?? "",
    email: partner?.email ?? "",
    meetingDate: partner?.meetingDate ?? "",
    notes: partner?.notes ?? "",
    linkedOrganizationId: partner?.linkedOrganizationId ?? null,
    linkedIndividualPublisherId: partner?.linkedIndividualPublisherId ?? null,
    linkedAppId: partner?.linkedAppId ?? null,
  });
  const [names, setNames] = useState({
    organization:
      partner?.linkedOrganization?.name ??
      partner?.linkedOrganizationSnapshot?.name ??
      "",
    individual:
      partner?.linkedIndividualPublisher?.name ??
      partner?.linkedIndividualPublisherSnapshot?.name ??
      "",
    app:
      partner?.linkedApp?.publisherName ??
      partner?.linkedAppSnapshot?.publisherName ??
      "",
  });
  const [appKind, setAppKind] = useState<"organization" | "individual" | null>(
    partner?.linkedApp?.publisherKind ??
      partner?.linkedAppSnapshot?.publisherKind ??
      null,
  );
  const [appStatus, setAppStatus] = useState(
    partner?.linkedApp?.status ?? null,
  );
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
      onSaved();
    },
  });
  useEffect(() => {
    onSaving(save.isPending);
  }, [save.isPending, onSaving]);
  useEffect(() => {
    const firstError = Object.entries(errors).find(
      ([, message]) => message,
    )?.[0];
    if (step === "contact" && firstError)
      document.getElementById(`partner-${firstError}`)?.focus();
  }, [errors, step]);
  function update(next: Partial<typeof values>) {
    setValues((current) => ({ ...current, ...next }));
    onDirty(true);
  }
  function validContact() {
    const next: Record<string, string> = {};
    for (const key of [
      "companyName",
      "firstName",
      "lastName",
      "email",
    ] as const)
      if (!values[key].trim()) next[key] = t("This field is required.");
    if (
      values.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
    )
      next.email = t("Please enter a valid email address.");
    setErrors(next);
    if (Object.keys(next).length) {
      setStep("contact");
      return false;
    }
    return true;
  }
  function navigate(next: Step) {
    if (next === "contact" || validContact()) setStep(next);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending || !validContact()) return;
    if (step !== "review") {
      setStep(step === "contact" ? "connections" : "review");
      return;
    }
    save.mutate({
      ...values,
      companyName: values.companyName.trim(),
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      phoneNumber: values.phoneNumber.trim(),
      email: values.email.trim().toLowerCase(),
      meetingDate: values.meetingDate || null,
      notes: values.notes.trim() || null,
    });
  }
  function select(kind: ConnectionKind, option: PartnerLinkOption) {
    setConfirmedLinks((current) => new Set([...current, kind]));
    if (kind === "app") {
      if (!option.publisherId || !option.publisherKind) return;
      update({
        linkedAppId: option.id,
        ...(option.publisherKind === "organization"
          ? { linkedOrganizationId: option.publisherId }
          : { linkedIndividualPublisherId: option.publisherId }),
      });
      setConfirmedLinks(
        (current) => new Set([...current, option.publisherKind!]),
      );
      const ownerId =
        option.publisherKind === "organization"
          ? values.linkedOrganizationId
          : values.linkedIndividualPublisherId;
      setNames((current) => ({
        ...current,
        app: option.name,
        [option.publisherKind!]:
          ownerId === option.publisherId && current[option.publisherKind!]
            ? current[option.publisherKind!]
            : option.name,
      }));
      setAppKind(option.publisherKind);
      setAppStatus(option.status ?? null);
      return;
    }
    const currentId =
      kind === "organization"
        ? values.linkedOrganizationId
        : values.linkedIndividualPublisherId;
    const clearApp = appKind === kind && currentId !== option.id;
    update({
      ...(kind === "organization"
        ? { linkedOrganizationId: option.id }
        : { linkedIndividualPublisherId: option.id }),
      ...(clearApp ? { linkedAppId: null } : {}),
    });
    setNames((current) => ({
      ...current,
      [kind]: option.name,
      ...(clearApp ? { app: "" } : {}),
    }));
    if (clearApp) {
      setAppKind(null);
      setAppStatus(null);
    }
  }
  function remove(kind: ConnectionKind) {
    const clearApp = kind === "app" || appKind === kind;
    update({
      ...(kind === "organization"
        ? { linkedOrganizationId: null }
        : kind === "individual"
          ? { linkedIndividualPublisherId: null }
          : {}),
      ...(clearApp ? { linkedAppId: null } : {}),
    });
    setNames((current) => ({
      ...current,
      [kind]: "",
      ...(clearApp ? { app: "" } : {}),
    }));
    if (clearApp) {
      setAppKind(null);
      setAppStatus(null);
    }
  }
  const ids = {
    organization: values.linkedOrganizationId,
    individual: values.linkedIndividualPublisherId,
    app: values.linkedAppId,
  };
  function connectionUnavailable(kind: ConnectionKind) {
    const originalId =
      kind === "organization"
        ? partner?.linkedOrganizationId
        : kind === "individual"
          ? partner?.linkedIndividualPublisherId
          : partner?.linkedAppId;
    const liveRecord =
      kind === "organization"
        ? partner?.linkedOrganization
        : kind === "individual"
          ? partner?.linkedIndividualPublisher
          : partner?.linkedApp;
    return Boolean(
      ids[kind] &&
        ids[kind] === originalId &&
        !liveRecord &&
        !confirmedLinks.has(kind),
    );
  }
  const fields = [
    {
      key: "companyName",
      label: "Company name",
      type: "text",
      max: 180,
      autoComplete: "organization",
      required: true,
    },
    {
      key: "firstName",
      label: "First name",
      type: "text",
      max: 140,
      autoComplete: "given-name",
      required: true,
    },
    {
      key: "lastName",
      label: "Last name",
      type: "text",
      max: 140,
      autoComplete: "family-name",
      required: true,
    },
    {
      key: "email",
      label: "Email",
      type: "email",
      max: 254,
      autoComplete: "email",
      required: true,
    },
    {
      key: "phoneNumber",
      label: "Phone number",
      type: "tel",
      max: 50,
      autoComplete: "tel",
      required: false,
    },
  ] as const;
  return (
    <>
      <form noValidate onSubmit={submit} className="flex min-h-0 flex-col">
        <Tabs
          value={step}
          onValueChange={(next) => navigate(next as Step)}
          className="shrink-0 border-b px-4 py-3 sm:px-6"
        >
          <TabsList
            aria-label={t("Partner setup")}
            className="grid h-auto grid-cols-3 gap-1 rounded-2xl bg-muted/60 p-1"
          >
            {(
              [
                { value: "contact", label: "Contact", Icon: CircleUserRound },
                { value: "connections", label: "Connections", Icon: Link2 },
                { value: "review", label: "Review", Icon: CheckCheck },
              ] as const
            ).map((item, index) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                id={`partner-step-${item.value}-tab`}
                aria-controls={`partner-step-${item.value}-panel`}
                disabled={save.isPending}
                className="gap-2 rounded-xl px-2 py-2 data-[state=active]:bg-violet-600 data-[state=active]:text-white"
              >
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-current/10 text-[11px]"
                >
                  {index + 1}
                </span>
                {t(item.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <fieldset
          disabled={save.isPending}
          className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6"
        >
          {step === "contact" && (
            <div
              role="tabpanel"
              id="partner-step-contact-panel"
              aria-labelledby="partner-step-contact-tab"
              aria-label={t("Contact")}
              className="grid gap-4 sm:grid-cols-2"
            >
              {fields.map((field) => (
                <div
                  key={field.key}
                  className={cn(
                    "space-y-2",
                    field.key === "companyName" && "sm:col-span-2",
                  )}
                >
                  <Label htmlFor={`partner-${field.key}`}>
                    {t(field.label)}
                    {!field.required && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        ({t("Optional")})
                      </span>
                    )}
                  </Label>
                  <Input
                    id={`partner-${field.key}`}
                    name={field.key}
                    type={field.type}
                    maxLength={field.max}
                    autoComplete={field.autoComplete}
                    required={field.required}
                    className="h-11 rounded-xl bg-muted/20"
                    value={values[field.key]}
                    aria-invalid={Boolean(errors[field.key])}
                    aria-describedby={
                      errors[field.key]
                        ? `partner-${field.key}-error`
                        : undefined
                    }
                    onChange={(event) => {
                      update({ [field.key]: event.target.value });
                      if (errors[field.key])
                        setErrors((current) => ({
                          ...current,
                          [field.key]: "",
                        }));
                    }}
                  />
                  {errors[field.key] && (
                    <p
                      id={`partner-${field.key}-error`}
                      className="text-xs text-destructive"
                    >
                      {errors[field.key]}
                    </p>
                  )}
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="partner-meetingDate">
                  {t("Meeting date")}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({t("Optional")})
                  </span>
                </Label>
                <Input
                  id="partner-meetingDate"
                  type="date"
                  className="h-11 rounded-xl bg-muted/20"
                  value={values.meetingDate}
                  onChange={(event) =>
                    update({ meetingDate: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="partner-notes">
                  {t("Notes")}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({t("Optional")})
                  </span>
                </Label>
                <Textarea
                  id="partner-notes"
                  rows={3}
                  maxLength={10000}
                  className="resize-y rounded-xl bg-muted/20"
                  value={values.notes}
                  onChange={(event) => update({ notes: event.target.value })}
                />
              </div>
            </div>
          )}
          {step === "connections" && (
            <div
              role="tabpanel"
              id="partner-step-connections-panel"
              aria-labelledby="partner-step-connections-tab"
              aria-label={t("Connections")}
              className="space-y-3"
            >
              {(Object.keys(CONNECTIONS) as ConnectionKind[]).map((kind) => {
                const item = CONNECTIONS[kind];
                const unavailable = connectionUnavailable(kind);
                return (
                  <div
                    key={kind}
                    className={cn("rounded-2xl border p-4", item.color)}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-xl",
                          item.iconColor,
                        )}
                      >
                        <item.Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold">{t(item.title)}</h3>
                        {ids[kind] ? (
                          <>
                            <p className="mt-1 break-words text-sm">
                              {names[kind] || ids[kind]}
                            </p>
                            <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                              {ids[kind]}
                            </p>
                          </>
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t("Not linked")}
                          </p>
                        )}
                        {unavailable && (
                          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            {t(
                              "This connection is unavailable. Choose another or remove it.",
                            )}
                          </p>
                        )}
                        {kind === "app" && appStatus && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t(partnerAppStatusLabel(appStatus))}
                          </p>
                        )}
                      </div>
                      {ids[kind] && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t(item.remove)}
                          title={t(item.remove)}
                          onClick={() => remove(kind)}
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 rounded-xl bg-background/80"
                      onClick={() => setPicker(kind)}
                    >
                      {ids[kind] ? (
                        <Pencil className="size-3.5" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      {t(item.choose)}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {step === "review" && (
            <div
              role="tabpanel"
              id="partner-step-review-panel"
              aria-labelledby="partner-step-review-tab"
              aria-label={t("Review")}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50/40 p-5 dark:border-violet-400/20 dark:from-violet-500/10 dark:to-fuchsia-500/5">
                <div className="flex items-start gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-lg font-semibold text-white">
                    {values.companyName.trim().slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-heading text-lg font-semibold">
                      {values.companyName.trim()}
                    </h3>
                    <p className="mt-1 break-words text-sm">
                      {values.firstName.trim()} {values.lastName.trim()}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-muted-foreground">
                      <Mail className="size-3.5 shrink-0" />
                      {values.email.trim().toLowerCase()}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("Edit contact details")}
                    onClick={() => setStep("contact")}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-violet-200/70 pt-3 text-sm dark:border-violet-400/20">
                  <div>
                    <dt className="text-muted-foreground">
                      {t("Phone number")}
                    </dt>
                    <dd className="mt-1 break-words">
                      {values.phoneNumber.trim() || t("Not provided")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("Meeting date")}
                    </dt>
                    <dd className="mt-1">
                      {values.meetingDate || t("Not scheduled")}
                    </dd>
                  </div>
                </dl>
                {values.notes.trim() && (
                  <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-background/60 p-3 text-sm">
                    {values.notes.trim()}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{t("Connections")}</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("connections")}
                  >
                    <Pencil className="size-3" />
                    {t("Edit connections")}
                  </Button>
                </div>
                {(Object.keys(CONNECTIONS) as ConnectionKind[])
                  .filter((kind) => ids[kind])
                  .map((kind) => {
                    const item = CONNECTIONS[kind];
                    return (
                      <div
                        key={kind}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                          item.color,
                        )}
                      >
                        <item.Icon className="size-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium">
                            {names[kind] || ids[kind]}
                          </p>
                          <p className="break-all text-[11px] text-muted-foreground">
                            {t(item.title)} · {ids[kind]}
                          </p>
                        </div>
                        {connectionUnavailable(kind) ? (
                          <span className="ml-auto max-w-36 text-xs font-medium text-amber-700 dark:text-amber-300">
                            {t("Unavailable connection")}
                          </span>
                        ) : (
                          <Check className="ml-auto size-4 shrink-0 text-emerald-600" />
                        )}
                      </div>
                    );
                  })}
                {!Object.values(ids).some(Boolean) && (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    {t("No connections yet")}
                  </p>
                )}
              </div>
            </div>
          )}
          {save.isError && (
            <div className="mt-4">
              <ErrorMessage
                error={save.error}
                fallback={t("Could not save partner.")}
              />
            </div>
          )}
        </fieldset>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-5 py-4 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() =>
              step === "contact"
                ? onCancel()
                : setStep(step === "review" ? "connections" : "contact")
            }
          >
            {step !== "contact" && <ArrowLeft className="size-4" />}
            {t(step === "contact" ? "Cancel" : "Back")}
          </Button>
          {step === "review" ? (
            <Button
              type="submit"
              disabled={save.isPending}
              className="h-10 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-white shadow-lg shadow-violet-500/15"
            >
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {t("Save partner")}
            </Button>
          ) : (
            <Button
              type="submit"
              className="h-10 rounded-xl bg-violet-600 px-5 text-white hover:bg-violet-700"
            >
              {t(step === "contact" ? "Continue" : "Review partner")}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </form>
      {picker && (
        <ConnectionBrowser
          initialKind={picker}
          organizationId={values.linkedOrganizationId}
          individualPublisherId={values.linkedIndividualPublisherId}
          selectedIds={ids}
          onClose={() => setPicker(null)}
          onSelect={select}
        />
      )}
    </>
  );
}
