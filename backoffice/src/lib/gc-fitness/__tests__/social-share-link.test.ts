/**
 * #1037 / S6 — el link compartible y los dos archivos de `/.well-known/`.
 *
 * ## Qué defiende de verdad este archivo
 *
 * Las cuatro piezas del deep link (el link que produce la app, el `applinks:` del
 * entitlements, el `android:host` del intent-filter y estos dos archivos) fallan
 * TODAS de la misma forma: el link abre el navegador. Que es exactamente lo que hace
 * un link cuando la app no está instalada. O sea que una desincronización no se
 * distingue de funcionar bien sin un teléfono con la app puesta.
 *
 * Estos tests fijan los valores CONTRA LOS DE LAS APPS, escritos a mano acá. Si
 * alguien cambia el host, el bundle o el team id de un solo lado, esto se pone rojo
 * en CI y no en el WhatsApp de otra persona.
 */
import { GET as appleAppSiteAssociation } from "@/app/.well-known/apple-app-site-association/route";
import { GET as assetLinks } from "@/app/.well-known/assetlinks.json/route";
import {
  APPLE_TEAM_ID,
  APP_BUNDLE_ID,
  SOCIAL_LINK_HOST,
  profileShareUrl,
  routineAppSchemeUrl,
  routineShareUrl,
} from "@/lib/gc-fitness/social-share-link";

describe("social share link", () => {
  it("produce exactamente el mismo string que los twins de iOS y Android", () => {
    // Copiado a mano de `SocialShareLinkTests.swift` / `SocialShareLinkTest.kt`.
    expect(routineShareUrl("tpl-123")).toBe("https://fit.goldencrowvs.com/f/r/tpl-123");
    expect(profileShareUrl("uid-9")).toBe("https://fit.goldencrowvs.com/f/u/uid-9");
    expect(routineAppSchemeUrl("tpl-123")).toBe("gcfitness://routine/tpl-123");
  });

  it("un id vacío no produce link", () => {
    // Devolver `https://…/f/r/` sería un link que se puede mandar y que no abre nada.
    expect(routineShareUrl("")).toBeNull();
    expect(profileShareUrl("")).toBeNull();
    expect(routineAppSchemeUrl("")).toBeNull();
  });

  it("un id con barra se escapa, no se pega crudo", () => {
    // Un `/` crudo partiría el path en un segmento más y el router de las apps leería
    // otra ruta.
    expect(routineShareUrl("a/b")).toBe("https://fit.goldencrowvs.com/f/r/a%2Fb");
  });
});

describe("/.well-known/apple-app-site-association", () => {
  it("se sirve como application/json — sin eso Apple lo descarta en silencio", async () => {
    const response = appleAppSiteAssociation();
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("declara el appID <TeamID>.<bundle> y acota los paths a /f/*", async () => {
    const body = await appleAppSiteAssociation().json();
    const details = body.applinks.details;
    const appID = `${APPLE_TEAM_ID}.${APP_BUNDLE_ID}`;

    expect(details[0].appIDs).toEqual([appID]);
    expect(details[0].components).toEqual([
      { "/": "/f/*", comment: expect.any(String) },
    ]);
    // La forma vieja, para iOS 12 y anteriores.
    expect(details[1]).toEqual({ appID, paths: ["/f/*"] });
  });

  it("el team id y el bundle son los de la app, no unos cualquiera", () => {
    // `F2VBZV9LC6` sale del Appfile de fastlane; el bundle está en Firebase. Con
    // cualquiera de los dos mal, Apple baja el archivo, no encuentra la app, y no
    // pasa nada — sin ningún error visible.
    expect(APPLE_TEAM_ID).toBe("F2VBZV9LC6");
    expect(APP_BUNDLE_ID).toBe("com.goldencrow.fitness");
    expect(SOCIAL_LINK_HOST).toBe("fit.goldencrowvs.com");
  });
});

describe("/.well-known/assetlinks.json", () => {
  it("es un JSON válido con el package de la app", async () => {
    const response = assetLinks();
    expect(response.headers.get("content-type")).toBe("application/json");

    const body = await response.json();
    expect(body[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(body[0].target.package_name).toBe(APP_BUNDLE_ID);
  });

  it("la lista de fingerprints está vacía A PROPÓSITO hasta que llegue el de Play", async () => {
    // Uno inventado verificaría igual de mal que ninguno, pero además mentiría sobre
    // estar hecho. Con la lista vacía el archivo es válido, Android simplemente no
    // verifica el dominio, y el esquema `gcfitness://` + esta landing siguen andando.
    //
    // Cuando llegue el SHA-256 de Play App Signing (H-4), este test cambia a
    // `toHaveLength(1)` — y ese cambio es la señal de que la verificación ya se
    // puede probar en un teléfono.
    const body = await assetLinks().json();
    expect(body[0].target.sha256_cert_fingerprints).toEqual([]);
  });
});
