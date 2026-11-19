/** @jest-environment jsdom */

/**
 * gc-fitness#1643 — el botón de la tienda de las landings `/f/*` RECUERDA el link.
 *
 * Android: `referrer=gcf_link=…` en la URL de Play. iOS (fuera de un web view): el link
 * se copia al portapapeles antes de ir al App Store. Adentro del web view de Instagram en
 * iOS sigue el aviso de #782, sin botón de tienda.
 *
 * ⚠️ Esto NO prueba que Play entregue el referrer ni que el App Store deje el
 * portapapeles intacto: eso se confirma a mano en un teléfono real.
 */

import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/gc-fitness/social-share-link";

import { SharedLinkActions, storeLink, storeNavigation } from "../shared-link-actions";

const WEB = "https://fit.goldencrowvs.com/f/c/abc234xyz9";

describe("storeLink", () => {
  it("Android lleva el link en el referrer de Play, también en un web view", () => {
    for (const inAppBrowser of [false, true]) {
      const { href, copiesLinkFirst } = storeLink({ platform: "android", inAppBrowser }, WEB);
      expect(href.startsWith(`${PLAY_STORE_URL}&referrer=`)).toBe(true);
      expect(new URL(href).searchParams.get("referrer")).toBe(`gcf_link=${encodeURIComponent(WEB)}`);
      expect(copiesLinkFirst).toBe(false);
    }
  });

  it("iOS en Safari copia el link antes de ir al App Store", () => {
    expect(storeLink({ platform: "ios", inAppBrowser: false }, WEB)).toEqual({
      href: APP_STORE_URL,
      copiesLinkFirst: true,
    });
  });

  it("sin link, o en escritorio, no copia nada", () => {
    expect(storeLink({ platform: "ios", inAppBrowser: false }, null).copiesLinkFirst).toBe(false);
    expect(storeLink({ platform: "other", inAppBrowser: false }, WEB)).toEqual({
      href: APP_STORE_URL,
      copiesLinkFirst: false,
    });
    expect(storeLink({ platform: "android", inAppBrowser: false }, null).href).toBe(PLAY_STORE_URL);
  });
});

function setUserAgent(ua: string, maxTouchPoints = 5) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
}

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM = `${IPHONE_SAFARI} Instagram 300.0`;
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("SharedLinkActions", () => {
  const writeText = jest.fn(() => Promise.resolve());
  let assign: jest.SpyInstance;

  beforeEach(() => {
    writeText.mockClear();
    assign = jest.spyOn(storeNavigation, "go").mockImplementation(() => undefined);
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  afterEach(() => assign.mockRestore());

  it("iOS: tocar la tienda copia el link y recién después navega", async () => {
    setUserAgent(IPHONE_SAFARI);
    render(<SharedLinkActions appUrl="gcfitness://invite/abc234xyz9" webUrl={WEB} />);
    const store = await screen.findByText("Descargar en el App Store");
    expect(screen.getByText(/copiamos este link/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(store);
    });
    expect(writeText).toHaveBeenCalledWith(WEB);
    expect(assign).toHaveBeenCalledWith(APP_STORE_URL);
  });

  it("iOS adentro de Instagram: sigue el aviso, sin botón de tienda", async () => {
    setUserAgent(IPHONE_INSTAGRAM);
    render(<SharedLinkActions appUrl={null} webUrl={WEB} />);
    expect(await screen.findByText(/Abrir en el navegador/)).toBeInTheDocument();
    expect(screen.queryByText("Descargar en el App Store")).toBeNull();
  });

  it("Android: el botón apunta a Play con el referrer y no copia", async () => {
    setUserAgent(ANDROID_CHROME, 0);
    render(<SharedLinkActions appUrl={null} webUrl={WEB} />);
    const store = await screen.findByText("Descargar en Google Play");
    expect(store.closest("a")?.getAttribute("href")).toContain("&referrer=gcf_link%3D");
    expect(screen.queryByText(/copiamos este link/)).toBeNull();
    fireEvent.click(store);
    expect(writeText).not.toHaveBeenCalled();
  });
});
