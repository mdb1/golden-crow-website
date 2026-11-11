"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CircleUserRound,
  GripVertical,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  Smartphone,
  X,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { partnerAppStatusLabel } from "@/components/god-mode/partner-editor-dialog";
import { PartnerEmailPreviewDialog } from "@/components/god-mode/partner-email-preview-dialog";
import {
  PARTNERS_API_ROUTE,
  PARTNERS_QUERY_KEY,
  PARTNER_SECTIONS,
  PARTNER_INDIVIDUAL_SECTIONS,
  partnerSection,
  type Partner,
} from "@/lib/connected-partners";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

function useText() {
  const { language } = useAppLanguage();
  return (text: string) => appText(language, text);
}

// Keep the same inline, resizable split-pane interaction as the CRM.
const MIN_WIDTH = 100 / 3;
const MAX_WIDTH = 200 / 3;
function clampWidth(value: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

export function PartnersSplitPane({
  children,
  detail,
}: {
  children: ReactNode;
  detail?: ReactNode;
}) {
  const t = useText();
  const splitRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(50);
  const [resizing, setResizing] = useState(false);
  const open = Boolean(detail);

  useEffect(() => {
    if (!open) setResizing(false);
  }, [open]);

  function resizeFromClientX(clientX: number) {
    const bounds = splitRef.current?.getBoundingClientRect();
    if (bounds && bounds.width > 0)
      setWidth(clampWidth(((bounds.right - clientX) / bounds.width) * 100));
  }

  useEffect(() => {
    if (!resizing || !open) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (event: PointerEvent) => {
      event.preventDefault();
      resizeFromClientX(event.clientX);
    };
    const stop = () => setResizing(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [resizing, open]);

  return (
    <div
      ref={splitRef}
      data-testid="partners-split-pane"
      className={cn(
        "grid min-w-0 gap-4",
        open &&
          "xl:h-[calc(100vh_-_var(--app-header-height)_-_2rem)] xl:min-h-0 xl:grid-cols-[minmax(0,var(--partners-list-width))_1rem_minmax(0,var(--partners-detail-width))] xl:gap-0 xl:overflow-hidden",
      )}
      style={
        open
          ? ({
              "--partners-list-width": `${100 - width}fr`,
              "--partners-detail-width": `${width}fr`,
            } as CSSProperties)
          : undefined
      }
    >
      <div
        className={cn(
          "min-w-0",
          open && "xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-2",
        )}
      >
        {children}
      </div>
      {open && (
        <div
          role="separator"
          tabIndex={0}
          aria-label={t("Resize partner detail panel")}
          aria-orientation="vertical"
          aria-valuemin={Math.round(MIN_WIDTH)}
          aria-valuemax={Math.round(MAX_WIDTH)}
          aria-valuenow={Math.round(width)}
          className={cn(
            "group hidden cursor-col-resize touch-none select-none items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/45 xl:flex",
            resizing && "bg-primary/8",
          )}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.preventDefault();
            resizeFromClientX(event.clientX);
            setResizing(true);
          }}
          onKeyDown={(event) => {
            const value =
              event.key === "Home"
                ? MIN_WIDTH
                : event.key === "End"
                  ? MAX_WIDTH
                  : event.key === "ArrowLeft"
                    ? width + 4
                    : event.key === "ArrowRight"
                      ? width - 4
                      : null;
            if (value === null) return;
            event.preventDefault();
            setWidth(clampWidth(value));
          }}
        >
          <span className="flex h-16 w-4 items-center justify-center rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-sm group-hover:border-primary/45 group-hover:text-foreground">
            <GripVertical className="size-4" />
          </span>
        </div>
      )}
      {detail}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {children || "—"}
      </dd>
    </div>
  );
}

function PartnerFacts({ partner }: { partner: Partner }) {
  const t = useText();
  const section = partnerSection(partner);
  const sectionLabel =
    [...PARTNER_SECTIONS, ...PARTNER_INDIVIDUAL_SECTIONS].find(
      (item) => item.key === section,
    )?.label ?? "Other app statuses or missing links";
  return (
    <div className="grid gap-4">
      <span className="w-fit rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">
        {t(sectionLabel)}
      </span>
      <section className="rounded-2xl border bg-background/70 p-4">
        <h4 className="mb-4 font-semibold">{t("Contact")}</h4>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Fact label={t("Company name")}>{partner.companyName}</Fact>
          <Fact label={t("Partner ID")}>{partner.id}</Fact>
          <Fact label={t("First name")}>{partner.firstName}</Fact>
          <Fact label={t("Last name")}>{partner.lastName}</Fact>
          <Fact label={t("Email")}>
            <a
              className="text-violet-700 underline-offset-4 hover:underline dark:text-violet-300"
              href={`mailto:${partner.email}`}
            >
              {partner.email}
            </a>
          </Fact>
          <Fact label={t("Phone number")}>{partner.phoneNumber || "—"}</Fact>
          <Fact label={t("Meeting date")}>
            {partner.meetingDate ?? t("Not scheduled")}
          </Fact>
        </dl>
      </section>
      <section className="space-y-3 rounded-2xl border bg-background/70 p-4">
        <h4 className="font-semibold">{t("Connections")}</h4>
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-400/20 dark:bg-violet-500/5">
          <h5 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Building2 className="size-4 text-violet-600 dark:text-violet-300" />
            {t("Linked organization")}
          </h5>
          {partner.linkedOrganizationId ? (
            <>
              <dl className="grid gap-3 text-sm">
                <Fact label={t("Name")}>
                  {partner.linkedOrganization?.name ??
                    partner.linkedOrganizationSnapshot?.name ??
                    "—"}
                </Fact>
                <Fact label={t("Organization ID")}>
                  {partner.linkedOrganizationId}
                </Fact>
              </dl>
              {!partner.linkedOrganization && (
                <p className="mt-3 break-words text-sm text-amber-700 dark:text-amber-300">
                  {t("Linked organization is unavailable.")} (
                  {partner.linkedOrganizationId})
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Not linked")}</p>
          )}
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-400/20 dark:bg-sky-500/5">
          <h5 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CircleUserRound className="size-4 text-sky-600 dark:text-sky-300" />
            {t("Linked individual publisher")}
          </h5>
          {partner.linkedIndividualPublisherId ? (
            <>
              <dl className="grid gap-3 text-sm">
                <Fact label={t("Name")}>
                  {partner.linkedIndividualPublisher?.name ??
                    partner.linkedIndividualPublisherSnapshot?.name ??
                    "—"}
                </Fact>
                <Fact label={t("Individual publisher ID")}>
                  {partner.linkedIndividualPublisherId}
                </Fact>
              </dl>
              {!partner.linkedIndividualPublisher && (
                <p className="mt-3 break-words text-sm text-amber-700 dark:text-amber-300">
                  {t("Linked individual publisher is unavailable.")} (
                  {partner.linkedIndividualPublisherId})
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Not linked")}</p>
          )}
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-400/20 dark:bg-emerald-500/5">
          <h5 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Smartphone className="size-4 text-emerald-600 dark:text-emerald-300" />
            {t("Linked app")}
          </h5>
          {partner.linkedAppId ? (
            <>
              <dl className="grid gap-3 text-sm">
                <Fact label={t("App ID")}>{partner.linkedAppId}</Fact>
                {partner.linkedApp && (
                  <>
                    <Fact label={t("Current status")}>
                      {t(partnerAppStatusLabel(partner.linkedApp.status))}
                    </Fact>
                    <Fact label={t("Publisher")}>
                      {partner.linkedApp.publisherName}
                    </Fact>
                    <Fact label={t("Publisher type")}>
                      {t(
                        partner.linkedApp.publisherKind === "organization"
                          ? "Organization"
                          : "Individual publisher",
                      )}
                    </Fact>
                    <Fact label={t("Publisher ID")}>
                      {partner.linkedApp.publisherId}
                    </Fact>
                    <Fact label={t("App identifier")}>
                      {partner.linkedApp.appProviderIdentifier ?? "—"}
                    </Fact>
                  </>
                )}
              </dl>
              {!partner.linkedApp && (
                <p className="mt-3 break-words text-sm text-amber-700 dark:text-amber-300">
                  {t(
                    "Linked app is unavailable or no longer belongs to a linked publisher.",
                  )}{" "}
                  ({partner.linkedAppId})
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Not linked")}</p>
          )}
        </div>
      </section>
      <section className="rounded-2xl border bg-background/70 p-4">
        <h4 className="mb-3 font-semibold">{t("Notes")}</h4>
        <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
          {partner.notes || "—"}
        </p>
      </section>
      {(partner.linkedOrganizationSnapshot ||
        partner.linkedIndividualPublisherSnapshot ||
        partner.linkedAppSnapshot) && (
        <details className="rounded-2xl border bg-muted/20 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {t("Stored connection snapshots")}
          </summary>
          <p className="my-3 text-xs text-muted-foreground">
            {t(
              "Saved when the partner was linked. Current connections and app status are shown above.",
            )}
          </p>
          <dl className="grid gap-4 text-sm">
            {partner.linkedOrganizationSnapshot && (
              <Fact label={t("Linked organization")}>
                {partner.linkedOrganizationSnapshot.name}
                {"\n"}
                {partner.linkedOrganizationSnapshot.id}
              </Fact>
            )}
            {partner.linkedIndividualPublisherSnapshot && (
              <Fact label={t("Linked individual publisher")}>
                {partner.linkedIndividualPublisherSnapshot.name}
                {"\n"}
                {partner.linkedIndividualPublisherSnapshot.id}
              </Fact>
            )}
            {partner.linkedAppSnapshot && (
              <>
                <Fact label={t("App ID")}>{partner.linkedAppSnapshot.id}</Fact>
                <Fact label={t("Saved app status")}>
                  {t(partnerAppStatusLabel(partner.linkedAppSnapshot.status))}
                </Fact>
                <Fact label={t("Publisher")}>
                  {partner.linkedAppSnapshot.publisherName}
                </Fact>
                <Fact label={t("Publisher type")}>
                  {t(
                    partner.linkedAppSnapshot.publisherKind === "organization"
                      ? "Organization"
                      : "Individual publisher",
                  )}
                </Fact>
                <Fact label={t("Publisher ID")}>
                  {partner.linkedAppSnapshot.publisherId}
                </Fact>
                <Fact label={t("App identifier")}>
                  {partner.linkedAppSnapshot.appProviderIdentifier ?? "—"}
                </Fact>
              </>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}

export function PartnerDetailPanel({
  partnerId,
  companyName,
  panelId,
  onEdit,
  onClose,
}: {
  partnerId: string;
  companyName: string;
  panelId: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const t = useText();
  const headingId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const query = useQuery({
    queryKey: [...PARTNERS_QUERY_KEY, "detail", partnerId],
    queryFn: ({ signal }) =>
      sdkFetch<{ partner: Partner }>(
        `${PARTNERS_API_ROUTE}/${encodeURIComponent(partnerId)}`,
        { signal },
      ),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const partner = query.data?.partner;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!window.matchMedia("(min-width: 1280px)").matches) {
        panelRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
        panelRef.current?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [partnerId]);

  return (
    <>
      <aside
        ref={panelRef}
        id={panelId}
        tabIndex={-1}
        aria-label={t("Partner details")}
        aria-busy={query.isFetching}
        className="min-w-0 scroll-mt-24 space-y-4 rounded-2xl border border-violet-200/70 bg-muted/10 outline-none xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain dark:border-violet-400/20"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b bg-background p-4">
          <div className="min-w-0 flex-1">
            <h3
              id={headingId}
              className="break-words font-heading text-xl font-semibold"
            >
              {partner?.companyName ?? companyName}
            </h3>
            {partner && (
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {partner.firstName} {partner.lastName}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`${t("Edit partner")}: ${partner?.companyName ?? companyName}`}
              title={t("Edit partner")}
              disabled={!partner || query.isError || query.isFetching}
              onClick={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("Hide details")}
              title={t("Hide details")}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="px-4 pb-4">
          {query.isPending && (
            <p
              role="status"
              className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              {t("Loading partner details...")}
            </p>
          )}
          {query.isError ? (
            <div
              role="alert"
              className="grid gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
            >
              <p className="text-destructive">
                {t("Could not load partner details.")}
              </p>
              {query.error instanceof Error && (
                <p className="break-words text-muted-foreground">
                  {query.error.message}
                </p>
              )}
              <Button
                className="w-fit"
                variant="outline"
                size="sm"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw className="size-4" />
                {t("Retry detail")}
              </Button>
            </div>
          ) : partner ? (
            <PartnerFacts partner={partner} />
          ) : null}
          {partner && !query.isError && (
            <div className="mt-6 space-y-3">
              {partnerSection(partner) === "other" && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {t(
                    "Review the partner's connections and app status before sending an email.",
                  )}
                </p>
              )}
              <Button
                type="button"
                className="h-auto min-h-24 w-full gap-3 whitespace-normal rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-7 text-lg font-semibold text-white shadow-sm hover:from-violet-700 hover:to-fuchsia-700 [&_svg]:size-6"
                disabled={
                  query.isFetching || partnerSection(partner) === "other"
                }
                onClick={() => setEmailPreviewOpen(true)}
              >
                <Mail className="size-6" />
                {t("Send an email")}
              </Button>
            </div>
          )}
        </div>
      </aside>
      {emailPreviewOpen && (
        <PartnerEmailPreviewDialog
          partnerId={partnerId}
          onClose={() => setEmailPreviewOpen(false)}
        />
      )}
    </>
  );
}
