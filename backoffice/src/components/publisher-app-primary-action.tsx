"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { publisherAppIntensePalette } from "@/components/publisher-app-promo-banner";
import "./publisher-app-primary-action.css";
import type { PublisherAppStatus } from "@/lib/publisher-app-config";
import {
  PUBLISHER_PORTAL_APP_EDIT_ROUTE,
  PUBLISHER_PORTAL_APP_NEW_ROUTE,
  PUBLISHER_PORTAL_APP_PAYMENT_DETAILS_ROUTE,
  PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE,
  PUBLISHER_PORTAL_APP_UPLOAD_BUILD_DETAILS_ROUTE,
} from "@/lib/publisher-portal-routes";

export function PublisherAppPrimaryAction({
  hasConfig,
  status,
  tint,
}: {
  hasConfig: boolean;
  status?: PublisherAppStatus | null;
  tint?: string;
}) {
  const palette = publisherAppIntensePalette(tint);
  const faceHue = (palette.sceneHue + 5) % 360;
  const needsDarkerFace = faceHue >= 30 && faceHue <= 205;
  const action = !hasConfig
    ? { label: "¡Quiero una prueba gratuita de mi app propia!", href: PUBLISHER_PORTAL_APP_NEW_ROUTE }
    : status === "active_for_testing"
      ? { label: "¡Quiero subir mi app al store!", href: PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE }
      : status === "active_waiting_for_payment"
        ? { label: "Completar información de pago", href: PUBLISHER_PORTAL_APP_PAYMENT_DETAILS_ROUTE }
        : status === "active_waiting_for_upload"
          ? { label: "Consultar estado de publicación", href: PUBLISHER_PORTAL_APP_UPLOAD_BUILD_DETAILS_ROUTE }
          : { label: "Ver mi app", href: PUBLISHER_PORTAL_APP_EDIT_ROUTE };

  return (
    <Link
      href={action.href}
      prefetch={false}
      data-testid="publisher-app-primary-action"
      className="trial-cta group relative mt-4 flex min-h-24 w-full items-center gap-4 whitespace-normal rounded-2xl border border-transparent px-5 py-5 text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-7"
      style={{
        "--trial-cta-hue": palette.sceneHue,
        "--trial-cta-light-hue": palette.sceneHue - 18,
        "--trial-cta-depth-hue": palette.sceneHue + 14,
        "--trial-cta-face-left": `hsl(${palette.sceneHue - 4} 100% ${needsDarkerFace ? 33 : 48}%)`,
        "--trial-cta-face-middle": `hsl(${faceHue} 100% ${needsDarkerFace ? 27 : 46}%)`,
        "--trial-cta-face-right": `hsl(${palette.sceneHue + 14} 100% ${needsDarkerFace ? 23 : 44}%)`,
        "--trial-cta-sheen-main": `${needsDarkerFace ? 30 : 51}%`,
        "--trial-cta-sheen-side": `${needsDarkerFace ? 36 : 62}%`,
        "--trial-cta-sheen-end": `${needsDarkerFace ? 30 : 53}%`,
      } as CSSProperties}
    >
      <span aria-hidden="true" className="trial-cta__halo" />
      <span aria-hidden="true" className="trial-cta__surface">
        <span className="trial-cta__bezel" />
        <span className="trial-cta__face" />
      </span>
      <span aria-hidden="true" className="trial-cta__reflection">
        <span className="trial-cta__sweep" />
      </span>
      <span aria-hidden="true" className="trial-cta__glints" />
      <span className="trial-cta__content">
        <span aria-hidden="true" className="trial-cta__icon flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/20">
          <Sparkles className="size-6" />
        </span>
        <span className="trial-cta__label min-w-0 flex-1 text-balance text-center font-heading text-xl font-semibold leading-snug sm:text-2xl">
          {action.label}
        </span>
        <span aria-hidden="true" className="trial-cta__arrow size-6 shrink-0">
          <ArrowRight className="trial-cta__arrow-outgoing size-6" />
          <ArrowRight className="trial-cta__arrow-incoming size-6" />
        </span>
      </span>
    </Link>
  );
}
