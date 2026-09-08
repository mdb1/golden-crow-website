"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  ImageIcon,
  PackageOpen,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppLanguage } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { formatDateTime } from "@/lib/moderation-utils";
import { cn } from "@/lib/utils";
import type {
  DiscoverOrganizationProductCatalogItem,
  DiscoverOrganizationRecord,
} from "@/lib/discover";

type ProductCatalogResponse = {
  productCatalog: DiscoverOrganizationProductCatalogItem[];
};

function catalogImageSource(item: DiscoverOrganizationProductCatalogItem) {
  return item.imageUploadDataUrl || item.imageUrl || "";
}

function compactUrlLabel(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const withoutProtocol = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

  return withoutProtocol.length > 38
    ? `${withoutProtocol.slice(0, 35)}...`
    : withoutProtocol;
}

function catalogItemMatches(
  item: DiscoverOrganizationProductCatalogItem,
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    item.id,
    item.title,
    item.description,
    item.productUrl,
    item.imageUrl,
    item.imageUploadName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function DiscoverOrganizationProductCatalogBrowser({
  organization,
  routeBase,
  organizationHref,
}: {
  organization: DiscoverOrganizationRecord;
  routeBase: string;
  organizationHref: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [items, setItems] = useState(() => organization.productCatalog ?? []);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const filteredItems = useMemo(
    () => items.filter((item) => catalogItemMatches(item, query)),
    [items, query],
  );

  async function refresh() {
    setPending(true);
    try {
      const response = await sdkFetch<ProductCatalogResponse>(
        `/discover/organizations/${encodeURIComponent(
          organization.id,
        )}/product-catalog`,
      );
      setItems(response.productCatalog);
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Product catalog refreshed."),
      });
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to refresh product catalog."),
      });
    } finally {
      setPending(false);
    }
  }

  async function deleteItem(item: DiscoverOrganizationProductCatalogItem) {
    setPending(true);
    try {
      await sdkFetch<{ deleted: boolean; catalogItemId: string }>(
        `/discover/organizations/${encodeURIComponent(
          organization.id,
        )}/product-catalog/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Product deleted."),
      });
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to delete the product."),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={organizationHref}>
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("Back to organization")}
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate font-heading text-xl font-semibold text-foreground">
                  {t("Product catalog")}
                </h2>
                <HeaderUnclutterButton />
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {organization.name}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={pending}
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
              {pending ? t("Working...") : t("Refresh")}
            </Button>
            <Button size="sm" asChild>
              <Link href={`${routeBase}/new`}>
                <Plus className="h-3.5 w-3.5" />
                {t("Add product to catalog")}
              </Link>
            </Button>
          </div>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search product title, description, or URL")}
            className="pl-9"
          />
        </label>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_170px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>{t("Product")}</span>
          <span>{t("Destination")}</span>
          <span>{t("Updated")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
              <PackageOpen className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">
              {items.length === 0
                ? t("No products in the catalog yet")
                : t("No products match the loaded rows.")}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {items.length === 0
                ? t("Create your first product in under 5 minutes.")
                : t("Try a different search or refresh the catalog.")}
            </p>
            {items.length === 0 ? (
              <Button className="mt-5" asChild>
                <Link href={`${routeBase}/new`}>
                  <Plus className="h-4 w-4" />
                  {t("Add product to catalog")}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          filteredItems.map((item) => {
            const imageSource = catalogImageSource(item);
            const productUrlLabel = compactUrlLabel(item.productUrl);

            return (
              <div
                key={item.id}
                className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_170px_auto] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/40">
                    {imageSource ? (
                      <img
                        src={imageSource}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium text-foreground">
                        {item.title}
                      </h3>
                      {imageSource ? (
                        <Badge variant="brand">{t("Has image")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("No image")}</Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.id}
                    </p>
                  </div>
                </div>

                <div className="min-w-0 text-sm text-muted-foreground">
                  {item.productUrl ? (
                    <a
                      href={item.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 font-medium text-brand hover:underline"
                    >
                      <span className="truncate">{productUrlLabel}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : (
                    <span>{t("No product URL")}</span>
                  )}
                  {item.callToActionLabel ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.callToActionLabel}
                    </div>
                  ) : null}
                </div>

                <div className="text-sm text-muted-foreground">
                  {formatDateTime(item.updatedAt) ?? t("No timestamp")}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`${routeBase}/${encodeURIComponent(item.id)}`}>
                      {t("Open")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={pending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("Delete")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("Delete product?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t(
                            "This removes the product from the organization catalog. This action cannot be undone.",
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => void deleteItem(item)}
                        >
                          {t("Delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
