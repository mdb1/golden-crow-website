/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PartnerContactHistory } from "../partner-contact-history";
import { PARTNERS_API_ROUTE } from "@/lib/connected-partners";
import {
  PARTNER_EMAIL_HISTORY_QUERY_KEY,
  type PartnerEmailHistoryRecord,
} from "@/lib/partner-email";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({ sdkFetch: jest.fn() }));
const endpoint = `${PARTNERS_API_ROUTE}/sent-email-log`;
const email: PartnerEmailHistoryRecord = {
  requestId: "e379b6a1-e325-4cc2-a31e-5d8a7e499f77",
  partnerId: "partner_one",
  partnerName: "Genome Studio",
  from: "federico@goldencrowvs.com",
  to: "ana@example.com",
  subject: "Una app para Genome Studio",
  language: "es",
  templateVariant: 3,
  category: "noOrganization",
  status: "sent",
  requestedByEmail: "god@example.com",
  createdAt: "2026-11-11T12:00:00.000Z",
  updatedAt: "2026-11-11T12:00:03.000Z",
  sentAt: "2026-11-11T12:00:03.000Z",
  messageAvailable: true,
  accessKeyOmitted: true,
};
function open(partnerId = email.partnerId, language: "en" | "es" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const component = (id: string) => (
    <AppLanguageProvider forcedLanguage={language}>
      <QueryClientProvider client={client}>
        <PartnerContactHistory key={id} partnerId={id} />
      </QueryClientProvider>
    </AppLanguageProvider>
  );
  const view = render(component(partnerId));
  return {
    ...view,
    client,
    selectPartner: (id: string) => view.rerender(component(id)),
  };
}
beforeEach(() => jest.resetAllMocks());

it.each([
  [1, "Recorrido del portal"],
  [6, "Preparar tu app para los stores"],
  [7, "Incorporar profesionales sin cargo"],
  [11, "Diseñar una clase interactiva"],
  [18, "Revisar un informe interactivo"],
] as const)("names invitation %s in contact history and the recorded message", async (templateVariant, label) => {
  const invitation = { ...email, purpose: "meetingInvitation", templateVariant };
  jest.mocked(sdkFetch)
    .mockResolvedValueOnce({ emails: [invitation], nextCursor: null })
    .mockResolvedValueOnce({ email: { ...invitation, messageText: "Invitación" } });
  open(email.partnerId, "es");
  const row = await screen.findByRole("listitem");
  expect(within(row).getByText(label)).toBeVisible();
  fireEvent.click(within(row).getByRole("button"));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(label)).toBeVisible();
  await within(dialog).findByText("Invitación");
});

it("shows compact subject/template/date summaries and loads the full saved body only in the selected email's modal", async () => {
  const body = `Hola Ana,\n\n${"Full paragraph of the saved email. ".repeat(180)}\n\nFinal line of the email.`;
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({
      emails: [{ ...email, messageText: body }],
      nextCursor: null,
    })
    .mockResolvedValueOnce({ email: { ...email, messageText: body } });
  open(email.partnerId, "es");
  const history = screen.getByRole("region", {
    name: "Historial de contactos",
  });
  await within(history).findByText(email.subject!);
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  expect(sdkFetch).toHaveBeenCalledWith(
    `${endpoint}?limit=20&partnerId=${email.partnerId}`,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  const row = within(history).getByRole("listitem");
  expect(within(row).getByText("Plantilla 1")).toBeVisible();
  expect(row.querySelector("time")).toHaveAttribute("dateTime", email.sentAt!);
  expect(row).not.toHaveTextContent("Full paragraph");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(within(row).getByRole("button"));
  const dialog = await screen.findByRole("dialog", { name: email.subject! });
  expect(
    await within(dialog).findByText(/Final line of the email/),
  ).toHaveTextContent("Full paragraph");
  expect(within(dialog).getByText(email.from!)).toBeVisible();
  expect(within(dialog).getByText(email.to)).toBeVisible();
  expect(
    within(dialog).getByText(
      "Las claves de acceso se ocultan en el historial de emails.",
    ),
  ).toBeVisible();
  expect(sdkFetch).toHaveBeenLastCalledWith(
    `${endpoint}/${email.requestId}`,
    expect.any(Object),
  );
  expect(row).not.toHaveTextContent("Full paragraph");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("paginates on request, separates contacts and refreshes after a confirmed send", async () => {
  const older = {
    ...email,
    requestId: "e379b6a1-e325-4cc2-a31e-5d8a7e499f78",
    subject: "Older subject",
  };
  const other = {
    ...email,
    partnerId: "partner_two",
    subject: "Another contact",
  };
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({ emails: [email], nextCursor: "pel1.next" })
    .mockResolvedValueOnce({ emails: [older], nextCursor: null })
    .mockResolvedValueOnce({ emails: [other], nextCursor: null })
    .mockResolvedValueOnce({
      emails: [{ ...other, subject: "Newly sent email" }],
      nextCursor: null,
    });
  const view = open();
  await screen.findByText(email.subject!);
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText(older.subject);
  expect(sdkFetch).toHaveBeenLastCalledWith(
    `${endpoint}?limit=20&partnerId=${email.partnerId}&cursor=pel1.next`,
    expect.any(Object),
  );
  view.selectPartner(other.partnerId);
  await screen.findByText(other.subject);
  expect(screen.queryByText(email.subject!)).not.toBeInTheDocument();
  expect(screen.queryByText(older.subject)).not.toBeInTheDocument();
  await act(async () => {
    await view.client.invalidateQueries({
      queryKey: [
        ...PARTNER_EMAIL_HISTORY_QUERY_KEY,
        "contact",
        other.partnerId,
      ],
    });
  });
  expect(await screen.findByText("Newly sent email")).toBeVisible();
});

it("retries errors without presenting them as an empty history", async () => {
  jest
    .mocked(sdkFetch)
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValueOnce({ emails: [], nextCursor: null });
  open();
  await screen.findByRole("alert");
  expect(
    screen.queryByText("No emails have been sent to this contact yet."),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByText("No emails have been sent to this contact yet."),
  ).toBeVisible();
});

it("opens legacy sends without inventing their template or body", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValue({
      emails: [{ ...email, templateVariant: null, messageAvailable: false }],
      nextCursor: null,
    });
  open();
  await screen.findByText("Template not recorded");
  fireEvent.click(
    screen.getByRole("button", { name: `View message: ${email.subject}` }),
  );
  expect(
    await screen.findByText(
      "Message content was not recorded for older sends.",
    ),
  ).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledTimes(1);
});
