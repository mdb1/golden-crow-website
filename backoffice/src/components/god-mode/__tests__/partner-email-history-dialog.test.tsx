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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PartnerEmailHistoryDialog } from "@/components/god-mode/partner-email-history-dialog";
import { PARTNERS_API_ROUTE } from "@/lib/connected-partners";
import type { PartnerEmailHistoryRecord } from "@/lib/partner-email";
import { sdkFetch } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));
const endpoint = `${PARTNERS_API_ROUTE}/sent-email-log`;
const email: PartnerEmailHistoryRecord = {
  requestId: "e379b6a1-e325-4cc2-a31e-5d8a7e499f77",
  partnerId: "one",
  partnerName: "Genome Studio",
  from: "federico@goldencrowvs.com",
  to: "ana@example.com",
  subject: "¡Una app para Genome Studio!",
  language: "es",
  templateVariant: 2,
  category: "organizationWithoutApp",
  status: "sent",
  createdAt: "2026-11-11T12:00:00.000Z",
  updatedAt: "2026-11-11T12:00:03.000Z",
  sentAt: "2026-11-11T12:00:03.000Z",
  requestedByEmail: "god@example.com",
  messageAvailable: true,
  accessKeyOmitted: true,
};
function open(component = <PartnerEmailHistoryDialog onClose={() => {}} />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <AppLanguageProvider forcedLanguage="en">
      <QueryClientProvider client={client}>{component}</QueryClientProvider>
    </AppLanguageProvider>,
  );
}
beforeEach(() => jest.resetAllMocks());

it("loads a 20-row page and fetches each recorded message only when expanded", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({ emails: [email], nextCursor: null })
    .mockResolvedValueOnce({
      email: {
        ...email,
        messageText: "Hola Ana,\n\nYour reviewed app invitation.",
      },
    });
  open();
  await screen.findByText(email.subject!);
  expect(sdkFetch).toHaveBeenCalledWith(
    `${endpoint}?limit=20`,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(screen.getByText(email.from!)).toBeVisible();
  expect(screen.getByText(email.to)).toBeVisible();
  expect(screen.getByText("Template 3")).toBeVisible();
  expect(screen.getByText("Sent")).toBeVisible();
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "View message" }));
  await screen.findByText(/Your reviewed app invitation/);
  expect(sdkFetch).toHaveBeenLastCalledWith(
    `${endpoint}/${email.requestId}`,
    expect.any(Object),
  );
  expect(
    screen.getByText("Access keys are hidden in the email history."),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Hide message" }));
  fireEvent.click(screen.getByRole("button", { name: "View message" }));
  expect(sdkFetch).toHaveBeenCalledTimes(2);
});

it.each([[3, "Template 1"], [1, "Template 2"], [2, "Template 3"]] as const)("labels saved variant %s with its current template name", async (templateVariant, label) => {
  jest.mocked(sdkFetch).mockResolvedValueOnce({ emails: [{ ...email, templateVariant }], nextCursor: null });
  open();
  expect(await screen.findByText(label)).toBeVisible();
});

it("loads more only on request and resets to the first page when refreshed", async () => {
  const second = {
    ...email,
    requestId: "e379b6a1-e325-4cc2-a31e-5d8a7e499f78",
    subject: "Older email",
  };
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({ emails: [email], nextCursor: "pel1.next" })
    .mockResolvedValueOnce({ emails: [second], nextCursor: null })
    .mockResolvedValueOnce({ emails: [email], nextCursor: null });
  open();
  await screen.findByText(email.subject!);
  expect(sdkFetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText(second.subject);
  expect(sdkFetch).toHaveBeenLastCalledWith(
    `${endpoint}?limit=20&cursor=pel1.next`,
    expect.any(Object),
  );
  expect(
    screen.queryByRole("button", { name: "Load more" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText(email.subject!);
  expect(screen.queryByText(second.subject)).not.toBeInTheDocument();
  expect(sdkFetch).toHaveBeenLastCalledWith(
    `${endpoint}?limit=20`,
    expect.any(Object),
  );
});

it("shows older records without claiming a sender or message that was never recorded", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValue({
      emails: [
        {
          ...email,
          from: null,
          subject: null,
          partnerName: null,
          category: null,
          templateVariant: null,
          messageAvailable: false,
        },
      ],
      nextCursor: null,
    });
  open();
  await screen.findByText("No subject recorded");
  expect(
    screen.getByText("Message content was not recorded for older sends."),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "View message" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("federico@goldencrowvs.com"),
  ).not.toBeInTheDocument();
  expect(sdkFetch).toHaveBeenCalledTimes(1);
});

it.each([
  ["sending", "In progress"],
  ["unknown", "Delivery not confirmed"],
  ["failed", "Not sent"],
] as const)(
  "distinguishes the %s state and offers no send or resend action",
  async (status, label) => {
    jest
      .mocked(sdkFetch)
      .mockResolvedValue({
        emails: [{ ...email, status, sentAt: null }],
        nextCursor: null,
      });
    open();
    await screen.findByText(label);
    if (status !== "failed")
      expect(screen.getByRole("note")).toHaveTextContent(
        "Delivery is not confirmed.",
      );
    expect(
      screen.queryByRole("button", { name: /send/i }),
    ).not.toBeInTheDocument();
  },
);

it("retries a failed list read without claiming there are no emails", async () => {
  jest
    .mocked(sdkFetch)
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValueOnce({ emails: [email], nextCursor: null });
  open();
  await screen.findByRole("alert");
  expect(
    screen.queryByText("No emails have been sent from Partners yet."),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText(email.subject!);
});

it("retries a failed message read without refetching the list", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce({ emails: [email], nextCursor: null })
    .mockRejectedValueOnce(new Error("Message unavailable."))
    .mockResolvedValueOnce({
      email: { ...email, messageText: "Saved content" },
    });
  open();
  await screen.findByText(email.subject!);
  fireEvent.click(screen.getByRole("button", { name: "View message" }));
  const alert = await screen.findByRole("alert");
  fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
  await screen.findByText("Saved content");
  expect(
    jest
      .mocked(sdkFetch)
      .mock.calls.filter(([path]) => path === `${endpoint}?limit=20`),
  ).toHaveLength(1);
});

it("shows the empty state and lets the operator close the modal", async () => {
  jest.mocked(sdkFetch).mockResolvedValue({ emails: [], nextCursor: null });
  const close = jest.fn();
  open(<PartnerEmailHistoryDialog onClose={close} />);
  await screen.findByText("No emails have been sent from Partners yet.");
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(close).toHaveBeenCalledTimes(1);
});

it("aborts an unfinished list request when the modal closes", async () => {
  let finish!: (value: unknown) => void;
  jest.mocked(sdkFetch).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { unmount } = open();
  const signal = jest.mocked(sdkFetch).mock.calls[0][1]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => finish({ emails: [], nextCursor: null }));
});
