/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AppLanguageProvider } from "@/components/app-language-provider";
import { PartnerEmailPreviewDialog } from "@/components/god-mode/partner-email-preview-dialog";
import { PARTNERS_API_ROUTE } from "@/lib/connected-partners";
import {
  partnerEmailPreviewDocument,
  type PartnerEmailPreview,
  type PartnerEmailSendResult,
} from "@/lib/partner-email";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";

jest.mock("@/lib/sdk-client", () => ({
  ...jest.requireActual("@/lib/sdk-client"),
  sdkFetch: jest.fn(),
}));

const REQUEST_ID = "72de9826-2191-49bd-aeb2-64d80c390285";
const NEXT_REQUEST_ID = "72de9826-2191-49bd-aeb2-64d80c390286";
const PARTNER_ID = "partner_one";
const ENDPOINT = `${PARTNERS_API_ROUTE}/${PARTNER_ID}`;
const preview: PartnerEmailPreview = {
  partnerId: PARTNER_ID,
  to: "ana@example.com",
  subject: "Tu organización en Pocket Genes",
  text: "Hola Ana, conocé la red de Pocket Genes.",
  html: '<p>Hola Ana, conocé la red de Pocket Genes.</p><a href="https://goldencrowvs.com/pocket-genes/join-us/new/" style="background:#6f3cc3;color:#fff">Crear organización</a>',
  ctaLabel: "Crear organización",
  ctaUrl: "https://goldencrowvs.com/pocket-genes/join-us/new/",
  category: "noOrganization",
  language: "es",
  previewHash: "a".repeat(64),
};
const sent: PartnerEmailSendResult = {
  status: "sent",
  to: preview.to,
  sentAt: "2026-11-11T17:00:00.000Z",
  requestId: REQUEST_ID,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function failure(status: number, message: string) {
  return new SdkRequestError({
    status,
    method: "POST",
    path: ENDPOINT,
    message,
    details: message,
  });
}

function renderDialog() {
  const onClose = jest.fn();
  const result = render(
    <AppLanguageProvider forcedLanguage="en">
      <PartnerEmailPreviewDialog partnerId={PARTNER_ID} onClose={onClose} />
    </AppLanguageProvider>,
  );
  return { ...result, onClose };
}

async function ready() {
  await screen.findByText(preview.subject);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Send email" })).toBeEnabled(),
  );
}

function requests() {
  return jest
    .mocked(sdkFetch)
    .mock.calls.filter(([, init]) => init?.method === "POST");
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(crypto, "randomUUID").mockReturnValue(REQUEST_ID);
});
afterEach(() => jest.restoreAllMocks());

it("prepares a Spanish, read-only preview without sending and shows recipient, subject, category and destination", async () => {
  jest.mocked(sdkFetch).mockResolvedValue(preview);
  renderDialog();
  await ready();
  expect(sdkFetch).toHaveBeenCalledWith(
    `${ENDPOINT}/email-preview?language=es`,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(screen.getByText(preview.to)).toBeVisible();
  expect(screen.getByText("No organization yet")).toBeVisible();
  expect(screen.getByText(preview.ctaLabel)).toBeVisible();
  fireEvent.click(screen.getByText("Purple button destination"));
  expect(screen.getByText(preview.ctaUrl)).toBeVisible();
  expect(screen.getByRole("button", { name: "Español" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(requests()).toHaveLength(0);
  const frame = screen.getByTitle("Email message preview");
  expect(frame).toHaveAttribute("sandbox", "");
  expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(frame.getAttribute("srcdoc")).toContain(
    'data-preview-href="https://goldencrowvs.com/pocket-genes/join-us/new/"',
  );
  expect(frame.getAttribute("srcdoc")).toContain("background:#6f3cc3");
  expect(frame.getAttribute("srcdoc")).not.toContain("<a href=");
});

it("keeps send disabled while preparing a preview and retries a failed preview without sending", async () => {
  const load = deferred<PartnerEmailPreview>();
  jest
    .mocked(sdkFetch)
    .mockReturnValueOnce(load.promise)
    .mockResolvedValueOnce(preview);
  renderDialog();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Preparing email preview...",
  );
  expect(screen.getByRole("button", { name: "Send email" })).toBeDisabled();
  await act(async () => load.reject(new Error("Preview unavailable")));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Preview unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
  await ready();
  expect(requests()).toHaveLength(0);
});

it("requests a fresh English preview when its language is chosen", async () => {
  const english = {
    ...preview,
    language: "en" as const,
    subject: "Your organization in Pocket Genes",
    previewHash: "b".repeat(64),
  };
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce(preview)
    .mockResolvedValueOnce(english);
  renderDialog();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(await screen.findByText(english.subject)).toBeVisible();
  expect(sdkFetch).toHaveBeenLastCalledWith(
    `${ENDPOINT}/email-preview?language=en`,
    expect.any(Object),
  );
  expect(requests()).toHaveLength(0);
});

it("ignores a stale language response and aborts its obsolete preview request", async () => {
  const spanish = deferred<PartnerEmailPreview>();
  const english = {
    ...preview,
    language: "en" as const,
    subject: "English message",
    previewHash: "b".repeat(64),
  };
  jest
    .mocked(sdkFetch)
    .mockReturnValueOnce(spanish.promise)
    .mockResolvedValueOnce(english);
  renderDialog();
  const oldSignal = jest.mocked(sdkFetch).mock.calls[0][1]?.signal;
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(await screen.findByText(english.subject)).toBeVisible();
  await act(async () => spanish.resolve(preview));
  expect(screen.queryByText(preview.subject)).not.toBeInTheDocument();
  expect(oldSignal?.aborted).toBe(true);
});

it("sends exactly the reviewed server hash and language once, blocking close and language changes while sending", async () => {
  const send = deferred<PartnerEmailSendResult>();
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce(preview)
    .mockReturnValueOnce(send.promise);
  const { onClose } = renderDialog();
  await ready();
  const button = screen.getByRole("button", {
    name: "Send email",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(requests()).toHaveLength(1);
  const [path, init] = requests()[0];
  expect(path).toBe(`${ENDPOINT}/email`);
  expect(JSON.parse(String(init?.body))).toEqual({
    language: "es",
    previewHash: preview.previewHash,
    requestId: REQUEST_ID,
  });
  expect(screen.getByRole("button", { name: "English" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Close" }),
  ).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Email preview" }), {
    key: "Escape",
  });
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => send.resolve(sent));
  expect(
    await screen.findByRole("region", { name: "Email sent" }),
  ).toHaveTextContent(preview.to);
  expect(
    screen.queryByRole("button", { name: "Send email" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("retains the reviewed language when sending an English preview", async () => {
  const english = {
    ...preview,
    language: "en" as const,
    subject: "English message",
    previewHash: "b".repeat(64),
  };
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce(preview)
    .mockResolvedValueOnce(english)
    .mockResolvedValueOnce(sent);
  renderDialog();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  await screen.findByText(english.subject);
  fireEvent.click(screen.getByRole("button", { name: "Send email" }));
  await screen.findByRole("region", { name: "Email sent" });
  expect(JSON.parse(String(requests()[0][1]?.body))).toEqual({
    language: "en",
    previewHash: english.previewHash,
    requestId: REQUEST_ID,
  });
});

it("requires an explicitly refreshed and reviewed preview after a stale-message conflict", async () => {
  const updated = {
    ...preview,
    subject: "Updated message",
    previewHash: "b".repeat(64),
    category: "organizationWithoutApp" as const,
  };
  jest
    .spyOn(crypto, "randomUUID")
    .mockReturnValueOnce(REQUEST_ID)
    .mockReturnValueOnce(NEXT_REQUEST_ID);
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce(preview)
    .mockRejectedValueOnce(failure(412, "Preview changed"))
    .mockResolvedValueOnce(updated)
    .mockResolvedValueOnce({ ...sent, requestId: NEXT_REQUEST_ID });
  renderDialog();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Send email" }));
  const refresh = await screen.findByRole("button", {
    name: "Refresh preview",
  });
  expect(screen.getByRole("button", { name: "Send email" })).toBeDisabled();
  expect(requests()).toHaveLength(1);
  fireEvent.click(refresh);
  await screen.findByText(updated.subject);
  expect(screen.getByText("Organization without app")).toBeVisible();
  expect(requests()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Send email" }));
  await screen.findByRole("region", { name: "Email sent" });
  expect(JSON.parse(String(requests()[1][1]?.body))).toEqual({
    language: "es",
    previewHash: updated.previewHash,
    requestId: NEXT_REQUEST_ID,
  });
});

it.each(["sending", "unknown"] as const)(
  "does not claim delivery for a %s result and checks the exact same request",
  async (status) => {
    jest
      .mocked(sdkFetch)
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce({ ...sent, status, sentAt: null })
      .mockResolvedValueOnce(sent);
    renderDialog();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Send email" }));
    const check = await screen.findByRole("button", {
      name: "Check delivery",
    });
    expect(
      screen.queryByRole("region", { name: "Email sent" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Delivery is not confirmed.",
    );
    expect(requests()).toHaveLength(1);
    fireEvent.click(check);
    await screen.findByRole("region", { name: "Email sent" });
    expect(requests()[1][1]?.body).toBe(requests()[0][1]?.body);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  },
);

it.each([
  new Error("Connection interrupted"),
  failure(502, "Delivery response unavailable"),
])(
  "treats a lost response as unconfirmed and retains the same idempotency key",
  async (error) => {
    jest
      .mocked(sdkFetch)
      .mockResolvedValueOnce(preview)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(sent);
    renderDialog();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Send email" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Check delivery",
      }),
    );
    await screen.findByRole("region", { name: "Email sent" });
    expect(requests()[1][1]?.body).toBe(requests()[0][1]?.body);
  },
);

it("keeps a request conflict uncertain and never offers a fresh preview or request ID", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce(preview)
    .mockRejectedValueOnce(
      failure(409, "Existing request could not be verified"),
    )
    .mockResolvedValueOnce({ ...sent, status: "unknown", sentAt: null });
  renderDialog();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Send email" }));
  const check = await screen.findByRole("button", { name: "Check delivery" });
  expect(
    screen.queryByRole("button", { name: "Refresh preview" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Email sent" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "English" })).toBeDisabled();
  fireEvent.click(check);
  await waitFor(() => expect(requests()).toHaveLength(2));
  expect(requests()[1][1]?.body).toBe(requests()[0][1]?.body);
  expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
});

it("offers a retry for a confirmed delivery failure without creating another request ID", async () => {
  jest
    .mocked(sdkFetch)
    .mockResolvedValueOnce(preview)
    .mockResolvedValueOnce({
      ...sent,
      status: "failed",
      sentAt: null,
      error: "Mail was rejected",
    })
    .mockResolvedValueOnce(sent);
  renderDialog();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Send email" }));
  const retry = await screen.findByRole("button", {
    name: "Retry sending",
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Mail was rejected");
  expect(
    screen.queryByRole("button", { name: "Check delivery" }),
  ).not.toBeInTheDocument();
  fireEvent.click(retry);
  await screen.findByRole("region", { name: "Email sent" });
  expect(requests()[1][1]?.body).toBe(requests()[0][1]?.body);
});

it("keeps the HTML preview inert without altering user text or the button's appearance", () => {
  const html =
    '<p>A company with href="words" in its name</p><a HREF = "https://example.test" style="background:#6f3cc3">Open portal</a>';
  const result = partnerEmailPreviewDocument(html);
  expect(result).toContain('<p>A company with href="words" in its name</p>');
  expect(result).toContain(
    '<a data-preview-href = "https://example.test" style="background:#6f3cc3">Open portal</a>',
  );
  expect(result).toContain("default-src 'none'");
  expect(result).toContain("form-action 'none'");
});
