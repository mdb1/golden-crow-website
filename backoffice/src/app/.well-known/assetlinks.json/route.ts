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
 * ⚠️ Hoy la lista está VACÍA y eso es deliberado (H-4 del ticket): un fingerprint
 * inventado verificaría igual de mal que ninguno, pero además mentiría sobre estar
 * hecho. Con la lista vacía el archivo es válido, Android no verifica el dominio, y
 * el esquema `gcfitness://` + la landing web siguen funcionando. Completar
 * `ANDROID_APP_SIGNING_SHA256` es un solo commit de datos.
 */
import { NextResponse } from "next/server";

import { APP_BUNDLE_ID } from "@/lib/gc-fitness/social-share-link";

export const dynamic = "force-static";

/**
 * SHA-256 de la clave con la que firma Google Play, en mayúsculas y separado por
 * dos puntos (`AB:CD:…`). Vacío hasta que un humano lo saque de Play Console.
 */
const ANDROID_APP_SIGNING_SHA256: string[] = [];

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
