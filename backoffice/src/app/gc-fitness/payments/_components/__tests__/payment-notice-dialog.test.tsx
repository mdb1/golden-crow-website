/**
 * @jest-environment jsdom
 */

// payment-notice-dialog.test.tsx — gc-fitness #1697. «Aviso de pago»: la tarjeta lleva los
// datos del cliente y del coach, el texto lleva los datos de cobro, y «Enviar por el chat»
// escribe un mensaje kind=image con el path PELADO del adjunto, ancho/alto y el texto.

import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

import type { ClientBillingView } from "@/lib/gc-fitness/payments-model";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
  useLocale: () => "es",
}));
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToast.success(...a),
    error: (...a: unknown[]) => mockToast.error(...a),
  },
}));
const mockRasterize = jest.fn();
jest.mock("@/components/gc-fitness/share-workout-card", () => ({
  ...jest.requireActual("@/components/gc-fitness/share-workout-card"),
  rasterizeShareCardNode: (...args: unknown[]) => mockRasterize(...args),
}));
const mockUpload = jest.fn();
const mockSend = jest.fn();
jest.mock("@/lib/gc-fitness/chat-server-actions", () => ({
  uploadTrainerChatAttachment: (...a: unknown[]) => mockUpload(...a),
  sendTrainerMessage: (...a: unknown[]) => mockSend(...a),
}));

import { PaymentNoticeDialog } from "../PaymentNoticeDialog";

const billing = {
  clientId: "client-1",
  planId: "p1",
  plan: { name: "Mensual online", amount: 25000, currency: "ARS", kind: "monthly" },
  amount: null,
  nextDueCivil: "2026-11-16",
} as unknown as ClientBillingView;

function ui(paymentDetails: string | null, b: ClientBillingView = billing) {
  return (
    <PaymentNoticeDialog
      clientId="client-1"
      clientName="Ana Pérez"
      clientFirstName="Ana"
      coachName="Caro"
      billing={b}
      paymentDetails={paymentDetails}
      open
      onOpenChange={() => {}}
    />
  );
}

const nbsp = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ");

beforeEach(() => {
  jest.clearAllMocks();
  mockRasterize.mockImplementation(async (_n: unknown, format: string) => ({
    dataUrl: format === "jpeg" ? "data:image/jpeg;base64,QUJD" : "data:image/png;base64,UE5H",
    width: 1080,
    height: 1350,
  }));
  mockUpload.mockResolvedValue({ storagePath: "images/client-1/m1.jpg" });
  mockSend.mockResolvedValue({ id: "m1" });
});

describe("PaymentNoticeDialog", () => {
  it("draws client, coach, plan, amount, due date and the payment details on the card", async () => {
    render(ui("Alias: caro.fit\nBanco Galicia"));
    const card = screen.getByTestId("payment-notice-card");
    expect(card).toHaveTextContent("Ana Pérez");
    expect(card).toHaveTextContent("noticeCoach:Caro");
    expect(card).toHaveTextContent("Mensual online");
    expect(nbsp(card.textContent)).toContain("$ 25.000");
    expect(card).toHaveTextContent("16 de noviembre de 2026");
    expect(screen.getByTestId("payment-notice-details")).toHaveTextContent("Alias: caro.fit");
    expect(screen.queryByTestId("payment-notice-no-details")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("payment-notice-preview")).toBeInTheDocument());
  });

  it("the text carries the payment details, and WhatsApp opens it", () => {
    render(ui("Alias: caro.fit"));
    const text = nbsp(screen.getByTestId("payment-notice-text").textContent);
    expect(text).toBe(
      "Hola Ana! Te recuerdo el pago de $ 25.000 que vence el 16 de noviembre.\n\nDatos para el pago:\nAlias: caro.fit\n\n¡Gracias! — Caro",
    );
    const href = screen.getByTestId("payment-notice-whatsapp").getAttribute("href") ?? "";
    expect(decodeURIComponent(href.replace("https://wa.me/?text=", ""))).toContain("Alias: caro.fit");
  });

  it("without details: hint shown, no details box, the plain reminder text", () => {
    render(ui(null));
    expect(screen.getByTestId("payment-notice-no-details")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-notice-details")).not.toBeInTheDocument();
    expect(nbsp(screen.getByTestId("payment-notice-text").textContent)).toBe(
      "Hola Ana! Te recuerdo el pago de $ 25.000 que vence el 16 de noviembre. ¡Gracias! — Caro",
    );
  });

  it("a class-based plan has no due date: «Pendiente»", () => {
    render(ui(null, { ...billing, plan: { ...billing.plan!, kind: "class_pack" } } as ClientBillingView));
    expect(screen.getByTestId("payment-notice-card")).toHaveTextContent("noticePending");
  });

  it("«Enviar por el chat» uploads a JPEG and writes an image message with the bare path + size + text", async () => {
    render(ui("Alias: caro.fit"));
    fireEvent.click(screen.getByTestId("payment-notice-send-chat"));
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "client-1", kind: "image", mimeType: "image/jpeg", base64Data: "QUJD" }),
    );
    const message = mockSend.mock.calls[0][0];
    expect(message).toMatchObject({
      chatId: "client-1",
      kind: "image",
      imagePath: "images/client-1/m1.jpg",
      imageWidth: 1080,
      imageHeight: 1350,
    });
    expect(message.text).toContain("Datos para el pago:\nAlias: caro.fit");
    expect(mockToast.success).toHaveBeenCalledWith("noticeSent");
  });

  it("a failed send shows the error and does not claim success", async () => {
    mockUpload.mockRejectedValue(new Error("Chat not found"));
    render(ui(null));
    fireEvent.click(screen.getByTestId("payment-notice-send-chat"));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("noticeSendFailed"));
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});
