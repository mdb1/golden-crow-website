/**
 * `/.well-known/assetlinks.json` — la mitad del servidor de los App Links de Android
 * (#1037 / S6, gc-fitness#1046).
 *
 * Android descarga este archivo al instalar la app y compara el SHA-256 del
 * certificado con el de la app instalada. Si coincide, `https://<host>/f/…` abre la
 * app sin preguntar. Si no, el link abre el navegador — que es exactamente lo que
 * hace cuando la app no está instalada, así que **la falla no se distingue de
 * funcionar bien** sin probarla en un teléfono con la app puesta.
 *
 * ## El fingerprint es el de PLAY, no el de la clave de subida
 *
 * La app se publica con Play App Signing: Google re-firma el AAB con SU clave, así
 * que el certificado que ve un teléfono NO es el del keystore local. El SHA-256 que
 * va acá se saca de Play Console ▸ Configuración ▸ Integridad de la app ▸ clave de
 * firma de la app. Poner el de subida es el error clásico y produce exactamente el
 * mismo silencio.
 *
 * Se sacó el 2026-09-27 por la API de Play (`generatedapks.list`, campo
 * `certificateSha256Hash`) sobre el versionCode 54, y se confirmó que NO coincide
 * con el del keystore de subida (`D3:E2:AF:…`). Si algún día se rota la clave de
 * firma de la app en Play Console, este valor cambia con ella.
 */
import { NextResponse } from "next/server";

import { APP_BUNDLE_ID } from "@/lib/gc-fitness/social-share-link";

export const dynamic = "force-static";

/**
 * SHA-256 de la clave con la que firma Google Play (Play App Signing), en
 * mayúsculas y separado por dos puntos.
 */
const ANDROID_APP_SIGNING_SHA256: string[] = [
  "E8:97:39:77:75:74:FE:8A:63:96:14:3A:27:CF:8A:D9:41:DD:FE:B7:A3:9C:E8:95:22:63:BA:7C:AB:F4:6C:CD",
];

export function GET() {
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_BUNDLE_ID,
        sha256_cert_fingerprints: ANDROID_APP_SIGNING_SHA256,
      },
    },
  ];

  return new NextResponse(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
