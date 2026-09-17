/**
 * `/.well-known/apple-app-site-association` — el archivo sin el cual los Universal
 * Links de iOS no existen (#1037 / S6, gc-fitness#1046).
 *
 * ## Por qué es un Route Handler y no un archivo en `public/`
 *
 * Apple exige que se sirva **sin extensión** y con `Content-Type: application/json`.
 * Un archivo en `public/` llamado `apple-app-site-association` (sin extensión) sale
 * como `application/octet-stream` en varios hosts, y el CDN de Apple lo descarta EN
 * SILENCIO: el link sigue abriendo Safari, que es lo mismo que hace cuando la app no
 * está instalada. Un handler fija el header y el problema no existe.
 *
 * ## El `appID` es `<TeamID>.<bundle>` y no se puede adivinar
 *
 * `F2VBZV9LC6` sale del `Appfile` de fastlane del repo de la app; el bundle es el que
 * ya está en Firebase. Si alguno de los dos está mal, Apple descarga el archivo, no
 * encuentra la app y no pasa nada — otra vez, sin ningún error visible.
 *
 * ## `/f/*` y nada más
 *
 * Los `paths` acotan qué URLs se queda la app. Sin el prefijo, cualquier página que
 * el sitio agregue mañana abriría la app. `components` es la forma moderna del mismo
 * acuerdo; se mandan las dos porque iOS < 13 sólo entiende `paths`.
 *
 * ⚠️ Esto NO alcanza solo: hace falta Associated Domains habilitado en el App ID del
 * portal (H-3) y `applinks:` en el entitlements. Las tres piezas fallan igual —
 * abriendo el navegador — así que ninguna se puede verificar por su cuenta.
 */
import { NextResponse } from "next/server";

import { APPLE_TEAM_ID, APP_BUNDLE_ID } from "@/lib/gc-fitness/social-share-link";

export const dynamic = "force-static";

export function GET() {
  const appID = `${APPLE_TEAM_ID}.${APP_BUNDLE_ID}`;
  const body = {
    applinks: {
      details: [
        {
          appIDs: [appID],
          components: [{ "/": "/f/*", comment: "Rutinas y perfiles compartidos" }],
        },
        // iOS 12 y anteriores leen esta forma. Cuesta cuatro líneas y evita que un
        // teléfono viejo abra Safari sin que nadie entienda por qué.
        { appID, paths: ["/f/*"] },
      ],
    },
  };

  return new NextResponse(JSON.stringify(body), {
    headers: {
      // Sin esto Apple descarta el archivo en silencio.
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
