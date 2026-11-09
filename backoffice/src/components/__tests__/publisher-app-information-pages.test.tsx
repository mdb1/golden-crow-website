/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import PublisherAppPaymentDetailsPage from "@/app/publisher-portal/(portal)/app/payment-details/page";
import PublisherAppUploadBuildDetailsPage from "@/app/publisher-portal/(portal)/app/upload-build-details/page";
import { PUBLISHER_APP_STATUSES, publisherAppStatusLabel, type PublisherAppConfig } from "@/lib/publisher-app-config";
import { loadPublisherAppPageData } from "@/lib/publisher-app-config-server";
import { PUBLISHER_PORTAL_APP_EDIT_ROUTE, PUBLISHER_PORTAL_APP_NEW_ROUTE, PUBLISHER_PORTAL_HOME_ROUTE } from "@/lib/publisher-portal-routes";

jest.mock("@/lib/publisher-app-config-server", () => ({ loadPublisherAppPageData: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }) }));

const config: PublisherAppConfig = {
  id: "organization_org-1", publisherKind: "organization", publisherId: "org-1",
  publisherName: "Pocket Genes Lab", publisherEmail: "publisher@example.org", publisherUsername: "pocketgenes",
  catalogEnabled: true, feedEnabled: true, status: "active_waiting_for_payment", platformOption: "ios",
  connectEnabled: true, profileEnabled: true, learnCustomizationEnabled: true,
  colors: { primary: "#123ABC", secondary: "#456DEF", tertiary: "#FEDCBA", counterpointClockwise: "#7D12E2", counterpointAnticlockwise: "#12DFE2", counterpointFarClockwise: "#E212DF", counterpointFarAnticlockwise: "#12E27D" },
  iconSource: "publisher", iconImageUrl: null, iconImageUploadDataUrl: null, schemaVersion: 1,
  createdAt: "2026-10-30T12:00:00.000Z", updatedAt: "2026-10-30T12:00:00.000Z", createdByUserId: "publisher-1", updatedByUserId: "publisher-1",
};

function mockConfig(nextConfig: PublisherAppConfig | null) {
  jest.mocked(loadPublisherAppPageData).mockResolvedValue({
    config: nextConfig, publisherName: config.publisherName, publisherEmail: config.publisherEmail, publisherUsername: config.publisherUsername,
  });
}

describe("publisher app information pages", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["ios", "USD 139,99", "USD 59,99", "USD 99,99", "iOS · 1 plataforma"],
    ["ios_android", "USD 279,98", "USD 119,98", "USD 199,98", "iOS + Android · 2 plataformas"],
  ] as const)("shows saved %s pricing, including setup and both subscription periods, without collecting payment", async (platformOption, setup, promotional, standard, platforms) => {
    mockConfig({ ...config, platformOption });
    const { container } = render(<AppLanguageProvider forcedLanguage="es">{await PublisherAppPaymentDetailsPage()}</AppLanguageProvider>);
    expect(screen.getByRole("heading", { name: "Completar información de pago" })).toBeInTheDocument();
    expect(screen.getByText(setup)).toBeInTheDocument();
    expect(screen.getAllByText(promotional, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`Desde el mes 7: ${standard.replaceAll(".", "\\.")}`))).toBeInTheDocument();
    expect(screen.getByText("Durante los primeros 6 meses")).toBeInTheDocument();
    expect(screen.getByText("Pago único")).toBeInTheDocument();
    expect(screen.getByText(platforms)).toBeInTheDocument();
    expect(screen.getByText(publisherAppStatusLabel(config.status))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contactar a soporte" })).toHaveAttribute("href", expect.stringContaining("mailto:support@goldencrowvs.com?subject="));
    expect(screen.getByText(/te indicaremos cómo realizar el pago/i)).toBeInTheDocument();
    expect(container.querySelector("form, input, select, textarea")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cambiar estado" })).toBeNull();
    const back = screen.getByRole("link", { name: "Volver al inicio" });
    expect(back).toHaveAttribute("href", PUBLISHER_PORTAL_HOME_ROUTE);
    expect(back.querySelector("svg")).not.toBeNull();
  });

  it.each(["ios", "ios_android"] as const)("shows broad Apple/D-U-N-S guidance, a qualified timeline and support contact for %s", async platformOption => {
    mockConfig({ ...config, platformOption, status: "active_waiting_for_upload" });
    const { container } = render(<AppLanguageProvider forcedLanguage="es">{await PublisherAppUploadBuildDetailsPage()}</AppLanguageProvider>);
    expect(screen.getByRole("heading", { name: "Consultar estado de publicación" })).toBeInTheDocument();
    expect(screen.getByText("Activa · Pendiente de subida")).toBeInTheDocument();
    expect(screen.getByText(/pueden llevar hasta 3 semanas/i)).toHaveTextContent(/los tiempos.*pueden variar y extenderse/i);
    expect(screen.getByText(/persona individual no requiere D-U-N-S/i)).toBeInTheDocument();
    expect(screen.getByRole("list").children).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Consultar la guía oficial de Apple/i })).toHaveAttribute("href", "https://developer.apple.com/help/account/membership/D-U-N-S/");
    expect(screen.getByRole("link", { name: "Contactar a soporte" })).toHaveAttribute("href", expect.stringContaining("mailto:support@goldencrowvs.com?subject="));
    expect(container.querySelector("form, input, select, textarea")).toBeNull();
    if (platformOption === "ios_android") expect(screen.getByText(/Google Play se coordina por separado/i)).toBeInTheDocument();
    else expect(screen.queryByText(/Google Play se coordina por separado/i)).toBeNull();
  });

  it("keeps helper header context hidden until the information control is opened", async () => {
    mockConfig(config);
    render(<AppLanguageProvider forcedLanguage="es">{await PublisherAppPaymentDetailsPage()}</AppLanguageProvider>);
    expect(screen.queryByRole("heading", { name: "Información de pago" })).toBeNull();
    const info = screen.getByRole("button", { name: "Mostrar contexto de encabezado" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(info);
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Información de pago" })).toBeInTheDocument();
  });

  it.each([
    ["payment", PublisherAppPaymentDetailsPage], ["upload", PublisherAppUploadBuildDetailsPage],
  ] as const)("sends %s information visitors without an app into creation", async (_name, page) => {
    mockConfig(null);
    await expect(page()).rejects.toThrow(`NEXT_REDIRECT:${PUBLISHER_PORTAL_APP_NEW_ROUTE}`);
  });

  it.each(PUBLISHER_APP_STATUSES.filter(status => status !== "active_waiting_for_payment"))("redirects %s away from payment details", async status => {
    mockConfig({ ...config, status });
    await expect(PublisherAppPaymentDetailsPage()).rejects.toThrow(`NEXT_REDIRECT:${PUBLISHER_PORTAL_APP_EDIT_ROUTE}`);
  });

  it.each(PUBLISHER_APP_STATUSES.filter(status => status !== "active_waiting_for_upload"))("redirects %s away from upload details", async status => {
    mockConfig({ ...config, status });
    await expect(PublisherAppUploadBuildDetailsPage()).rejects.toThrow(`NEXT_REDIRECT:${PUBLISHER_PORTAL_APP_EDIT_ROUTE}`);
  });
});
