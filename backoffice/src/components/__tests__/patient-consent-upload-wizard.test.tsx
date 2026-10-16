/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientConsentUploadWizard } from "@/components/patient-consent-upload-wizard";
import { applySignaturesToConsentPdf } from "@/lib/consent-pdf";
import type { InformedConsentDraftRecord } from "@/lib/informed-consents";
import { processSignatureImageDataUrl } from "@/lib/signature-image";
import { SdkRequestError, sdkFetch } from "@/lib/sdk-client";

const mockRouterPush = jest.fn();
const mockRouterRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  }),
}));

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
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

const OBSOLETE_GUIDED_TRANSITION_MESSAGES = [
  "Entorno de firma electrónica iniciado.",
  "Documento preparado. Verifique ahora la identidad del firmante.",
  "Identidad declarada. Incorpore la firma al consentimiento.",
  "Firma preparada. Ubíquela en el documento digital.",
  "Firma aplicada. Revise el documento y confirme su aceptación legal.",
] as const;

function consentDraft(
  overrides: Partial<InformedConsentDraftRecord> = {},
): InformedConsentDraftRecord {
  return {
    id: "patient-uid",
    collectionKey: "2pq-informed-consent-drafts",
    schemaVersion: 1,
    revision: 4,
    patientId: "PAT-00001",
    mode: "guided",
    activeStepId: "data",
    visitedStepIds: ["method", "download", "data"],
    patientName: "Ada Paciente",
    patientDocument: "31.234.567",
    signatureDate: "2026-10-16",
    hasPartner: false,
    partnerName: "",
    patientSignatureDataUrl: null,
    partnerSignatureDataUrl: null,
    patientSignatureMethod: null,
    partnerSignatureMethod: null,
    patientPlacement: { x: 0.72, y: 0.445, width: 0.16 },
    partnerPlacement: { x: 0.72, y: 0.64, width: 0.16 },
    selectedRole: "patient",
    createdAt: "2026-10-16T10:00:00.000Z",
    updatedAt: "2026-10-16T10:05:00.000Z",
    createdByEmail: "ada@example.com",
    createdByUid: "patient-uid",
    updatedByEmail: "ada@example.com",
    updatedByUid: "patient-uid",
    ...overrides,
  };
}

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

function expectNoGuidedTransitionMessages() {
  for (const message of OBSOLETE_GUIDED_TRANSITION_MESSAGES) {
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  }
}

async function chooseGuidedFlow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Firmar en línea" }));
}

async function chooseDirectFlow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Cargar archivo firmado" }),
  );
}

async function openPortalSignatureStep(
  user: ReturnType<typeof userEvent.setup>,
  partnerName?: string,
) {
  await chooseGuidedFlow(user);
  await user.click(
    screen.getByRole("button", { name: "Continuar con los datos" }),
  );
  await user.type(
    screen.getByRole("textbox", { name: "Documento del paciente" }),
    "31.234.567",
  );
  if (partnerName) {
    await user.click(
      screen.getByRole("checkbox", {
        name: "El consentimiento también será firmado por la pareja",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Nombre y apellido de la pareja",
      }),
      partnerName,
    );
  }
  await user.click(
    screen.getByRole("button", { name: "Continuar para firmar" }),
  );
}

function signatureSection(name: "Firma del paciente" | "Firma de la pareja") {
  const section = screen.getByRole("heading", { name }).closest("section");
  expect(section).toBeInstanceOf(HTMLElement);
  return section as HTMLElement;
}

function mockPatientPortalSdk({
  savedSignature = null,
  uploadedConsentId,
  uploadError,
  draftRevision = 0,
}: {
  savedSignature?: string | null;
  uploadedConsentId?: string;
  uploadError?: Error;
  draftRevision?: number;
} = {}) {
  let revision = draftRevision;
  jest.mocked(sdkFetch).mockImplementation(((
    path: string,
    options?: RequestInit,
  ) => {
    if (path === "/2pq/informed-consents/draft") {
      revision += 1;
      return Promise.resolve({ draft: { revision } });
    }
    if (path === "/2pq/informed-consents/saved-signature") {
      return Promise.resolve({ savedSignature });
    }
    if (path === "/2pq/informed-consents" && options?.method === "POST") {
      return uploadError
        ? Promise.reject(uploadError)
        : Promise.resolve({
            record: { id: uploadedConsentId ?? "CONSENT-PATIENT" },
          });
    }
    return Promise.reject(new Error(`Unexpected SDK path: ${path}`));
  }) as typeof sdkFetch);
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
      screen.getByRole("heading", {
        name: "Está firmando un documento digital",
      }),
    ).toBeVisible();
    expectNoGuidedTransitionMessages();
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
      within(sidebar).getByText("Preparar las firmas"),
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
    expect(
      screen.getByText(
        /antes de avanzar con la firma, el paciente debe leer este consentimiento informado con detenimiento/i,
      ),
    ).toBeVisible();
  });

  it("keeps the current-step actions fixed and reserves scrolling clearance", async () => {
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    const interactions = screen.getByTestId("consent-wizard-interactions");
    const actionFooter = screen.getByTestId("consent-wizard-action-footer");

    expect(actionFooter).toHaveAttribute("aria-label", "Acciones del paso");
    expect(actionFooter).toHaveClass(
      "consent-wizard-action-dock",
      "fixed",
      "inset-x-0",
      "bottom-0",
      "z-40",
    );
    expect(actionFooter).not.toHaveClass("sticky");
    expect(actionFooter.className).toContain("safe-area-inset-bottom");
    expect(interactions.className).toContain(
      "pb-[calc(15rem+env(safe-area-inset-bottom))]",
    );
    expect(
      within(actionFooter).getByRole("link", {
        name: "Volver a consentimientos",
      }),
    ).toBeVisible();

    await chooseGuidedFlow(user);

    expect(screen.getByTestId("consent-wizard-action-footer")).toBe(
      actionFooter,
    );
    expect(
      within(actionFooter).getByRole("button", {
        name: "Continuar con los datos",
      }),
    ).toBeVisible();
  });

  it("keeps every guided sidebar step clickable and autosaves ordered revisions", async () => {
    mockPatientPortalSdk();
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    await chooseGuidedFlow(user);
    const sidebar = screen.getByTestId("consent-wizard-sidebar");
    expect(within(sidebar).getAllByRole("button")).toHaveLength(6);
    for (const label of [
      "Elegir cómo continuar",
      "Descargar consentimiento",
      "Datos de quienes firman",
      "Preparar las firmas",
      "Aplicar firmas al PDF",
      "Revisar y subir",
    ]) {
      expect(
        within(sidebar).getByRole("button", { name: label }),
      ).toBeVisible();
    }

    await waitFor(() =>
      expect(
        jest
          .mocked(sdkFetch)
          .mock.calls.some(
            ([path, options]) =>
              path === "/2pq/informed-consents/draft" &&
              options?.method === "PUT",
          ),
      ).toBe(true),
    );
    const firstDraftCall = jest
      .mocked(sdkFetch)
      .mock.calls.find(
        ([path, options]) =>
          path === "/2pq/informed-consents/draft" && options?.method === "PUT",
      );
    expect(JSON.parse(String(firstDraftCall?.[1]?.body))).toMatchObject({
      expectedRevision: null,
      mode: "guided",
      activeStepId: "download",
    });

    await user.click(
      within(sidebar).getByRole("button", { name: "Aplicar firmas al PDF" }),
    );
    expect(
      screen.getByRole("heading", { name: "Aplicar firmas al PDF" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Todavía faltan datos para aplicar las firmas",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Completar datos" }),
    ).toBeEnabled();

    await waitFor(() => {
      const draftCalls = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, options]) =>
            path === "/2pq/informed-consents/draft" &&
            options?.method === "PUT",
        );
      expect(draftCalls.length).toBeGreaterThanOrEqual(2);
      expect(JSON.parse(String(draftCalls.at(-1)?.[1]?.body))).toMatchObject({
        expectedRevision: 1,
        activeStepId: "editor",
        visitedStepIds: expect.arrayContaining([
          "method",
          "download",
          "editor",
        ]),
      });
    });

    await user.click(
      within(sidebar).getByRole("button", { name: "Datos de quienes firman" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Documento del paciente" }),
      "31.234.567",
    );
    await user.click(
      within(sidebar).getByRole("button", { name: "Revisar y subir" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Prepare el documento antes de revisarlo",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Preparar firmas" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("checkbox", {
        name: /Declaro, bajo mi responsabilidad/,
      }),
    ).not.toBeInTheDocument();

    await user.click(
      within(sidebar).getByRole("button", { name: "Datos de quienes firman" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Documento del paciente" }),
    ).toHaveValue("31.234.567");
  });

  it("prefills the current patient's stored document in a fresh guided flow", async () => {
    const user = userEvent.setup();
    render(
      <PatientConsentUploadWizard
        initialPatientName="Ada Paciente"
        initialPatientDocument="  31.234.567  "
      />,
    );

    await chooseGuidedFlow(user);
    await user.click(
      screen.getByRole("button", { name: "Continuar con los datos" }),
    );

    expect(
      screen.getByRole("textbox", { name: "Nombre y apellido del paciente" }),
    ).toHaveValue("Ada Paciente");
    expect(
      screen.getByRole("textbox", { name: "Documento del paciente" }),
    ).toHaveValue("31.234.567");
  });

  it.each([
    ["DRAFT-9988", "DRAFT-9988"],
    ["", ""],
  ])(
    "keeps the restored draft document %p instead of the current patient value",
    (draftDocument, expectedDocument) => {
      render(
        <PatientConsentUploadWizard
          initialPatientName="Ada Paciente"
          initialPatientDocument="CURRENT-1122"
          initialDraft={consentDraft({
            activeStepId: "data",
            visitedStepIds: ["method", "download", "data"],
            patientDocument: draftDocument,
          })}
        />,
      );

      expect(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
      ).toHaveValue(expectedDocument);
    },
  );

  it("uses the existing revision when a fresh flow deliberately replaces the single draft", async () => {
    mockPatientPortalSdk({ draftRevision: 7 });
    const user = userEvent.setup();
    render(
      <PatientConsentUploadWizard
        initialPatientName="Flujo nuevo"
        initialDraftRevision={7}
      />,
    );

    expectActiveSidebarStep("Elegir cómo continuar");
    expect(screen.queryByText("Ada Paciente")).not.toBeInTheDocument();
    await chooseDirectFlow(user);

    await waitFor(() => {
      const draftCall = jest
        .mocked(sdkFetch)
        .mock.calls.find(
          ([path, options]) =>
            path === "/2pq/informed-consents/draft" &&
            options?.method === "PUT",
        );
      expect(JSON.parse(String(draftCall?.[1]?.body))).toMatchObject({
        expectedRevision: 7,
        mode: "direct",
        activeStepId: "direct-download",
      });
    });
  });

  it("restores draft data but rebuilds the generated PDF and legal acceptance", async () => {
    mockPatientPortalSdk({
      savedSignature: TRANSPARENT_SIGNATURE_DATA_URL,
    });
    const user = userEvent.setup();
    render(
      <PatientConsentUploadWizard
        initialPatientName="Nombre anterior"
        initialDraft={consentDraft({
          activeStepId: "preview",
          visitedStepIds: [
            "method",
            "download",
            "data",
            "signature",
            "editor",
            "preview",
          ],
          patientSignatureDataUrl: TRANSPARENT_SIGNATURE_DATA_URL,
          patientSignatureMethod: "saved",
          patientPlacement: { x: 0.4, y: 0.3, width: 0.2 },
        })}
      />,
    );

    expectActiveSidebarStep("Aplicar firmas al PDF");
    expect(
      screen.queryByText("Última página · Página 2 de 2"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Firma del paciente" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", {
        name: "Seleccionar firma para ubicar",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByAltText("Página 2 del consentimiento informado"),
    ).toBeVisible();
    expect(
      screen.queryByRole("checkbox", {
        name: /Declaro, bajo mi responsabilidad/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Acepto la realización de este estudio",
      }),
    ).not.toBeInTheDocument();

    const sidebar = screen.getByTestId("consent-wizard-sidebar");
    await user.click(
      within(sidebar).getByRole("button", { name: "Datos de quienes firman" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Nombre y apellido del paciente" }),
    ).toHaveValue("Ada Paciente");
    expect(
      screen.getByRole("textbox", { name: "Documento del paciente" }),
    ).toHaveValue("31.234.567");
    expect(screen.getByLabelText("Fecha de firma")).toHaveValue("2026-10-16");
  });

  it("restores a direct-upload draft without retaining the selected file", () => {
    render(
      <PatientConsentUploadWizard
        initialDraft={consentDraft({
          mode: "direct",
          activeStepId: "direct-upload",
          visitedStepIds: [
            "method",
            "direct-download",
            "direct-sign",
            "direct-upload",
          ],
        })}
      />,
    );

    expectActiveSidebarStep("Subir el escaneo firmado");
    expect(
      screen.getByText(
        /los archivos elegidos no se guardan dentro del borrador/i,
      ),
    ).toBeVisible();
    expect(screen.getByText("Sin archivo seleccionado")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Subir consentimiento" }),
    ).toBeDisabled();
  });

  it("discards a generated PDF when sidebar navigation changes during preparation", async () => {
    const originalFetch = global.fetch;
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: jest.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer,
      })),
    });
    let resolveGeneratedPdf: ((value: Uint8Array) => void) | undefined;
    const generatedPdf = new Promise<Uint8Array>((resolve) => {
      resolveGeneratedPdf = resolve;
    });
    jest.mocked(applySignaturesToConsentPdf).mockReturnValue(generatedPdf);
    mockPatientPortalSdk();

    try {
      const user = userEvent.setup();
      render(
        <PatientConsentUploadWizard
          initialDraft={consentDraft({
            activeStepId: "editor",
            visitedStepIds: [
              "method",
              "download",
              "data",
              "signature",
              "editor",
            ],
            patientSignatureDataUrl: TRANSPARENT_SIGNATURE_DATA_URL,
            patientSignatureMethod: "saved",
          })}
        />,
      );

      const editorContent = screen.getByAltText(
        "Página 2 del consentimiento informado",
      );
      const securityBanner = screen.getByTestId(
        "guided-signing-security-banner",
      );
      const actionFooter = screen.getByTestId("consent-wizard-action-footer");
      expect(securityBanner.closest("header")).toBeNull();
      expect(securityBanner.closest('[data-step-id="editor"]')).toBeNull();
      expect(
        editorContent.compareDocumentPosition(securityBanner) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        securityBanner.compareDocumentPosition(actionFooter) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await user.click(
        screen.getByRole("button", { name: "Aplicar firmas y continuar" }),
      );
      await waitFor(() =>
        expect(applySignaturesToConsentPdf).toHaveBeenCalledTimes(1),
      );
      const preparingButton = screen.getByRole("button", {
        name: "Preparando documento…",
      });
      expect(preparingButton).toBeDisabled();
      expect(preparingButton).toHaveAttribute("aria-busy", "true");

      const sidebar = screen.getByTestId("consent-wizard-sidebar");
      await user.click(
        within(sidebar).getByRole("button", {
          name: "Datos de quienes firman",
        }),
      );

      await act(async () => {
        resolveGeneratedPdf?.(new Uint8Array([37, 80, 68, 70]));
        await generatedPdf;
      });

      expectActiveSidebarStep("Datos de quienes firman");
      expect(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
      ).toHaveValue("31.234.567");
      expect(
        await screen.findByText(
          /el contenido o el paso activo cambiaron mientras se preparaba el documento/i,
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole("checkbox", {
          name: /Declaro, bajo mi responsabilidad/,
        }),
      ).not.toBeInTheDocument();
    } finally {
      if (originalFetch) {
        Object.defineProperty(global, "fetch", {
          configurable: true,
          value: originalFetch,
        });
      } else {
        Reflect.deleteProperty(global, "fetch");
      }
    }
  });

  it("stops autosaving and final submission when the draft revision conflicts", async () => {
    jest.mocked(sdkFetch).mockImplementation((async (path: string) => {
      if (path === "/2pq/informed-consents/draft") {
        throw new SdkRequestError({
          status: 409,
          method: "PUT",
          path,
          message: "Draft revision conflict",
          details: "expected revision did not match",
        });
      }
      throw new Error(`Unexpected SDK path: ${path}`);
    }) as typeof sdkFetch);
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    await chooseDirectFlow(user);

    const draftStatus = await screen.findByTestId("consent-draft-save-status");
    expect(draftStatus).toHaveAttribute("role", "alert");
    expect(
      within(draftStatus).getByText(/El borrador cambió en otra sesión/),
    ).toBeVisible();
    expect(
      within(draftStatus).getByRole("link", {
        name: "Volver a consentimientos",
      }),
    ).toHaveAttribute("href", "/patient-portal/consents");
    expect(screen.getByText(/elegí “Continuar desde borrador”/i)).toBeVisible();

    const sidebar = screen.getByTestId("consent-wizard-sidebar");
    await user.click(
      within(sidebar).getByRole("button", {
        name: "Subir el escaneo firmado",
      }),
    );
    await user.upload(
      screen.getByLabelText("Consentimiento firmado"),
      new File(["signed"], "consent.pdf", { type: "application/pdf" }),
    );

    expect(
      screen.getByRole("button", { name: "Subir consentimiento" }),
    ).toBeDisabled();
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, options]) =>
            path === "/2pq/informed-consents/draft" &&
            options?.method === "PUT",
        ),
    ).toHaveLength(1);
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.some(
          ([path, options]) =>
            path === "/2pq/informed-consents" && options?.method === "POST",
        ),
    ).toBe(false);
  });

  it("keeps a failed non-conflicting draft pending for a bounded lifecycle retry", async () => {
    let draftCallCount = 0;
    jest.mocked(sdkFetch).mockImplementation(((
      path: string,
      options?: RequestInit,
    ) => {
      if (
        path === "/2pq/informed-consents/draft" &&
        options?.method === "PUT"
      ) {
        draftCallCount += 1;
        return draftCallCount === 1
          ? Promise.reject(new Error("temporary draft outage"))
          : Promise.resolve({ draft: { revision: 1 } });
      }
      return Promise.reject(new Error("Unexpected SDK path: " + path));
    }) as typeof sdkFetch);
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    await chooseDirectFlow(user);
    const draftStatus = await screen.findByTestId("consent-draft-save-status");
    await waitFor(() =>
      expect(draftStatus).toHaveTextContent("No se pudo guardar el borrador"),
    );
    expect(draftCallCount).toBe(1);
    const firstDraftBody = jest
      .mocked(sdkFetch)
      .mock.calls.find(
        ([path, options]) =>
          path === "/2pq/informed-consents/draft" && options?.method === "PUT",
      )?.[1]?.body;

    act(() => window.dispatchEvent(new Event("pagehide")));

    await waitFor(() => expect(draftCallCount).toBe(2));
    const draftCalls = jest
      .mocked(sdkFetch)
      .mock.calls.filter(
        ([path, options]) =>
          path === "/2pq/informed-consents/draft" && options?.method === "PUT",
      );
    expect(draftCalls[1]?.[1]?.body).toBe(firstDraftBody);
    await waitFor(() =>
      expect(draftStatus).toHaveTextContent(
        "Borrador guardado automáticamente",
      ),
    );
  });

  it("locks all wizard navigation while the final submission is in flight", async () => {
    let draftCallCount = 0;
    let resolvePendingDraft: (() => void) | undefined;
    let resolvePendingPost: (() => void) | undefined;
    const pendingDraft = new Promise<void>((resolve) => {
      resolvePendingDraft = resolve;
    });
    const pendingPost = new Promise<void>((resolve) => {
      resolvePendingPost = resolve;
    });
    jest.mocked(sdkFetch).mockImplementation(((
      path: string,
      options?: RequestInit,
    ) => {
      if (
        path === "/2pq/informed-consents/draft" &&
        options?.method === "PUT"
      ) {
        draftCallCount += 1;
        const response = { draft: { revision: draftCallCount } };
        return draftCallCount === 3
          ? pendingDraft.then(() => response)
          : Promise.resolve(response);
      }
      if (path === "/2pq/informed-consents" && options?.method === "POST") {
        return pendingPost.then(() => ({
          record: { id: "CONSENT-LOCKED-SUBMISSION" },
        }));
      }
      return Promise.reject(new Error(`Unexpected SDK path: ${path}`));
    }) as typeof sdkFetch);
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    await chooseDirectFlow(user);
    await waitFor(() => expect(draftCallCount).toBe(1));
    const sidebar = screen.getByTestId("consent-wizard-sidebar");
    await user.click(
      within(sidebar).getByRole("button", { name: "Imprimir y firmar" }),
    );
    await waitFor(() => expect(draftCallCount).toBe(2));
    await user.click(
      within(sidebar).getByRole("button", {
        name: "Subir el escaneo firmado",
      }),
    );
    await user.upload(
      screen.getByLabelText("Consentimiento firmado"),
      new File(["signed"], "consent.pdf", { type: "application/pdf" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Subir consentimiento" }),
    );
    await waitFor(() => expect(draftCallCount).toBe(3));

    expect(screen.getByTestId("consent-final-submit-lock")).toBeVisible();
    expect(screen.getByTestId("consent-wizard-interactions")).toHaveAttribute(
      "inert",
    );
    expect(
      within(sidebar).getByRole("button", { name: "Imprimir y firmar" }),
    ).toBeDisabled();
    await act(async () => {
      resolvePendingDraft?.();
      await pendingDraft;
    });

    await waitFor(() =>
      expect(
        jest
          .mocked(sdkFetch)
          .mock.calls.some(
            ([path, options]) =>
              path === "/2pq/informed-consents" && options?.method === "POST",
          ),
      ).toBe(true),
    );
    expect(
      within(sidebar).getByRole("button", { name: "Imprimir y firmar" }),
    ).toBeDisabled();

    await act(async () => {
      resolvePendingPost?.();
      await pendingPost;
    });
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith("/patient-portal/consents"),
    );
    expect(screen.queryByTestId("consent-final-submit-lock")).toBeNull();
  });

  it.each(["pagehide", "visibilitychange"] as const)(
    "flushes the pending draft on %s without storing it locally",
    async (lifecycleEvent) => {
      const visibilitySpy =
        lifecycleEvent === "visibilitychange"
          ? jest
              .spyOn(document, "visibilityState", "get")
              .mockReturnValue("hidden")
          : null;
      mockPatientPortalSdk();
      const user = userEvent.setup();
      try {
        render(
          <PatientConsentUploadWizard initialPatientName="Ada Paciente" />,
        );

        await chooseGuidedFlow(user);
        await waitFor(() => {
          expect(
            jest
              .mocked(sdkFetch)
              .mock.calls.filter(
                ([path, options]) =>
                  path === "/2pq/informed-consents/draft" &&
                  options?.method === "PUT",
              ),
          ).toHaveLength(1);
        });
        const sidebar = screen.getByTestId("consent-wizard-sidebar");
        await user.click(
          within(sidebar).getByRole("button", {
            name: "Datos de quienes firman",
          }),
        );
        await waitFor(() => {
          expect(
            jest
              .mocked(sdkFetch)
              .mock.calls.filter(
                ([path, options]) =>
                  path === "/2pq/informed-consents/draft" &&
                  options?.method === "PUT",
              ),
          ).toHaveLength(2);
        });

        fireEvent.change(
          screen.getByRole("textbox", { name: "Documento del paciente" }),
          { target: { value: "31.234.567" } },
        );
        act(() => {
          const target = lifecycleEvent === "pagehide" ? window : document;
          target.dispatchEvent(new Event(lifecycleEvent));
        });

        await waitFor(() => {
          const draftCalls = jest
            .mocked(sdkFetch)
            .mock.calls.filter(
              ([path, options]) =>
                path === "/2pq/informed-consents/draft" &&
                options?.method === "PUT",
            );
          expect(draftCalls).toHaveLength(3);
          expect(
            JSON.parse(String(draftCalls.at(-1)?.[1]?.body)),
          ).toMatchObject({
            patientDocument: "31.234.567",
          });
        });
        expect(window.localStorage).toHaveLength(0);
      } finally {
        visibilitySpy?.mockRestore();
      }
    },
  );

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

      expect(
        screen.queryByLabelText("Área para dibujar la firma del paciente"),
      ).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: /Dibujar una firma nueva/ }),
      );
      expect(
        screen.getByRole("group", { name: "Dibujar firma del paciente" }),
      ).toHaveFocus();
      expect(
        screen.queryByRole("button", { name: /Importar una imagen/ }),
      ).not.toBeInTheDocument();

      const canvas = screen.getByLabelText(
        "Área para dibujar la firma del paciente",
      );
      const saveSignature = screen.getByRole("button", {
        name: "Guardar firma y continuar",
      });
      expect(saveSignature).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "Continuar al editor" }),
      ).not.toBeInTheDocument();
      fireEvent.pointerDown(canvas, {
        pointerId: 1,
        clientX: 10,
        clientY: 10,
      });
      expect(saveSignature).toBeDisabled();
      fireEvent.pointerMove(canvas, {
        pointerId: 1,
        clientX: 20,
        clientY: 20,
      });
      expect(saveSignature).toBeEnabled();
      await user.click(saveSignature);

      expect(
        screen.getByRole("heading", { name: "Aplicar firmas al PDF" }),
      ).toBeVisible();
      await waitFor(() => {
        const editorDrafts = jest
          .mocked(sdkFetch)
          .mock.calls.filter(
            ([path, options]) =>
              path === "/2pq/informed-consents/draft" &&
              options?.method === "PUT",
          )
          .map(([, options]) => JSON.parse(String(options?.body)))
          .filter((draft) => draft.activeStepId === "editor");
        expect(editorDrafts.length).toBeGreaterThan(0);
        for (const draft of editorDrafts) {
          expect(draft).toEqual(
            expect.objectContaining({
              patientSignatureDataUrl: expect.stringMatching(
                /^data:image\/png;base64,/,
              ),
              patientSignatureMethod: "draw",
            }),
          );
        }
      });
      expect(
        screen.getByText(/arrástrela directamente hasta su ubicación/),
      ).toBeVisible();
      expect(
        screen.queryByText("Última página · Página 2 de 2"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Firma del paciente" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("group", {
          name: "Seleccionar firma para ubicar",
        }),
      ).not.toBeInTheDocument();
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
      expectNoGuidedTransitionMessages();
      await user.click(
        screen.getByRole("button", { name: "Continuar con los datos" }),
      );
      expectNoGuidedTransitionMessages();
      await user.type(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
        "31.234.567",
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );
      await user.click(
        screen.getByRole("button", {
          name: /Importar una imagen/,
        }),
      );

      expect(
        screen.getByRole("dialog", { name: "Importar firma del paciente" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /Dibujar una firma nueva/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Área para dibujar la firma del paciente"),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /Dibujar una firma nueva/ }),
        ).toHaveFocus(),
      );
      await user.click(
        screen.getByRole("button", { name: /Importar una imagen/ }),
      );

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
      expect(
        screen.getByAltText("Vista previa de la firma del paciente"),
      ).toHaveAttribute("src", TRANSPARENT_SIGNATURE_DATA_URL);
      expect(
        screen.getByText(
          "La imagen importada quedó preparada y lista para aplicarse al consentimiento.",
        ),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Cambiar método" }),
      ).toBeVisible();
      expect(
        screen.queryByLabelText("Área para dibujar la firma del paciente"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Importar una imagen/ }),
      ).not.toBeInTheDocument();

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

  it("offers a valid saved signature, locks the completed preview, and caches the portal lookup", async () => {
    jest.mocked(sdkFetch).mockResolvedValue({
      savedSignature: TRANSPARENT_SIGNATURE_DATA_URL,
    });
    const user = userEvent.setup();
    render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

    await openPortalSignatureStep(user);

    expect(sdkFetch).toHaveBeenCalledWith(
      "/2pq/informed-consents/saved-signature",
    );
    const savedSignatureOption = await screen.findByRole("button", {
      name: /Reutilizar firma guardada/,
    });
    expect(savedSignatureOption).toBeVisible();
    expect(savedSignatureOption.querySelector("img")).toHaveAttribute(
      "src",
      TRANSPARENT_SIGNATURE_DATA_URL,
    );
    expect(
      screen.getByRole("button", { name: /Dibujar una firma nueva/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Importar una imagen/ }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("Área para dibujar la firma del paciente"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Reutilizar firma guardada/ }),
    );

    expect(
      screen.getByAltText("Vista previa de la firma del paciente"),
    ).toHaveAttribute("src", TRANSPARENT_SIGNATURE_DATA_URL);
    expect(screen.getByLabelText("Firma del paciente lista")).toHaveFocus();
    expect(
      screen.getByText(
        "La firma guardada del paciente está lista para reutilizarse en este consentimiento.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Dibujar una firma nueva/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Importar una imagen/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continuar al editor" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Cambiar método" }));
    expect(
      screen.queryByAltText("Vista previa de la firma del paciente"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Dibujar una firma nueva/ }),
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Volver" }));
    await user.click(
      screen.getByRole("button", { name: "Continuar para firmar" }),
    );
    expect(
      await screen.findByRole("button", {
        name: /Reutilizar firma guardada/,
      }),
    ).toBeVisible();
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path]) => path === "/2pq/informed-consents/saved-signature",
        ),
    ).toHaveLength(1);
  });

  it.each([
    ["null", { savedSignature: null }, false],
    ["failed", null, true],
  ])(
    "keeps saved-signature UI absent for a %s lookup and does not retry on back navigation",
    async (_, payload, shouldReject) => {
      if (shouldReject) {
        jest.mocked(sdkFetch).mockRejectedValueOnce(new Error("unavailable"));
      } else {
        jest.mocked(sdkFetch).mockResolvedValueOnce(payload);
      }
      const user = userEvent.setup();
      render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

      await openPortalSignatureStep(user);

      await waitFor(() =>
        expect(sdkFetch).toHaveBeenCalledWith(
          "/2pq/informed-consents/saved-signature",
        ),
      );
      expect(
        screen.getByRole("button", { name: /Dibujar una firma nueva/ }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: /Importar una imagen/ }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", {
          name: /Reutilizar firma guardada/,
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/firma guardada/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Volver" }));
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );
      expect(
        jest
          .mocked(sdkFetch)
          .mock.calls.filter(
            ([path]) => path === "/2pq/informed-consents/saved-signature",
          ),
      ).toHaveLength(1);
    },
  );

  it("caches each backoffice lookup and ignores a late saved signature after switching patients", async () => {
    let resolveAdaSavedSignature!: (value: {
      savedSignature: string | null;
    }) => void;
    const adaSavedSignature = new Promise<{
      savedSignature: string | null;
    }>((resolve) => {
      resolveAdaSavedSignature = resolve;
    });
    const adaCase = {
      id: "CASE-ADA",
      institutionId: "INST-00001",
      doctorId: "DOC-00001",
      patientId: "PAT-ADA",
      patientName: "Ada Paciente",
      caseLabel: "Caso Ada",
      informedConsentId: null,
      createdAt: "2026-10-16T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
    };
    const beaCase = {
      ...adaCase,
      id: "CASE-BEA",
      patientId: "PAT-BEA",
      patientName: "Bea Paciente",
      caseLabel: "Caso Bea",
    };
    jest.mocked(sdkFetch).mockImplementation(((path: string) => {
      if (path === "/2pq/informed-consents/cases?patientId=PAT-ADA") {
        return Promise.resolve({ cases: [adaCase] });
      }
      if (path === "/2pq/informed-consents/saved-signature?patientId=PAT-ADA") {
        return adaSavedSignature;
      }
      if (path === "/2pq/informed-consents/cases?patientId=PAT-BEA") {
        return Promise.resolve({ cases: [beaCase] });
      }
      if (path === "/2pq/informed-consents/saved-signature?patientId=PAT-BEA") {
        return Promise.resolve({ savedSignature: null });
      }
      return Promise.reject(new Error(`Unexpected SDK path: ${path}`));
    }) as typeof sdkFetch);
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
    await user.click(await screen.findByRole("combobox", { name: "Caso 2PQ" }));
    await user.click(
      screen.getByRole("option", { name: "Caso Ada - CASE-ADA" }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
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

    const adaSavedPath =
      "/2pq/informed-consents/saved-signature?patientId=PAT-ADA";
    await waitFor(() => expect(sdkFetch).toHaveBeenCalledWith(adaSavedPath));
    expect(
      screen.queryByRole("button", {
        name: /Reutilizar firma guardada/,
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Volver" }));
    await user.click(
      screen.getByRole("button", { name: "Continuar para firmar" }),
    );
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(([path]) => path === adaSavedPath),
    ).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Volver" }));
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await user.click(screen.getByRole("combobox", { name: "Paciente" }));
    await user.click(
      screen.getByRole("option", { name: "Bea Paciente - PAT-BEA" }),
    );
    await user.click(await screen.findByRole("combobox", { name: "Caso 2PQ" }));
    await user.click(
      screen.getByRole("option", { name: "Caso Bea - CASE-BEA" }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(
      screen.getByRole("button", { name: "Continuar con los datos" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Documento del paciente" }),
      "32.345.678",
    );
    await user.click(
      screen.getByRole("button", { name: "Continuar para firmar" }),
    );

    const beaSavedPath =
      "/2pq/informed-consents/saved-signature?patientId=PAT-BEA";
    await waitFor(() => expect(sdkFetch).toHaveBeenCalledWith(beaSavedPath));
    await act(async () => {
      resolveAdaSavedSignature({
        savedSignature: TRANSPARENT_SIGNATURE_DATA_URL,
      });
      await adaSavedSignature;
      await Promise.resolve();
    });
    expect(
      jest
        .mocked(sdkFetch)
        .mock.calls.filter(([path]) => path === beaSavedPath),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", {
        name: /Reutilizar firma guardada/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Dibujar una firma nueva/ }),
    ).toBeVisible();
  });

  it("never offers saved-signature reuse to the partner and clears partner identity changes", async () => {
    const context = {
      beginPath: jest.fn(),
      clearRect: jest.fn(),
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
    const setPointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "setPointerCapture",
    );
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    jest.mocked(sdkFetch).mockResolvedValue({
      savedSignature: TRANSPARENT_SIGNATURE_DATA_URL,
    });

    try {
      const user = userEvent.setup();
      render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);
      await openPortalSignatureStep(user, "Alex Pareja");

      const patientSection = signatureSection("Firma del paciente");
      const partnerSection = signatureSection("Firma de la pareja");
      expect(
        await within(patientSection).findByRole("button", {
          name: /Reutilizar firma guardada/,
        }),
      ).toBeVisible();
      expect(
        within(partnerSection).queryByRole("button", {
          name: /Reutilizar firma guardada/,
        }),
      ).not.toBeInTheDocument();
      expect(
        within(partnerSection).queryByRole("button", {
          name: /Dibujar una firma nueva/,
        }),
      ).not.toBeInTheDocument();

      await user.click(
        within(patientSection).getByRole("button", {
          name: /Reutilizar firma guardada/,
        }),
      );
      await user.click(
        within(partnerSection).getByRole("button", {
          name: /Dibujar una firma nueva/,
        }),
      );
      fireEvent.pointerDown(
        within(partnerSection).getByLabelText(
          "Área para dibujar la firma de la pareja",
        ),
        { pointerId: 1, clientX: 10, clientY: 10 },
      );
      fireEvent.pointerMove(
        within(partnerSection).getByLabelText(
          "Área para dibujar la firma de la pareja",
        ),
        { pointerId: 1, clientX: 20, clientY: 20 },
      );
      await user.click(
        within(partnerSection).getByRole("button", {
          name: "Guardar firma y continuar",
        }),
      );
      expect(
        screen.getByRole("heading", { name: "Aplicar firmas al PDF" }),
      ).toBeVisible();
      const signerSelector = screen.getByRole("group", {
        name: "Seleccionar firma para ubicar",
      });
      expect(
        within(signerSelector).getByRole("button", {
          name: "Firma del paciente",
        }),
      ).toBeVisible();
      expect(
        within(signerSelector).getByRole("button", {
          name: "Firma de la pareja",
        }),
      ).toBeVisible();
      expect(
        screen.queryByText("Última página · Página 2 de 2"),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Volver" }));
      await user.click(screen.getByRole("button", { name: "Volver" }));
      const partnerName = screen.getByRole("textbox", {
        name: "Nombre y apellido de la pareja",
      });
      await user.clear(partnerName);
      await user.type(partnerName, "Bea Pareja");
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );
      expect(
        within(signatureSection("Firma de la pareja")).queryByAltText(
          "Vista previa de la firma de la pareja",
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Continuar al editor" }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Volver" }));
      await user.click(
        screen.getByRole("checkbox", {
          name: "El consentimiento también será firmado por la pareja",
        }),
      );
      await user.click(
        screen.getByRole("checkbox", {
          name: "El consentimiento también será firmado por la pareja",
        }),
      );
      expect(
        screen.getByRole("textbox", {
          name: "Nombre y apellido de la pareja",
        }),
      ).toHaveValue("");
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
      screen.queryByLabelText("Área para dibujar la firma del paciente"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Área para dibujar la firma de la pareja"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Dibujar una firma nueva/ }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: /Importar una imagen/ }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", {
        name: /Reutilizar firma guardada/,
      }),
    ).not.toBeInTheDocument();
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
    mockPatientPortalSdk({ uploadedConsentId: "CONSENT-PATIENT" });
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
      screen.getByText(
        /antes de avanzar con la firma, el paciente debe leer este consentimiento informado con detenimiento/i,
      ),
    ).toBeVisible();
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
      expectedDraftRevision: expect.any(Number),
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
      .mockResolvedValueOnce({ savedSignature: null })
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
      .mockResolvedValueOnce({ savedSignature: null })
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

      const patientSignatureSection = screen
        .getByRole("heading", { name: "Firma del paciente" })
        .closest("section");
      const partnerSignatureSection = screen
        .getByRole("heading", { name: "Firma de la pareja" })
        .closest("section");
      expect(patientSignatureSection).toBeInstanceOf(HTMLElement);
      expect(partnerSignatureSection).toBeInstanceOf(HTMLElement);
      await user.click(
        within(patientSignatureSection as HTMLElement).getByRole("button", {
          name: /Dibujar una firma nueva/,
        }),
      );
      fireEvent.pointerDown(
        screen.getByLabelText("Área para dibujar la firma del paciente"),
        { pointerId: 1, clientX: 10, clientY: 10 },
      );
      fireEvent.pointerMove(
        screen.getByLabelText("Área para dibujar la firma del paciente"),
        { pointerId: 1, clientX: 20, clientY: 20 },
      );
      await user.click(
        screen.getByRole("button", { name: "Guardar firma y continuar" }),
      );
      const partnerDrawMethod = within(
        partnerSignatureSection as HTMLElement,
      ).getByRole("button", {
        name: /Dibujar una firma nueva/,
      });
      await waitFor(() => expect(partnerDrawMethod).toHaveFocus());
      await user.click(partnerDrawMethod);
      fireEvent.pointerDown(
        screen.getByLabelText("Área para dibujar la firma de la pareja"),
        { pointerId: 2, clientX: 10, clientY: 10 },
      );
      fireEvent.pointerMove(
        screen.getByLabelText("Área para dibujar la firma de la pareja"),
        { pointerId: 2, clientX: 20, clientY: 20 },
      );
      await user.click(
        screen.getByRole("button", { name: "Guardar firma y continuar" }),
      );
      expect(
        screen.getByRole("heading", { name: "Aplicar firmas al PDF" }),
      ).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Volver" }));
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
      expect(screen.queryByText("Firma lista")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Continuar al editor" }),
      ).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: /Dibujar una firma nueva/ }),
      );
      fireEvent.pointerDown(
        screen.getByLabelText("Área para dibujar la firma del paciente"),
        { pointerId: 3, clientX: 10, clientY: 10 },
      );
      fireEvent.pointerMove(
        screen.getByLabelText("Área para dibujar la firma del paciente"),
        { pointerId: 3, clientX: 20, clientY: 20 },
      );
      await user.click(
        screen.getByRole("button", { name: "Guardar firma y continuar" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Aplicar firmas y continuar" }),
      );
      expect(
        screen.getByText((_, element) =>
          Boolean(
            element?.tagName === "P" &&
            element.textContent?.includes(
              "Entregue el control de este dispositivo a Bea Paciente",
            ),
          ),
        ),
      ).toBeVisible();
      const legalAttestation = await screen.findByRole("checkbox", {
        name: /Declaro, bajo mi responsabilidad, que soy la persona/,
      });
      expect(legalAttestation).toHaveAttribute("aria-required", "true");
      expect(
        screen.getByRole("button", {
          name: "Acepto la realización de este estudio",
        }),
      ).toBeDisabled();
      await user.click(legalAttestation);
      await user.click(
        screen.getByRole("button", {
          name: "Acepto la realización de este estudio",
        }),
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
        signatureAttestationAccepted: true,
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

    expect(
      screen.queryByTestId("guided-signing-security-banner"),
    ).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole("checkbox", {
        name: /Declaro, bajo mi responsabilidad, que soy la persona/,
      }),
    ).not.toBeInTheDocument();

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

  it("requires the legal attestation and celebrates before navigating after a guided upload", async () => {
    const originalFetch = global.fetch;
    const fetchTemplate = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer,
    }));
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: fetchTemplate,
    });
    jest
      .mocked(applySignaturesToConsentPdf)
      .mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    mockPatientPortalSdk({
      savedSignature: TRANSPARENT_SIGNATURE_DATA_URL,
      uploadedConsentId: "CONSENT-GUIDED",
    });

    try {
      const user = userEvent.setup();
      render(<PatientConsentUploadWizard initialPatientName="Ada Paciente" />);

      await chooseGuidedFlow(user);
      expectNoGuidedTransitionMessages();
      await user.click(
        screen.getByRole("button", { name: "Continuar con los datos" }),
      );
      expectNoGuidedTransitionMessages();
      await user.type(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
        "31.234.567",
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );
      expectNoGuidedTransitionMessages();
      await user.click(
        await screen.findByRole("button", {
          name: /Reutilizar firma guardada/,
        }),
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar al editor" }),
      );
      expectNoGuidedTransitionMessages();
      await user.click(
        screen.getByRole("button", { name: "Aplicar firmas y continuar" }),
      );

      const legalAttestation = await screen.findByRole("checkbox", {
        name: /Declaro, bajo mi responsabilidad, que soy la persona/,
      });
      expectNoGuidedTransitionMessages();
      const finalAcceptance = screen.getByRole("button", {
        name: "Acepto la realización de este estudio",
      });
      expect(legalAttestation).not.toBeChecked();
      expect(legalAttestation).toHaveAttribute("aria-required", "true");
      expect(finalAcceptance).toBeDisabled();
      expect(
        screen.getByText(
          "Marque la declaración para habilitar el envío final.",
        ),
      ).toBeVisible();

      await user.click(legalAttestation);
      expect(finalAcceptance).toBeEnabled();

      await user.click(screen.getByRole("button", { name: "Volver" }));
      await user.click(screen.getByRole("button", { name: "Volver" }));
      await user.click(screen.getByRole("button", { name: "Volver" }));
      await user.type(
        screen.getByRole("textbox", { name: "Documento del paciente" }),
        "9",
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar para firmar" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar al editor" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Aplicar firmas y continuar" }),
      );

      const resetLegalAttestation = await screen.findByRole("checkbox", {
        name: /Declaro, bajo mi responsabilidad, que soy la persona/,
      });
      expect(resetLegalAttestation).not.toBeChecked();
      await user.click(resetLegalAttestation);
      const resetFinalAcceptance = screen.getByRole("button", {
        name: "Acepto la realización de este estudio",
      });
      act(() => {
        resetFinalAcceptance.click();
        resetFinalAcceptance.click();
      });

      await waitFor(() =>
        expect(sdkFetch).toHaveBeenCalledWith(
          "/2pq/informed-consents",
          expect.objectContaining({ method: "POST", body: expect.any(String) }),
        ),
      );
      expect(
        jest
          .mocked(sdkFetch)
          .mock.calls.filter(
            ([path, options]) =>
              path === "/2pq/informed-consents" && options?.method === "POST",
          ),
      ).toHaveLength(1);
      const uploadCall = jest
        .mocked(sdkFetch)
        .mock.calls.find(([path]) => path === "/2pq/informed-consents");
      const uploadBody = JSON.parse(String(uploadCall?.[1]?.body));
      const savedDraftCount = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, options]) =>
            path === "/2pq/informed-consents/draft" &&
            options?.method === "PUT",
        ).length;
      expect(uploadBody).toMatchObject({
        flowMode: "guided",
        savedSignature: TRANSPARENT_SIGNATURE_DATA_URL,
        signatureAttestationAccepted: true,
        expectedDraftRevision: savedDraftCount,
        file: { type: "application/pdf" },
      });
      expect(String(uploadCall?.[1]?.body)).not.toContain("partnerSignature");
      expect(
        await screen.findByRole("heading", {
          name: "Consentimiento firmado y enviado",
        }),
      ).toBeVisible();
      expect(
        screen.getByText(
          /El documento se cerró y quedó almacenado correctamente/,
        ),
      ).toBeVisible();
      expect(mockRouterPush).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Continuar" }));
      expect(mockRouterPush).toHaveBeenCalledWith("/patient-portal/consents");
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    } finally {
      if (originalFetch) {
        Object.defineProperty(global, "fetch", {
          configurable: true,
          value: originalFetch,
        });
      } else {
        Reflect.deleteProperty(global, "fetch");
      }
    }
  });

  it("keeps the guided review open and reports an upload error", async () => {
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
    mockPatientPortalSdk({
      savedSignature: TRANSPARENT_SIGNATURE_DATA_URL,
      uploadError: new Error("upload failed"),
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
      await user.click(
        await screen.findByRole("button", {
          name: /Reutilizar firma guardada/,
        }),
      );
      await user.click(
        screen.getByRole("button", { name: "Continuar al editor" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Aplicar firmas y continuar" }),
      );
      await user.click(
        await screen.findByRole("checkbox", {
          name: /Declaro, bajo mi responsabilidad, que soy la persona/,
        }),
      );
      await waitFor(() =>
        expect(
          screen.getByTestId("consent-draft-save-status"),
        ).toHaveTextContent("Borrador guardado automáticamente"),
      );
      const draftSavesBeforeUpload = jest
        .mocked(sdkFetch)
        .mock.calls.filter(
          ([path, options]) =>
            path === "/2pq/informed-consents/draft" &&
            options?.method === "PUT",
        ).length;
      await user.click(
        screen.getByRole("button", {
          name: "Acepto la realización de este estudio",
        }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No se pudo subir el consentimiento.",
      );
      expect(
        screen.getByRole("button", {
          name: "Acepto la realización de este estudio",
        }),
      ).toBeEnabled();
      expect(
        screen.queryByRole("heading", {
          name: "Consentimiento firmado y enviado",
        }),
      ).not.toBeInTheDocument();
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(mockRouterRefresh).not.toHaveBeenCalled();
      await waitFor(() => {
        const draftCalls = jest
          .mocked(sdkFetch)
          .mock.calls.filter(
            ([path, options]) =>
              path === "/2pq/informed-consents/draft" &&
              options?.method === "PUT",
          );
        expect(draftCalls).toHaveLength(draftSavesBeforeUpload + 1);
        expect(JSON.parse(String(draftCalls.at(-1)?.[1]?.body))).toMatchObject({
          activeStepId: "preview",
        });
      });
    } finally {
      if (originalFetch) {
        Object.defineProperty(global, "fetch", {
          configurable: true,
          value: originalFetch,
        });
      } else {
        Reflect.deleteProperty(global, "fetch");
      }
    }
  });
});
