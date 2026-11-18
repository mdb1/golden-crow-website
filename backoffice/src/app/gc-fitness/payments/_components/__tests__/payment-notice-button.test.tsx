/**
 * @jest-environment jsdom
 */

// payment-notice-button.test.tsx — gc-fitness #1697. The «Aviso de pago» of the roster and of
// Inicio's «Cobros» card: the click opens the dialog WITHOUT reaching the row (which navigates
// to the client), and the dialog gets the coach's name and «Datos de cobro» read on open.

import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

import type { ClientBillingView } from "@/lib/gc-fitness/payments-model";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
const mockCoachName = jest.fn();
jest.mock("@/lib/gc-fitness/payments-actions", () => ({
  getCoachDisplayName: () => mockCoachName(),
}));
const mockDetails = jest.fn();
jest.mock("@/lib/gc-fitness/payment-details-actions", () => ({
  getCoachPaymentDetails: () => mockDetails(),
}));
const dialogProps = jest.fn();
jest.mock("../PaymentNoticeDialog", () => ({
  PaymentNoticeDialog: (props: Record<string, unknown>) => {
    dialogProps(props);
    return props.open ? <div data-testid="notice-dialog" /> : null;
  },
}));

import { PaymentNoticeButton } from "../PaymentNoticeButton";

const billing = {
  clientId: "c1",
  planId: "p1",
  plan: { name: "Mensual online", amount: 25000, currency: "ARS", kind: "monthly" },
  amount: null,
  nextDueCivil: "2026-11-16",
} as unknown as ClientBillingView;

test("opens the notice without navigating the row, with the coach name and details", async () => {
  mockCoachName.mockResolvedValue("Caro");
  mockDetails.mockResolvedValue("Alias: caro.fit");
  const rowClick = jest.fn();
  render(
    <div onClick={rowClick}>
      <PaymentNoticeButton clientId="c1" clientName="Ana Pérez" billing={billing} />
    </div>,
  );
  expect(mockCoachName).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("payment-notice-c1"));
  expect(rowClick).not.toHaveBeenCalled();
  expect(screen.getByTestId("notice-dialog")).toBeInTheDocument();
  await waitFor(() =>
    expect(dialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        coachName: "Caro",
        clientFirstName: "Ana",
        paymentDetails: "Alias: caro.fit",
        detailsLoaded: true,
      }),
    ),
  );
});
