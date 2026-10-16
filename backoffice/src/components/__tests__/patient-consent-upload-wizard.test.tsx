/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientConsentUploadWizard } from "@/components/patient-consent-upload-wizard";
import { processSignatureImageDataUrl } from "@/lib/signature-image";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  sdkFetch: jest.fn(),
}));

jest.mock("@/lib/signature-image", () => ({
  ...jest.requireActual("@/lib/signature-image"),
  processSignatureImageDataUrl: jest.fn(),
}));

const TRANSPARENT_SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC";

describe("PatientConsentUploadWizard", () => {
  beforeEach(() => {
    jest.mocked(sdkFetch).mockReset();
    jest.mocked(processSignatureImageDataUrl).mockReset();
  });

  it("shows the five-step signing flow and the downloadable 2PQ PDF", () => {
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    expect(
      screen.getByRole("heading", { name: "Subir consentimiento" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Descargar")).toBeInTheDocument();
    expect(screen.getByText("Datos")).toBeInTheDocument();
    expect(screen.getByText("Firmar")).toBeInTheDocument();
    expect(screen.getByText("Aplicar firma")).toBeInTheDocument();
    expect(screen.getByText("Vista previa")).toBeInTheDocument();
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
        Reflect.deleteProperty(
          HTMLImageElement.prototype,
          "setPointerCapture",
        );
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

  it("offers a direct upload path for an already signed file", async () => {
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard />);

    await user.click(
      screen.getByRole("button", { name: "Cargar archivo firmado" }),
    );

    expect(screen.getByText("Consentimiento firmado")).toBeInTheDocument();
    expect(screen.getByText("Sin archivo seleccionado")).toBeInTheDocument();
    expect(
      screen.getByText("PDF o imagen, máximo 750 KB."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Subir consentimiento" }),
    ).toBeDisabled();
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

    expect(screen.getByText("Destino")).toBeInTheDocument();
    expect(screen.getByText("Descargar")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Volver a consentimientos" }),
    ).toHaveAttribute("href", "/2pq-dashboard/consents");

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
        name: "Continuar con el consentimiento",
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Descargar el consentimiento 2PQ" }),
    ).toBeInTheDocument();
  });
});
