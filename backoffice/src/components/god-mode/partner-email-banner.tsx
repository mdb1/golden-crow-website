"use client";

import { createRoot } from "react-dom/client";
import { toJpeg } from "html-to-image";
import { PublisherAppPromoBanner } from "@/components/publisher-app-promo-banner";
import type {
  PartnerEmailBannerBrand,
  PartnerEmailBannerInput,
  PartnerEmailLanguage,
  PartnerEmailPreview,
} from "@/lib/partner-email";

function awaitBanner(node: HTMLElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let observer: MutationObserver;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      observer.disconnect();
      node.removeEventListener("load", check, true);
      node.removeEventListener("error", failed, true);
      signal.removeEventListener("abort", aborted);
      error ? reject(error) : resolve();
    };
    const aborted = () => finish(new DOMException("Aborted", "AbortError"));
    const failed = () =>
      finish(
        new Error(
          "Could not load the publisher icon or app banner. Try again.",
        ),
      );
    const check = () => {
      if (signal.aborted) return aborted();
      const banner = node.querySelector<HTMLElement>("[data-runtime-state]");
      if (banner?.dataset.runtimeState === "error") return failed();
      const images = Array.from(node.querySelectorAll("img"));
      if (
        banner?.dataset.runtimeState === "ready" &&
        node.querySelectorAll(".atomic-raster").length === 3 &&
        images.every((img) => img.src && img.complete && img.naturalWidth > 0)
      )
        finish();
    };
    observer = new MutationObserver(check);
    const timeout = window.setTimeout(failed, 25000);
    observer.observe(node, {
      childList: true,
      attributes: true,
      subtree: true,
    });
    node.addEventListener("load", check, true);
    node.addEventListener("error", failed, true);
    signal.addEventListener("abort", aborted, { once: true });
    check();
  });
}

export async function renderPartnerEmailBanner(
  brand: PartnerEmailBannerBrand,
  language: PartnerEmailLanguage,
  category: PartnerEmailPreview["category"],
  signal: AbortSignal,
): Promise<PartnerEmailBannerInput> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  Object.assign(container.style, {
    position: "fixed",
    left: "-15000px",
    top: "0",
    width: "1024px",
    pointerEvents: "none",
  });
  document.body.append(container);
  const root = createRoot(container);
  const newApp =
    category === "organizationWithoutApp" ||
    category === "individualWithoutApp";
  try {
    root.render(
      <div
        data-email-banner-capture
        style={{
          width: 1024,
          background: "#ffffff",
          color: "#171126",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            padding: "26px 30px",
            minHeight: 120,
            boxSizing: "border-box",
          }}
        >
          {brand.imageUrl ? (
            <img
              src={brand.imageUrl}
              alt=""
              style={{
                width: 68,
                height: 68,
                objectFit: "contain",
                borderRadius: 16,
              }}
            />
          ) : (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 68,
                height: 68,
                flexShrink: 0,
                background: brand.tint,
                color: "white",
                fontSize: 32,
                borderRadius: 16,
              }}
            >
              {Array.from(brand.name)[0]?.toUpperCase()}
            </span>
          )}
          <strong
            style={{
              fontSize: 30,
              lineHeight: "36px",
              overflowWrap: "anywhere",
            }}
          >
            {brand.name}
          </strong>
        </div>
        <PublisherAppPromoBanner
          organizationName={brand.name}
          organizationTint={brand.tint}
          organizationImageUrl={brand.imageUrl}
          language={language}
          showPricing={!newApp}
          showAction={!newApp}
          ctaLabel={
            language === "es"
              ? newApp
                ? "Crear mi app"
                : "Editar mi app"
              : newApp
                ? "Create my app"
                : "Edit my app"
          }
        />
      </div>,
    );
    await awaitBanner(container, signal);
    await document.fonts.ready;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const capture = container.querySelector<HTMLElement>(
      "[data-email-banner-capture]",
    )!;
    const dataUrl = await toJpeg(capture, {
      quality: 0.9,
      pixelRatio: 1,
      width: 1024,
      backgroundColor: "#ffffff",
      includeQueryParams: true,
      fetchRequestInit: { referrerPolicy: "no-referrer" },
    });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (
      !dataUrl.startsWith("data:image/jpeg;base64,") ||
      dataUrl.length > 750000
    )
      throw new Error("Could not prepare the app banner. Try again.");
    return { contextHash: brand.contextHash, dataUrl };
  } finally {
    root.unmount();
    container.remove();
  }
}
