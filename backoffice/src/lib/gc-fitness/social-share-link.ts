/**
 * El link compartible de una rutina — el ÚNICO lugar donde vive el dominio en web
 * (#1037 / S6, issue gc-fitness#1046).
 *
 * TWIN — hermanos que tienen que coincidir palabra por palabra:
 *  - `gc-fitness/iOS/Packages/GCFitnessCore/Sources/GCFitnessCore/Schema/SocialShareLink.swift`
 *  - `gc-fitness/android/core/src/main/kotlin/com/goldencrow/fitness/core/schema/SocialShareLink.kt`
 *
 * El mismo host aparece en cuatro lugares que fallan de formas distintas si se
 * desincronizan: el link que produce el botón Compartir de las apps, el `applinks:`
 * del entitlements de iOS, el `android:host` del intent-filter, y los dos archivos
 * de `/.well-known/` que sirve ESTE repo. Un dominio cambiado en tres de los cuatro
 * no rompe nada visible: el link se manda igual, se ve igual en el chat, y
 * simplemente abre el navegador en vez de la app — que es exactamente lo que hace
 * un link cuando la app no está instalada.
 */

/**
 * El dominio canónico.
 *
 * Subdominio y no el apex a propósito: `goldencrowvs.com` lo sirve GitHub Pages (el
 * sitio de marketing), y esta landing es SSR en el proyecto de Vercel. Apuntar el
 * apex a Vercel movería el sitio entero.
 */
export const SOCIAL_LINK_HOST = "fit.goldencrowvs.com";

/** El host de deploy. Responde los mismos paths y el mismo `/.well-known/`. */
export const SOCIAL_LINK_DEPLOY_HOST = "golden-crow-backoffice.vercel.app";

/** El bundle/package de la app, en los dos archivos de `/.well-known/`. */
export const APP_BUNDLE_ID = "com.goldencrow.fitness";

/** El Team ID de Apple — la primera mitad del `appID` del AASA. */
export const APPLE_TEAM_ID = "F2VBZV9LC6";

export function routineShareUrl(templateId: string): string | null {
  if (!templateId) return null;
  return `https://${SOCIAL_LINK_HOST}/f/r/${encodeURIComponent(templateId)}`;
}

export function profileShareUrl(uid: string): string | null {
  if (!uid) return null;
  return `https://${SOCIAL_LINK_HOST}/f/u/${encodeURIComponent(uid)}`;
}

/** `gcfitness://routine/{id}` — el esquema propio, para el botón "Abrir en la app". */
export function routineAppSchemeUrl(templateId: string): string | null {
  if (!templateId) return null;
  return `gcfitness://routine/${encodeURIComponent(templateId)}`;
}

/**
 * `gcfitness://profile/{uid}` — el "Abrir en la app" de la landing de perfil
 * (#1184 / SV2-4). Las dos apps rutean la cabeza `profile` a la pantalla del perfil
 * social desde S6 (`DeepLinkRouting.swift` / `DeepLinkRouting.kt`).
 */
export function profileAppSchemeUrl(uid: string): string | null {
  if (!uid) return null;
  return `gcfitness://profile/${encodeURIComponent(uid)}`;
}

export const APP_STORE_URL = "https://apps.apple.com/us/app/gc-fitness/id6771836254";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.goldencrow.fitness";

/**
 * `https://fit.goldencrowvs.com/f/c/{code}` — el link de invitación de un coach
 * (gc-fitness#1631). Lo produce la app del coach (`coachGetInviteLink`) y lo rutean
 * las dos apps a `coachInvite(code)`; sin la app, cae en `/f/c/[code]`.
 */
export function coachInviteUrl(code: string): string | null {
  if (!code) return null;
  return `https://${SOCIAL_LINK_HOST}/f/c/${encodeURIComponent(code)}`;
}

/** `gcfitness://invite/{code}` — el "Abrir en Corvo" de la landing de invitación. */
export function coachInviteAppSchemeUrl(code: string): string | null {
  if (!code) return null;
  return `gcfitness://invite/${encodeURIComponent(code)}`;
}

/**
 * La URL de Play que RECUERDA de qué link vino la persona (gc-fitness#1643).
 *
 * El link se pierde al pasar por la tienda: la app recién instalada no sabe quién la
 * invitó. Play sí guarda el parámetro `referrer` y se lo entrega a la app en su
 * primer arranque (Play Install Referrer API). El formato es el contrato con
 * `DeferredInviteLink.fromInstallReferrer` de Android: el valor de `referrer` es
 * `gcf_link=<webUrl codificado>`, y el todo va codificado otra vez como valor de
 * query — Play decodifica una capa, la app la otra.
 *
 * Sin `webUrl` devuelve la URL de Play pelada.
 */
export function playStoreUrlWithReferrer(webUrl: string | null | undefined): string {
  if (!webUrl) return PLAY_STORE_URL;
  const referrer = `gcf_link=${encodeURIComponent(webUrl)}`;
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
}
