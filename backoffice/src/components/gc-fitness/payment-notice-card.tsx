"use client";

// payment-notice-card.tsx — gc-fitness #1697: la tarjeta del «Aviso de pago».
//
// La MISMA tubería que la imagen de fin de entrenamiento (`share-workout-card.tsx`): un nodo
// de 1080 px de ancho fuera de pantalla, estilos inline con la paleta hex de SHARE-CARD-SPEC
// (`SHARE_CARD_STYLE`: fondo negro + brillo ámbar, logo inline, pie «CORVO») y
// `rasterizeShareCardNode` (html-to-image) para el PNG. Nada de Tailwind ni del tema: la
// imagen no puede cambiar con el modo claro/oscuro de quien la manda.
//
// Determinista: sólo dibuja lo que trae `PaymentNoticeModel` (sin «hoy», sin reloj).

import { forwardRef } from "react";

import { SHARE_CARD_STYLE as S } from "@/components/gc-fitness/share-workout-card";
import type { PaymentNoticeModel } from "@/lib/gc-fitness/payment-notice";

export interface PaymentNoticeLabels {
  eyebrow: string;
  coachLine: string;
  plan: string;
  amount: string;
  due: string;
  pending: string;
  details: string;
}

function Row({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 32,
        padding: "28px 0",
        borderBottom: `1px solid ${S.CARD_BORDER}`,
      }}
    >
      <span
        style={{
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: S.LABEL_GRAY,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: big ? 72 : 40,
          fontWeight: big ? 700 : 600,
          color: big ? S.STAT_NUMBER : S.TEXT_PRIMARY,
          textAlign: "right",
          overflowWrap: "anywhere",
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export const PaymentNoticeCard = forwardRef<
  HTMLDivElement,
  { model: PaymentNoticeModel; labels: PaymentNoticeLabels }
>(function PaymentNoticeCard({ model, labels }, ref) {
  return (
    <div
      ref={ref}
      data-testid="payment-notice-card"
      style={{
        width: S.CANVAS_WIDTH,
        minHeight: S.CANVAS_MIN_HEIGHT,
        backgroundColor: S.BG,
        backgroundImage: S.backgroundImage,
        color: S.TEXT_PRIMARY,
        fontFamily: S.FONT_STACK,
        padding: "56px 64px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {/* Header band — logo + eyebrow + client name + coach line (as the workout card). */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 28 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={S.logoDataUri}
          alt=""
          width={150}
          height={150}
          style={{ width: 150, height: 150, objectFit: "contain", flexShrink: 0 }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: S.ACCENT,
            }}
          >
            {labels.eyebrow}
          </span>
          <span
            style={{ fontSize: 56, fontWeight: 600, lineHeight: 1.1, overflowWrap: "anywhere" }}
            data-testid="payment-notice-client"
          >
            {model.clientName}
          </span>
          {model.coachName.trim() ? (
            <span style={{ fontSize: 28, color: S.TEXT_SECONDARY }}>{labels.coachLine}</span>
          ) : null}
        </div>
      </div>

      {/* Amber divider */}
      <div style={{ height: 1, backgroundColor: S.DIVIDER, margin: "40px 0 8px" }} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        {model.planName ? <Row label={labels.plan} value={model.planName} /> : null}
        <Row label={labels.amount} value={model.amountLabel} big />
        <Row label={labels.due} value={model.dueLabel ?? labels.pending} />
      </div>

      {model.details ? (
        <div
          data-testid="payment-notice-details"
          style={{
            marginTop: 40,
            backgroundColor: S.SURFACE,
            border: `1px solid ${S.CARD_BORDER}`,
            borderRadius: 20,
            padding: "28px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <span
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: S.ACCENT,
            }}
          >
            {labels.details}
          </span>
          <span
            style={{
              fontSize: 34,
              lineHeight: 1.35,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              color: S.TEXT_PRIMARY,
            }}
          >
            {model.details}
          </span>
        </div>
      ) : null}

      <div style={{ flex: 1 }} />

      {/* Footer band — the same wordmark as the workout card. */}
      <div style={{ marginTop: 48, fontSize: 22, fontWeight: 600, letterSpacing: 2, color: S.ACCENT }}>
        CORVO
      </div>
    </div>
  );
});
