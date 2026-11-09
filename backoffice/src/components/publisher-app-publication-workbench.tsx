"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, FileCheck2, LoaderCircle } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { PublisherAppReviewDocument, PublisherAppSuccessCelebration } from "@/components/publisher-app-config-workbench";
import { Button } from "@/components/ui/button";
import type { PublisherAppConfig, PublisherAppConfigResponse } from "@/lib/publisher-app-config";
import { PUBLISHER_PORTAL_APP_EDIT_ROUTE, PUBLISHER_PORTAL_HOME_ROUTE } from "@/lib/publisher-portal-routes";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

export function PublisherAppPublicationWorkbench({
  config,
  apiPath = "/publisher-app/config",
  editHref = PUBLISHER_PORTAL_APP_EDIT_ROUTE,
  backHref = PUBLISHER_PORTAL_HOME_ROUTE,
  backLabel = "Volver al inicio",
}: {
  config: PublisherAppConfig;
  apiPath?: string;
  editHref?: string;
  backHref?: string;
  backLabel?: string;
}) {
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const inFlight = useRef(false);

  async function submit() {
    if (!accepted || inFlight.current || config.status !== "active_for_testing") return;
    inFlight.current = true;
    setPending(true);
    setToast(null);
    try {
      const response = await sdkFetch<PublisherAppConfigResponse>(`${apiPath}/sign-terms-and-conditions`, {
        method: "POST",
        body: JSON.stringify({ termsAccepted: true, expectedUpdatedAt: config.updatedAt }),
      });
      if (response.config?.id !== config.id || response.config.status !== "active_waiting_for_payment" || !response.config.termsAcceptedAt) {
        throw new Error("El servidor no confirmó la firma y la solicitud de publicación.");
      }
      setCompleted(true);
    } catch (error) {
      setToast({
        id: Date.now(), tone: "error", title: "No pudimos solicitar la publicación",
        message: error instanceof Error ? error.message : "Volvé a intentarlo.",
        details: error instanceof SdkRequestError ? error.details : undefined,
      });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (completed) return <PublisherAppSuccessCelebration
    variant="publication" publisherName={config.publisherName}
    appProviderIdentifier={config.appProviderIdentifier ?? ""}
    editHref={editHref} backHref={backHref} backLabel={backLabel}
  />;

  return (
    <section className="space-y-5 pb-40" data-testid="publisher-app-publication-workbench">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} language="es" />
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" asChild>
          <Link href={editHref} prefetch={false}><ArrowLeft className="size-4" /> Volver a editar mi app</Link>
        </Button>
        <HeaderUnclutterButton />
      </div>
      {config.status === "active_for_testing" ? (
        <PublisherAppReviewDocument
          publisherName={config.publisherName} publisherEmail={config.publisherEmail}
          state={config} colors={config.colors}
          iconSource={config.iconImageUploadDataUrl ?? config.iconImageUrl}
          termsAccepted={accepted} onTermsAcceptedChange={setAccepted} disabled={pending}
        />
      ) : <p role="alert">Esta app no está en la etapa de pruebas para solicitar su publicación.</p>}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl justify-end">
          <Button size="lg" onClick={() => void submit()} disabled={!accepted || pending || config.status !== "active_for_testing"}
            className="h-14 rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white hover:bg-emerald-700">
            {pending ? <LoaderCircle className="size-5 animate-spin" /> : <FileCheck2 className="size-5" />}
            {pending ? "Enviando solicitud…" : "Aceptar condiciones y solicitar publicación"}
          </Button>
        </div>
      </footer>
    </section>
  );
}
