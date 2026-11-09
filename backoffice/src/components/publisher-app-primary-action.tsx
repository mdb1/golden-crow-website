"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { publisherAppIntensePalette } from "@/components/publisher-app-promo-banner";
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
  const action = !hasConfig
    ? { label: "¡Quiero una prueba gratuita de mi app propia!", href: PUBLISHER_PORTAL_APP_NEW_ROUTE }
    : status === "active_for_testing"
      ? { label: "¡Quiero subir de mi app propia al store!", href: PUBLISHER_PORTAL_APP_SIGN_TERMS_ROUTE }
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
      className="group relative mt-4 flex min-h-24 w-full items-center gap-4 overflow-hidden whitespace-normal rounded-2xl border border-white/20 px-5 py-5 text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)] transition duration-200 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none sm:px-7"
      style={{ backgroundImage: `linear-gradient(110deg, ${palette.accentDeep}, ${palette.ink})` }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px opacity-80" style={{ backgroundImage: `linear-gradient(90deg, transparent, ${palette.accent}, transparent)` }} />
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-inner">
        <Sparkles className="size-6" />
      </span>
      <span className="min-w-0 flex-1 text-balance text-center font-heading text-lg font-semibold leading-snug sm:text-xl">
        {action.label}
      </span>
      <ArrowRight aria-hidden="true" className="size-6 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
    </Link>
  );
}
