/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PublisherSupportBookingNewPage from "@/app/publisher-portal/(portal)/support-bookings/new/page";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { getPublisherSupportBookingIdentity } from "@/lib/publisher-support-bookings-server";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

jest.mock("@/lib/publisher-support-bookings-server", () => ({
  getPublisherSupportBookingIdentity: jest.fn(),
}));

const identity = {
  uid: "publisher-1",
  email: "publisher@example.com",
  project: "mydnamap" as const,
  surface: "publisher-portal" as const,
};

function availableTimes(path: string, times: string[]) {
  const month = new URL(path, "https://sdk.example").searchParams.get("month");
  return { month, slotsByDate: { [`${month}-20`]: times } };
}

async function renderBooking(query: Record<string, string | string[] | undefined> = {}, client = new QueryClient()) {
  const page = await PublisherSupportBookingNewPage({ searchParams: Promise.resolve(query) });
  render(
    <AppLanguageProvider initialLanguage="es" forcedLanguage="es">
      <QueryClientProvider client={client}>{page}</QueryClientProvider>
    </AppLanguageProvider>,
  );
}

async function openBookingDetails() {
  const user = userEvent.setup();
  await renderBooking();
  await user.click(await screen.findByRole("button", { name: "09:00" }));
  await user.click(screen.getByRole("combobox", { name: "Motivo" }));
  await user.click(await screen.findByRole("option", { name: "Facturación" }));
  return user;
}

beforeEach(() => {
  jest.mocked(sdkFetch).mockReset();
  jest.mocked(getPublisherSupportBookingIdentity).mockResolvedValue(identity);
});

const invitedSlot = { date: "2099-08-20", startTime: "09:30" };

it("opens an available invitation at confirmation and books its exact slot on one click", async () => {
  const user = userEvent.setup();
  jest.mocked(sdkFetch).mockImplementation(async (path) => (
    path.startsWith("/client-bookings/availability")
      ? availableTimes(path, ["09:00", "09:30"])
      : { status: "ok", bookingId: "booking-1" }
  ));
  await renderBooking(invitedSlot);

  const submit = await screen.findByRole("button", { name: "Solicitar reunión" });
  expect(submit).toBeEnabled();
  expect(screen.getByRole("combobox", { name: "Motivo" })).toHaveTextContent("Otro");
  expect(screen.getByText(/09:30 · 30 minutos/)).toBeVisible();
  expect(jest.mocked(sdkFetch).mock.calls.map(([path]) => path)).toEqual([
    "/client-bookings/availability?month=2099-08&context=pocket-genes-support",
  ]);

  await user.click(submit);
  const [, request] = jest.mocked(sdkFetch).mock.calls[1];
  expect(JSON.parse(String(request?.body))).toEqual({ ...invitedSlot, reason: "other", locale: "es" });
  expect(await screen.findByRole("dialog", { name: "¡Gracias por reservar!" })).toBeVisible();
});

it("rechecks a cached invitation and offers alternatives when the time is taken", async () => {
  const user = userEvent.setup();
  const client = new QueryClient();
  const path = "/client-bookings/availability?month=2099-08&context=pocket-genes-support";
  client.setQueryData(["support-booking-availability", "2099-08"], availableTimes(path, ["09:30"]));
  let finishFetch!: () => void;
  const pending = new Promise<void>((resolve) => { finishFetch = resolve; });
  jest.mocked(sdkFetch).mockImplementation(async () => {
    await pending;
    return availableTimes(path, ["09:00"]);
  });
  await renderBooking(invitedSlot, client);

  expect(screen.queryByRole("button", { name: "Solicitar reunión" })).not.toBeInTheDocument();
  finishFetch();
  expect(await screen.findByRole("alert")).toHaveTextContent("Ese horario ya no está disponible.");
  expect(screen.queryByRole("button", { name: "09:30" })).not.toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: "09:00" }));
  expect(screen.getByText(/09:00 · 30 minutos/)).toBeVisible();
  expect(jest.mocked(sdkFetch).mock.calls).toHaveLength(1);
});

it.each([
  { date: "2099-02-30", startTime: "09:00" },
  { date: invitedSlot.date, startTime: "29:99" },
  { date: [invitedSlot.date, invitedSlot.date], startTime: invitedSlot.startTime },
  { date: invitedSlot.date },
])("uses the regular calendar when the invitation is malformed (%j)", async (query) => {
  jest.mocked(sdkFetch).mockImplementation(async (path) => availableTimes(path, ["09:00"]));
  await renderBooking(query);
  expect(await screen.findByRole("button", { name: "09:00" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Solicitar reunión" })).not.toBeInTheDocument();
});

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
