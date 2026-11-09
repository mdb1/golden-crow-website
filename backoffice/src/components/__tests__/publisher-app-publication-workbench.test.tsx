/** @jest-environment jsdom */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PublisherAppPublicationWorkbench } from "@/components/publisher-app-publication-workbench";
import { publisherAppDefaultAdvancedConfiguration, publisherAppDefaultColors, type PublisherAppConfig, type PublisherAppConfigResponse } from "@/lib/publisher-app-config";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

jest.mock("next/navigation", () => ({ useRouter: () => ({}) }));
jest.mock("@/lib/sdk-client", () => ({ ...jest.requireActual("@/lib/sdk-client"), sdkFetch: jest.fn() }));

const config: PublisherAppConfig = {
  id: "organization_org-1", publisherKind: "organization", publisherId: "org-1",
  publisherName: "Pocket Genes Lab", publisherEmail: "publisher@example.org", publisherUsername: "pocketgenes",
  catalogEnabled: true, feedEnabled: true, status: "active_for_testing", platformOption: "ios",
  connectEnabled: false, profileEnabled: false, learnCustomizationEnabled: false,
  colors: { ...publisherAppDefaultColors("#112233"), primary: "#112233" }, iconSource: "publisher",
  iconImageUrl: "https://example.org/icon.png", iconImageUploadDataUrl: null,
  advancedConfiguration: publisherAppDefaultAdvancedConfiguration({ name: "Pocket Genes Lab", kind: "organization", id: "org-1" }),
  appProviderIdentifier: "app_org_pocket_genes_lab_48217", runtimeRevision: 1, schemaVersion: 1,
  createdAt: "2026-10-30T12:00:00.000Z", updatedAt: "2026-10-30T12:00:00.000Z",
  createdByUserId: "publisher-1", updatedByUserId: "publisher-1",
};
const signed: PublisherAppConfig = {
  ...config, status: "active_waiting_for_payment", termsVersion: "2026-10-31",
  termsAcceptedAt: "2026-11-09T12:00:00.000Z", termsAcceptedByUserId: "publisher-1", runtimeRevision: 2,
};
function renderPublication(props: Partial<React.ComponentProps<typeof PublisherAppPublicationWorkbench>> = {}) {
  return render(<AppLanguageProvider initialLanguage="es" forcedLanguage="es"><PublisherAppPublicationWorkbench config={config} {...props} /></AppLanguageProvider>);
}
function acceptTerms() { fireEvent.click(screen.getByRole("checkbox", { name: /Leí y acepto los términos y condiciones/i })); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

describe("publisher app publication signature", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(sdkFetch).mockResolvedValue({ config: signed }); });

  it("shows exclusively the former fifth-step review, prices, and PDF before signature", () => {
    renderPublication();
    expect(screen.queryByLabelText("Progreso de configuración")).toBeNull();
    expect(screen.queryByRole("button", { name: /Paso \d/ })).toBeNull();
    expect(screen.queryByLabelText("Vista previa de la app")).toBeNull();
    // Preserved commercial review and PDF assertions from the former fifth step.
    expect(screen.getByTestId("publisher-app-review")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Revisión de configuración y condiciones",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Solo iOS")).toBeTruthy();
    expect(screen.getByText("#112233")).toBeTruthy();
    const subscriptionOffer = screen.getByTestId(
      "publisher-app-subscription-offer",
    );
    expect(subscriptionOffer).toHaveClass(
      "bg-white",
      "text-black",
      "dark:bg-[#0b0c0d]",
      "dark:text-white",
    );
    expect(subscriptionOffer).toHaveTextContent(
      "Monthly subscription per platform",
    );
    expect(subscriptionOffer).toHaveTextContent("$59.99");
    expect(subscriptionOffer).toHaveTextContent("USD / month");
    expect(subscriptionOffer).toHaveTextContent("for the first");
    expect(subscriptionOffer).toHaveTextContent("six months");
    expect(subscriptionOffer).toHaveTextContent("$99.99 USD");
    const promotionalPrice = screen.getByTestId(
      "publisher-app-promotional-price",
    );
    const promotionalAmount = screen.getByTestId(
      "publisher-app-promotional-amount",
    );
    const promotionalUnit = screen.getByTestId(
      "publisher-app-promotional-unit",
    );
    const promotionalDuration = screen.getByTestId(
      "publisher-app-promotional-duration",
    );
    const standardPrice = screen.getByTestId("publisher-app-standard-price");
    expect(promotionalPrice).toHaveClass("flex-col");
    expect(promotionalAmount).toHaveClass("block", "text-5xl");
    expect(promotionalUnit).toHaveClass("block");
    expect(promotionalDuration.children).toHaveLength(3);
    expect(promotionalDuration).toHaveTextContent("for the first");
    expect(promotionalDuration).toHaveTextContent("six months");
    expect(screen.getByText("six months")).toHaveClass("text-3xl");
    expect(subscriptionOffer.textContent?.indexOf("$59.99")).toBeLessThan(
      subscriptionOffer.textContent?.indexOf("$99.99 USD") ?? -1,
    );
    expect(standardPrice.querySelector("span")).toHaveClass("line-through");
    expect(subscriptionOffer).toHaveTextContent("Managed service");
    expect(subscriptionOffer).toHaveTextContent(
      "Included while the subscription is active",
    );
    [
      "Continued licensing of PocketGenesSDK.",
      "Ongoing SDK maintenance and improvements.",
      "Integration of SDK updates into your app.",
      "New app builds and store submissions included.",
      "Security and compatibility updates.",
      "Technical support for SDK functionality.",
    ].forEach((benefit) => {
      expect(screen.getByText(benefit)).toBeTruthy();
    });
    expect(screen.getByText("Resumen comercial")).toBeTruthy();
    expect(screen.getByText("Suscripción mensual")).toBeTruthy();
    expect(
      screen.getByText(
        /USD 59,99 por mes · precio bonificado por 6 meses \(luego USD 99,99\)/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/USD 139,99 · pago único/i)).toBeTruthy();
    expect(screen.queryByText("Usuario")).toBeNull();
    expect(screen.queryByText("Estado inicial")).toBeNull();
    expect(screen.queryByText("Revisión estimada")).toBeNull();
    expect(screen.queryByText("Pending revision")).toBeNull();
    expect(screen.queryByText("24 a 48 horas")).toBeNull();
    expect(screen.queryByTestId("publisher-app-terms-document")).toBeNull();
    expect(
      screen.queryByTitle("Términos y condiciones de PocketGenesSDK"),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: /Abrir PDF/i })).toBeNull();

    const termsDisclosure = screen.getByRole("button", {
      name: "See full terms and conditions",
    });
    expect(termsDisclosure).toHaveAttribute("aria-expanded", "false");
    expect(termsDisclosure).toHaveAttribute(
      "aria-controls",
      "publisher-app-full-terms",
    );
    fireEvent.click(termsDisclosure);
    expect(sdkFetch).not.toHaveBeenCalled();

    const termsDocument = screen.getByTestId("publisher-app-terms-document");
    const termsFrame = screen.getByTitle(
      "Términos y condiciones de PocketGenesSDK",
    );
    expect(termsDocument).toContainElement(termsFrame);
    expect(termsDocument).toHaveAttribute("id", "publisher-app-full-terms");
    expect(
      screen.getByRole("button", {
        name: "Hide full terms and conditions",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(termsFrame).toHaveAttribute(
      "src",
      "/PocketGenesSDK_Terminos_y_Condiciones.pdf#page=1&view=FitH&toolbar=0&navpanes=0",
    );
    expect(termsFrame).toHaveAttribute("scrolling", "yes");
    expect(termsFrame.parentElement).toHaveClass(
      "h-[360px]",
      "overflow-hidden",
      "sm:h-[440px]",
    );
    expect(screen.getByRole("link", { name: /Abrir PDF/i })).toHaveAttribute(
      "href",
      "/PocketGenesSDK_Terminos_y_Condiciones.pdf",
    );
    expect(screen.queryByText(/El pedido de/i)).toBeNull();
    expect(screen.queryByText(/Anexo A · Rango razonable de uso/i)).toBeNull();
    const termsPdfPath = join(
      process.cwd(),
      "public",
      "PocketGenesSDK_Terminos_y_Condiciones.pdf",
    );
    expect(existsSync(termsPdfPath)).toBe(true);
    expect(readFileSync(termsPdfPath).subarray(0, 5).toString("ascii")).toBe(
      "%PDF-",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Hide full terms and conditions",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "See full terms and conditions",
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("publisher-app-terms-document")).toBeNull();
    const palette = screen.getByText("Paleta visual").closest("section")!;
    expect(within(palette).getAllByRole("term")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Aceptar condiciones y solicitar publicación" })).toBeDisabled();
  });

  it("doubles subscription and store setup prices for iOS and Android", () => {
    renderPublication({ config: { ...config, platformOption: "ios_android" } });
    expect(screen.getByText("iOS + Android")).toBeTruthy();
    expect(screen.getByText(/USD 119,98 por mes · precio bonificado por 6 meses \(luego USD 199,98\)/i)).toBeTruthy();
    expect(screen.getByText(/USD 279,98 · pago único/i)).toBeTruthy();
  });

  it.each([
    { apiPath: "/publisher-app/config", editHref: "/publisher-portal/app/edit" },
    { apiPath: "/admin/publisher-app-configs/organization_org-1", editHref: "/god-mode/apps/organization_org-1" },
  ])("signs the reviewed configuration and celebrates only the confirmed payment-waiting transition: $apiPath", async ({ apiPath, editHref }) => {
    const response = deferred<PublisherAppConfigResponse>();
    jest.mocked(sdkFetch).mockImplementation(() => response.promise);
    renderPublication({ apiPath, editHref });
    const acceptButton = screen.getByRole("button", { name: "Aceptar condiciones y solicitar publicación" });
    expect(acceptButton).toBeDisabled();
    expect(sdkFetch).not.toHaveBeenCalled();
    const termsAcceptance = screen.getByTestId("publisher-app-terms-acceptance");
    const termsCheckbox = screen.getByRole("checkbox", { name: /Leí y acepto los términos y condiciones/i });
    expect(termsAcceptance).toHaveAttribute("data-selected", "false");
    expect(termsCheckbox).toHaveClass("size-8");
    expect(screen.getByText("Requerido")).toBeTruthy();
    fireEvent.click(termsCheckbox);
    expect(termsAcceptance).toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Aceptado")).toBeTruthy();
    expect(acceptButton).toBeEnabled();
    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);
    expect(sdkFetch).toHaveBeenCalledTimes(1);
    expect(sdkFetch).toHaveBeenCalledWith(`${apiPath}/sign-terms-and-conditions`, {
      method: "POST", body: JSON.stringify({ termsAccepted: true, expectedUpdatedAt: config.updatedAt }),
    });
    expect(acceptButton).toBeDisabled();
    expect(termsCheckbox).toBeDisabled();
    expect(screen.queryByTestId("publisher-app-success-overlay")).toBeNull();
    response.resolve({ config: signed });
    const success = await screen.findByTestId("publisher-app-success-overlay");
    expect(success).toHaveClass("publisher-app-success-overlay", "fixed");
    expect(screen.getByTestId("publisher-app-success-circle")).toHaveClass("publisher-app-success-circle", "bg-[#16a34a]");
    expect(success).toHaveTextContent("Publicación solicitada");
    expect(success).toHaveTextContent("coordinar el pago");
    expect(success).toHaveTextContent("subir la app a las tiendas");
    expect(success).not.toHaveTextContent("La app está activa para pruebas");
    expect(screen.getByRole("link", { name: /Ver y editar mi app/i })).toHaveAttribute("href", editHref);
    fireEvent.animationEnd(screen.getByTestId("publisher-app-success-circle"));
    expect(sdkFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "still testing", response: { ...signed, status: "active_for_testing" as const } },
    { label: "missing signature", response: { ...signed, termsAcceptedAt: undefined } },
    { label: "wrong organization", response: { ...signed, id: "organization_other" } },
  ])("does not celebrate an invalid response: $label", async ({ response }) => {
    jest.mocked(sdkFetch).mockResolvedValue({ config: response });
    renderPublication(); acceptTerms();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar condiciones y solicitar publicación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El servidor no confirmó la firma");
    expect(screen.queryByTestId("publisher-app-success-overlay")).toBeNull();
  });

  it("preserves the review and accepts a retry after a failed request", async () => {
    jest.mocked(sdkFetch).mockRejectedValueOnce(new SdkRequestError({ status: 503, method: "POST", path: "/publisher-app/config/sign-terms-and-conditions", message: "Servicio no disponible", details: "Publication request log" })).mockResolvedValueOnce({ config: signed });
    renderPublication(); acceptTerms();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar condiciones y solicitar publicación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Servicio no disponible");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar log" }));
    expect(screen.getByText("Publication request log")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByTestId("publisher-app-success-overlay")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar condiciones y solicitar publicación" }));
    await screen.findByTestId("publisher-app-success-overlay");
    expect(sdkFetch).toHaveBeenCalledTimes(2);
  });

  it.each(["pending_revision", "active_waiting_for_payment", "active_waiting_for_upload", "active", "approved", "changes_requested", "rejected"] as const)("does not permit signing from %s", status => {
    renderPublication({ config: { ...config, status } });
    expect(screen.queryByTestId("publisher-app-review")).toBeNull();
    expect(screen.getByRole("button", { name: "Aceptar condiciones y solicitar publicación" })).toBeDisabled();
    expect(sdkFetch).not.toHaveBeenCalled();
  });
});
