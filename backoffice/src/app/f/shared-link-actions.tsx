"use client";

/**
 * Los botones de las landings compartidas (#1037 / S6, gc-fitness#1046) — la de
 * rutina (`/f/r/[routineId]`) y, desde #1184 / SV2-4, la de perfil (`/f/u/[uid]`).
 * Los dos links viven en el mismo lugar por la misma razón: el WebView de Instagram
 * les pega igual a los dos, y una copia de este archivo es una copia de la lección
 * de #782 que tarde o temprano se desincroniza.
 *
 * ## Por qué esto es un componente de cliente y no tres links
 *
 * Porque el caso que importa es el navegador EMBEBIDO de Instagram, y ahí no hay
 * ninguna URL que pueda mostrar la App Store. `WKWebView` no le pasa los esquemas
 * desconocidos al sistema: la app anfitriona tiene que implementar `decidePolicyFor`
 * y llamar a `UIApplication.open()`. Instagram no lo hace, así que la navegación se
 * cancela **en silencio** — indistinguible de un botón muerto. Y en iOS TODA URL de
 * `apps.apple.com` responde 301 a un esquema de app: ese redirect ES el mecanismo de
 * hand-off de Apple, no un bug, así que cambiar de URL nunca puede arreglarlo.
 *
 * Eso costó DOS intentos fallidos en #782 antes de entenderse. La única salida real
 * es detectar el web view y pedirle a la persona que abra la página en el navegador
 * de verdad (Instagram: menú ⋯ → "Abrir en el navegador"), más un copiar-link para
 * que pueda hacerlo aunque el menú no aparezca.
 *
 * En Android adentro de un web view se deja la URL `https` de Play: un `market://`
 * caído deja un botón muerto, mientras que `https` al menos renderiza la página web
 * de Play.
 *
 * ⚠️ Ningún test cubre esto de verdad. Ni jsdom ni un navegador de escritorio
 * ejercitan el WKWebView de Instagram; lo único testeable es el HTML con un UA
 * falsificado. La confirmación final es manual, en un iPhone real, desde un link real
 * de Instagram. Se dice acá en vez de sugerir una cobertura que no existe.
 */

import { useEffect, useState, type MouseEvent } from "react";

import { APP_STORE_URL, playStoreUrlWithReferrer } from "@/lib/gc-fitness/social-share-link";

type Platform = "ios" | "android" | "other";

export interface Environment {
  platform: Platform;
  /** Un navegador embebido (Instagram, Facebook, TikTok…). */
  inAppBrowser: boolean;
}

function detect(): Environment {
  if (typeof navigator === "undefined") return { platform: "other", inAppBrowser: false };
  const ua = navigator.userAgent;

  // iPad moderno se anuncia como Mac: `maxTouchPoints` es la señal correcta.
  // `typeof document.ontouchend !== "undefined"` NO sirve — ese handler existe en
  // entornos sin touch (jsdom lo define), así que llamaba iPad a toda Mac.
  const isIPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const platform: Platform = /iPhone|iPod/.test(ua) || isIPad
    ? "ios"
    : /Android/.test(ua)
      ? "android"
      : "other";

  const inAppBrowser = /Instagram|FBAN|FBAV|FB_IAB|Line\/|Twitter|TikTok/i.test(ua);
  return { platform, inAppBrowser };
}

/**
 * El botón de la tienda: a dónde va y si copia el link antes (#1643). Pura, para
 * testearla sin un navegador.
 *
 * - Android: la URL `https` de Play con `referrer=gcf_link=…`, TAMBIÉN adentro de un
 *   web view — sigue siendo `https` (la lección de #782 es no usar `market://`), y el
 *   `referrer` viaja igual cuando la página de Play abre la app de Play.
 * - iOS fuera de un web view: el App Store, copiando el link primero (no hay
 *   `referrer` en iOS). Adentro del web view esta función no se usa: ahí no hay botón.
 * - Escritorio: el App Store pelado, sin copiar (nadie instala desde ahí).
 */
export function storeLink(
  environment: Environment,
  webUrl: string | null,
): { href: string; copiesLinkFirst: boolean } {
  if (environment.platform === "android") {
    return { href: playStoreUrlWithReferrer(webUrl), copiesLinkFirst: false };
  }
  return {
    href: APP_STORE_URL,
    copiesLinkFirst: environment.platform === "ios" && !environment.inAppBrowser && !!webUrl,
  };
}

/** La navegación a la tienda, en un objeto para que el test la observe (jsdom no deja tocar `location`). */
export const storeNavigation = {
  go(url: string) {
    window.location.assign(url);
  },
};

interface SharedLinkActionsProps {
  /** `gcfitness://…` — "Abrir en Corvo". `null` esconde el botón. */
  appUrl: string | null;
  /** El link `https://fit.goldencrowvs.com/f/…` que copia el botón del WebView. */
  webUrl: string | null;
}

export function SharedLinkActions({ appUrl, webUrl }: SharedLinkActionsProps) {
  const [environment, setEnvironment] = useState<Environment>({
    platform: "other",
    inAppBrowser: false,
  });
  const [copied, setCopied] = useState(false);

  // En el servidor no hay UA del dispositivo que valga: el primer render es el
  // neutro y la detección ocurre en el cliente.
  useEffect(() => setEnvironment(detect()), []);

  const { href: storeUrl, copiesLinkFirst } = storeLink(environment, webUrl);

  /**
   * #1643 — en iOS el link se pierde al pasar por el App Store (no hay `referrer`).
   * Se copia al portapapeles ANTES de ir a la tienda, y la app recién instalada le
   * ofrece pegarlo una vez (`PasteButton`, sin el aviso de pegado). Best effort: sin
   * permiso o si el portapapeles cuelga, se va a la tienda igual, a lo sumo 800 ms tarde.
   */
  function goToStoreCopyingLink(event: MouseEvent<HTMLAnchorElement>) {
    if (!copiesLinkFirst || !webUrl) return;
    event.preventDefault();
    let write: Promise<unknown>;
    try {
      write = navigator.clipboard?.writeText(webUrl) ?? Promise.resolve();
    } catch {
      write = Promise.resolve();
    }
    const timeout = new Promise((resolve) => setTimeout(resolve, 800));
    void Promise.race([write.catch(() => undefined), timeout]).then(() => {
      storeNavigation.go(storeUrl);
    });
  }

  async function copyLink() {
    if (!webUrl) return;
    try {
      await navigator.clipboard.writeText(webUrl);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles el link sigue estando en la barra de
      // direcciones; no hay nada que avisar.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {appUrl ? (
        <a
          href={appUrl}
          className="rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-semibold text-white"
        >
          Abrir en Corvo
        </a>
      ) : null}

      {environment.inAppBrowser && environment.platform === "ios" ? (
        // Dentro del WebView de Instagram NO hay link a la Store que funcione. Se dice
        // qué hacer en vez de ofrecer un botón que muere sin decir nada.
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            Estás dentro del navegador de la app. Para bajar Corvo, abrí esta página
            en Safari: tocá el menú <strong>⋯</strong> arriba a la derecha y elegí{" "}
            <strong>Abrir en el navegador</strong>.
          </p>
          <button
            type="button"
            onClick={copyLink}
            className="self-start rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold"
          >
            {copied ? "Link copiado" : "Copiar link"}
          </button>
        </div>
      ) : (
        <>
          <a
            href={storeUrl}
            onClick={goToStoreCopyingLink}
            className="rounded-xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold"
          >
            {environment.platform === "android"
              ? "Descargar en Google Play"
              : "Descargar en el App Store"}
          </a>
          {copiesLinkFirst ? (
            <p className="text-xs text-neutral-500">
              Al tocar, copiamos este link: cuando abras Corvo por primera vez, pegalo
              para volver acá.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
