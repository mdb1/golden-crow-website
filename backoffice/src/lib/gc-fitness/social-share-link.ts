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

export const APP_STORE_URL = "https://apps.apple.com/us/app/gc-fitness/id6771836254";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.goldencrow.fitness";
