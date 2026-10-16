/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientConsentUploadWizard } from "@/components/patient-consent-upload-wizard";
import { applySignaturesToConsentPdf } from "@/lib/consent-pdf";
import { processSignatureImageDataUrl } from "@/lib/signature-image";
import { sdkFetch } from "@/lib/sdk-client";

const mockRouterPush = jest.fn();
const mockRouterRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

jest.mock("@/lib/signature-image", () => ({
  ...jest.requireActual("@/lib/signature-image"),
  processSignatureImageDataUrl: jest.fn(),
}));

jest.mock("@/lib/consent-pdf", () => ({
  ...jest.requireActual("@/lib/consent-pdf"),
  applySignaturesToConsentPdf: jest.fn(),
}));

const TRANSPARENT_SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC";

function expectActiveSidebarStep(name: string) {
  const sidebar = screen.getByTestId("consent-wizard-sidebar");
  const label = within(sidebar).getByText(name);
  expect(label.closest("li")).toHaveAttribute("aria-current", "step");
}

function expectSidebarSteps(stepIds: string[]) {
  const sidebar = screen.getByTestId("consent-wizard-sidebar");
  expect(
    [...sidebar.querySelectorAll("li")].map((step) =>
      step.getAttribute("data-step-id"),
    ),
  ).toEqual(stepIds);
}

async function chooseGuidedFlow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Firmar en línea" }));
}

async function chooseDirectFlow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Cargar archivo firmado" }),
  );
}

describe("PatientConsentUploadWizard", () => {
  beforeEach(() => {
    jest.mocked(sdkFetch).mockReset();
    jest.mocked(processSignatureImageDataUrl).mockReset();
    jest.mocked(applySignaturesToConsentPdf).mockReset();
    mockRouterPush.mockReset();
    mockRouterRefresh.mockReset();
  });

  it("starts with the method as the only step, then opens the guided signing flow", async () => {
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    expect(
      screen.getByRole("heading", { name: "Subir consentimiento" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("consent-wizard-sidebar")).toBeVisible();
    expectActiveSidebarStep("Elegir cómo continuar");
    expectSidebarSteps(["method"]);
    expect(screen.getByText("Paso 1 · Elegir recorrido")).toBeVisible();
    expect(screen.queryByText("Paso 1 de 1")).not.toBeInTheDocument();
    const initialSidebar = screen.getByTestId("consent-wizard-sidebar");
    expect(
      within(initialSidebar).queryByText("Descargar consentimiento"),
    ).toBeNull();
    expect(
      within(initialSidebar).queryByText("Datos de quienes firman"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Firmar en línea" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cargar archivo firmado" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", {
        name: "Descargar consentimiento-informado-2pq.pdf",
      }),
    ).not.toBeInTheDocument();

    await chooseGuidedFlow(user);

    expect(
      screen.queryByRole("button", { name: "Firmar en línea" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cargar archivo firmado" }),
    ).not.toBeInTheDocument();
    expectActiveSidebarStep("Descargar consentimiento");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Descargar consentimiento" }),
      ).toHaveFocus(),
    );
    expect(screen.getByText("Paso 2 de 6")).toBeVisible();
    expectSidebarSteps([
      "method",
      "download",
      "data",
      "signature",
      "editor",
      "preview",
    ]);
    const sidebar = screen.getByTestId("consent-wizard-sidebar");
    expect(
      within(sidebar).getByText("Datos de quienes firman"),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByText("Dibujar o importar firmas"),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByText("Aplicar firmas al PDF"),
    ).toBeInTheDocument();
    expect(within(sidebar).getByText("Revisar y subir")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Descargar consentimiento-informado-2pq.pdf",
      }),
    ).toHaveAttribute(
      "href",
      "/patient-portal/documents/consentimiento-informado-2pq.pdf",
    );
  });

  it("only offers drag placement on the last PDF page", async () => {
    const context = {
      beginPath: jest.fn(),
      clearRect: jest.fn(),
      drawImage: jest.fn(),
      lineTo: jest.fn(),
      moveTo: jest.fn(),
      stroke: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const getContext = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    const toDataUrl = jest
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      );
    const setPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "setPointerCapture",
    );
    const imageSetPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "setPointerCapture",
    );
    const imageReleasePointerCaptureDescriptor =
      Object.getOwnPropertyDescriptor(
        HTMLImageElement.prototype,
        "releasePointerCapture",
      );
    const pointerEventDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "PointerEvent",
    );
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLImageElement.prototype, "setPointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLImageElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });

    try {
      const user = userEvent.setup();
      render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

      await chooseGuidedFlow(user);
      await user.click(
        screen.getByRole("button", { name: "Continuar con los datos" }),
      );
      await user.type(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
        "31.234.567",
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );

      const canvas = screen.getByLabelText(
        "Área para dibujar la firma del paciente",
      );
      fireEvent.pointerDown(canvas, {
        pointerId: 1,
        clientX: 10,
        clientY: 10,
      });
      const saveSignature = screen.getByRole("button", {
        name: "Guardar firma del paciente",
      });
      expect(saveSignature).toBeEnabled();
      await user.click(saveSignature);
      await user.click(
        screen.getByRole("button", { name: "Continuar al editor" }),
      );

      expect(
        screen.getByRole("heading", { name: "Aplicar firmas al PDF" }),
      ).toBeVisible();
      expect(
        screen.getByText(/arrástrela directamente hasta su ubicación/),
      ).toBeVisible();
      expect(
        screen.getByText(
          (_, element) =>
            element?.tagName === "P" &&
            element.textContent === "Última página · Página 2 de 2",
        ),
      ).toBeVisible();
      expect(
        screen.getByAltText("Página 2 del consentimiento informado"),
      ).toBeVisible();
      expect(
        screen.queryByAltText("Página 1 del consentimiento informado"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Página 1" }),
      ).not.toBeInTheDocument();
      expect(screen.queryAllByRole("slider")).toHaveLength(0);
      expect(screen.queryByLabelText("Posición horizontal")).toBeNull();
      expect(screen.queryByLabelText("Posición vertical")).toBeNull();
      expect(screen.queryByLabelText("Tamaño")).toBeNull();
      expect(screen.getByAltText("Firma del paciente")).toHaveClass(
        "cursor-grab",
        "touch-none",
      );
      const signature = screen.getByAltText("Firma del paciente");
      const previewPage = signature.parentElement?.parentElement;
      expect(previewPage).toBeInstanceOf(HTMLElement);
      jest
        .spyOn(previewPage as HTMLElement, "getBoundingClientRect")
        .mockReturnValue({
          bottom: 1050,
          height: 1000,
          left: 100,
          right: 1100,
          top: 50,
          width: 1000,
          x: 100,
          y: 50,
          toJSON: () => ({}),
        });
      fireEvent.pointerDown(signature, {
        pointerId: 2,
        clientX: 820,
        clientY: 495,
      });
      fireEvent.pointerMove(signature, {
        pointerId: 2,
        clientX: 500,
        clientY: 350,
      });
      fireEvent.pointerUp(signature, { pointerId: 2 });
      expect(signature).toHaveStyle({ left: "40%", top: "30%" });
    } finally {
      getContext.mockRestore();
      toDataUrl.mockRestore();
      if (setPointerCaptureDescriptor) {
        Object.defineProperty(
          HTMLCanvasElement.prototype,
          "setPointerCapture",
          setPointerCaptureDescriptor,
        );
      } else {
        Reflect.deleteProperty(
          HTMLCanvasElement.prototype,
          "setPointerCapture",
        );
      }
      if (imageSetPointerCaptureDescriptor) {
        Object.defineProperty(
          HTMLImageElement.prototype,
          "setPointerCapture",
          imageSetPointerCaptureDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLImageElement.prototype, "setPointerCapture");
      }
      if (imageReleasePointerCaptureDescriptor) {
        Object.defineProperty(
          HTMLImageElement.prototype,
          "releasePointerCapture",
          imageReleasePointerCaptureDescriptor,
        );
      } else {
        Reflect.deleteProperty(
          HTMLImageElement.prototype,
          "releasePointerCapture",
        );
      }
      if (pointerEventDescriptor) {
        Object.defineProperty(window, "PointerEvent", pointerEventDescriptor);
      } else {
        Reflect.deleteProperty(window, "PointerEvent");
      }
    }
  });

  it("imports a signature image, adjusts it, and uses the transparent asset", async () => {
    jest.mocked(processSignatureImageDataUrl).mockResolvedValue({
      dataUrl: TRANSPARENT_SIGNATURE_DATA_URL,
      width: 720,
      height: 240,
      sourceWidth: 600,
      sourceHeight: 200,
      rasterWidth: 600,
      rasterHeight: 200,
      sourceBounds: {
        left: 20,
        top: 30,
        right: 579,
        bottom: 169,
        width: 560,
        height: 140,
      },
      inkPixelCount: 320,
    });
    const getContext = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);

    try {
      const user = userEvent.setup();
      render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

      await chooseGuidedFlow(user);
      await user.click(
        screen.getByRole("button", { name: "Continuar con los datos" }),
      );
      await user.type(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
        "31.234.567",
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );
      await user.click(
        screen.getByRole("button", {
          name: "Importar imagen de firma del paciente",
        }),
      );

      expect(
        screen.getByRole("dialog", { name: "Importar firma del paciente" }),
      ).toBeVisible();
      const file = new File(["signature"], "firma.webp", {
        type: "image/webp",
      });
      await user.upload(screen.getByLabelText("Imagen de la firma"), file);

      await waitFor(() =>
        expect(processSignatureImageDataUrl).toHaveBeenCalledWith(
          expect.stringMatching(/^data:image\/webp;base64,/),
          { contrast: 1.8, threshold: 190 },
        ),
      );
      expect(
        await screen.findByAltText(
          "Vista previa de la firma con fondo transparente",
        ),
      ).toHaveAttribute("src", TRANSPARENT_SIGNATURE_DATA_URL);

      fireEvent.change(screen.getByLabelText("Contraste"), {
        target: { value: "2.4" },
      });
      fireEvent.change(screen.getByLabelText("Umbral blanco y negro"), {
        target: { value: "170" },
      });
      await waitFor(() =>
        expect(processSignatureImageDataUrl).toHaveBeenLastCalledWith(
          expect.stringMatching(/^data:image\/webp;base64,/),
          { contrast: 2.4, threshold: 170 },
        ),
      );

      await user.click(
        await screen.findByRole("button", { name: "Usar esta firma" }),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText("Firma guardada")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Guardar firma del paciente" }),
      ).toBeDisabled();

      const continueButton = screen.getByRole("button", {
        name: "Continuar al editor",
      });
      expect(continueButton).toBeEnabled();
      await user.click(continueButton);
      expect(screen.getByAltText("Firma del paciente")).toHaveAttribute(
        "src",
        TRANSPARENT_SIGNATURE_DATA_URL,
      );
    } finally {
      getContext.mockRestore();
    }
  });

  it("prefills the patient name and reveals the partner name only when selected", async () => {
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    await chooseGuidedFlow(user);
    await user.click(
      screen.getByRole("button", { name: "Continuar con los datos" }),
    );

    expect(
      screen.getByRole("textbox", {
        name: "Nombre y apellido del paciente",
      }),
    ).toHaveValue("Ada Paciente");
    const patientDocument = screen.getByRole("textbox", {
      name: "Documento del paciente",
    });
    expect(patientDocument).toBeRequired();
    const signatureDate = screen.getByLabelText("Fecha de firma");
    const dateParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const dateValues = new Map(
      dateParts.map((part) => [part.type, part.value]),
    );
    expect(signatureDate).toHaveValue(
      `${dateValues.get("year")}-${dateValues.get("month")}-${dateValues.get("day")}`,
    );
    expect(signatureDate).toBeRequired();
    expect(
      screen.queryByRole("textbox", {
        name: "Nombre y apellido de la pareja",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", {
        name: "El consentimiento también será firmado por la pareja",
      }),
    );

    const partnerName = screen.getByRole("textbox", {
      name: "Nombre y apellido de la pareja",
    });
    expect(partnerName).toBeRequired();

    await user.type(patientDocument, "31.234.567");
    await user.type(partnerName, "Alex Pareja");
    await user.click(
      screen.getByRole("button", { name: "Continuar para firmar" }),
    );

    expect(
      screen.getByLabelText("Área para dibujar la firma del paciente"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Área para dibujar la firma de la pareja"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Importar imagen de firma del paciente",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Importar imagen de firma de la pareja",
      }),
    ).toBeInTheDocument();
  });

  it("requires the patient name and document before opening the signature step", async () => {
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard />);

    await chooseGuidedFlow(user);
    await user.click(
      screen.getByRole("button", { name: "Continuar con los datos" }),
    );
    await user.clear(screen.getByLabelText("Fecha de firma"));
    await user.click(
      screen.getByRole("button", { name: "Continuar para firmar" }),
    );

    expect(
      screen.getByText("Ingrese el nombre y apellido del paciente."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ingrese el documento del paciente."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ingrese una fecha de firma válida."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Datos de quienes firman" }),
    ).toBeInTheDocument();
  });

  it("guides patient direct uploads through download, manual signing, and scan upload", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      record: { id: "CONSENT-PATIENT" },
    });
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard />);

    await chooseDirectFlow(user);

    expectActiveSidebarStep("Descargar la plantilla");
    expect(screen.getByText("Paso manual 1 de 3")).toBeVisible();
    expectSidebarSteps([
      "method",
      "direct-download",
      "direct-sign",
      "direct-upload",
    ]);
    expect(
      screen.queryByRole("button", { name: "Firmar en línea" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cargar archivo firmado" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Descargar la plantilla" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Descargue la plantilla oficial")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Descargar plantilla de consentimiento",
      }),
    ).toHaveAttribute(
      "href",
      "/patient-portal/documents/consentimiento-informado-2pq.pdf",
    );
    const manualSteps = screen.getByRole("list", {
      name: "Pasos para cargar un consentimiento firmado manualmente",
    });
    expect(
      within(manualSteps).getByText("Descargar la plantilla"),
    ).toBeVisible();
    expect(
      within(manualSteps).getByText("Imprimir, completar y firmar"),
    ).toBeVisible();
    expect(
      within(manualSteps).getByText("Escanear y subir el archivo"),
    ).toBeVisible();
    expect(
      screen.queryByText("Sin archivo seleccionado"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Ya descargué la plantilla" }),
    );
    expectActiveSidebarStep("Imprimir y firmar");
    expect(screen.getByText("Paso manual 2 de 3")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Imprimir y firmar" }),
    ).toBeVisible();
    expect(
      screen.getByText("Imprima todas las páginas de la plantilla descargada."),
    ).toBeVisible();
    expect(
      screen.getByText(/Escanee todas las páginas ya firmadas/),
    ).toBeVisible();
    expect(
      screen.queryByText("Sin archivo seleccionado"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Ya lo imprimí y firmé" }),
    );
    expectActiveSidebarStep("Subir el escaneo firmado");
    expect(screen.getByText("Paso manual 3 de 3")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Subir el escaneo firmado" }),
    ).toBeVisible();
    expect(screen.getByText("Consentimiento firmado")).toBeInTheDocument();
    expect(screen.getByText("Sin archivo seleccionado")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Un único PDF con todas las páginas o una imagen completa y legible. Máximo 750 KB.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Subir consentimiento" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expectActiveSidebarStep("Imprimir y firmar");
    await user.click(
      screen.getByRole("button", { name: "Ya lo imprimí y firmé" }),
    );

    const directFile = new File(["signed consent"], "consentimiento.pdf", {
      type: "application/pdf",
    });
    await user.upload(
      screen.getByLabelText("Consentimiento firmado"),
      directFile,
    );
    expect(await screen.findByText("consentimiento.pdf")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Subir consentimiento" }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: "Subir consentimiento" }),
    );
    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/2pq/informed-consents",
        expect.objectContaining({
          method: "POST",
          body: expect.any(String),
        }),
      ),
    );
    const patientUploadCall = jest
      .mocked(sdkFetch)
      .mock.calls.find(([path]) => path === "/2pq/informed-consents");
    expect(JSON.parse(String(patientUploadCall?.[1]?.body))).toEqual({
      flowMode: "direct",
      file: expect.objectContaining({
        name: "consentimiento.pdf",
        type: "application/pdf",
      }),
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/patient-portal/consents");

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expectActiveSidebarStep("Imprimir y firmar");
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expectActiveSidebarStep("Descargar la plantilla");
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expectActiveSidebarStep("Elegir cómo continuar");
    expect(
      screen.getByRole("button", { name: "Firmar en línea" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cargar archivo firmado" }),
    ).toBeVisible();
  });

  it("adds an administrative destination step and loads cases for the selected patient", async () => {
    jest.mocked(sdkFetch).mockResolvedValueOnce({
      cases: [
        {
          id: "CASE-00001",
          institutionId: "INST-00001",
          doctorId: "DOC-00001",
          patientId: "PAT-00001",
          patientName: "Ada Paciente",
          caseLabel: "Caso Ada",
          informedConsentId: null,
          createdAt: "2026-10-16T00:00:00.000Z",
          updatedAt: "2026-10-16T00:00:00.000Z",
        },
      ],
    });
    const user = userEvent.setup();
    render(
      <PatientConsentUploadWizard
        surface="backoffice"
        initialPatientPage={{
          patients: [
            {
              id: "PAT-00001",
              fullName: "Ada Paciente",
              email: "ada@example.com",
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Volver a consentimientos" }),
    ).toHaveAttribute("href", "/2pq-dashboard/consents");

    expectActiveSidebarStep("Elegir cómo continuar");
    expect(
      within(screen.getByTestId("consent-wizard-sidebar")).queryByText(
        "Seleccionar paciente y caso 2PQ",
      ),
    ).toBeNull();
    await chooseGuidedFlow(user);
    expectActiveSidebarStep("Seleccionar paciente y caso 2PQ");
    expectSidebarSteps([
      "method",
      "destination",
      "download",
      "data",
      "signature",
      "editor",
      "preview",
    ]);

    await user.click(screen.getByRole("combobox", { name: "Paciente" }));
    await user.click(
      screen.getByRole("option", { name: "Ada Paciente - PAT-00001" }),
    );

    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/2pq/informed-consents/cases?patientId=PAT-00001",
      ),
    );
    await user.click(screen.getByRole("combobox", { name: "Caso 2PQ" }));
    await user.click(
      screen.getByRole("option", { name: "Caso Ada - CASE-00001" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Continuar",
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Descargar consentimiento" }),
    ).toBeInTheDocument();
    expectActiveSidebarStep("Descargar consentimiento");
  });

  it("clears saved signatures and signer details when the operator switches patients", async () => {
    const oldPatientSignature = "data:image/png;base64,b2xkLXBhdGllbnQ=";
    const oldPartnerSignature = "data:image/png;base64,b2xkLXBhcnRuZXI=";
    const newPatientSignature = "data:image/png;base64,bmV3LXBhdGllbnQ=";
    const context = {
      beginPath: jest.fn(),
      clearRect: jest.fn(),
      drawImage: jest.fn(),
      lineTo: jest.fn(),
      moveTo: jest.fn(),
      stroke: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const getContext = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    const toDataUrl = jest
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValueOnce(oldPatientSignature)
      .mockReturnValueOnce(oldPartnerSignature)
      .mockReturnValueOnce(newPatientSignature);
    const setPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "setPointerCapture",
    );
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    const originalFetch = global.fetch;
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: jest.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer,
      })),
    });
    jest
      .mocked(applySignaturesToConsentPdf)
      .mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    jest
      .mocked(sdkFetch)
      .mockResolvedValueOnce({
        cases: [
          {
            id: "CASE-ADA",
            institutionId: "INST-00001",
            doctorId: "DOC-00001",
            patientId: "PAT-ADA",
            patientName: "Ada Paciente",
            caseLabel: "Caso Ada",
            informedConsentId: null,
            createdAt: "2026-10-16T00:00:00.000Z",
            updatedAt: "2026-10-16T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        cases: [
          {
            id: "CASE-BEA",
            institutionId: "INST-00001",
            doctorId: "DOC-00001",
            patientId: "PAT-BEA",
            patientName: "Bea Paciente",
            caseLabel: "Caso Bea",
            informedConsentId: null,
            createdAt: "2026-10-16T00:00:00.000Z",
            updatedAt: "2026-10-16T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ record: { id: "CONSENT-BEA" } });

    try {
      const user = userEvent.setup();
      render(
        <PatientConsentUploadWizard
          surface="backoffice"
          initialPatientPage={{
            patients: [
              {
                id: "PAT-ADA",
                fullName: "Ada Paciente",
                email: "ada@example.com",
              },
              {
                id: "PAT-BEA",
                fullName: "Bea Paciente",
                email: "bea@example.com",
              },
            ],
          }}
        />,
      );

      await chooseGuidedFlow(user);
      await user.click(screen.getByRole("combobox", { name: "Paciente" }));
      await user.click(
        screen.getByRole("option", { name: "Ada Paciente - PAT-ADA" }),
      );
      await waitFor(() =>
        expect(sdkFetch).toHaveBeenCalledWith(
          "/2pq/informed-consents/cases?patientId=PAT-ADA",
        ),
      );
      await user.click(screen.getByRole("combobox", { name: "Caso 2PQ" }));
      await user.click(
        screen.getByRole("option", { name: "Caso Ada - CASE-ADA" }),
      );
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      await user.click(
        screen.getByRole("button", { name: "Continuar con los datos" }),
      );

      const signatureDate = screen.getByLabelText("Fecha de firma");
      const defaultSignatureDate = (signatureDate as HTMLInputElement).value;
      await user.type(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
        "31.234.567",
      );
      fireEvent.change(signatureDate, { target: { value: "2026-01-02" } });
      await user.click(
        screen.getByRole("checkbox", {
          name: "El consentimiento también será firmado por la pareja",
        }),
      );
      await user.type(
        screen.getByRole("textbox", {
          name: "Nombre y apellido de la pareja",
        }),
        "Alex Pareja",
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );

      fireEvent.pointerDown(
        screen.getByLabelText("Área para dibujar la firma del paciente"),
        { pointerId: 1, clientX: 10, clientY: 10 },
      );
      await user.click(
        screen.getByRole("button", { name: "Guardar firma del paciente" }),
      );
      fireEvent.pointerDown(
        screen.getByLabelText("Área para dibujar la firma de la pareja"),
        { pointerId: 2, clientX: 10, clientY: 10 },
      );
      await user.click(
        screen.getByRole("button", { name: "Guardar firma de la pareja" }),
      );
      expect(screen.getAllByText("Firma guardada")).toHaveLength(2);

      await user.click(screen.getByRole("button", { name: "Volver" }));
      await user.click(screen.getByRole("button", { name: "Volver" }));
      await user.click(screen.getByRole("button", { name: "Volver" }));
      await user.click(screen.getByRole("combobox", { name: "Paciente" }));
      await user.click(
        screen.getByRole("option", { name: "Bea Paciente - PAT-BEA" }),
      );
      await waitFor(() =>
        expect(sdkFetch).toHaveBeenCalledWith(
          "/2pq/informed-consents/cases?patientId=PAT-BEA",
        ),
      );
      await user.click(screen.getByRole("combobox", { name: "Caso 2PQ" }));
      await user.click(
        screen.getByRole("option", { name: "Caso Bea - CASE-BEA" }),
      );
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      await user.click(
        screen.getByRole("button", { name: "Continuar con los datos" }),
      );

      expect(
        screen.getByRole("textbox", { name: "Nombre y apellido del paciente" }),
      ).toHaveValue("Bea Paciente");
      expect(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
      ).toHaveValue("");
      expect(screen.getByLabelText("Fecha de firma")).toHaveValue(
        defaultSignatureDate,
      );
      expect(
        screen.getByRole("checkbox", {
          name: "El consentimiento también será firmado por la pareja",
        }),
      ).not.toBeChecked();
      expect(
        screen.queryByRole("textbox", {
          name: "Nombre y apellido de la pareja",
        }),
      ).not.toBeInTheDocument();

      await user.type(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
        "32.345.678",
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );
      expect(screen.queryByText("Firma guardada")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Continuar al editor" }),
      ).toBeDisabled();

      fireEvent.pointerDown(
        screen.getByLabelText("Área para dibujar la firma del paciente"),
        { pointerId: 3, clientX: 10, clientY: 10 },
      );
      await user.click(
        screen.getByRole("button", { name: "Guardar firma del paciente" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar al editor" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Aplicar firmas y continuar" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Subir consentimiento" }),
      );

      await waitFor(() =>
        expect(sdkFetch).toHaveBeenCalledWith(
          "/2pq/informed-consents",
          expect.objectContaining({ method: "POST", body: expect.any(String) }),
        ),
      );
      const uploadCall = jest
        .mocked(sdkFetch)
        .mock.calls.find(([path]) => path === "/2pq/informed-consents");
      expect(JSON.parse(String(uploadCall?.[1]?.body))).toMatchObject({
        patientId: "PAT-BEA",
        caseId: "CASE-BEA",
        flowMode: "guided",
        savedSignature: newPatientSignature,
      });
      expect(String(uploadCall?.[1]?.body)).not.toContain(oldPatientSignature);
      expect(String(uploadCall?.[1]?.body)).not.toContain(oldPartnerSignature);
      expect(applySignaturesToConsentPdf).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        [
          expect.objectContaining({
            role: "patient",
            name: "Bea Paciente",
            document: "32.345.678",
            signatureDataUrl: newPatientSignature,
            placement: { x: 0.72, y: 0.445, width: 0.16 },
          }),
        ],
      );
    } finally {
      getContext.mockRestore();
      toDataUrl.mockRestore();
      if (originalFetch) {
        Object.defineProperty(global, "fetch", {
          configurable: true,
          value: originalFetch,
        });
      } else {
        Reflect.deleteProperty(global, "fetch");
      }
      if (setPointerCaptureDescriptor) {
        Object.defineProperty(
          HTMLCanvasElement.prototype,
          "setPointerCapture",
          setPointerCaptureDescriptor,
        );
      } else {
        Reflect.deleteProperty(
          HTMLCanvasElement.prototype,
          "setPointerCapture",
        );
      }
    }
  });

  it("routes a backoffice direct upload through destination and the complete manual path", async () => {
    jest
      .mocked(sdkFetch)
      .mockResolvedValueOnce({
        cases: [
          {
            id: "CASE-00001",
            institutionId: "INST-00001",
            doctorId: "DOC-00001",
            patientId: "PAT-00001",
            patientName: "Ada Paciente",
            caseLabel: "Caso Ada",
            informedConsentId: null,
            createdAt: "2026-10-16T00:00:00.000Z",
            updatedAt: "2026-10-16T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ record: { id: "CONSENT-ADMIN" } });
    const user = userEvent.setup();
    render(
      <PatientConsentUploadWizard
        surface="backoffice"
        initialPatientPage={{
          patients: [
            {
              id: "PAT-00001",
              fullName: "Ada Paciente",
              email: "ada@example.com",
            },
          ],
        }}
      />,
    );

    await chooseDirectFlow(user);
    expectActiveSidebarStep("Seleccionar paciente y caso 2PQ");
    expect(screen.getByText("Preparación del recorrido manual")).toBeVisible();
    expectSidebarSteps([
      "method",
      "destination",
      "direct-download",
      "direct-sign",
      "direct-upload",
    ]);
    expect(
      screen.queryByRole("button", { name: "Cargar archivo firmado" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Consentimiento firmado"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Paciente" }));
    await user.click(
      screen.getByRole("option", { name: "Ada Paciente - PAT-00001" }),
    );
    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/2pq/informed-consents/cases?patientId=PAT-00001",
      ),
    );
    await user.click(screen.getByRole("combobox", { name: "Caso 2PQ" }));
    await user.click(
      screen.getByRole("option", { name: "Caso Ada - CASE-00001" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Continuar",
      }),
    );

    expectActiveSidebarStep("Descargar la plantilla");
    expect(screen.getByText("Paso manual 1 de 3")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Descargar la plantilla" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Descargar plantilla de consentimiento",
      }),
    ).toHaveAttribute(
      "href",
      "/patient-portal/documents/consentimiento-informado-2pq.pdf",
    );
    expect(
      screen.queryByText("Consentimiento firmado"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Ya descargué la plantilla" }),
    );
    expectActiveSidebarStep("Imprimir y firmar");
    await user.click(
      screen.getByRole("button", { name: "Ya lo imprimí y firmé" }),
    );
    expectActiveSidebarStep("Subir el escaneo firmado");
    expect(screen.getByText("Consentimiento firmado")).toBeInTheDocument();

    const directFile = new File(["signed consent"], "admin-consent.pdf", {
      type: "application/pdf",
    });
    await user.upload(
      screen.getByLabelText("Consentimiento firmado"),
      directFile,
    );
    await user.click(
      screen.getByRole("button", { name: "Subir consentimiento" }),
    );
    await waitFor(() =>
      expect(sdkFetch).toHaveBeenCalledWith(
        "/2pq/informed-consents",
        expect.objectContaining({
          method: "POST",
          body: expect.any(String),
        }),
      ),
    );
    const adminUploadCall = jest
      .mocked(sdkFetch)
      .mock.calls.find(([path]) => path === "/2pq/informed-consents");
    expect(JSON.parse(String(adminUploadCall?.[1]?.body))).toEqual({
      patientId: "PAT-00001",
      caseId: "CASE-00001",
      flowMode: "direct",
      file: expect.objectContaining({
        name: "admin-consent.pdf",
        type: "application/pdf",
      }),
    });
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/2pq-dashboard/consents/CONSENT-ADMIN",
    );
  });

  it("sends only the patient signature with a guided consent upload", async () => {
    const context = {
      beginPath: jest.fn(),
      clearRect: jest.fn(),
      drawImage: jest.fn(),
      lineTo: jest.fn(),
      moveTo: jest.fn(),
      stroke: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const getContext = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    const toDataUrl = jest
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue(TRANSPARENT_SIGNATURE_DATA_URL);
    const originalFetch = global.fetch;
    const fetchTemplate = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer,
    }));
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: fetchTemplate,
    });
    const setPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "setPointerCapture",
    );
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    jest
      .mocked(applySignaturesToConsentPdf)
      .mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    jest.mocked(sdkFetch).mockResolvedValue({
      record: { id: "CONSENT-GUIDED" },
    });

    try {
      const user = userEvent.setup();
      render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

      await chooseGuidedFlow(user);
      await user.click(
        screen.getByRole("button", { name: "Continuar con los datos" }),
      );
      await user.type(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
        "31.234.567",
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );
      const canvas = screen.getByLabelText(
        "Área para dibujar la firma del paciente",
      );
      fireEvent.pointerDown(canvas, {
        pointerId: 1,
        clientX: 10,
        clientY: 10,
      });
      await user.click(
        screen.getByRole("button", { name: "Guardar firma del paciente" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar al editor" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Aplicar firmas y continuar" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Subir consentimiento" }),
      );

      await waitFor(() =>
        expect(sdkFetch).toHaveBeenCalledWith(
          "/2pq/informed-consents",
          expect.objectContaining({ method: "POST", body: expect.any(String) }),
        ),
      );
      const uploadCall = jest
        .mocked(sdkFetch)
        .mock.calls.find(([path]) => path === "/2pq/informed-consents");
      expect(JSON.parse(String(uploadCall?.[1]?.body))).toMatchObject({
        flowMode: "guided",
        savedSignature: TRANSPARENT_SIGNATURE_DATA_URL,
        file: { type: "application/pdf" },
      });
      expect(String(uploadCall?.[1]?.body)).not.toContain("partnerSignature");
    } finally {
      getContext.mockRestore();
      toDataUrl.mockRestore();
      if (originalFetch) {
        Object.defineProperty(global, "fetch", {
          configurable: true,
          value: originalFetch,
        });
      } else {
        Reflect.deleteProperty(global, "fetch");
      }
      if (setPointerCaptureDescriptor) {
        Object.defineProperty(
          HTMLCanvasElement.prototype,
          "setPointerCapture",
          setPointerCaptureDescriptor,
        );
      } else {
        Reflect.deleteProperty(
          HTMLCanvasElement.prototype,
          "setPointerCapture",
        );
      }
    }
  });
});
