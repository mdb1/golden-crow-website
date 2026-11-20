/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PublisherSupportBookingNew } from "@/components/publisher-support-booking-new";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

const identity = {
  uid: "publisher-1",
  email: "publisher@example.com",
  project: "mydnamap",
  surface: "publisher-portal" as const,
};

function availableTimes(path: string, times: string[]) {
  const month = new URL(path, "https://sdk.example").searchParams.get("month");
  return { month, slotsByDate: { [`${month}-20`]: times } };
}

async function openBookingDetails() {
  const user = userEvent.setup();
  render(
    <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
      <QueryClientProvider client={new QueryClient()}>
        <PublisherSupportBookingNew identity={identity} />
      </QueryClientProvider>
    </AppLanguageProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "09:00" }));
  await user.click(screen.getByRole("combobox", { name: "Motivo" }));
  await user.click(await screen.findByRole("option", { name: "Facturación" }));
  return user;
}

beforeEach(() => jest.mocked(sdkFetch).mockReset());

it("confirms the signed-in publisher's booking after selecting a reason", async () => {
  jest.mocked(sdkFetch).mockImplementation(async (path) => (
    path.startsWith("/client-bookings/availability")
      ? availableTimes(path, ["09:00", "09:30"])
      : { status: "ok", bookingId: "booking-1" }
  ));
  const user = await openBookingDetails();

  expect(screen.getByRole("textbox", { name: "Correo de confirmación" })).toHaveValue(identity.email);
  await user.click(screen.getByRole("button", { name: "Solicitar reunión" }));

  expect(await screen.findByRole("dialog", { name: "¡Gracias por reservar!" })).toBeVisible();
  const request = jest.mocked(sdkFetch).mock.calls.find(([path]) => path === "/admin/publisher-support-bookings")?.[1];
  expect(request?.headers).toMatchObject({ "x-expected-session-uid": identity.uid });
  expect(JSON.parse(String(request?.body))).toEqual({
    date: expect.stringMatching(/^\d{4}-\d{2}-20$/),
    startTime: "09:00",
    reason: "billing",
    locale: "es",
  });
});

it("returns to the calendar and reloads times when someone else reserved the slot", async () => {
  let times = ["09:00", "09:30"];
  jest.mocked(sdkFetch).mockImplementation(async (path) => {
    if (path.startsWith("/client-bookings/availability")) return availableTimes(path, times);
    times = ["09:30"];
    throw new SdkRequestError({
      status: 409,
      method: "POST",
      path,
      message: "This slot is unavailable.",
      details: "",
    });
  });
  const user = await openBookingDetails();
  await user.click(screen.getByRole("button", { name: "Solicitar reunión" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Ese horario ya no está disponible.");
  expect(await screen.findByRole("button", { name: "09:30" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
