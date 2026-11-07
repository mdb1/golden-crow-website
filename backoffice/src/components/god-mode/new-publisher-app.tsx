"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Check, Loader2 } from "lucide-react";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { PublisherAppConfigWorkbench } from "@/components/publisher-app-config-workbench";
import { PublisherAppPromoBanner } from "@/components/publisher-app-promo-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DiscoverOrganizationsPage } from "@/lib/discover";
import type { OrganizationPublisherAppCreationData } from "@/lib/publisher-app-config";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

function organizationAppPath(id: string) {
  return `/admin/publisher-app-configs/organizations/${encodeURIComponent(id)}`;
}

function appEditHref(id: string) {
  return `/god-mode/apps/${encodeURIComponent(`organization_${id}`)}`;
}

export function GodModeNewPublisherApp() {
  const [query, setQuery] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [wizard, setWizard] = useState<OrganizationPublisherAppCreationData | null>(null);
  const organizationsQuery = useInfiniteQuery({
    queryKey: ["god-mode-app-organizations"],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      return sdkFetch<DiscoverOrganizationsPage>(`/discover/organizations?${params}`);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const publisherQuery = useQuery({
    queryKey: ["god-mode-app-organization", organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => sdkFetch<OrganizationPublisherAppCreationData>(organizationAppPath(organizationId)),
    staleTime: 0,
  });
  const organizations = organizationsQuery.data?.pages.flatMap((page) => page.organizations) ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOrganizations = organizations.filter((organization) =>
    [organization.name, organization.id, organization.contactEmail ?? ""].some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery),
    ),
  );
  const publisher = publisherQuery.data;

  if (wizard) {
    return (
      <PublisherAppConfigWorkbench
        key={wizard.publisherId}
        mode="create"
        publisherKind="organization"
        publisherId={wizard.publisherId}
        publisherName={wizard.publisherName}
        publisherTint={wizard.publisherTint}
        publisherImageUrl={wizard.publisherImageUrl}
        publisherEmail={wizard.publisherEmail}
        publisherUsername={wizard.publisherUsername}
        apiPath={organizationAppPath(wizard.publisherId)}
        editHref={appEditHref(wizard.publisherId)}
        backHref="/god-mode/apps"
        backLabel="Volver a Apps"
        allowAutomaticActivation
        showDangerZone={false}
      />
    );
  }

  return (
    <section className="space-y-5" data-testid="god-mode-new-app">
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-xl font-semibold">Nueva app</h2>
            <HeaderUnclutterButton />
          </div>
          <Button variant="outline" asChild>
            <Link href="/god-mode/apps"><ArrowLeft className="size-4" />Volver a Apps</Link>
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-organization-search">Organización</Label>
          <Input
            id="app-organization-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar entre las organizaciones cargadas"
          />
        </div>
        {organizationsQuery.isPending ? (
          <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Cargando organizaciones…</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Organizaciones">
            {visibleOrganizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                aria-pressed={organization.id === organizationId}
                onClick={() => setOrganizationId(organization.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition hover:border-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                  organization.id === organizationId && "border-violet-500 bg-violet-500/10",
                )}
              >
                <Building2 className="size-5 shrink-0 text-violet-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{organization.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{organization.id}</span>
                </span>
                {organization.id === organizationId ? <Check className="size-4 shrink-0" /> : null}
              </button>
            ))}
          </div>
        )}
        {!organizationsQuery.isPending && !organizationsQuery.isError && visibleOrganizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay organizaciones que coincidan en las filas cargadas.</p>
        ) : null}
        {organizationsQuery.isError ? (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>No pudimos cargar las organizaciones.</p>
            <Button variant="outline" onClick={() => void organizationsQuery.refetch()}>Reintentar</Button>
          </div>
        ) : null}
        {organizationsQuery.isFetchNextPageError ? (
          <p role="alert" className="text-sm text-destructive">No pudimos cargar más organizaciones. Volvé a intentarlo.</p>
        ) : null}
        {organizationsQuery.hasNextPage ? (
          <Button variant="outline" disabled={organizationsQuery.isFetchingNextPage} onClick={() => void organizationsQuery.fetchNextPage()}>
            {organizationsQuery.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null}
            {organizationsQuery.isFetchingNextPage ? "Cargando…" : "Cargar más"}
          </Button>
        ) : null}
      </div>

      {organizationId && publisherQuery.isPending ? <p role="status">Cargando la organización…</p> : null}
      {publisherQuery.isError ? (
        <div role="alert" className="space-y-2 rounded-2xl border border-destructive/30 p-5 text-sm">
          <p>No pudimos preparar la app: {publisherQuery.error.message}</p>
          <Button variant="outline" onClick={() => void publisherQuery.refetch()}>Reintentar</Button>
        </div>
      ) : null}
      {publisher && !publisherQuery.isError ? (
        <div className="space-y-3">
          <h3 className="font-heading text-lg font-semibold">{publisher.publisherName}</h3>
          {publisher.config ? (
            <Link
              href={appEditHref(publisher.publisherId)}
              aria-label={`Editar app de ${publisher.publisherName}`}
              className="block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-4"
            >
              <PublisherAppPromoBanner
                organizationName={publisher.publisherName}
                organizationTint={publisher.publisherTint}
                organizationImageUrl={publisher.publisherImageUrl}
                ctaLabel="Editar mi app"
              />
            </Link>
          ) : (
            <button
              type="button"
              aria-label={`Crear app para ${publisher.publisherName}`}
              onClick={() => setWizard(publisher)}
              className="block w-full rounded-[14px] text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-4"
            >
              <PublisherAppPromoBanner
                organizationName={publisher.publisherName}
                organizationTint={publisher.publisherTint}
                organizationImageUrl={publisher.publisherImageUrl}
              />
            </button>
          )}
          {publisher.config ? <p className="text-sm text-muted-foreground">Esta organización ya tiene una app configurada.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
