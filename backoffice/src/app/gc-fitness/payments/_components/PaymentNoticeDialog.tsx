"use client";

// gc-fitness #1697 — «Aviso de pago»: la tarjeta (imagen) + el texto para UN cliente.
//
// La tarjeta sale de la misma tubería que la imagen de fin de entrenamiento
// (`PaymentNoticeCard` + `rasterizeShareCardNode`). Se comparte por:
//   - el chat de la app («Enviar por el chat»): el MISMO camino que una foto del chat del
//     backoffice — `uploadTrainerChatAttachment` (Storage del lado del servidor) +
//     `sendTrainerMessage` kind=image con el path PELADO `images/{chatId}/{id}.jpg`, ancho/alto
//     y el texto como pie, la forma que escriben las apps;
//   - WhatsApp: `wa.me/?text=` con el texto (wa.me no lleva imágenes; para la imagen está
//     «Descargar imagen»);
//   - descargar el PNG y copiar el texto.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Download, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PaymentNoticeCard,
  type PaymentNoticeLabels,
} from "@/components/gc-fitness/payment-notice-card";
import { rasterizeShareCardNode } from "@/components/gc-fitness/share-workout-card";
import { whatsappShareUrl } from "@/lib/gc-fitness/billing";
// The Server Action module is imported ON USE, not at the top: this component is mounted by
// screens whose tests render it without the Admin SDK (roster, Inicio, Cobros) — a static
// import drags firebase-admin into every one of them. Same action, same ID (#382).
import { buildPaymentNotice } from "@/lib/gc-fitness/payment-notice";
import type { ClientBillingView } from "@/lib/gc-fitness/payments-model";
import { noteIfStaleDeployment } from "@/lib/gc-fitness/stale-deployment";

import { usePaymentLabels } from "./payment-labels";

interface Props {
  clientId: string;
  clientName: string;
  clientFirstName: string;
  coachName: string;
  billing: ClientBillingView | null;
  /** Los «Datos de cobro» del coach (null = no cargó nada). */
  paymentDetails: string | null;
  /** false mientras todavía se leen los datos de cobro (no se dibuja una tarjeta a medias). */
  detailsLoaded?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentNoticeDialog({
  clientId,
  clientName,
  clientFirstName,
  coachName,
  billing,
  paymentDetails,
  detailsLoaded = true,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations("payments");
  const { lang } = usePaymentLabels();
  const model = useMemo(
    () =>
      buildPaymentNotice({
        lang,
        clientName,
        clientFirstName,
        coachName,
        billing,
        paymentDetails,
      }),
    [lang, clientName, clientFirstName, coachName, billing, paymentDetails],
  );
  const labels: PaymentNoticeLabels = {
    eyebrow: t("noticeAction"),
    coachLine: t("noticeCoach", { name: coachName }),
    plan: t("noticePlan"),
    amount: t("noticeAmount"),
    due: t("noticeDue"),
    pending: t("noticePending"),
    details: t("noticeDetails"),
  };
  const cardRef = useRef<HTMLDivElement | null>(null);
  // The dialog's content mounts in a LATER commit than this component (Radix portal +
  // presence), so the preview waits for the node itself, not for a ref read at mount.
  const [cardNode, setCardNode] = useState<HTMLDivElement | null>(null);
  const setCard = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node;
    setCardNode(node);
  }, []);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // La vista previa ES el PNG que se descarga (no una maqueta con CSS de la página).
  useEffect(() => {
    if (!open || !detailsLoaded) return;
    let cancelled = false;
    setPreview(null);
    const node = cardNode;
    if (!node) return;
    rasterizeShareCardNode(node, "png")
      .then((r) => {
        if (!cancelled) setPreview(r.dataUrl);
      })
      .catch(() => {
        /* la vista previa es best-effort; los botones vuelven a rasterizar */
      });
    return () => {
      cancelled = true;
    };
  }, [open, detailsLoaded, model, cardNode]);

  async function download() {
    const node = cardRef.current;
    if (!node) return;
    try {
      const { dataUrl } = await rasterizeShareCardNode(node, "png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${model.fileStem}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error(t("errorGeneric"));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(model.text);
      toast.success(t("noticeCopied"));
    } catch {
      // Sin permiso de portapapeles: el texto queda visible en el diálogo.
    }
  }

  async function sendToChat() {
    const node = cardRef.current;
    if (!node || sending) return;
    setSending(true);
    try {
      // JPEG como las fotos del chat de las apps (un PNG de 1080 px pesa varias veces más).
      const { dataUrl, width, height } = await rasterizeShareCardNode(
        node,
        "jpeg",
      );
      const base64Data = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const { sendTrainerMessage, uploadTrainerChatAttachment } =
        await import("@/lib/gc-fitness/chat-server-actions");
      const uploaded = await uploadTrainerChatAttachment({
        chatId: clientId,
        kind: "image",
        fileName: `${model.fileStem}.jpg`,
        mimeType: "image/jpeg",
        base64Data,
      });
      await sendTrainerMessage({
        chatId: clientId,
        kind: "image",
        imagePath: uploaded.storagePath,
        imageWidth: width,
        imageHeight: height,
        text: model.text,
      });
      toast.success(t("noticeSent"));
      onOpenChange(false);
    } catch (err) {
      if (!noteIfStaleDeployment(err)) toast.error(t("noticeSendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        data-testid="payment-notice-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("noticeAction")}</DialogTitle>
        </DialogHeader>

        <div
          className="overflow-hidden rounded-xl border bg-black"
          style={{ aspectRatio: "1080 / 1350" }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={t("noticeAction")}
              className="h-full w-full object-contain"
              data-testid="payment-notice-preview"
            />
          ) : null}
        </div>

        {detailsLoaded && !model.details ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="payment-notice-no-details"
          >
            {t("noticeNoDetails")}
          </p>
        ) : null}

        <p
          className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm"
          data-testid="payment-notice-text"
        >
          {model.text}
        </p>

        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          <Button
            type="button"
            onClick={sendToChat}
            disabled={sending || !detailsLoaded}
            data-testid="payment-notice-send-chat"
          >
            <Send className="size-4" />
            {t("noticeSendChat")}
          </Button>
          <Button asChild variant="outline">
            <a
              href={whatsappShareUrl(model.text)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="payment-notice-whatsapp"
            >
              <MessageCircle className="size-4" />
              {t("noticeWhatsapp")}
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={download}
            disabled={!detailsLoaded}
            data-testid="payment-notice-download"
          >
            <Download className="size-4" />
            {t("noticeDownload")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={copy}
            data-testid="payment-notice-copy"
          >
            <Copy className="size-4" />
            {t("noticeCopyText")}
          </Button>
        </DialogFooter>

        {/* Off-screen card — laid out (NOT display:none) so html-to-image can rasterize it. */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            pointerEvents: "none",
          }}
        >
          <PaymentNoticeCard ref={setCard} model={model} labels={labels} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
